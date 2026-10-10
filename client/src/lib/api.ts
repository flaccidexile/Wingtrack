import { supabase } from './supabase'
import type { CheckoutPayload, InventoryAdjustmentPayload, Order } from '@/types'

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
 * Parse a failed response into a human-readable Error. Surfaces the HTTP
 * status so a proxy/network failure ("Failed to fetch") is distinguishable
 * from a real API error message.
 */
async function toApiError(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => null) as { message?: string } | null
  if (body?.message) return new Error(body.message)
  if (res.status === 401) return new Error('Your session has expired. Please sign in again.')
  if (res.status === 403) return new Error('You do not have permission to perform this action.')
  return new Error(`${fallback} (HTTP ${res.status})`)
}

/**
 * GET /api/orders (Cashier or Admin)
 *
 * Returns a page of orders plus the total row count, so the UI can show
 * "showing X of Y" and offer pagination instead of silently truncating.
 */
export async function apiGetOrders(params?: {
  limit?: number
  offset?: number
  status?: 'completed' | 'void'
  from?: string
  to?: string
  search?: string
}): Promise<{ orders: Order[]; total: number; limit: number; offset: number }> {
  const headers = await getAuthHeader()
  const qs = new URLSearchParams()
  if (params?.limit != null) qs.set('limit', String(params.limit))
  if (params?.offset != null) qs.set('offset', String(params.offset))
  if (params?.status) qs.set('status', params.status)
  if (params?.from) qs.set('from', params.from)
  if (params?.to) qs.set('to', params.to)
  if (params?.search) qs.set('search', params.search)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''

  const res = await fetch(`${API_BASE}/orders${suffix}`, {
    method: 'GET',
    headers,
  })
  if (!res.ok) {
    throw await toApiError(res, 'Failed to fetch orders')
  }

  const json = await res.json()
  // Tolerate the legacy bare-array shape so an older server does not break the UI.
  if (Array.isArray(json)) {
    return { orders: json as Order[], total: json.length, limit: json.length, offset: 0 }
  }
  return {
    orders: (json.orders ?? []) as Order[],
    total: json.total ?? 0,
    limit: json.limit ?? 100,
    offset: json.offset ?? 0,
  }
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
    throw await toApiError(res, 'Failed to fetch inventory movements')
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
    throw await toApiError(res, 'Failed to fetch products')
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
    throw await toApiError(res, 'Failed to fetch categories')
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
 * POST /api/auth/signup  (Admin only)
 * Provisions a new staff account. Requires an authenticated admin session —
 * public self-registration is disabled.
 */
export async function apiSignUp(payload: {
  email: string
  password: string
  full_name: string
  role: 'admin' | 'cashier' | 'inventory_personnel'
}) {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Sign up failed' }))
    throw new Error(err.message ?? 'Sign up failed')
  }
  return res.json()
}



/**
 * POST /api/auth/check-registered  (Public)
 * Reports whether an email belongs to a provisioned staff account.
 * Deliberately unauthenticated: it runs before login, and it returns only a
 * boolean pair — never a name, role, or id.
 */
export async function apiCheckRegistered(email: string): Promise<{
  registered: boolean
  active: boolean
  message?: string
}> {
  const res = await fetch(`${API_BASE}/auth/check-registered`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Unable to verify this email right now.' }))
    throw new Error(err.message ?? 'Unable to verify this email right now.')
  }
  return res.json()
}

/**
 * POST /api/auth/send-login-otp  (Public, staff-gated)
 *
 * Asks the server to email a sign-in code. The server only mails when a custom
 * SMTP relay is configured; otherwise it replies `{ sent: false, reason: 'smtp' }`
 * so the caller can fall back to Supabase's mailer. A `registered: false`
 * outcome surfaces as an Error carrying the server's guidance message.
 */
export async function apiSendLoginOtp(email: string): Promise<{
  sent: boolean
  reason?: 'smtp' | 'schema'
  message?: string
}> {
  const res = await fetch(`${API_BASE}/auth/send-login-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const body = await res.json().catch(() => null) as
    | { sent?: boolean; reason?: 'smtp' | 'schema'; message?: string }
    | null

  if (!res.ok) {
    throw new Error(body?.message ?? 'Unable to send a code right now. Please try again.')
  }
  return { sent: Boolean(body?.sent), reason: body?.reason, message: body?.message }
}

/**
 * POST /api/auth/provision-self  (Authenticated)
 * Completes self-service sign-up by creating the caller's staff_profiles row.
 * Idempotent: safe to call on every sign-in. The server clamps the role to
 * non-admin values and never reactivates a deactivated account.
 */
export async function apiProvisionSelf(payload?: { full_name?: string; role?: string }) {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/auth/provision-self`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) {
    throw await toApiError(res, 'Failed to complete registration')
  }
  return res.json() as Promise<{
    provisioned: boolean
    created: boolean
    role?: string
    is_active?: boolean
  }>
}


// --- PayMongo Sandbox Helpers --------------------------------

/** POST /api/paymongo/create-intent */
export async function apiCreatePaymentIntent(amountCentavos: number, description?: string) {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/paymongo/create-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ amount_centavos: amountCentavos, description }),
  })
  if (!res.ok) { const err = await res.json().catch(() => ({ message: 'PayMongo error' })); throw new Error(err.message ?? 'Failed to create payment intent') }
  return res.json() as Promise<{ payment_intent_id: string; client_key: string }>
}

/** POST /api/paymongo/create-method */
export async function apiCreatePaymentMethod(payload: { type: 'card' | 'gcash' | 'paymaya'; billing?: object; details?: object }) {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/paymongo/create-method`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  })
  if (!res.ok) { const err = await res.json().catch(() => ({ message: 'PayMongo error' })); throw new Error(err.message ?? 'Failed to create payment method') }
  return res.json() as Promise<{ payment_method_id: string }>
}

/** POST /api/paymongo/attach-method */
export async function apiAttachPaymentMethod(payload: { payment_intent_id: string; payment_method_id: string; client_key: string }) {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/paymongo/attach-method`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  })
  if (!res.ok) { const err = await res.json().catch(() => ({ message: 'PayMongo error' })); throw new Error(err.message ?? 'Failed to attach payment method') }
  return res.json() as Promise<{
    status: string
    next_action?: {
      type: string
      redirect?: { url: string; return_url?: string }
    } | null
  }>
}

/** POST /api/paymongo/create-checkout-session */
export async function apiCreateCheckoutSession(payload: {
  amount_centavos: number
  description?: string
  method_type?: 'gcash' | 'paymaya' | 'card' | 'all'
  line_items?: Array<{ name: string; amount: number; quantity: number }>
  success_url?: string
  cancel_url?: string
}) {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_BASE}/paymongo/create-checkout-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'PayMongo error' }))
    throw new Error(err.message ?? 'Failed to create checkout session')
  }
  return res.json() as Promise<{
    checkout_session_id: string
    checkout_url: string
    client_key?: string
    sandbox_mock?: boolean
  }>
}

