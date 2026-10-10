import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import Sidebar, { type Page } from './Sidebar'
import ErrorBoundary from '@/components/ErrorBoundary'
import type { StaffRole } from '@/types'

// Lazy page imports
import Dashboard from '@/pages/admin/Dashboard'
import Analytics from '@/pages/admin/Analytics'
import StaffManager from '@/pages/admin/StaffManager'
import MenuManager from '@/pages/admin/MenuManager'
import PointOfSale from '@/pages/cashier/PointOfSale'
import Inventory from '@/pages/inventory/Inventory'
import OrdersList from '@/pages/orders/OrdersList'

const DEFAULT_PAGE: Record<StaffRole, Page> = {
  admin: 'dashboard',
  cashier: 'pos',
  inventory_personnel: 'inventory',
}

/** Which pages each role is allowed to access */
const PAGE_ACCESS: Record<StaffRole, Page[]> = {
  admin: ['dashboard', 'pos', 'orders', 'menu', 'inventory', 'analytics', 'staff'],
  cashier: ['pos'],
  inventory_personnel: ['inventory'],
}

function canAccess(role: StaffRole | null, page: Page): boolean {
  if (!role) return false
  return PAGE_ACCESS[role].includes(page)
}

/** Human-readable page titles, shown in the mobile top bar. */
const PAGE_TITLES: Record<Page, string> = {
  dashboard: 'Dashboard',
  pos: 'Point of Sale',
  orders: 'Transactions',
  menu: 'Menu Items',
  inventory: 'Inventory',
  analytics: 'Analytics',
  staff: 'Staff Manager',
}

/** Below this width the sidebar collapses into a drawer and a top bar appears. */
const DRAWER_BREAKPOINT = 1024

export default function AppShell() {
  const { role } = useAuth()
  const [page, setPage] = useState<Page>(role ? DEFAULT_PAGE[role] : 'dashboard')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < DRAWER_BREAKPOINT,
  )

  // Guard: if the user tries to navigate to a page they don't have access to,
  // redirect them back to their default page.
  useEffect(() => {
    if (role && !canAccess(role, page)) {
      setPage(DEFAULT_PAGE[role])
    }
  }, [role, page])

  // Track viewport width so we know whether the sidebar is a rail or a drawer.
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${DRAWER_BREAKPOINT - 1}px)`)
    const sync = () => {
      setIsNarrow(query.matches)
      if (!query.matches) setDrawerOpen(false)
    }
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  // No role means no usable profile — App.tsx already renders an access-denied
  // screen in that case, so render nothing here rather than defaulting a page.
  if (!role) return null

  const safePage = canAccess(role, page) ? page : DEFAULT_PAGE[role]

  const handleNavigate = (next: Page) => {
    setPage(next)
    setDrawerOpen(false)
  }

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
      <Sidebar
        page={safePage}
        setPage={handleNavigate}
        mobileOpen={drawerOpen}
        onCloseMobile={() => setDrawerOpen(false)}
      />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100dvh' }}>
        {/* Mobile top bar — only shown once the sidebar has collapsed */}
        {isNarrow && (
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              background: 'var(--sidebar)',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={drawerOpen}
              id="btn-open-drawer"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 6,
                color: 'var(--sidebar-foreground)',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <span
              style={{
                fontFamily: 'Fraunces',
                fontSize: 17,
                fontWeight: 700,
                color: 'var(--sidebar-foreground)',
                letterSpacing: '-0.01em',
              }}
            >
              {PAGE_TITLES[safePage]}
            </span>
          </header>
        )}

        <main
          style={{
            flex: 1,
            minHeight: 0,
            overflow: safePage === 'pos' ? 'hidden' : 'auto',
            background: 'var(--background)',
          }}
        >
          <div
            className="fade-in"
            key={safePage}
            style={{
              // The POS page needs a definite height for its .pos-shell `height: 100%`
              // to resolve, so use `height` (not `minHeight`) and let the child fill it.
              height: safePage === 'pos' ? '100%' : undefined,
              minHeight: '100%',
              display: safePage === 'pos' ? 'flex' : 'block',
              flexDirection: 'column',
              // `flex: 1` on .pos-shell requires the flex parent to have a bounded height.
              minWidth: 0,
            }}
          >
            <ErrorBoundary label={PAGE_TITLES[safePage]} onRetry={() => setPage(safePage)}>
              {safePage === 'dashboard'  && <Dashboard />}
              {safePage === 'pos'        && <PointOfSale />}
              {safePage === 'orders'     && <OrdersList />}
              {safePage === 'menu'       && <MenuManager />}
              {safePage === 'inventory'  && <Inventory />}
              {safePage === 'analytics'  && <Analytics />}
              {safePage === 'staff'      && <StaffManager />}
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  )
}

