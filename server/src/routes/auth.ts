import { Router, type Request, type Response } from 'express'
import crypto from 'node:crypto'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'
import { supabaseAdmin } from '../lib/supabase'
import { sendMail, isSmtpConfigured, buildOtpEmail, buildPasswordResetEmail } from '../lib/mailer'
import { validatePassword } from '../lib/validation'

const router = Router()

/** Generic, enumeration-safe message returned for any unregistered email. */
const NOT_REGISTERED_MESSAGE =
  'This email is not registered as staff. Ask an administrator to create your account before using code sign-in.'

/** Roles that may be assigned to a newly provisioned staff account. */
const ASSIGNABLE_ROLES = ['admin', 'cashier', 'inventory_personnel'] as const
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

function isAssignableRole(value: unknown): value is AssignableRole {
  return typeof value === 'string' && (ASSIGNABLE_ROLES as readonly string[]).includes(value)
}

/**
 * Roles a user may pick for themselves during self-service sign-up.
 *
 * Admin is deliberately absent: it can only ever be granted by an existing
 * admin (POST /api/staff or PATCH /api/staff/:id). Without this, typing
 * "admin" on the public signup form would grant full access.
 */
const SELF_SIGNUP_ROLES = ['cashier', 'inventory_personnel'] as const
type SelfSignupRole = (typeof SELF_SIGNUP_ROLES)[number]

function isSelfSignupRole(value: unknown): value is SelfSignupRole {
  return typeof value === 'string' && (SELF_SIGNUP_ROLES as readonly string[]).includes(value)
}

/** How long one address must wait between reset-link requests. */
const RESET_COOLDOWN_MS = 60_000

/**
 * Per-address cooldown for reset requests.
 *
 * In memory on purpose: this guards against a single caller hammering the
 * endpoint into someone's inbox, not against a distributed attack, and losing
 * it on restart is harmless. Supabase's own mailer has an equivalent limit, so
 * this keeps our behaviour consistent with the fallback path.
 */
const resetCooldowns = new Map<string, number>()

/** Seconds the caller must still wait, or 0 when the address is clear. */
function resetCooldownRemaining(email: string): number {
  const until = resetCooldowns.get(email)
  if (!until) return 0

  const remainingMs = until - Date.now()
  if (remainingMs <= 0) {
    resetCooldowns.delete(email)
    return 0
  }

  return Math.ceil(remainingMs / 1000)
}

/**
 * Picks the post-reset landing page.
 *
 * The client sends its own origin so the link returns the user to the right
 * host. That value is only ever a redirect target handed to Supabase, but it
 * still arrives in a request body, so it is parsed and restricted to http/https
 * rather than trusted. Anything unusable falls back to CLIENT_URL — the same
 * page the app already sends users to.
 */
function safeRedirectTarget(requested: string): string {
  const fallback = process.env.CLIENT_URL?.trim() || 'http://localhost:5173'

  if (!requested) return `${fallback}?mode=reset`

  try {
    const url = new URL(requested)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return `${fallback}?mode=reset`
    // Force the mode the client uses to recognise a recovery landing.
    url.searchParams.set('mode', 'reset')
    return url.toString()
  } catch {
    return `${fallback}?mode=reset`
  }
}

/**
 * POST /api/auth/check-registered — Public.
 *
 * Reports whether an email belongs to a provisioned staff account. Used by
 * the login page to gate OTP sign-in: one-time codes are a login method, not
 * a registration method, so an unregistered address must never receive one.
 *
 * Privacy: this necessarily reveals whether a given email is staff (an
 * enumeration surface), so the response is deliberately minimal — a boolean
 * pair and nothing else. No names, roles, or ids are returned. Responses are
 * uniform in shape and timing-irrelevant, and the endpoint is rate-limited at
 * the edge alongside the rest of the auth surface.
 */
router.post('/check-registered', async (req: Request, res: Response): Promise<void> => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''

  if (!email || !email.includes('@')) {
    res.status(400).json({ message: 'A valid email address is required.' })
    return
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('staff_profiles')
      .select('is_active')
      .ilike('email', email)
      .maybeSingle()

    if (error) {
      console.error('check-registered lookup error:', error)
      res.status(500).json({ message: 'Unable to verify this email right now. Please try again.' })
      return
    }

    // Uniform 200: absence is a normal outcome, not an error.
    res.json({
      registered: Boolean(data),
      active: Boolean(data?.is_active),
      message: data ? undefined : NOT_REGISTERED_MESSAGE,
    })
  } catch (err: unknown) {
    console.error('check-registered error:', err)
    res.status(500).json({ message: 'Unable to verify this email right now. Please try again.' })
  }
})

/**
 * POST /api/auth/send-login-otp — Public, gated on the email being staff.
 *
 * Issues a 6-digit sign-in code for an already-registered, active staff member
 * and mails it using our own SMTP relay when one is configured.
 *
 * WHY THIS BYPASSES SUPABASE'S MAILER
 * -----------------------------------
 * Supabase Auth's built-in mailer only delivers to addresses belonging to the
 * project's own team, and is limited to roughly two messages per hour. For a
 * real POS deployment that means staff codes never arrive, while Supabase still
 * answers `200 OK` — the failure is invisible. Generating and sending the code
 * ourselves removes both restrictions.
 *
 * When SMTP is NOT configured we answer `{ sent: false, reason: 'smtp' }` so the
 * client can fall back to Supabase's mailer. That keeps local development
 * working with zero setup while making production delivery explicit.
 *
 * Security notes:
 *  - Only active staff receive codes; the registration check mirrors
 *    /check-registered and returns the same enumeration-safe message.
 *  - The code is random (crypto), stored only as a SHA-256 hash, expires in
 *    5 minutes, and can be attempted only a handful of times.
 *  - A per-email cooldown prevents using this endpoint to spam a staff inbox.
 */
router.post('/send-login-otp', async (req: Request, res: Response): Promise<void> => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''

  if (!email || !email.includes('@')) {
    res.status(400).json({ message: 'A valid email address is required.' })
    return
  }

  try {
    // 1. Only provisioned, active staff may receive a code.
    const { data: staff, error: staffError } = await supabaseAdmin
      .from('staff_profiles')
      .select('is_active')
      .ilike('email', email)
      .maybeSingle()

    if (staffError) {
      console.error('send-login-otp staff lookup error:', staffError)
      res.status(500).json({ message: 'Unable to send a code right now. Please try again.' })
      return
    }
    if (!staff) {
      res.status(404).json({ message: NOT_REGISTERED_MESSAGE })
      return
    }
    if (!staff.is_active) {
      res.status(403).json({ message: 'This account has been deactivated. Contact an administrator.' })
      return
    }

    // 2. Without SMTP we cannot deliver, so hand control back to the client,
    //    which will use Supabase's mailer instead.
    if (!isSmtpConfigured()) {
      res.json({ sent: false, reason: 'smtp', message: 'Custom SMTP is not configured on the server.' })
      return
    }

    // 3. Cooldown: refuse a second code within 60 seconds for the same address.
    const cooldownFloor = new Date(Date.now() - 60_000).toISOString()
    const { data: recent, error: recentError } = await supabaseAdmin
      .from('login_otps')
      .select('created_at')
      .ilike('email', email)
      .gt('created_at', cooldownFloor)
      .limit(1)
      .maybeSingle()

    if (recentError && recentError.code !== 'PGRST205') {
      console.error('send-login-otp cooldown check error:', recentError)
      res.status(500).json({ message: 'Unable to send a code right now. Please try again.' })
      return
    }
    if (recent) {
      res.status(429).json({ message: 'A code was just sent. Please wait a minute before requesting another.' })
      return
    }

    // 4. Mint, store (hashed), and mail the code.
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
    const codeHash = crypto.createHash('sha256').update(code).digest('hex')
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString()

    const { error: insertError } = await supabaseAdmin
      .from('login_otps')
      .insert({ email, code_hash: codeHash, expires_at: expiresAt })

    if (insertError) {
      // PGRST205 = table absent: report it plainly so setup is obvious.
      if (insertError.code === 'PGRST205') {
        console.error('send-login-otp: login_otps table is missing. Apply the schema.sql migration.')
        res.json({ sent: false, reason: 'schema', message: 'The server database is missing its code table.' })
        return
      }
      console.error('send-login-otp insert error:', insertError)
      res.status(500).json({ message: 'Unable to send a code right now. Please try again.' })
      return
    }

    const { subject, text } = buildOtpEmail(code)
    const delivery = await sendMail({ to: email, subject, text })

    if (!delivery.delivered) {
      res.status(502).json({
        message: 'The code could not be emailed. An administrator needs to check the mail settings.',
        reason: 'delivery',
      })
      return
    }

    res.json({ sent: true })
  } catch (err: unknown) {
    console.error('send-login-otp error:', err)
    res.status(500).json({ message: 'Unable to send a code right now. Please try again.' })
  }
})

/**
 * POST /api/auth/send-password-reset — Public, gated on the email being staff.
 *
 * Mails a password-reset link using our own SMTP relay when one is configured.
 *
 * WHY THIS BYPASSES SUPABASE'S MAILER
 * -----------------------------------
 * The client used to call `supabase.auth.resetPasswordForEmail()` directly.
 * That goes through Supabase's built-in mailer, which only delivers to the
 * project's own team addresses and is limited to roughly two messages per hour.
 * Worse, it answers `200 OK` with an empty body even when nothing was sent, so
 * the UI said "check your email" for a message that was never queued. That is
 * exactly the reported symptom: request accepted, nothing in the inbox.
 *
 * We therefore mint the recovery link ourselves with the admin API (which does
 * NOT send mail) and deliver it through the same relay the sign-in code uses.
 *
 * When SMTP is NOT configured we answer `{ sent: false, reason: 'smtp' }` so the
 * client can fall back to Supabase's mailer. That keeps local development
 * working with zero setup while making production delivery explicit.
 *
 * Security notes:
 *  - Only active staff receive a link; the lookup mirrors /check-registered.
 *  - A per-address cooldown prevents using this endpoint to spam an inbox, and
 *    is applied *before* minting so a refused request cannot burn a token.
 *  - The link is single-use and expires on Supabase's own schedule.
 */
router.post('/send-password-reset', async (req: Request, res: Response): Promise<void> => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const requestedRedirect = typeof req.body?.redirectTo === 'string' ? req.body.redirectTo.trim() : ''

  if (!email || !email.includes('@')) {
    res.status(400).json({ message: 'A valid email address is required.' })
    return
  }

  try {
    // 1. Only provisioned, active staff may reset a password.
    const { data: staff, error: staffError } = await supabaseAdmin
      .from('staff_profiles')
      .select('is_active')
      .ilike('email', email)
      .maybeSingle()

    if (staffError) {
      console.error('send-password-reset staff lookup error:', staffError)
      res.status(500).json({ message: 'Unable to send a reset link right now. Please try again.' })
      return
    }
    if (!staff) {
      res.status(404).json({
        // Deliberately its own wording: the shared NOT_REGISTERED_MESSAGE talks
        // about "code sign-in", which is meaningless on the reset screen.
        message: 'This email is not registered as staff. Ask an administrator to create your account.',
        reason: 'refused',
      })
      return
    }
    if (!staff.is_active) {
      res.status(403).json({
        message: 'This account has been deactivated. Ask an administrator to restore access.',
        reason: 'refused',
      })
      return
    }

    // 2. Without SMTP we cannot deliver, so hand control back to the client,
    //    which will use Supabase's mailer instead.
    if (!isSmtpConfigured()) {
      res.json({ sent: false, reason: 'smtp', message: 'Custom SMTP is not configured on the server.' })
      return
    }

    // 3. Cooldown: refuse a second link within 60 seconds for the same address.
    const waitSeconds = resetCooldownRemaining(email)
    if (waitSeconds > 0) {
      res.status(429).json({
        message: `A reset link was just requested. Please wait ${waitSeconds} seconds before trying again.`,
        reason: 'refused',
      })
      return
    }

    // 4. Mint the recovery link. This does NOT send an email — we deliver it.
    const redirectTo = safeRedirectTarget(requestedRedirect)
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    })

    const actionLink = linkData?.properties?.action_link

    if (linkError || !actionLink) {
      console.error('send-password-reset generateLink error:', linkError)
      res.status(502).json({
        message: 'Unable to create a reset link for this account. Ask an administrator to check the mail settings.',
        reason: 'delivery',
      })
      return
    }

    // 5. Deliver it ourselves.
    const { subject, text } = buildPasswordResetEmail(actionLink)
    const delivery = await sendMail({ to: email, subject, text })

    if (!delivery.delivered) {
      res.status(502).json({
        message: 'The reset link could not be emailed. An administrator needs to check the mail settings.',
        reason: 'delivery',
      })
      return
    }

    // Only start the cooldown once a link has actually gone out.
    resetCooldowns.set(email, Date.now() + RESET_COOLDOWN_MS)
    res.json({ sent: true })
  } catch (err: unknown) {
    console.error('send-password-reset error:', err)
    res.status(500).json({ message: 'Unable to send a reset link right now. Please try again.' })
  }
})

/**
 * POST /api/auth/provision-self — Authenticated, self-service.
 *
 * Completes sign-up for a user who has authenticated (via email confirmation
 * link, OTP, or password) but has no staff_profiles row yet. Creates their
 * profile using the role they chose at sign-up, clamped to SELF_SIGNUP_ROLES.
 *
 * Why this exists: Supabase Auth owns account creation, but the app requires a
 * staff_profiles row for access. Without this step a self-registered user
 * authenticates successfully and is then locked out forever, because nothing
 * ever created the row.
 *
 * Security invariants:
 *  - Requires a valid session: the profile is always created for req.userId,
 *    never for a body-supplied id.
 *  - Role is clamped to SELF_SIGNUP_ROLES; admin is never reachable here.
 *  - Idempotent and non-destructive: if a row already exists it is returned
 *    as-is. A deactivated row is never reactivated.
 *  - Email/full_name are taken from the verified token claims where possible,
 *    not trusted from the request body alone.
 */
router.post('/provision-self', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const body = (req.body ?? {}) as { full_name?: string; role?: string }
  const email = (req.userEmail ?? '').trim().toLowerCase()

  if (!req.userId || !email) {
    res.status(400).json({ message: 'Your session is missing an email address. Please sign in again.' })
    return
  }

  try {
    // 1. Already provisioned? Return it untouched (idempotent). A deactivated
    //    row stays deactivated — self-service never undoes an admin action.
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('staff_profiles')
      .select('id, role, is_active')
      .eq('user_id', req.userId)
      .maybeSingle()

    if (lookupError) {
      console.error('provision-self lookup failed:', lookupError)
      res.status(500).json({ message: 'Unable to check your account right now. Please try again.' })
      return
    }

    if (existing) {
      res.json({ provisioned: true, created: false, role: existing.role, is_active: existing.is_active })
      return
    }

    // 2. Also catch a pre-provisioned row that was created by an admin before
    //    this user first signed in (matched by email but not yet linked).
    const { data: byEmail } = await supabaseAdmin
      .from('staff_profiles')
      .select('id, role, is_active')
      .ilike('email', email)
      .maybeSingle()

    if (byEmail) {
      const { error: linkError } = await supabaseAdmin
        .from('staff_profiles')
        .update({ user_id: req.userId })
        .eq('id', byEmail.id)

      if (linkError) {
        console.error('provision-self link failed:', linkError)
        res.status(500).json({ message: 'Unable to link your staff profile. Contact an administrator.' })
        return
      }

      res.json({ provisioned: true, created: false, role: byEmail.role, is_active: byEmail.is_active })
      return
    }

    // 3. Fresh account — create the profile. Role is clamped; anything
    //    unrecognised (including a hand-crafted "admin") falls back to cashier.
    const requestedRole = body.role
    const role: SelfSignupRole = isSelfSignupRole(requestedRole) ? requestedRole : 'cashier'

    const fullName =
      (typeof body.full_name === 'string' && body.full_name.trim()) ||
      email.split('@')[0]

    const { data: created, error: insertError } = await supabaseAdmin
      .from('staff_profiles')
      .insert({
        user_id: req.userId,
        full_name: fullName,
        email,
        role,
        is_active: true,
        created_by: null,
      })
      .select('id, role, is_active')
      .maybeSingle()

    if (insertError) {
      // A concurrent request may have created it a moment ago — treat the
      // unique violation as success rather than failing the user.
      if (insertError.code === '23505') {
        const { data: raced } = await supabaseAdmin
          .from('staff_profiles')
          .select('id, role, is_active')
          .eq('user_id', req.userId)
          .maybeSingle()
        if (raced) {
          res.json({ provisioned: true, created: false, role: raced.role, is_active: raced.is_active })
          return
        }
      }

      console.error('provision-self insert failed:', insertError)
      res.status(500).json({ message: 'Unable to create your staff profile. Contact an administrator.' })
      return
    }

    res.status(201).json({ provisioned: true, created: true, role: created?.role, is_active: created?.is_active })
  } catch (err: unknown) {
    console.error('provision-self error:', err)
    res.status(500).json({ message: 'Unable to complete your registration. Please try again.' })
  }
})

/**
 * POST /api/auth/signup — Admin only.
 *
 * Provisions a new staff account. This is NOT a public sign-up endpoint:
 * public self-registration is disabled by design, so an existing admin must
 * be authenticated to create an account. The role is validated against
 * ASSIGNABLE_ROLES and never inferred from the request body.
 *
 * For the very first admin account, insert the user directly in the Supabase
 * dashboard (Authentication → Users → Add User) and add the matching
 * public.staff_profiles row — see README "Create the First Admin Account".
 */
router.post(
  '/signup',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { email, password, full_name, role } = req.body as {
      email?: string
      password?: string
      full_name?: string
      role?: string
    }

    if (!email || !password || !full_name) {
      res.status(400).json({ message: 'Full name, email, and password are required.' })
      return
    }

    const pwdError = validatePassword(password)
    if (pwdError) {
      res.status(400).json({ message: pwdError })
      return
    }

    // Role must be explicitly provided and must be a valid, non-privileged-by-default value.
    if (!isAssignableRole(role)) {
      res.status(400).json({
        message: `A valid role is required. One of: ${ASSIGNABLE_ROLES.join(', ')}.`,
      })
      return
    }

    // Never allow provisioning through this route to target the caller's own account.
    if (req.userEmail && req.userEmail.toLowerCase() === email.toLowerCase()) {
      res.status(400).json({ message: 'You cannot provision an account for your own email address.' })
      return
    }

    try {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, role },
      })

      if (authError || !authData?.user) {
        res.status(400).json({ message: authError?.message ?? 'Failed to create user account.' })
        return
      }

      const userId = authData.user.id

      // Resolve the calling admin's staff_profile id for the created_by audit field.
      const { data: adminProfile } = await supabaseAdmin
        .from('staff_profiles')
        .select('id')
        .eq('user_id', req.userId!)
        .maybeSingle()

      const { data: existingProfile } = await supabaseAdmin
        .from('staff_profiles')
        .select('id')
        .ilike('email', email)
        .maybeSingle()

      if (existingProfile) {
        const { error: updateError } = await supabaseAdmin
          .from('staff_profiles')
          .update({
            user_id: userId,
            full_name,
            role,
            is_active: true,
            created_by: adminProfile?.id ?? null,
          })
          .eq('id', existingProfile.id)

        if (updateError) {
          await supabaseAdmin.auth.admin.deleteUser(userId)
          res.status(500).json({ message: updateError.message })
          return
        }
      } else {
        const { error: insertError } = await supabaseAdmin.from('staff_profiles').insert({
          user_id: userId,
          full_name,
          email,
          role,
          is_active: true,
          created_by: adminProfile?.id ?? null,
        })

        if (insertError) {
          // Roll back the auth user so we don't leave an orphaned account.
          await supabaseAdmin.auth.admin.deleteUser(userId)
          res.status(500).json({ message: insertError.message })
          return
        }
      }

      res.status(201).json({
        success: true,
        message: 'Account successfully registered and profile provisioned.',
        user: { id: userId, email, full_name, role },
      })
    } catch (err: unknown) {
      console.error('Registration error in /api/auth/signup:', err)
      res.status(500).json({
        message: err instanceof Error ? err.message : 'Internal registration error.',
      })
    }
  }
)

export default router
