import { useAuth } from '@/hooks/useAuth'
import type { StaffRole } from '@/types'

type Page =
  | 'dashboard'
  | 'pos'
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
  { id: 'dashboard', label: 'Dashboard',    roles: ['admin'],                               icon: DashIcon  },
  { id: 'pos',       label: 'Point of Sale', roles: ['admin', 'cashier'],                    icon: PosIcon   },
  { id: 'inventory', label: 'Inventory',     roles: ['admin', 'inventory_personnel'],         icon: InvIcon   },
  { id: 'analytics', label: 'Analytics',     roles: ['admin'],                               icon: AnaIcon   },
  { id: 'staff',     label: 'Staff Manager', roles: ['admin'],                               icon: StaffIcon },
]

interface SidebarProps {
  page: Page
  setPage: (p: Page) => void
}

export default function Sidebar({ page, setPage }: SidebarProps) {
  const { profile, role, signOut } = useAuth()

  const visibleNav = NAV_ITEMS.filter(item => role && item.roles.includes(role))

  const roleLabel: Record<StaffRole, string> = {
    admin: 'Admin / Manager',
    cashier: 'Cashier',
    inventory_personnel: 'Inventory Personnel',
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

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
      {/* Logo */}
      <div style={{ padding: '26px 22px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 46, height: 46, borderRadius: 12,
              background: 'rgba(196,122,46,0.15)',
              border: '1px solid rgba(196,122,46,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <InvIcon active={true} />
          </div>
          <div>
            <p style={{ fontFamily: 'Fraunces', fontWeight: 700, fontSize: 22, color: 'var(--sidebar-foreground)', lineHeight: 1.1 }}>
              <span style={{ color: 'var(--sidebar-active)' }}>WING</span>TRACK
            </p>
            <p style={{ fontSize: 12, color: 'var(--sidebar-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 3 }}>
              Wing's Zone
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, minHeight: 0, padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        <p style={{ fontSize: 12, color: 'var(--sidebar-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '4px 12px 14px', fontFamily: 'DM Mono', fontWeight: 600 }}>
          Operations
        </p>
        {visibleNav.map(({ id, label, icon: Icon }) => {
          const active = page === id
          return (
            <button
              key={id}
              id={`nav-${id}`}
              onClick={() => setPage(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '13px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: active ? 'rgba(240,155,58,0.18)' : 'transparent',
                color: active ? 'var(--sidebar-active)' : 'var(--sidebar-muted)',
                fontFamily: 'DM Sans', fontSize: 16, fontWeight: active ? 600 : 500,
                transition: 'all 0.15s', textAlign: 'left', width: '100%',
                borderLeft: active ? '3px solid var(--sidebar-active)' : '3px solid transparent',
              }}
              onMouseEnter={e => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)'
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 12px', borderRadius: 8 }}>
          <div
            style={{
              width: 42, height: 42, borderRadius: '50%',
              background: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 700, color: '#fdfaf6', flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--sidebar-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.full_name ?? 'Staff'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--sidebar-muted)', fontWeight: 500 }}>
              {role ? roleLabel[role] : ''}
            </p>
          </div>
        </div>
        <button
          id="btn-signout"
          onClick={signOut}
          style={{
            width: '100%', marginTop: 10, padding: '11px', background: 'transparent',
            border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8,
            fontSize: 14, color: 'var(--sidebar-muted)', cursor: 'pointer',
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
    </aside>
  )
}

export type { Page }
