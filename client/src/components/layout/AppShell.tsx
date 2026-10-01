import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import Sidebar, { type Page } from './Sidebar'
import type { StaffRole } from '@/types'

// Lazy page imports
import Dashboard from '@/pages/admin/Dashboard'
import Analytics from '@/pages/admin/Analytics'
import StaffManager from '@/pages/admin/StaffManager'
import PointOfSale from '@/pages/cashier/PointOfSale'
import Inventory from '@/pages/inventory/Inventory'
import OrdersList from '@/pages/orders/OrdersList'

const DEFAULT_PAGE: Record<StaffRole, Page> = {
  admin: 'dashboard',
  cashier: 'pos',
  inventory_personnel: 'inventory',
}

export default function AppShell() {
  const { role } = useAuth()
  const [page, setPage] = useState<Page>(role ? DEFAULT_PAGE[role] : 'dashboard')

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
      <Sidebar page={page} setPage={setPage} />
      <main style={{ flex: 1, overflow: 'auto', height: '100dvh', background: 'var(--background)' }}>
        <div className="fade-in" key={page}>
          {page === 'dashboard'  && <Dashboard />}
          {page === 'pos'        && <PointOfSale />}
          {page === 'orders'     && <OrdersList />}
          {page === 'inventory'  && <Inventory />}
          {page === 'analytics'  && <Analytics />}
          {page === 'staff'      && <StaffManager />}
        </div>
      </main>
    </div>
  )
}
