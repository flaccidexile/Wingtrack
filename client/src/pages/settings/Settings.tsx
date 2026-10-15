import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  apiRemoveAvatar,
  apiUpdateMyProfile,
  apiUpdatePassword,
  apiUploadAvatar,
} from '@/lib/api'
import { MIN_PASSWORD_LENGTH } from '@/lib/validation'
import { roleLabel } from '@/lib/staff'
import Avatar from '@/components/ui/Avatar'

/** Mirrors the copy shown under the Upload photo button. */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const ACCEPTED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600,
  color: 'var(--foreground)', marginBottom: 7,
}


/** Read-only identity field — muted so it reads as "not editable here". */
function LockedField({ label, value, flex = 1 }: { label: string; value: string; flex?: number }) {
  return (
    <div style={{ flex, minWidth: 160 }}>
      <label style={labelStyle}>{label}</label>
      <div
        style={{
          padding: '11px 14px', borderRadius: 8, fontSize: 14,
          background: 'var(--muted)', border: '1px solid var(--border)',
          color: 'var(--muted-foreground)', overflowWrap: 'anywhere',
        }}
      >
        {value}
      </div>
    </div>
  )
}

// ── Eye icon ─────────────────────────────────────────────
function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

// ── Password input with individual show/hide toggle ───────
function PwdInput({
  id, label, value, onChange, placeholder, show, onToggle, autoComplete = 'new-password',
}: {
  id: string; label: string; value: string;
  onChange: (v: string) => void; placeholder: string;
  show: boolean; onToggle: () => void; autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          className="input"
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ padding: '11px 44px 11px 14px', fontSize: 14, width: '100%', boxSizing: 'border-box' }}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? 'Hide password' : 'Show password'}
          style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', padding: 0,
          }}
        >
          <EyeIcon open={show} />
        </button>
      </div>
    </div>
  )
}

// ── Change Password Modal ─────────────────────────────────
function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!open) {
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
      setShowCurrent(false); setShowNew(false); setShowConfirm(false)
      setError(null); setSaved(false); setBusy(false)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    if (!currentPwd) { setError('Please enter your current password.'); return }
    if (newPwd.length < MIN_PASSWORD_LENGTH) {
      setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`); return
    }
    if (newPwd !== confirmPwd) { setError('New passwords do not match.'); return }
    if (currentPwd === newPwd) {
      setError('New password must be different from your current password.'); return
    }

    setBusy(true)
    try {
      await apiUpdatePassword(newPwd)
      setSaved(true)
      setTimeout(() => onClose(), 1600)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not change your password.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-pwd-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        }}
      />
      {/* Panel */}
      <div style={{
        position: 'relative', zIndex: 1,
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '32px 32px 28px',
        width: '100%', maxWidth: 460,
        boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
          <div>
            <h2 id="change-pwd-title" style={{ fontFamily: 'Inter', fontSize: 20, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
              Change Password
            </h2>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 4, marginBottom: 0 }}>
              Choose a strong password of at least {MIN_PASSWORD_LENGTH} characters.
            </p>
          </div>
          <button
            type="button"
            id="btn-close-change-pwd"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', marginLeft: 12,
              color: 'var(--muted-foreground)', padding: 4, borderRadius: 6,
              display: 'flex', alignItems: 'center',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Info banner */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--muted)', borderRadius: 10, padding: '11px 14px', marginBottom: 22,
        }}>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
            You'll be signed out after updating your password.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PwdInput
            id="modal-current-password"
            label="Current Password"
            value={currentPwd}
            onChange={setCurrentPwd}
            placeholder="Enter your current password"
            show={showCurrent}
            onToggle={() => setShowCurrent(p => !p)}
            autoComplete="current-password"
          />

          <div style={{ borderTop: '1px solid var(--border)' }} />

          <PwdInput
            id="modal-new-password"
            label="New Password"
            value={newPwd}
            onChange={setNewPwd}
            placeholder={`Min. ${MIN_PASSWORD_LENGTH} characters`}
            show={showNew}
            onToggle={() => setShowNew(p => !p)}
          />

          <PwdInput
            id="modal-confirm-password"
            label="Confirm New Password"
            value={confirmPwd}
            onChange={setConfirmPwd}
            placeholder="Re-type the new password"
            show={showConfirm}
            onToggle={() => setShowConfirm(p => !p)}
          />

          {error && (
            <div role="alert" style={{
              background: 'var(--danger-bg)', border: '1px solid #fca5a5',
              borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', fontWeight: 500,
            }}>{error}</div>
          )}

          {saved && (
            <div role="status" style={{
              background: '#f0fdf4', border: '1px solid #86efac',
              borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--success)', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Password updated successfully!
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              type="button"
              id="btn-cancel-change-pwd"
              onClick={onClose}
              disabled={busy}
              style={{
                padding: '10px 20px', fontSize: 14, borderRadius: 8, fontWeight: 600,
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--foreground)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              id="btn-submit-change-pwd"
              type="submit"
              className="btn-primary"
              disabled={busy || saved}
              style={{ padding: '10px 22px', fontSize: 14 }}
            >
              {busy ? 'Updating…' : saved ? 'Updated!' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Settings page ────────────────────────────────────
export default function Settings() {
  const { profile, refreshProfile } = useAuth()

  // ── My Profile ────────────────────────────────────────────
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSaved, setProfileSaved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // ── Change Password Modal ─────────────────────────────────
  const [pwdModalOpen, setPwdModalOpen] = useState(false)

  // Re-seed the name field whenever the profile is re-read.
  useEffect(() => { setFullName(profile?.full_name ?? '') }, [profile?.full_name])

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setProfileError(null)
    setProfileSaved(false)

    const clean = fullName.trim()
    if (clean.length < 2) {
      setProfileError('Full name must be at least 2 characters.')
      return
    }
    if (clean === profile?.full_name) {
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2000)
      return
    }

    setProfileBusy(true)
    try {
      await apiUpdateMyProfile({ full_name: clean })
      // Re-read so the sidebar, receipts and audit log all pick up the new name.
      await refreshProfile()
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2500)
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : 'Could not save your profile.')
    } finally {
      setProfileBusy(false)
    }
  }

  async function handleAvatarPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset immediately so picking the same file twice still fires a change.
    e.target.value = ''
    if (!file) return

    setUploadError(null)

    if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
      setUploadError('Only JPG, PNG or WebP images are supported.')
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setUploadError('That image is larger than 5 MB. Please choose a smaller file.')
      return
    }

    setUploading(true)
    try {
      await apiUploadAvatar(file)
      await refreshProfile()
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Could not upload that image.')
    } finally {
      setUploading(false)
    }
  }

  async function handleRemoveAvatar() {
    setUploadError(null)
    setUploading(true)
    try {
      await apiRemoveAvatar()
      await refreshProfile()
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Could not remove your photo.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title" style={{ fontSize: 26 }}>Settings</h1>
        <p className="page-subtitle">Manage your account and profile details</p>
      </div>

      {/* ── My Profile ──────────────────────────────────────── */}
      <section className="card" style={{ padding: '24px 26px', marginBottom: 18 }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'Inter', fontSize: 19, fontWeight: 700, color: 'var(--foreground)' }}>My Profile</h2>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 4 }}>Your name appears on receipts and in the audit log</p>
        </div>

        <form onSubmit={handleSaveProfile}>
          <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Photo */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: 132, flexShrink: 0 }}>
              <Avatar name={profile?.full_name} src={profile?.avatar_url} size={84} />
              <input
                ref={fileInputRef}
                id="avatar-file-input"
                type="file"
                accept={ACCEPTED_AVATAR_TYPES.join(',')}
                onChange={handleAvatarPicked}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                id="btn-upload-photo"
                className="btn-ghost"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                style={{ padding: '8px 14px', fontSize: 12.5, width: '100%' }}
              >
                {uploading ? 'Uploading…' : profile?.avatar_url ? 'Replace photo' : 'Upload photo'}
              </button>
              {profile?.avatar_url && !uploading && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--muted-foreground)', textDecoration: 'underline', padding: 0 }}
                >
                  Remove photo
                </button>
              )}
              <p style={{ fontSize: 11, color: 'var(--muted-foreground)', textAlign: 'center', lineHeight: 1.45 }}>
                JPG, PNG or WebP<br />max 5 MB
              </p>
            </div>

            {/* Fields */}
            <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label htmlFor="settings-full-name" style={labelStyle}>Full Name</label>
                <input
                  id="settings-full-name"
                  className="input"
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  style={{ padding: '11px 14px', fontSize: 14 }}
                />
              </div>

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <LockedField label="Email" value={profile?.email ?? '—'} flex={2} />
                <LockedField label="Role" value={roleLabel(profile?.role)} flex={1} />
              </div>

              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: -6 }}>
                Email and role are identity fields — ask an administrator to change them.
              </p>

              {uploadError && (
                <div role="alert" style={{ background: 'var(--danger-bg)', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', fontWeight: 500 }}>
                  {uploadError}
                </div>
              )}
              {profileError && (
                <div role="alert" style={{ background: 'var(--danger-bg)', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', fontWeight: 500 }}>
                  {profileError}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button id="btn-save-profile" type="submit" className="btn-primary" disabled={profileBusy} style={{ padding: '11px 22px', fontSize: 14 }}>
                  {profileBusy ? 'Saving…' : 'Save Profile'}
                </button>
                {profileSaved && (
                  <span style={{ fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>Profile saved.</span>
                )}
              </div>
            </div>
          </div>
        </form>

        {/* ── Security divider ─────────────────────────────── */}
        <div style={{ borderTop: '1px solid var(--border)', margin: '24px 0 20px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>Password &amp; Security</p>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 3, marginBottom: 0 }}>
              Update your login password at any time.
            </p>
          </div>
          <button
            type="button"
            id="btn-open-change-password"
            onClick={() => setPwdModalOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600,
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--foreground)', cursor: 'pointer',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--muted)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Change Password
          </button>
        </div>
      </section>

      {/* ── Change Password Modal ────────────────────────── */}
      <ChangePasswordModal open={pwdModalOpen} onClose={() => setPwdModalOpen(false)} />
    </div>
  )
}

