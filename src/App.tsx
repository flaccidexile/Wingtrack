import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import PointOfSale from './pages/PointOfSale'
import Inventory from './pages/Inventory'
import Analytics from './pages/Analytics'

type Page = 'dashboard' | 'pos' | 'inventory' | 'analytics'

const NAV = [
  { id: 'dashboard' as Page, label: 'Dashboard', icon: DashIcon },
  { id: 'pos' as Page, label: 'Point of Sale', icon: PosIcon },
  { id: 'inventory' as Page, label: 'Inventory', icon: InvIcon },
  { id: 'analytics' as Page, label: 'Analytics', icon: AnaIcon },
]

function DashIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--sidebar-active)' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  )
}
function PosIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--sidebar-active)' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <line x1="6" y1="9" x2="6" y2="9.01"/><line x1="10" y1="9" x2="10" y2="9.01"/>
      <line x1="14" y1="9" x2="14" y2="9.01"/><line x1="6" y1="13" x2="6" y2="13.01"/>
      <line x1="10" y1="13" x2="10" y2="13.01"/><line x1="14" y1="13" x2="18" y2="13"/>
    </svg>
  )
}
function InvIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--sidebar-active)' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6l9-3 9 3v12l-9 3-9-3V6z"/>
      <path d="M12 3v18M3 6l9 3 9-3"/>
    </svg>
  )
}
function AnaIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--sidebar-active)' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{ background: 'var(--sidebar)', display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* Logo */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--sidebar-active)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#1c0f06', fontFamily: 'Fraunces' }}>W</span>
            </div>
            <div>
              <p style={{ fontFamily: 'Fraunces', fontWeight: 700, fontSize: 15, color: 'var(--sidebar-foreground)', lineHeight: 1.1 }}>
                <span style={{ color: 'var(--sidebar-active)' }}>WING</span>TRACK
              </p>
              <p style={{ fontSize: 10, color: 'var(--sidebar-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 1 }}>POS & Inventory</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <p style={{ fontSize: 10, color: 'var(--sidebar-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 8px 10px', fontFamily: 'DM Mono', fontWeight: 600 }}>Operations</p>
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = page === id
            return (
              <button
                key={id}
                onClick={() => setPage(id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: active ? 'rgba(240,155,58,0.18)' : 'transparent',
                  color: active ? 'var(--sidebar-active)' : 'var(--sidebar-muted)',
                  fontFamily: 'DM Sans', fontSize: 13, fontWeight: active ? 600 : 500,
                  transition: 'all 0.15s', textAlign: 'left', width: '100%',
                  borderLeft: active ? '2px solid var(--sidebar-active)' : '2px solid transparent',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-foreground)' }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-muted)' } }}
              >
                <Icon active={active} />
                {label}
              </button>
            )
          })}
        </nav>

        {/* User */}
        <div style={{ padding: '16px 12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: '#fdfaf6' }}>M</div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--sidebar-foreground)' }}>Manager</p>
              <p style={{ fontSize: 10, color: 'var(--sidebar-muted)' }}>wings.zone@store.ph</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ overflow: 'auto', height: '100vh', background: 'var(--background)' }}>
        {page === 'dashboard' && <Dashboard />}
        {page === 'pos' && <PointOfSale />}
        {page === 'inventory' && <Inventory />}
        {page === 'analytics' && <Analytics />}
      </main>
    </div>
  )
}
