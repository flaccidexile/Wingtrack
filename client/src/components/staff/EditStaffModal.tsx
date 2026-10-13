import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiRemoveStaffAvatar, apiUpdateStaff, apiUploadStaffAvatar } from '@/lib/api'
import { STAFF_ROLES } from '@/lib/staff'
import Avatar from '@/components/ui/Avatar'
import type { StaffProfile, StaffRole } from '@/types'

interface EditStaffModalProps {
  /** The member being edited, or null to keep the dialog closed. */
  staff: StaffProfile | null
  /** The signed-in admin's profile — used to disable self-destructive edits. */
  self?: StaffProfile | null
  onClose: () => void
  /** Called with the saved row so the caller can update its list in place. */
  onSaved: (updated: StaffProfile) => void
}

/** Mirrors the limits enforced by the API and shown in Settings. */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const ACCEPTED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Edit Staff Member dialog.
 *
 * Covers everything an administrator can change about an account: photo,
 * display name, sign-in email, role and access. The email field is the same
 * address used to sign in, so the server moves the auth account with it — the
 * copy below the field says so, because that is not obvious.
 *
 * The photo is applied the moment it is chosen rather than on save: it is an
 * independent request, and uploading it up-front means a member's picture is
 * visible in the roster even if the admin then cancels the rest of the edit.
 *
 * Guards that need server state (never leave the shop without an active
 * administrator) are enforced by the API; the self-edit guards are mirrored
 * here so the admin sees why the control is unavailable before submitting.
 */
export default function EditStaffModal({ staff, self, onClose, onSaved }: EditStaffModalProps) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<StaffRole>('cashier')
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The photo is tracked separately from the form fields because it is saved
  // on its own, immediately.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isSelf = Boolean(staff && self && staff.id === self.id)

  // Re-seed the form each time a different member is opened.
  useEffect(() => {
    if (!staff) return
    setFullName(staff.full_name)
    setEmail(staff.email)
    setRole(staff.role)
    setIsActive(staff.is_active)
    setAvatarUrl(staff.avatar_url ?? null)
    setError(null)
    setPhotoError(null)
    setSaving(false)
    setPhotoBusy(false)
  }, [staff])

  // Lock background scroll and close on Escape.
  useEffect(() => {
    if (!staff) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving && !photoBusy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [staff, saving, photoBusy, onClose])

  if (!staff || typeof document === 'undefined') return null

  const dirty =
    fullName.trim() !== staff.full_name ||
    email.trim().toLowerCase() !== staff.email.toLowerCase() ||
    role !== staff.role ||
    isActive !== staff.is_active

  /** Uploads the chosen image straight away and reflects it in the roster. */
  async function handlePhotoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset immediately so picking the same file twice still fires a change.
    e.target.value = ''
    if (!file || !staff) return

    setPhotoError(null)

    if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
      setPhotoError('Only JPG, PNG or WebP images are supported.')
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setPhotoError('That image is larger than 5 MB. Please choose a smaller file.')
      return
    }

    setPhotoBusy(true)
    try {
      const updated = await apiUploadStaffAvatar(staff.id, file)
      setAvatarUrl(updated.avatar_url ?? null)
      onSaved(updated)
    } catch (err: unknown) {
      setPhotoError(err instanceof Error ? err.message : 'Could not upload that photo.')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleRemovePhoto() {
    if (!staff) return
    setPhotoError(null)
    setPhotoBusy(true)
    try {
      const updated = await apiRemoveStaffAvatar(staff.id)
      setAvatarUrl(null)
      onSaved(updated)
    } catch (err: unknown) {
      setPhotoError(err instanceof Error ? err.message : 'Could not remove that photo.')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!staff) return
    setError(null)

    if (fullName.trim().length < 2) {
      setError('Full name must be at least 2 characters.')
      return
    }

    // Send only what actually changed, so an untouched email never triggers a
    // needless auth-account update.
    const payload: Parameters<typeof apiUpdateStaff>[1] = {}
    if (fullName.trim() !== staff.full_name) payload.full_name = fullName.trim()
    if (email.trim().toLowerCase() !== staff.email.toLowerCase()) payload.email = email.trim().toLowerCase()
    if (role !== staff.role) payload.role = role
    if (isActive !== staff.is_active) payload.is_active = isActive

    if (Object.keys(payload).length === 0) { onClose(); return }

    setSaving(true)
    try {
      const updated = await apiUpdateStaff(staff.id, payload)
      onSaved(updated)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save these changes.')
    } finally {
      setSaving(false)
    }
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 600,
    color: 'var(--foreground)', marginBottom: 6,
  }
  const hintStyle: React.CSSProperties = {
    fontSize: 12, color: 'var(--muted-foreground)', marginTop: 6, lineHeight: 1.5,
  }
  const busy = saving || photoBusy

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: 20,
      }}
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div className="card fade-in dialog-card" style={{ width: '100%', maxWidth: 460, padding: '28px 26px', boxShadow: '0 25px 60px rgba(0,0,0,0.35)' }}>
        <h2 style={{ fontFamily: 'Inter', fontSize: 20, fontWeight: 700, color: 'var(--foreground)' }}>
          Edit Staff Member
        </h2>
        <p style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--muted-foreground)', marginTop: 4, marginBottom: 20, overflowWrap: 'anywhere' }}>
          ID: {staff.id.slice(0, 8)}…
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ── Photo ─────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Avatar
              name={fullName || staff.full_name}
              src={avatarUrl}
              size={58}
              title={avatarUrl ? `${staff.full_name}'s photo` : undefined}
            />

            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--foreground)', overflowWrap: 'anywhere' }}>
                {fullName || staff.full_name}
              </p>
              <p style={{ fontSize: 11.5, color: 'var(--muted-foreground)', fontFamily: 'IBM Plex Mono', marginTop: 2, overflowWrap: 'anywhere' }}>
                {staff.email}
              </p>

              <input
                ref={fileInputRef}
                id={`edit-avatar-file-${staff.id}`}
                type="file"
                accept={ACCEPTED_AVATAR_TYPES.join(',')}
                onChange={handlePhotoPicked}
                style={{ display: 'none' }}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  id={`btn-edit-photo-${staff.id}`}
                  disabled={photoBusy}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    fontSize: 12, padding: '5px 12px', borderRadius: 6, fontWeight: 600,
                    background: 'transparent', border: '1px solid var(--border)',
                    color: 'var(--foreground)', cursor: photoBusy ? 'wait' : 'pointer',
                    opacity: photoBusy ? 0.6 : 1,
                  }}
                >
                  {photoBusy ? 'Working…' : avatarUrl ? 'Replace photo' : 'Upload photo'}
                </button>

                {avatarUrl && !photoBusy && (
                  <button
                    type="button"
                    id={`btn-edit-photo-remove-${staff.id}`}
                    onClick={handleRemovePhoto}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                      fontSize: 12, color: 'var(--danger)', textDecoration: 'underline',
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>

              {photoError ? (
                <p role="alert" style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>{photoError}</p>
              ) : (
                <p style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 6 }}>
                  {avatarUrl
                    ? 'Shown across the Staff Manager and in the sidebar.'
                    : 'No photo yet — initials are shown instead. JPG, PNG or WebP up to 5 MB.'}
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="edit-staff-name" style={labelStyle}>Full Name</label>
            <input
              id="edit-staff-name"
              className="input"
              type="text"
              required
              autoFocus
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              style={{ padding: '11px 14px', fontSize: 14 }}
            />
          </div>

          <div>
            <label htmlFor="edit-staff-email" style={labelStyle}>Email</label>
            <input
              id="edit-staff-email"
              className="input"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ padding: '11px 14px', fontSize: 14 }}
            />
            <p style={hintStyle}>This is also the sign-in address. Changing it updates the login immediately.</p>
          </div>

          <div>
            <label htmlFor="edit-staff-role" style={labelStyle}>Role</label>
            <select
              id="edit-staff-role"
              className="input"
              value={role}
              disabled={isSelf}
              onChange={e => setRole(e.target.value as StaffRole)}
              style={{ padding: '11px 14px', fontSize: 14, opacity: isSelf ? 0.65 : 1, cursor: isSelf ? 'not-allowed' : 'pointer' }}
            >
              {STAFF_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {isSelf && <p style={hintStyle}>You cannot change your own role — ask another administrator.</p>}
          </div>

          <div>
            <label
              htmlFor="edit-staff-active"
              style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: isSelf ? 'not-allowed' : 'pointer' }}
            >
              <input
                id="edit-staff-active"
                type="checkbox"
                checked={isActive}
                disabled={isSelf}
                onChange={e => setIsActive(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: isSelf ? 'not-allowed' : 'pointer' }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>Account active</span>
            </label>
            <p style={{ ...hintStyle, marginLeft: 25 }}>
              {isSelf
                ? 'You cannot deactivate your own account.'
                : isActive ? 'This person can sign in.' : 'This person will be signed out and blocked from signing in.'}
            </p>
          </div>

          {error && (
            <div role="alert" style={{ background: 'var(--danger-bg)', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', fontWeight: 500 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy} style={{ flex: 1, padding: '12px' }}>
              Cancel
            </button>
            <button
              id="btn-save-staff"
              type="submit"
              className="btn-primary"
              disabled={busy || !dirty}
              style={{ flex: 2, padding: '12px' }}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
