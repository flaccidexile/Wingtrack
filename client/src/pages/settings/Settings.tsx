import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  apiGetStaff,
  apiRemoveAvatar,
  apiUpdateMyProfile,
  apiUpdatePassword,
  apiUploadAvatar,
} from '@/lib/api'
import { MIN_PASSWORD_LENGTH } from '@/lib/validation'
import { ROLE_BADGE, roleLabel } from '@/lib/staff'
import Avatar from '@/components/ui/Avatar'
import EditStaffModal from '@/components/staff/EditStaffModal'
import StaffDetailModal from '@/components/staff/StaffDetailModal'
import type { StaffProfile } from '@/types'

/** Mirrors the copy shown under the Upload photo button. */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const ACCEPTED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600,
  color: 'var(--foreground)', marginBottom: 7,
}

/** Section wrapper: title, one-line description, then the body. */
function Section({
  title,
  description,
  aside,
  children,
}: {
  title: string
  description: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="card" style={{ padding: '24px 26px', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontFamily: 'Fraunces', fontSize: 19, fontWeight: 700, color: 'var(--foreground)' }}>{title}</h2>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 4 }}>{description}</p>
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
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

export default function Settings() {
  const { profile, role, refreshProfile } = useAuth()
  const isAdmin = role === 'admin'

  // ── My Profile ────────────────────────────────────────────
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSaved, setProfileSaved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // Re-seed the name field whenever the profile is re-read (e.g. the heartbeat
  // picked up an admin's edit).
  useEffect(() => { setFullName(profile?.full_name ?? '') }, [profile?.full_name])

  // ── Security ──────────────────────────────────────────────
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [pwdBusy, setPwdBusy] = useState(false)
  const [pwdError, setPwdError] = useState<string | null>(null)
  const [pwdSaved, setPwdSaved] = useState(false)

  // ── User Accounts (admin only) ────────────────────────────
  const [accounts, setAccounts] = useState<StaffProfile[]>([])
  const [accountsLoading, setAccountsLoading] = useState(isAdmin)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<StaffProfile | null>(null)
  /** The member whose read-only profile panel is open, if any. */
  const [viewing, setViewing] = useState<StaffProfile | null>(null)

  /**
   * Loads through the API so the avatars and sign-in times held on the auth
   * user are included — the browser cannot read `auth.users` itself.
   */
  const loadAccounts = useCallback(async () => {
    try {
      setAccounts(await apiGetStaff())
    } catch {
      // Leave the previous list in place; the section stays usable.
    } finally {
      setAccountsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) void loadAccounts()
  }, [isAdmin, loadAccounts])

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

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwdError(null)
    setPwdSaved(false)

    if (newPwd.length < MIN_PASSWORD_LENGTH) {
      setPwdError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (newPwd !== confirmPwd) {
      setPwdError('Passwords do not match.')
      return
    }

    setPwdBusy(true)
    try {
      await apiUpdatePassword(newPwd)
      setPwdSaved(true)
      setNewPwd('')
      setConfirmPwd('')
      setTimeout(() => setPwdSaved(false), 3000)
    } catch (err: unknown) {
      setPwdError(err instanceof Error ? err.message : 'Could not change your password.')
    } finally {
      setPwdBusy(false)
    }
  }

  const query = search.trim().toLowerCase()
  const visibleAccounts = query
    ? accounts.filter(a =>
        a.full_name.toLowerCase().includes(query) || a.email.toLowerCase().includes(query))
    : accounts

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Fraunces', fontSize: 26, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>
          Settings
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
          Manage your account, staff details and store preferences
        </p>
      </div>

      {/* ── My Profile ──────────────────────────────────────── */}
      <Section title="My Profile" description="Your name appears on receipts and in the audit log">
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
      </Section>

      {/* ── Security ────────────────────────────────────────── */}
      <Section title="Security" description={`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters`}>
        <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 520 }}>
          <div>
            <label htmlFor="settings-new-password" style={labelStyle}>New Password</label>
            <input
              id="settings-new-password"
              className="input"
              type={showPwd ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder={`Min. ${MIN_PASSWORD_LENGTH} characters`}
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              style={{ padding: '11px 14px', fontSize: 14 }}
            />
          </div>

          <div>
            <label htmlFor="settings-confirm-password" style={labelStyle}>Confirm New Password</label>
            <input
              id="settings-confirm-password"
              className="input"
              type={showPwd ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Re-type the new password"
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              style={{ padding: '11px 14px', fontSize: 14 }}
            />
          </div>

          <label htmlFor="settings-show-passwords" style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', width: 'fit-content' }}>
            <input
              id="settings-show-passwords"
              type="checkbox"
              checked={showPwd}
              onChange={e => setShowPwd(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, color: 'var(--foreground)' }}>Show passwords</span>
          </label>

          {pwdError && (
            <div role="alert" style={{ background: 'var(--danger-bg)', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', fontWeight: 500 }}>
              {pwdError}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button id="btn-change-password" type="submit" className="btn-primary" disabled={pwdBusy} style={{ padding: '11px 22px', fontSize: 14 }}>
              {pwdBusy ? 'Updating…' : 'Change Password'}
            </button>
            {pwdSaved && (
              <span style={{ fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>Password updated.</span>
            )}
          </div>
        </form>
      </Section>

      {/* ── User Accounts (admin only) ──────────────────────── */}
      {isAdmin && (
        <Section
          title="User Accounts"
          description="Edit a staff member's name, email, role or access."
          aside={
            <input
              id="settings-account-search"
              className="input"
              type="search"
              placeholder="Search name or email"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 220, padding: '9px 14px', fontSize: 13 }}
            />
          }
        >
          {accountsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
              <div className="spinner" style={{ width: 26, height: 26, borderWidth: 3 }} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {visibleAccounts.map((a, i) => (
                <div
                  key={a.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0',
                    borderTop: i === 0 ? 'none' : '1px solid var(--muted)',
                    flexWrap: 'wrap',
                  }}
                >
                  <Avatar name={a.full_name} src={a.avatar_url} size={36} />
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)', overflowWrap: 'anywhere' }}>
                      {a.full_name}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--muted-foreground)', fontFamily: 'DM Mono', overflowWrap: 'anywhere' }}>
                      {a.email}
                    </p>
                  </div>

                  <span style={{
                    fontSize: 12, padding: '4px 11px', borderRadius: 20, fontWeight: 600, whiteSpace: 'nowrap',
                    background: ROLE_BADGE[a.role].bg, color: ROLE_BADGE[a.role].color,
                  }}>
                    {roleLabel(a.role)}
                  </span>

                  <span style={{
                    fontSize: 12, padding: '4px 10px', borderRadius: 20, fontWeight: 700, whiteSpace: 'nowrap',
                    background: a.is_active ? '#e8f5e9' : '#f3f4f6',
                    color: a.is_active ? '#15803d' : '#6b7280',
                  }}>
                    {a.is_active ? 'Active' : 'Inactive'}
                  </span>

                  <button
                    type="button"
                    id={`settings-view-${a.id}`}
                    onClick={() => setViewing(a)}
                    style={{
                      fontSize: 12, padding: '6px 14px', borderRadius: 6, fontWeight: 600,
                      background: 'transparent', border: '1px solid var(--border)',
                      color: 'var(--foreground)', cursor: 'pointer',
                    }}
                  >
                    View
                  </button>

                  <button
                    type="button"
                    id={`settings-edit-${a.id}`}
                    onClick={() => setEditing(a)}
                    style={{
                      fontSize: 12, padding: '6px 14px', borderRadius: 6, fontWeight: 600,
                      background: 'transparent', border: '1px solid var(--border)',
                      color: 'var(--foreground)', cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                </div>
              ))}

              {visibleAccounts.length === 0 && (
                <p style={{ padding: '28px 0', fontSize: 14, color: 'var(--muted-foreground)', textAlign: 'center' }}>
                  {query ? `No staff match “${search.trim()}”.` : 'No staff accounts yet.'}
                </p>
              )}
            </div>
          )}
        </Section>
      )}

      <EditStaffModal
        staff={editing}
        self={profile}
        onClose={() => setEditing(null)}
        onSaved={updated => {
          setAccounts(prev => prev.map(a => (a.id === updated.id ? updated : a)))
          // A self-edit via this dialog should refresh the shell too.
          if (updated.id === profile?.id) void refreshProfile()
        }}
      />

      {/* Read-only profile panel — the same one the Staff Manager uses. */}
      <StaffDetailModal
        staff={viewing}
        provisionedBy={
          viewing?.created_by
            ? accounts.find(a => a.id === viewing.created_by)?.full_name ?? 'Administrator'
            : null
        }
        isSelf={Boolean(viewing && profile && viewing.id === profile.id)}
        onClose={() => setViewing(null)}
        onEdit={() => { setEditing(viewing); setViewing(null) }}
      />
    </div>
  )
}
