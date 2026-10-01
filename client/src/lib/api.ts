import { supabase } from './supabase'
import type { CheckoutPayload, InventoryAdjustmentPayload } from '@/types'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

/**
 * Get the current Supabase access token for Express API auth.
 */
async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  let token = session?.access_token

  // If session is expired or expires within 60s, refresh it
  if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60000) {
    const { data: refreshData } = await supabase.auth.refreshSession()
    if (refreshData?.session?.access_token) {
      token = refreshData.session.access_token
    }
  }

  if (!token) throw new Error('Not authenticated')
  return { Authorization: `Bearer ${token}` }
}

/**
 * POST /api/checkout
 * Sends the order to Express, which handles inventory deduction.
 */
export async function apiCheckout(payload: CheckoutPayload) {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Checkout failed' }))
    throw new Error(err.message ?? 'Checkout failed')
  }
  return res.json()
}

/**
 * PATCH /api/inventory/:id
 * Manual stock adjustment (restock / waste / correction).
 */
export async function apiAdjustInventory(payload: InventoryAdjustmentPayload) {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/inventory/${payload.inventory_id}/adjust`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Adjustment failed' }))
    throw new Error(err.message ?? 'Adjustment failed')
  }
  return res.json()
}

/**
 * POST /api/staff (Admin only)
 * Provisions a new staff account.
 */
export async function apiCreateStaff(data: {
  email: string
  password: string
  full_name: string
  role: 'cashier' | 'inventory_personnel' | 'admin'
}) {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/staff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to create staff' }))
    throw new Error(err.message ?? 'Failed to create staff')
  }
  return res.json()
}

/**
 * DELETE /api/staff/:id  (Admin only — deactivates account)
 */
export async function apiDeactivateStaff(staffId: string) {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/staff/${staffId}`, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to deactivate staff' }))
    throw new Error(err.message ?? 'Failed to deactivate staff')
  }
  return res.json()
}

/**
 * PATCH /api/staff/:id/reactivate (Admin only)
 */
export async function apiReactivateStaff(staffId: string) {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/staff/${staffId}/reactivate`, {
    method: 'PATCH',
    headers,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to reactivate staff' }))
    throw new Error(err.message ?? 'Failed to reactivate staff')
  }
  return res.json()
}

/**
 * PATCH /api/staff/update-password (Authenticated users)
 */
export async function apiUpdatePassword(password: string) {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/staff/update-password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to update password' }))
    throw new Error(err.message ?? 'Failed to update password')
  }
  return res.json()
}

/**
 * GET /api/orders (Cashier or Admin)
 */
export async function apiGetOrders() {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/orders`, {
    method: 'GET',
    headers,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to fetch orders' }))
    throw new Error(err.message ?? 'Failed to fetch orders')
  }
  return res.json()
}

/**
 * POST /api/orders/:id/void (Cashier or Admin)
 */
export async function apiVoidOrder(orderId: string, reason?: string) {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/orders/${orderId}/void`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to void order' }))
    throw new Error(err.message ?? 'Failed to void order')
  }
  return res.json()
}

/**
 * GET /api/inventory/movements (Admin or Inventory Personnel)
 */
export async function apiGetInventoryMovements() {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/inventory/movements`, {
    method: 'GET',
    headers,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to fetch inventory movements' }))
    throw new Error(err.message ?? 'Failed to fetch inventory movements')
  }
  return res.json()
}

/**
 * POST /api/inventory (Admin or Inventory Personnel)
 */
export async function apiCreateInventoryItem(payload: {
  name: string
  category: string
  unit: string
  stock_qty?: number
  min_stock_level?: number
  unit_cost?: number
  supplier?: string
}) {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/inventory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to create inventory item' }))
    throw new Error(err.message ?? 'Failed to create inventory item')
  }
  return res.json()
}

