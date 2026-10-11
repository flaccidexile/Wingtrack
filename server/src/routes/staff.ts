import express, { Router, type Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'
import { supabaseAdmin } from '../lib/supabase'
import { validatePassword } from '../lib/validation'

const router = Router()

const ROLES = ['admin', 'cashier', 'inventory_personnel'] as const
type StaffRole = (typeof ROLES)[number]

/** Longest name we accept — keeps the sidebar, receipts and audit log legible. */
const MAX_NAME_LENGTH = 80

/** Avatars are capped at 5 MB, matching the copy shown in Settings. */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024

/** Image types the avatars bucket accepts. */
const AVATAR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

/**
 * True when a PostgREST error means a column is absent from the table.
 *
 * PostgREST reports this two ways: `42703` (undefined_column) when the column
 * appears in a SELECT or filter, and `PGRST204` when it is named in an
 * INSERT/UPDATE payload. Both are checked — relying on one alone leaves the
 * other case falling through as a 500.
 */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42703' || error.code === 'PGRST204') return true
  return /column .* does not exist|could not find the .* column/i.test(error.message ?? '')
}

/** Emits the "presence columns are missing" warning at most once per boot. */
let presenceWarningShown = false
function warnPresenceUnavailable() {
  if (presenceWarningShown) return
  presenceWarningShown = true
  console.warn(
    '\n  [WINGTRACK] staff_profiles is missing avatar_url / last_seen_at / last_sign_in_at.\n' +
    '  Online monitoring falls back to auth sign-in times until you run\n' +
    '  supabase/RUN_ALL_MIGRATIONS.sql in the Supabase SQL Editor.\n',
  )
}

/** Rejects a malformed `:id` before it reaches Postgres. */
function requireUuidParam(req: AuthenticatedRequest, res: Response): string | null {
  const id = String(req.params.id ?? '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    // Without this guard Postgres raises `invalid input syntax for type uuid`,
    // which surfaces as a 500 echoing the raw database error.
    res.status(404).json({ message: 'Staff member not found.' })
    return null
  }
  return id
}

/**
 * Facts about a staff member that live in `auth.users` rather than
 * `staff_profiles`.
 *
 * WHY THIS EXISTS
 * ---------------
 * Two things the Staff Manager needs are only reliably available on the auth
 * user: `last_sign_in_at`, and the avatar URL when the presence migration has
 * not been applied yet. `auth.users` is not reachable from the browser, so the
 * server has to read it and merge it into the rows it returns.
 *
 * Without this, an un-migrated database shows "Never signed in" against every
 * member — including people who signed in minutes ago — which makes the whole
 * monitoring screen look broken.
 *
 * `listUsers()` is paginated and comparatively expensive, so the directory is
 * cached briefly: long enough to serve a page load plus its follow-up refresh,
 * short enough that a fresh sign-in appears promptly.
 */
const AUTH_DIRECTORY_TTL_MS = 20_000

interface AuthFacts {
  last_sign_in_at: string | null
  avatar_url: string | null
}

let authDirectoryCache: { at: number; map: Map<string, AuthFacts> } | null = null

async function authDirectory(): Promise<Map<string, AuthFacts>> {
  if (authDirectoryCache && Date.now() - authDirectoryCache.at < AUTH_DIRECTORY_TTL_MS) {
    return authDirectoryCache.map
  }

  const map = new Map<string, AuthFacts>()
  const perPage = 200

  try {
    for (let page = 1; ; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
      if (error || !data?.users?.length) break

      for (const u of data.users) {
        const meta = (u.user_metadata ?? {}) as { avatar_url?: unknown }
        map.set(u.id, {
          last_sign_in_at: u.last_sign_in_at ?? null,
          avatar_url: typeof meta.avatar_url === 'string' ? meta.avatar_url : null,
        })
      }

      if (data.users.length < perPage) break
    }
  } catch (err) {
    console.warn('[WINGTRACK] Could not read the auth directory:', err)
  }

  authDirectoryCache = { at: Date.now(), map }
  return map
}

/** Drops the cached directory so the next read reflects a just-made change. */
function invalidateAuthDirectory() {
  authDirectoryCache = null
}

/** Merges the auth-side facts into a single staff row. */
async function enrichStaffRow<T extends Record<string, unknown>>(row: T): Promise<T> {
  const [enriched] = await enrichStaff([row])
  return enriched
}

/**
 * Creates the `avatars` bucket if it is missing.
 *
 * The bucket normally already exists, but a fresh project will not have it and
 * a missing bucket surfaces to the user as an opaque upload failure. Creating
 * it on demand keeps the feature self-contained.
 */
async function ensureAvatarsBucket() {
  try {
    const { data } = await supabaseAdmin.storage.getBucket('avatars')
    if (data) return
  } catch {
    // getBucket throws when the bucket is absent — fall through and create it.
  }

  const { error } = await supabaseAdmin.storage.createBucket('avatars', {
    public: true,
    fileSizeLimit: MAX_AVATAR_BYTES,
    allowedMimeTypes: Object.keys(AVATAR_MIME),
  })

  // A concurrent request may have created it first; that is not a failure.
  if (error && !/already exists/i.test(error.message)) {
    console.warn('[WINGTRACK] Could not create the avatars bucket:', error.message)
  }
}

/**
 * Stores a staff member's photo URL.
 *
 * Written in two places on purpose:
 *
 * - `staff_profiles.avatar_url` is the canonical home, but the column only
 *   exists after the presence migration.
 * - `auth.users.user_metadata.avatar_url` is writable today and is what
 *   `enrichStaff()` falls back to, so photos work on an un-migrated database.
 *
 * A missing column is therefore not an error — metadata already holds the URL.
 */
async function setAvatarUrl(profile: Record<string, unknown>, url: string | null) {
  const userId = profile.user_id as string

  try {
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId)
    const existingMeta = (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: { ...existingMeta, avatar_url: url },
    })
  } catch (err) {
    console.warn('[WINGTRACK] Could not mirror the avatar URL into auth metadata:', err)
  }

  const { error } = await supabaseAdmin
    .from('staff_profiles')
    .update({ avatar_url: url })
    .eq('id', profile.id as string)

  if (isMissingColumn(error)) warnPresenceUnavailable()
  else if (error) console.warn('[WINGTRACK] Could not store avatar_url:', error.message)

  invalidateAuthDirectory()
}

/**
 * Validates the raw image body of an avatar upload.
 *
 * Returns the decoded buffer plus the extension to store it under, or null
 * after having already sent the failure response — so callers can simply
 * `if (!image) return`.
 */
function readAvatarUpload(
  req: AuthenticatedRequest,
  res: Response,
): { body: Buffer; contentType: string; ext: string } | null {
  const contentType = String(req.headers['content-type'] ?? '').split(';')[0].trim()
  const ext = AVATAR_MIME[contentType]

  if (!ext) {
    res.status(415).json({ message: 'Only JPG, PNG or WebP images are supported.' })
    return null
  }

  const body = req.body as Buffer
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ message: 'The uploaded file is empty.' })
    return null
  }
  if (body.length > MAX_AVATAR_BYTES) {
    res.status(413).json({ message: 'Image must be 5 MB or smaller.' })
    return null
  }

  return { body, contentType, ext }
}

/**
 * Writes image bytes to the avatars bucket and returns the public URL.
 *
 * The filename carries a timestamp so a replaced photo is served from a new
 * URL — otherwise a CDN or browser would keep showing the previous image.
 */
async function storeAvatarObject(
  profileId: string,
  body: Buffer,
  contentType: string,
  ext: string,
): Promise<{ url: string } | { error: string }> {
  await ensureAvatarsBucket()

  const path = `${profileId}/avatar-${Date.now()}.${ext}`
  const { error } = await supabaseAdmin.storage
    .from('avatars')
    .upload(path, body, { contentType, upsert: true, cacheControl: '3600' })

  if (error) return { error: error.message }

  const { data } = supabaseAdmin.storage.from('avatars').getPublicUrl(path)
  return { url: data.publicUrl }
}

/** The stored photo URL for a row, whichever of the two homes holds it. */
async function currentAvatarUrl(profile: Record<string, unknown>): Promise<string | null> {
  const fromColumn = (profile.avatar_url as string | null | undefined) ?? null
  if (fromColumn) return fromColumn
  return (await authDirectory()).get(profile.user_id as string)?.avatar_url ?? null
}

/** Deletes the stored object behind an avatar URL. Best effort by design. */
async function deleteAvatarObject(url: string | null) {
  const path = url?.split('/avatars/')[1]
  if (!path) return
  await supabaseAdmin.storage.from('avatars').remove([path]).catch(() => undefined)
}

/**
 * Applies a new photo (or clears it) for one staff member.
 *
 * Shared by the self-service and administrator routes so both paths store the
 * URL identically and neither leaks an orphaned object behind.
 */
async function applyAvatarChange(
  profile: Record<string, unknown>,
  uploadedUrl: string | null,
): Promise<Record<string, unknown>> {
  const previous = await currentAvatarUrl(profile)

  await setAvatarUrl(profile, uploadedUrl)

  // Only clean up the old file once the new URL is durably stored, and never
  // delete the object we have just written.
  if (previous && previous !== uploadedUrl) await deleteAvatarObject(previous)

  return enrichStaffRow({ ...profile, avatar_url: uploadedUrl })
}

/** Express middleware chain for a raw image body. */
const rawImage = express.raw({ type: Object.keys(AVATAR_MIME), limit: MAX_AVATAR_BYTES })

/**
 * Merges the auth-side facts into a set of staff rows.
 *
 * Both fields prefer our own column and fall back to the auth value, so the
 * same code path works before and after the presence migration.
 */
async function enrichStaff<T extends Record<string, unknown>>(rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows

  const directory = await authDirectory()

  return rows.map(row => {
    const userId = row.user_id as string | undefined
    const facts = userId ? directory.get(userId) : undefined

    return {
      ...row,
      last_sign_in_at: (row.last_sign_in_at as string | null | undefined) ?? facts?.last_sign_in_at ?? null,
      avatar_url: (row.avatar_url as string | null | undefined) ?? facts?.avatar_url ?? null,
    }
  })
}

/** Reads the caller's own staff profile row. */
async function loadOwnProfile(userId: string) {
  const { data } = await supabaseAdmin
    .from('staff_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  return data
}

/**
 * Refuses an edit that would leave the shop with no usable administrator.
 *
 * Deactivating or demoting the final active admin locks everyone out of the
 * Staff Manager permanently — there is no in-app way back — so this is checked
 * on every mutation that could remove one.
 */
async function wouldRemoveLastAdmin(targetId: string): Promise<boolean> {
  const { data: activeAdmins } = await supabaseAdmin
    .from('staff_profiles')
    .select('id')
    .eq('role', 'admin')
    .eq('is_active', true)

  const admins = activeAdmins ?? []
  return admins.length <= 1 && admins.some(a => a.id === targetId)
}

// ============================================================
// Collection
// ============================================================

// GET /api/staff — Admin only: list all staff
router.get('/', requireAuth, requireRole('admin'), async (_req, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('staff_profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) { res.status(500).json({ message: error.message }); return }

  // Enriched because auth.users is not readable from the browser — see the
  // comment on authDirectory().
  res.json(await enrichStaff((data ?? []) as Record<string, unknown>[]))
})

// POST /api/staff — Admin only: provision a new staff account
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { email, password, full_name, role } = req.body as {
      email: string
      password: string
      full_name: string
      role: StaffRole
    }

    if (!email || !password || !full_name || !role) {
      res.status(400).json({ message: 'email, password, full_name, and role are required.' })
      return
    }

    const pwdError = validatePassword(password)
    if (pwdError) {
      res.status(400).json({ message: pwdError })
      return
    }

    if (!isStaffRole(role)) {
      res.status(400).json({ message: 'Role must be admin, cashier, or inventory_personnel.' })
      return
    }

    const normalizedEmail = email.trim().toLowerCase()
    const cleanName = full_name.trim()
    if (cleanName.length < 2 || cleanName.length > MAX_NAME_LENGTH) {
      res.status(400).json({ message: `Full name must be between 2 and ${MAX_NAME_LENGTH} characters.` })
      return
    }

    // Create auth user using admin API (bypasses email confirmation)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: cleanName, role },
    })

    if (authError || !authData?.user) {
      // Surface a clean, user-facing message for the common duplicate-email case.
      const duplicate = /already registered|already been registered|exists/i.test(authError?.message ?? '')
      res.status(duplicate ? 409 : 400).json({
        message: duplicate
          ? 'An account with that email already exists.'
          : 'Failed to create the staff account. Please check the details and try again.',
      })
      return
    }

    // Get the admin's staff_profile id for created_by
    const { data: adminProfile } = await supabaseAdmin
      .from('staff_profiles')
      .select('id')
      .eq('user_id', req.userId!)
      .maybeSingle()

    // Create staff profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('staff_profiles')
      .insert({
        user_id:    authData.user.id,
        full_name:  cleanName,
        email:      normalizedEmail,
        role,
        is_active:  true,
        created_by: adminProfile?.id ?? null,
      })
      .select()
      .single()

    if (profileError) {
      // Rollback: delete the auth user we just created
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      res.status(500).json({ message: profileError.message })
      return
    }

    invalidateAuthDirectory()
    res.status(201).json(await enrichStaffRow(profile as Record<string, unknown>))
  }
)

// ============================================================
// Self-service routes
// ------------------------------------------------------------
// These MUST be registered before the `/:id` routes below — Express matches
// in declaration order, so a literal path declared later would be swallowed
// by `/:id` and the handler would receive "me" as an id.
// ============================================================

// PATCH /api/staff/me — Any authenticated user: update their own display name
router.patch(
  '/me',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { full_name } = req.body as { full_name?: unknown }

    if (typeof full_name !== 'string') {
      res.status(400).json({ message: 'full_name is required.' })
      return
    }

    const cleanName = full_name.trim()
    if (cleanName.length < 2 || cleanName.length > MAX_NAME_LENGTH) {
      res.status(400).json({ message: `Full name must be between 2 and ${MAX_NAME_LENGTH} characters.` })
      return
    }

    const { data, error } = await supabaseAdmin
      .from('staff_profiles')
      .update({ full_name: cleanName })
      .eq('user_id', req.userId!)
      .select()
      .maybeSingle()

    if (error) { res.status(500).json({ message: error.message }); return }
    if (!data) { res.status(404).json({ message: 'No staff profile is linked to this account.' }); return }

    // Keep the auth metadata in step so a re-provision never resurrects the old name.
    await supabaseAdmin.auth.admin
      .updateUserById(req.userId!, { user_metadata: { full_name: cleanName } })
      .catch(() => undefined)

    res.json(data)
  }
)

// POST /api/staff/heartbeat — Any authenticated user: stamp presence
//
// The Staff Manager treats a member as "online now" when `last_seen_at` is
// recent, so the client pings this on an interval while the app is open.
//
// The response deliberately echoes the caller's live role and active flag:
// that turns the heartbeat into the delivery channel for admin changes. When
// an admin demotes or deactivates someone, that person's next ping reports the
// new state and the client locks the UI down — no realtime subscription or
// page reload required on the affected user's side.
router.post(
  '/heartbeat',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { sign_in } = (req.body ?? {}) as { sign_in?: unknown }
    const now = new Date().toISOString()

    const patch: Record<string, unknown> = { last_seen_at: now }
    // `sign_in` is set once per browser session, so last_sign_in_at reflects a
    // real login rather than the most recent page refresh.
    if (sign_in === true) patch.last_sign_in_at = now

    const { data, error } = await supabaseAdmin
      .from('staff_profiles')
      .update(patch)
      .eq('user_id', req.userId!)
      .select('id, role, is_active, full_name, last_seen_at, last_sign_in_at')
      .maybeSingle()

    if (isMissingColumn(error)) {
      // The presence migration has not been applied yet. Rather than fail every
      // 45 seconds, fall back to a plain read — the heartbeat's second job
      // (delivering an admin's role/access change to an open session) still
      // works, only the online indicator stays dark.
      warnPresenceUnavailable()
      const fallback = await supabaseAdmin
        .from('staff_profiles')
        .select('id, role, is_active, full_name')
        .eq('user_id', req.userId!)
        .maybeSingle()

      if (fallback.error) { res.status(500).json({ message: fallback.error.message }); return }
      if (!fallback.data) { res.status(404).json({ message: 'No staff profile is linked to this account.' }); return }

      res.json({
        last_seen_at: null,
        presence_available: false,
        profile: fallback.data,
      })
      return
    }

    if (error) { res.status(500).json({ message: error.message }); return }
    if (!data) { res.status(404).json({ message: 'No staff profile is linked to this account.' }); return }

    res.json({ last_seen_at: data.last_seen_at, presence_available: true, profile: data })
  }
)

// POST /api/staff/me/avatar — Any authenticated user: upload their photo
//
// The raw image bytes are the request body (`Content-Type: image/png` etc.)
// rather than multipart form data, which avoids pulling in a parser
// dependency for a single-field upload. `express.json()` ignores non-JSON
// content types, so the buffer arrives intact.
router.post(
  '/me/avatar',
  requireAuth,
  rawImage,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const image = readAvatarUpload(req, res)
    if (!image) return

    const profile = await loadOwnProfile(req.userId!)
    if (!profile) {
      res.status(404).json({ message: 'No staff profile is linked to this account.' })
      return
    }

    const stored = await storeAvatarObject(profile.id as string, image.body, image.contentType, image.ext)
    if ('error' in stored) {
      res.status(500).json({ message: `Upload failed: ${stored.error}` })
      return
    }

    res.json(await applyAvatarChange(profile, stored.url))
  }
)

// DELETE /api/staff/me/avatar — Any authenticated user: remove their photo
router.delete(
  '/me/avatar',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const profile = await loadOwnProfile(req.userId!)
    if (!profile) {
      res.status(404).json({ message: 'No staff profile is linked to this account.' })
      return
    }

    res.json(await applyAvatarChange(profile, null))
  }
)

// POST /api/staff/:id/avatar — Admin only: set another member's photo
//
// Exists because most staff never open Settings, and an administrator adding
// someone to the roster usually has their photo to hand. Without this the
// Staff Manager can only ever show initials.
router.post(
  '/:id/avatar',
  requireAuth,
  requireRole('admin'),
  rawImage,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = requireUuidParam(req, res)
    if (!id) return

    const image = readAvatarUpload(req, res)
    if (!image) return

    const { data: profile } = await supabaseAdmin
      .from('staff_profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (!profile) {
      res.status(404).json({ message: 'Staff member not found.' })
      return
    }

    const stored = await storeAvatarObject(id, image.body, image.contentType, image.ext)
    if ('error' in stored) {
      res.status(500).json({ message: `Upload failed: ${stored.error}` })
      return
    }

    res.json(await applyAvatarChange(profile as Record<string, unknown>, stored.url))
  }
)

// DELETE /api/staff/:id/avatar — Admin only: clear another member's photo
router.delete(
  '/:id/avatar',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = requireUuidParam(req, res)
    if (!id) return

    const { data: profile } = await supabaseAdmin
      .from('staff_profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (!profile) {
      res.status(404).json({ message: 'Staff member not found.' })
      return
    }

    res.json(await applyAvatarChange(profile as Record<string, unknown>, null))
  }
)

// PATCH /api/staff/update-password — Authenticated user updates their own password
router.patch(
  '/update-password',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { password } = req.body as { password?: string }

    const pwdError = validatePassword(password)
    if (pwdError) {
      res.status(400).json({ message: pwdError })
      return
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.userId!, {
      password: password!,
    })

    if (error) {
      res.status(400).json({ message: error.message })
      return
    }

    res.json({ message: 'Password updated successfully.' })
  }
)

// ============================================================
// Admin routes targeting a specific staff member
// ============================================================

// PATCH /api/staff/:id/reactivate — Admin only: reactivate a staff member
router.patch(
  '/:id/reactivate',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = requireUuidParam(req, res)
    if (!id) return

    const { data, error } = await supabaseAdmin
      .from('staff_profiles')
      .update({ is_active: true })
      .eq('id', id)
      .select()
      .maybeSingle()

    if (error) { res.status(500).json({ message: error.message }); return }
    if (!data) { res.status(404).json({ message: 'Staff member not found.' }); return }

    res.json(await enrichStaffRow(data as Record<string, unknown>))
  }
)

// PATCH /api/staff/:id — Admin only: edit name, email, role or access
router.patch(
  '/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = requireUuidParam(req, res)
    if (!id) return
    const { full_name, email, role, is_active } = req.body as {
      full_name?: unknown
      email?: unknown
      role?: unknown
      is_active?: unknown
    }

    const { data: target, error: lookupError } = await supabaseAdmin
      .from('staff_profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (lookupError) { res.status(500).json({ message: lookupError.message }); return }
    if (!target) { res.status(404).json({ message: 'Staff member not found.' }); return }

    const isSelf = target.user_id === req.userId
    const patch: Record<string, unknown> = {}
    let newEmail: string | null = null

    // ── Full name ──────────────────────────────────────────
    if (full_name !== undefined) {
      if (typeof full_name !== 'string') {
        res.status(400).json({ message: 'Full name must be text.' })
        return
      }
      const cleanName = full_name.trim()
      if (cleanName.length < 2 || cleanName.length > MAX_NAME_LENGTH) {
        res.status(400).json({ message: `Full name must be between 2 and ${MAX_NAME_LENGTH} characters.` })
        return
      }
      if (cleanName !== target.full_name) patch.full_name = cleanName
    }

    // ── Role ───────────────────────────────────────────────
    if (role !== undefined) {
      if (!isStaffRole(role)) {
        res.status(400).json({ message: 'Role must be admin, cashier, or inventory_personnel.' })
        return
      }
      if (role !== target.role) {
        // An admin who demotes themselves loses the Staff Manager instantly and
        // cannot undo it — require a different admin to make that change.
        if (isSelf) {
          res.status(400).json({ message: 'You cannot change your own role.' })
          return
        }
        if (target.role === 'admin' && target.is_active && await wouldRemoveLastAdmin(id)) {
          res.status(400).json({ message: 'At least one active administrator must remain.' })
          return
        }
        patch.role = role
      }
    }

    // ── Access ─────────────────────────────────────────────
    if (is_active !== undefined) {
      if (typeof is_active !== 'boolean') {
        res.status(400).json({ message: 'is_active must be true or false.' })
        return
      }
      if (is_active !== target.is_active) {
        if (is_active === false) {
          if (isSelf) {
            res.status(400).json({ message: 'You cannot deactivate your own account.' })
            return
          }
          if (target.role === 'admin' && await wouldRemoveLastAdmin(id)) {
            res.status(400).json({ message: 'At least one active administrator must remain.' })
            return
          }
        }
        patch.is_active = is_active
      }
    }

    // ── Email ──────────────────────────────────────────────
    if (email !== undefined) {
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        res.status(400).json({ message: 'Enter a valid email address.' })
        return
      }
      const normalized = email.trim().toLowerCase()
      if (normalized !== target.email.toLowerCase()) {
        const { data: clash } = await supabaseAdmin
          .from('staff_profiles')
          .select('id')
          .ilike('email', normalized)
          .neq('id', id)
          .maybeSingle()

        if (clash) {
          res.status(409).json({ message: 'Another staff member already uses that email.' })
          return
        }
        newEmail = normalized
      }
    }

    if (!Object.keys(patch).length && !newEmail) {
      res.json(await enrichStaffRow(target as Record<string, unknown>))
      return
    }

    // The email is the sign-in address, so the auth user must move with it or
    // the member is locked out of an account whose profile says otherwise.
    if (newEmail) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(target.user_id, {
        email: newEmail,
        email_confirm: true,
      })

      if (authError) {
        const duplicate = /already|exists|registered/i.test(authError.message)
        res.status(duplicate ? 409 : 400).json({
          message: duplicate
            ? 'That email is already in use by another sign-in account.'
            : `Could not update the sign-in address: ${authError.message}`,
        })
        return
      }
      patch.email = newEmail
    }

    const { data, error } = await supabaseAdmin
      .from('staff_profiles')
      .update(patch)
      .eq('id', id)
      .select()
      .single()

    if (error) { res.status(500).json({ message: error.message }); return }
    if (newEmail) invalidateAuthDirectory()
    res.json(await enrichStaffRow(data as Record<string, unknown>))
  }
)

// DELETE /api/staff/:id — Admin only: deactivate a staff member
router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = requireUuidParam(req, res)
    if (!id) return

    // Prevent admin from deactivating themselves
    const selfProfile = await loadOwnProfile(req.userId!)

    if (selfProfile?.id === id) {
      res.status(400).json({ message: 'You cannot deactivate your own account.' })
      return
    }

    const { data: target } = await supabaseAdmin
      .from('staff_profiles')
      .select('role, is_active')
      .eq('id', id)
      .maybeSingle()

    if (!target) { res.status(404).json({ message: 'Staff member not found.' }); return }

    if (target.role === 'admin' && target.is_active && await wouldRemoveLastAdmin(id)) {
      res.status(400).json({ message: 'At least one active administrator must remain.' })
      return
    }

    const { data, error } = await supabaseAdmin
      .from('staff_profiles')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .maybeSingle()

    if (error) { res.status(500).json({ message: error.message }); return }
    if (!data) { res.status(404).json({ message: 'Staff member not found.' }); return }

    res.json(await enrichStaffRow(data as Record<string, unknown>))
  }
)

export default router
