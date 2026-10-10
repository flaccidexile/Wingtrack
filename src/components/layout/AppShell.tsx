import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import Sidebar, { type Page } from './Sidebar'
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

export default function AppShell() {
  const { role } = useAuth()
  const [page, setPage] = useState<Page>(role ? DEFAULT_PAGE[role] : 'dashboard')

  // Guard: if the user tries to navigate to a page they don't have access to,
  // redirect them back to their default page.
  useEffect(() => {
    if (role && !canAccess(role, page)) {
      setPage(DEFAULT_PAGE[role])
    }
  }, [role, page])

  const safePage = role && canAccess(role, page) ? page : (role ? DEFAULT_PAGE[role] : 'dashboard')

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
      <Sidebar page={safePage} setPage={setPage} />
      <main style={{ flex: 1, overflow: safePage === 'pos' ? 'hidden' : 'auto', height: '100dvh', background: 'var(--background)' }}>
        <div className="fade-in" key={safePage} style={{ height: '100%', minHeight: '100%', display: safePage === 'pos' ? 'flex' : 'block', flexDirection: 'column' }}>
          {safePage === 'dashboard'  && <Dashboard />}
          {safePage === 'pos'        && <PointOfSale />}
          {safePage === 'orders'     && <OrdersList />}
          {safePage === 'menu'       && <MenuManager />}
          {safePage === 'inventory'  && <Inventory />}
          {safePage === 'analytics'  && <Analytics />}
          {safePage === 'staff'      && <StaffManager />}
        </div>
      </main>
    </div>
  )
}

