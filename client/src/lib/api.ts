import { supabase } from './supabase'
import type { CheckoutPayload, InventoryAdjustmentPayload } from '@/types'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

/**
 * Get the current Supabase access token for Express API auth.
 */
async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
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
