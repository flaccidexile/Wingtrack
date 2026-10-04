import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { apiUpdatePassword } from '@/lib/api'
import type { StaffRole } from '@/types'

type Page =
  | 'dashboard'
  | 'pos'
  | 'orders'
  | 'menu'
  | 'inventory'
  | 'analytics'
  | 'staff'

interface NavItem {
  id: Page
  label: string
  roles: StaffRole[]
  icon: React.FC<{ active: boolean }>
}

function DashIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--sidebar-active)' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  )
}
function PosIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--sidebar-active)' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <line x1="6" y1="9" x2="6" y2="9.01"/><line x1="10" y1="9" x2="10" y2="9.01"/>
      <line x1="14" y1="9" x2="14" y2="9.01"/><line x1="6" y1="13" x2="6" y2="13.01"/>
      <line x1="10" y1="13" x2="10" y2="13.01"/><line x1="14" y1="13" x2="18" y2="13"/>
    </svg>
  )
}
function OrdersIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--sidebar-active)' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  )
}
function MenuIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--sidebar-active)' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/>
      <path d="M7 2v20"/>
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>
    </svg>
  )
}
function InvIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--sidebar-active)' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6l9-3 9 3v12l-9 3-9-3V6z"/><path d="M12 3v18M3 6l9 3 9-3"/>
    </svg>
  )
}
function AnaIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--sidebar-active)' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  )
}
function StaffIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--sidebar-active)' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard',     roles: ['admin'],                       icon: DashIcon   },
  { id: 'pos',       label: 'Point of Sale',  roles: ['admin', 'cashier'],            icon: PosIcon    },
  { id: 'orders',    label: 'Transactions',   roles: ['admin'],                       icon: OrdersIcon },
  { id: 'menu',      label: 'Menu Items',     roles: ['admin'],                       icon: MenuIcon   },
  { id: 'inventory', label: 'Inventory',      roles: ['admin', 'inventory_personnel'], icon: InvIcon    },
  { id: 'analytics', label: 'Analytics',      roles: ['admin'],                       icon: AnaIcon    },
  { id: 'staff',     label: 'Staff Manager',  roles: ['admin'],                       icon: StaffIcon  },
]

interface SidebarProps {
  page: Page
  setPage: (p: Page) => void
}

export default function Sidebar({ page, setPage }: SidebarProps) {
  const { profile, role, signOut } = useAuth()
  const [showPwdModal, setShowPwdModal] = useState(false)
  const [newPwd, setNewPwd] = useState('')
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)
  const [pwdError, setPwdError] = useState<string | null>(null)
  const [pwdSuccess, setPwdSuccess] = useState(false)
  const [pwdLoading, setPwdLoading] = useState(false)

  const visibleNav = NAV_ITEMS.filter(item => role && item.roles.includes(role))

  const roleLabel: Record<StaffRole, string> = {
    admin: 'Admin / Manager',
    cashier: 'Cashier',
    inventory_personnel: 'Inventory Personnel',
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    setPwdError(null)
    if (newPwd.length < 6) {
      setPwdError('Password must be at least 6 characters.')
      return
    }
    if (newPwd !== confirmPwd) {
      setPwdError('Passwords do not match.')
      return
    }

    setPwdLoading(true)
    try {
      await apiUpdatePassword(newPwd)
      setPwdSuccess(true)
      setTimeout(() => {
        setShowPwdModal(false)
        setPwdSuccess(false)
        setNewPwd('')
        setConfirmPwd('')
      }, 1500)
    } catch (err: unknown) {
      setPwdError(err instanceof Error ? err.message : 'Failed to update password')
    } finally {
      setPwdLoading(false)
    }
  }

  return (
    <aside
      style={{
        background: 'var(--sidebar)',
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        width: 280,
        flexShrink: 0,
      }}
    >
      {/* Brand */}
      <div style={{ padding: '26px 24px 22px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'linear-gradient(135deg, var(--sidebar-active), var(--primary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(196,122,46,0.3)',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1c0f06" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'Fraunces', fontSize: 21, fontWeight: 700, color: 'var(--sidebar-foreground)', letterSpacing: '-0.01em' }}>
                WING'S ZONE
              </span>
            </div>
            <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--sidebar-active)', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>
              WINGTRACK SYSTEM
            </span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
        {visibleNav.map(({ id, label, icon: Icon }) => {
          const active = page === id
          return (
            <button
              key={id}
              id={`nav-${id}`}
              onClick={() => setPage(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                padding: '11px 16px',
                borderRadius: 9,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'DM Sans',
                fontSize: 14,
                fontWeight: active ? 600 : 500,
                textAlign: 'left',
                width: '100%',
                transition: 'all 0.15s ease',
                background: active ? 'rgba(235,165,79,0.14)' : 'transparent',
                color: active ? 'var(--sidebar-active)' : 'var(--sidebar-muted)',
                position: 'relative',
              }}
              onMouseEnter={e => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--sidebar-foreground)'
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent'
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--sidebar-muted)'
                }
              }}
            >
              <Icon active={active} />
              {label}
            </button>
          )
        })}
      </nav>

      {/* User + Sign Out */}
      <div style={{ padding: '18px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8 }}>
          <div
            style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: '#fdfaf6', flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--sidebar-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.full_name ?? 'Staff'}
            </p>
            <p style={{ fontSize: 11, color: 'var(--sidebar-muted)', fontWeight: 500 }}>
              {role ? roleLabel[role] : ''}
            </p>
          </div>
          <button
            onClick={() => { setShowPwdModal(true); setPwdError(null); setPwdSuccess(false) }}
            title="Change password"
            style={{
              background: 'transparent', border: 'none', color: 'var(--sidebar-muted)',
              cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-foreground)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-muted)'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </button>
        </div>

        <button
          id="btn-signout"
          onClick={signOut}
          style={{
            width: '100%', marginTop: 8, padding: '10px', background: 'transparent',
            border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8,
            fontSize: 13, color: 'var(--sidebar-muted)', cursor: 'pointer',
            fontFamily: 'DM Sans', fontWeight: 500, transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(185,28,28,0.16)'
            ;(e.currentTarget as HTMLElement).style.color = '#fca5a5'
            ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(252,165,165,0.3)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'transparent'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--sidebar-muted)'
            ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.14)'
          }}
        >
          Sign Out
        </button>
      </div>

      {/* Change Password Modal */}
      {showPwdModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowPwdModal(false) }}
        >
          <div className="card fade-in" style={{ width: '100%', maxWidth: 380, padding: '26px' }}>
            <h3 style={{ fontFamily: 'Fraunces', fontSize: 18, color: 'var(--foreground)', marginBottom: 8 }}>
              Change Your Password
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 16 }}>
              Set a secure new password for your account.
            </p>

            <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--foreground)' }}>
                  New Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={showNewPwd ? 'text' : 'password'}
                    required
                    placeholder="Min 6 characters"
                    value={newPwd}
                    onChange={e => setNewPwd(e.target.value)}
                    style={{ width: '100%', padding: '9px 36px 9px 12px', fontSize: 13 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPwd(prev => !prev)}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--muted-foreground)',
                    }}
                    title={showNewPwd ? 'Hide password' : 'Show password'}
                    aria-label={showNewPwd ? 'Hide password' : 'Show password'}
                  >
                    {showNewPwd ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--foreground)' }}>
                  Confirm Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={showConfirmPwd ? 'text' : 'password'}
                    required
                    placeholder="Re-type new password"
                    value={confirmPwd}
                    onChange={e => setConfirmPwd(e.target.value)}
                    style={{ width: '100%', padding: '9px 36px 9px 12px', fontSize: 13 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPwd(prev => !prev)}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--muted-foreground)',
                    }}
                    title={showConfirmPwd ? 'Hide password' : 'Show password'}
                    aria-label={showConfirmPwd ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPwd ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {pwdError && (
                <div style={{ padding: '8px 12px', background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 12 }}>
                  {pwdError}
                </div>
              )}

              {pwdSuccess && (
                <div style={{ padding: '8px 12px', background: '#e8f5e9', color: '#15803d', borderRadius: 6, fontSize: 12 }}>
                  Password updated successfully.
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowPwdModal(false)}
                  className="btn-ghost"
                  style={{ flex: 1, padding: '9px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={pwdLoading || pwdSuccess}
                  style={{ flex: 1, padding: '9px' }}
                >
                  {pwdLoading ? 'Saving...' : 'Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  )
}

export type { Page }
