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

/**
 * GET /api/products
 */
export async function apiGetProducts() {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/products`, {
    method: 'GET',
    headers,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to fetch products' }))
    throw new Error(err.message ?? 'Failed to fetch products')
  }
  return res.json()
}

/**
 * GET /api/products/categories
 */
export async function apiGetCategories() {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/products/categories`, {
    method: 'GET',
    headers,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to fetch categories' }))
    throw new Error(err.message ?? 'Failed to fetch categories')
  }
  return res.json()
}

/**
 * POST /api/products/categories (Admin only)
 */
export async function apiCreateCategory(name: string) {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/products/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to create category' }))
    throw new Error(err.message ?? 'Failed to create category')
  }
  return res.json()
}

/**
 * POST /api/products (Admin only)
 */
export async function apiCreateProduct(payload: {
  name: string
  category_id: string
  price: number
  is_available?: boolean
  image_url?: string
  recipes?: Array<{ inventory_id: string; qty_per_unit: number }>
}) {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to create product' }))
    throw new Error(err.message ?? 'Failed to create product')
  }
  return res.json()
}

/**
 * PATCH /api/products/:id (Admin only)
 */
export async function apiUpdateProduct(id: string, payload: {
  name?: string
  category_id?: string
  price?: number
  is_available?: boolean
  image_url?: string
  recipes?: Array<{ inventory_id: string; qty_per_unit: number }>
}) {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/products/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to update product' }))
    throw new Error(err.message ?? 'Failed to update product')
  }
  return res.json()
}

/**
 * PATCH /api/products/:id/toggle (Admin only)
 */
export async function apiToggleProductAvailability(id: string, is_available: boolean) {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/products/${id}/toggle`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ is_available }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to toggle product availability' }))
    throw new Error(err.message ?? 'Failed to toggle product availability')
  }
  return res.json()
}

/**
 * DELETE /api/products/:id (Admin only)
 */
export async function apiDeleteProduct(id: string) {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/products/${id}`, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to delete product' }))
    throw new Error(err.message ?? 'Failed to delete product')
  }
  return res.json()
}

/**
 * POST /api/auth/signup
 * Registers a new staff account and provisions their profile.
 */
export async function apiSignUp(payload: {
  email: string
  password: string
  full_name: string
  role?: string
}) {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Sign up failed' }))
    throw new Error(err.message ?? 'Sign up failed')
  }
  return res.json()
}



