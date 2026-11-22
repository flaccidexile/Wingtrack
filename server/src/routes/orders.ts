import { Router, type Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'
import { supabaseAdmin } from '../lib/supabase'
import {
  getAllOrderItemCosts,
  getAllProductCosts,
  getAllOrderPaymentMethods,
  getAllOrderExtraMeta,
  setOrderExtraMeta,
  setOrderPaymentMethod,
  setOrderItemCosts,
  type OrderExtraMeta,
} from '../lib/productMetadata'
import { VAT_RATE } from '../lib/validation'

const router = Router()

/**
 * Enriches order items with their unit_cost and exact payment_method
 * (e.g., distinguishing 'maya' from 'gcash') from the database or metadata fallback.
 */
function enrichOrderItems(
  order: any,
  itemCostsMap: Record<string, number>,
  productCostsMap: Record<string, number>,
  paymentMethodsMap: Record<string, string>,
  recipeCostsMap: Record<string, number> = {},
  extraMetaMap: Record<string, OrderExtraMeta> = {}
) {
  if (!order) return order
  const exactPaymentMethod = paymentMethodsMap[order.id] || order.payment_method
  const extra = extraMetaMap[order.id] ?? {}
  if (!Array.isArray(order.order_items)) {
    return { ...order, payment_method: exactPaymentMethod, ...extra }
  }
  const enrichedItems = order.order_items.map((item: any) => {
    let cost = item.unit_cost != null && Number(item.unit_cost) > 0 ? Number(item.unit_cost) : null
    if (cost === null || Number.isNaN(cost) || cost === 0) {
      const fromItem = itemCostsMap[item.id]
      const fromProd = productCostsMap[item.product_id]
      const fromRecipe = recipeCostsMap[item.product_id]
      cost = (fromItem && fromItem > 0)
        ? fromItem
        : (fromProd && fromProd > 0)
          ? fromProd
          : (fromRecipe && fromRecipe > 0)
            ? fromRecipe
            : 0
    }
    return {
      ...item,
      unit_cost: cost,
    }
  })
  return {
    ...order,
    payment_method: exactPaymentMethod,
    ...extra,
    order_items: enrichedItems,
  }
}

async function getRecipeCostsMap(): Promise<Record<string, number>> {
  const { data } = await supabaseAdmin
    .from('product_recipes')
    .select('product_id, qty_per_unit, inventory:inventory(unit_cost)')
  const map: Record<string, number> = {}
  for (const r of (data ?? []) as any[]) {
    const pid = r.product_id as string
    const lineCost = (Number(r.qty_per_unit) || 0) * (Number(r.inventory?.unit_cost) || 0)
    map[pid] = Math.round(((map[pid] ?? 0) + lineCost) * 100) / 100
  }
  return map
}

// ────────────────────────────────────────────────────────────
// POST /api/orders/import — Manually transfer a previous-system sale
//
// Admin-only. The Transactions page uses this to record an old sale from the
// shop's previous system. It deliberately does NOT touch inventory: the stock
// move happened back then in the old system, so this only reconstructs the
// sales history. The order is backdated to `created_at` and tagged with
// `note: 'inserted'` in its local metadata so it is visibly "previous data".
// ────────────────────────────────────────────────────────────

const IMPORT_PAYMENT_METHODS = ['cash', 'gcash', 'maya', 'card'] as const
const IMPORT_ORDER_TYPES = ['dine_in', 'take_out', 'delivery'] as const
const IMPORT_DISCOUNT_TYPES = ['none', 'senior', 'pwd'] as const
const IMPORT_SC_PWD_RATE = 0.20

interface ImportedLine {
  name: string
  quantity: number
  unit_price: number
  unit_cost: number
  product_id: string | null
}
interface ValidatedImport {
  createdAt: string
  lines: ImportedLine[]
  paymentMethod: string
  orderType: string
  tableNumber: string | null
  discountType: string
  discountId: string | null
  paymentReference: string | null
  notes: string | null
}

function validateImportBody(body: unknown):
  | { ok: true; value: ValidatedImport }
  | { ok: false; message: string } {
  const b = (body ?? {}) as Record<string, unknown>

  // A real, parseable timestamp is required — backdating is the whole point.
  if (typeof b.created_at !== 'string' || b.created_at.trim() === '') {
    return { ok: false, message: 'Date & time of the original sale is required.' }
  }
  const parsed = new Date(b.created_at)
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, message: 'The date & time is not valid.' }
  }
  // Guard against a typo like year 2099 or year 1 producing nonsense history.
  const year = parsed.getUTCFullYear()
  if (year < 2000 || year > new Date().getUTCFullYear() + 1) {
    return { ok: false, message: 'The date must be between year 2000 and next year.' }
  }

  if (!Array.isArray(b.items) || b.items.length === 0) {
    return { ok: false, message: 'At least one item is required.' }
  }
  if (b.items.length > 100) {
    return { ok: false, message: 'A single order cannot have more than 100 item lines.' }
  }

  const lines: ImportedLine[] = []
  for (let i = 0; i < b.items.length; i++) {
    const raw = b.items[i] as Record<string, unknown> | null
    const label = `Item ${i + 1}`
    if (!raw || typeof raw !== 'object') return { ok: false, message: `${label} is malformed.` }
    if (typeof raw.name !== 'string' || raw.name.trim() === '') {
      return { ok: false, message: `${label} needs a name.` }
    }
    if (typeof raw.quantity !== 'number' || !Number.isInteger(raw.quantity) || raw.quantity < 1 || raw.quantity > 999) {
      return { ok: false, message: `${label} quantity must be a whole number from 1 to 999.` }
    }
    if (typeof raw.unit_price !== 'number' || !Number.isFinite(raw.unit_price) || raw.unit_price < 0 || raw.unit_price > 1_000_000) {
      return { ok: false, message: `${label} price must be a number between 0 and 1,000,000.` }
    }
    const rawCost = raw.unit_cost
    const unitCost = typeof rawCost === 'number' && Number.isFinite(rawCost) && rawCost >= 0 ? rawCost : 0
    const pid = typeof raw.product_id === 'string' && raw.product_id.trim() !== '' ? raw.product_id : null
    lines.push({
      name: raw.name.trim().slice(0, 200),
      quantity: raw.quantity,
      unit_price: Math.round(raw.unit_price * 100) / 100,
      unit_cost: Math.round(unitCost * 100) / 100,
      product_id: pid,
    })
  }

  const paymentMethod = typeof b.payment_method === 'string' ? b.payment_method : 'cash'
  if (!(IMPORT_PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) {
    return { ok: false, message: 'Invalid payment method.' }
  }
  const orderType = typeof b.order_type === 'string' && (IMPORT_ORDER_TYPES as readonly string[]).includes(b.order_type)
    ? b.order_type : 'dine_in'
  const discountType = typeof b.discount_type === 'string' && (IMPORT_DISCOUNT_TYPES as readonly string[]).includes(b.discount_type)
    ? b.discount_type : 'none'

  return {
    ok: true,
    value: {
      createdAt: parsed.toISOString(),
      lines,
      paymentMethod,
      orderType,
      tableNumber: orderType === 'dine_in' && typeof b.table_number === 'string' && b.table_number.trim() !== ''
        ? b.table_number.trim().slice(0, 32) : null,
      discountType,
      discountId: discountType !== 'none' && typeof b.discount_id === 'string' && b.discount_id.trim() !== ''
        ? b.discount_id.trim().slice(0, 64) : null,
      paymentReference: typeof b.payment_reference === 'string' && b.payment_reference.trim() !== ''
        ? b.payment_reference.trim().slice(0, 80) : null,
      notes: typeof b.notes === 'string' && b.notes.trim() !== '' ? b.notes.trim().slice(0, 500) : null,
    },
  }
}

/**
 * Resolves a line to an existing product id, creating a hidden placeholder in
 * a dedicated "Previous System" category when the old item name is not on the
 * current menu. This keeps the order_items.product_id foreign key valid even
 * when the previous system sold items that no longer exist.
 */
async function resolveImportProduct(
  line: ImportedLine,
  categoryId: string
): Promise<string | null> {
  if (line.product_id) {
    const { data } = await supabaseAdmin
      .from('products').select('id').eq('id', line.product_id).maybeSingle()
    if (data) return data.id as string
  }
  const { data: existing } = await supabaseAdmin
    .from('products').select('id').ilike('name', line.name).maybeSingle()
  if (existing) return existing.id as string

  const { data: created, error } = await supabaseAdmin
    .from('products')
    .insert({
      name: line.name,
      category_id: categoryId,
      price: line.unit_price,
      unit_cost: line.unit_cost,
      is_available: false,
    })
    .select('id').single()
  if (error || !created) {
    // Some deployments have not applied the unit_cost migration yet.
    const retry = await supabaseAdmin
      .from('products')
      .insert({ name: line.name, category_id: categoryId, price: line.unit_price, is_available: false })
      .select('id').single()
    return retry.data ? (retry.data.id as string) : null
  }
  return created.id as string
}

router.post(
  '/import',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const validation = validateImportBody(req.body)
    if (!validation.ok) {
      res.status(400).json({ message: validation.message })
      return
    }
    const v = validation.value

    const { data: staffProfile } = await supabaseAdmin
      .from('staff_profiles').select('id').eq('user_id', req.userId!).maybeSingle()
    if (!staffProfile) {
      res.status(403).json({ message: 'Staff profile not found.' })
      return
    }

    // Find or create the bucket for placeholder products from the old system.
    const CATEGORY = 'Previous System (Imported)'
    let { data: category } = await supabaseAdmin
      .from('product_categories').select('id').ilike('name', CATEGORY).maybeSingle()
    if (!category) {
      const created = await supabaseAdmin
        .from('product_categories')
        .insert({ name: CATEGORY, sort_order: 9999 })
        .select('id').single()
      if (created.error || !created.data) {
        console.error('[import] Failed to create placeholder category:', created.error)
        res.status(500).json({ message: 'Could not prepare the import category. Try again.' })
        return
      }
      category = created.data
    }

    const resolved: Array<ImportedLine & { productId: string }> = []
    for (const line of v.lines) {
      const productId = await resolveImportProduct(line, category.id as string)
      if (!productId) {
        res.status(500).json({ message: `Could not resolve product "${line.name}".` })
        return
      }
      resolved.push({ ...line, productId })
    }

    const subtotal = Math.round(resolved.reduce((s, l) => s + l.unit_price * l.quantity, 0) * 100) / 100
    const isScPwd = v.discountType === 'senior' || v.discountType === 'pwd'
    const discountAmount = isScPwd ? Math.round(subtotal * IMPORT_SC_PWD_RATE * 100) / 100 : 0
    const vatAmount = isScPwd ? 0 : Math.round(subtotal * VAT_RATE * 100) / 100
    const totalAmount = Math.round((isScPwd ? subtotal - discountAmount : subtotal + vatAmount) * 100) / 100

    // The DB enum lacks 'maya'; keep the exact label in local metadata.
    const dbPaymentMethod: 'cash' | 'gcash' | 'card' = v.paymentMethod === 'maya' ? 'gcash' : v.paymentMethod as any

    const importNotes = `[PREVIOUS DATA · IMPORTED]${v.notes ? ` ${v.notes}` : ''}`

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        cashier_id: staffProfile.id,
        status: 'completed',
        payment_method: dbPaymentMethod,
        subtotal,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        notes: importNotes,
        created_at: v.createdAt,
        updated_at: v.createdAt,
      })
      .select('id, order_number').single()

    if (orderError || !order) {
      console.error('[import] Order insert failed:', orderError)
      res.status(500).json({ message: 'Failed to save the imported order.' })
      return
    }

    const linePayload = resolved.map(l => ({
      order_id: order.id,
      product_id: l.productId,
      product_name: l.name,
      unit_price: l.unit_price,
      unit_cost: l.unit_cost,
      quantity: l.quantity,
    }))
    const itemsInsert = await supabaseAdmin
      .from('order_items').insert(linePayload).select('id, product_id, unit_cost')
    let insertedItems: Array<{ id: string; product_id?: string; unit_cost?: number | null }> | null =
      itemsInsert.data as Array<{ id: string; product_id?: string; unit_cost?: number | null }> | null
    if (itemsInsert.error && (itemsInsert.error.code === 'PGRST204' || itemsInsert.error.code === '42703' || /unit_cost/i.test(itemsInsert.error.message))) {
      const retry = await supabaseAdmin
        .from('order_items')
        .insert(linePayload.map(({ unit_cost, ...rest }) => rest))
        .select('id, product_id')
      insertedItems = retry.data
    }
    if (itemsInsert.error && !insertedItems) {
      // Compensate: remove the header so no phantom order survives.
      await supabaseAdmin.from('orders').delete().eq('id', order.id)
      console.error('[import] Line items insert failed:', itemsInsert.error)
      res.status(500).json({ message: 'Failed to save the imported items. Nothing was recorded.' })
      return
    }

    // Local fallback metadata — carries the "inserted" marker that means
    // "this is previous data", plus all the order-type/discount detail.
    setOrderPaymentMethod(order.id as string, v.paymentMethod)
    setOrderExtraMeta(order.id as string, {
      order_type: v.orderType as any,
      table_number: v.tableNumber,
      discount_type: v.discountType as any,
      discount_id: v.discountId,
      discount_amount: discountAmount,
      payment_reference: v.paymentReference,
      note: 'inserted',
    })
    if (insertedItems && Array.isArray(insertedItems)) {
      setOrderItemCosts(insertedItems.map((it: any) => ({
        id: it.id,
        cost: it.unit_cost != null ? Number(it.unit_cost) : 0,
      })))
    }

    res.status(201).json({
      id: order.id,
      order_number: order.order_number,
      total_amount: totalAmount,
      note: 'inserted',
    })
  }
)

/** Default and maximum number of orders returned in one page. */
const DEFAULT_PAGE_SIZE = 100
const MAX_PAGE_SIZE = 500

/**
 * Chunk size for the running-totals scan.
 *
 * PostgREST caps a single response (Supabase's default is 1000 rows), so the
 * scan walks the table in pages of that size rather than asking for everything
 * at once and silently receiving a truncated answer.
 */
const SUMMARY_PAGE_SIZE = 1000

/** Ceiling on the scan, so a pathological table cannot stall a list request. */
const SUMMARY_MAX_PAGES = 20

// GET /api/orders — List orders (cashier reads own, admin reads all)
router.get(
  '/',
  requireAuth,
  requireRole('cashier', 'admin'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      // maybeSingle(): a missing row must be a normal null, not a PGRST116
      // throw. requireRole has already resolved and validated this profile, so
      // an absent row here is a genuine data gap — report it, don't 500.
      const { data: staffProfile, error: profileError } = await supabaseAdmin
        .from('staff_profiles')
        .select('id, role')
        .eq('user_id', req.userId!)
        .maybeSingle()

      if (profileError) {
        console.error('Fetch orders — profile lookup failed:', profileError)
        res.status(500).json({ message: 'Unable to resolve your staff profile.' })
        return
      }

      if (!staffProfile) {
        res.status(403).json({ message: 'Staff profile not found.' })
        return
      }

      // Pagination: `limit` is clamped to a sane range so a client cannot ask
      // for the entire table (or a negative/NaN window) in one request.
      const rawLimit = Number(req.query.limit)
      const rawOffset = Number(req.query.offset)
      const limit = Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(Math.floor(rawLimit), MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE
      const offset = Number.isFinite(rawOffset) && rawOffset > 0
        ? Math.floor(rawOffset)
        : 0

      // Optional filters pushed down to the database. Search used to run
      // entirely client-side over a capped 100-row window, which silently hid
      // older matches.
      const { status, from, to, search } = req.query as {
        status?: string
        from?: string
        to?: string
        search?: string
      }

      // Normalised once, up front, so the page query and the summary below
      // cannot drift apart in how they interpret the same parameters.
      const statusFilter = status === 'completed' || status === 'void' ? status : null

      const rangeStart = from && !Number.isNaN(Date.parse(from))
        ? new Date(from).toISOString()
        : null

      // `to` is treated as inclusive of the whole day.
      let rangeEnd: string | null = null
      if (to && !Number.isNaN(Date.parse(to))) {
        const end = new Date(to)
        end.setHours(23, 59, 59, 999)
        rangeEnd = end.toISOString()
      }

      // Free-text search by order number when the term is numeric.
      const orderNumberSearch = search && /^\d+$/.test(search.trim())
        ? Number(search.trim())
        : null

      let query = supabaseAdmin
        .from('orders')
        .select('*, order_items(*), cashier:cashier_id(full_name, email)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      // Cashiers can only see their own orders per proposal & RLS rules
      if (staffProfile.role === 'cashier') {
        query = query.eq('cashier_id', staffProfile.id)
      }

      if (statusFilter) {
        query = query.eq('status', statusFilter)
      }

      if (rangeStart) {
        query = query.gte('created_at', rangeStart)
      }
      if (rangeEnd) {
        query = query.lte('created_at', rangeEnd)
      }

      if (orderNumberSearch !== null) {
        query = query.eq('order_number', orderNumberSearch)
      }

      const { data: orders, error, count } = await query

      if (error) {
        console.error('Fetch orders — query failed:', error)
        res.status(500).json({ message: 'Failed to fetch orders.' })
        return
      }

      /*
       * Running totals for whoever is asking.
       *
       * Deliberately NOT narrowed by status or search: this is the standing
       * tally a cashier wants to see on their own history ("I have rung up 84
       * sales worth ₱41,220.50") rather than a restatement of the rows
       * underneath, and it must not jump to zero when the list is filtered to
       * voids. It IS scoped by role, so a cashier only ever totals their own.
       *
       * Why the totals are summed here instead of by the database:
       *
       *   - PostgREST aggregates are switched OFF on this project. Asking for
       *     `total_amount.sum()` fails with "Use of aggregate functions is not
       *     allowed" (Supabase ships `db-aggregates-enabled = false`). Verified
       *     against the live database, not assumed.
       *   - The alternative, a `RETURNS TABLE` SQL function called over RPC,
       *     would need a migration — and this project's migrations are not
       *     reliably applied, so a core read must not depend on one.
       *
       * So the rows are read in chunks that stay under the API's response cap
       * and added up in Node. `order('id')` gives pagination a unique, stable
       * key, so no row can be double-counted or skipped between pages.
       *
       * Best-effort by design: on any failure the `summary` key is omitted and
       * the client hides the strip. A decorative total is never a reason for
       * the transaction list itself to fail.
       */
      let summary: { transactions: number; sales: number } | null = null
      try {
        let transactions = 0
        let sales = 0

        for (let page = 0; page < SUMMARY_MAX_PAGES; page += 1) {
          let pageQuery = supabaseAdmin
            .from('orders')
            .select('status, total_amount')
            .order('id', { ascending: true })
            .range(page * SUMMARY_PAGE_SIZE, page * SUMMARY_PAGE_SIZE + SUMMARY_PAGE_SIZE - 1)

          if (staffProfile.role === 'cashier') {
            pageQuery = pageQuery.eq('cashier_id', staffProfile.id)
          }

          const { data: pageRows, error: pageError } = await pageQuery
          if (pageError) throw pageError

          const rows = pageRows ?? []
          for (const row of rows) {
            transactions += 1
            if (row.status !== 'void') sales += Number(row.total_amount) || 0
          }

          // A short page means the table has been fully walked.
          if (rows.length < SUMMARY_PAGE_SIZE) break
        }

        summary = { transactions, sales }
      } catch (summaryError) {
        console.error('Fetch orders — summary failed:', summaryError)
      }

      const itemCostsMap = getAllOrderItemCosts()
      const productCostsMap = getAllProductCosts()
      const paymentMethodsMap = getAllOrderPaymentMethods()
      const recipeCostsMap = await getRecipeCostsMap()
      const extraMetaMap = getAllOrderExtraMeta()
      const enrichedOrders = (orders ?? []).map((o: any) => enrichOrderItems(o, itemCostsMap, productCostsMap, paymentMethodsMap, recipeCostsMap, extraMetaMap))

      res.json({
        orders: enrichedOrders,
        total: count ?? (orders?.length ?? 0),
        limit,
        offset,
        summary,
      })
    } catch (err) {
      console.error('Fetch orders error:', err)
      res.status(500).json({ message: 'Internal server error while fetching orders.' })
    }
  }
)

// GET /api/orders/:id — Get single order details with items
router.get(
  '/:id',
  requireAuth,
  requireRole('cashier', 'admin'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params

      const { data: order, error } = await supabaseAdmin
        .from('orders')
        .select('*, order_items(*), cashier:cashier_id(full_name, email)')
        .eq('id', id)
        .single()

      if (error || !order) {
        res.status(404).json({ message: 'Order not found.' })
        return
      }

      const itemCostsMap = getAllOrderItemCosts()
      const productCostsMap = getAllProductCosts()
      const paymentMethodsMap = getAllOrderPaymentMethods()
      const recipeCostsMap = await getRecipeCostsMap()
      const extraMetaMap = getAllOrderExtraMeta()
      res.json(enrichOrderItems(order, itemCostsMap, productCostsMap, paymentMethodsMap, recipeCostsMap, extraMetaMap))
    } catch (err) {
      res.status(500).json({ message: 'Internal server error.' })
    }
  }
)

// POST /api/orders/:id/void — Server-side void order & reverse inventory deductions
router.post(
  '/:id/void',
  requireAuth,
  requireRole('cashier', 'admin'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params
      const { reason } = req.body as { reason?: string }

      const { data: staffProfile, error: profileError } = await supabaseAdmin
        .from('staff_profiles')
        .select('id, role')
        .eq('user_id', req.userId!)
        .maybeSingle()

      if (profileError) {
        console.error('Void order — profile lookup failed:', profileError)
        res.status(500).json({ message: 'Unable to resolve your staff profile.' })
        return
      }

      if (!staffProfile) {
        res.status(403).json({ message: 'Staff profile not found.' })
        return
      }

      // Fetch the order with items
      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', id)
        .single()

      if (orderError || !order) {
        res.status(404).json({ message: 'Order not found.' })
        return
      }

      if (order.status === 'void') {
        res.status(400).json({ message: 'Order is already voided.' })
        return
      }

      // Cashiers can only void their own orders; admins can void any
      if (staffProfile.role === 'cashier' && order.cashier_id !== staffProfile.id) {
        res.status(403).json({ message: 'You are only authorized to void your own transactions.' })
        return
      }

      const orderItems = order.order_items ?? []
      const productIds = orderItems.map((i: { product_id: string }) => i.product_id)

      // Fetch recipes for products in order to reverse inventory
      if (productIds.length > 0) {
        const { data: recipes } = await supabaseAdmin
          .from('product_recipes')
          .select('product_id, inventory_id, qty_per_unit')
          .in('product_id', productIds)

        const restoreMap = new Map<string, number>()
        for (const item of orderItems) {
          const itemRecipes = (recipes ?? []).filter((r: { product_id: string }) => r.product_id === item.product_id)
          for (const recipe of itemRecipes) {
            const totalToRestore = Number(recipe.qty_per_unit) * item.quantity
            restoreMap.set(
              recipe.inventory_id,
              (restoreMap.get(recipe.inventory_id) ?? 0) + totalToRestore
            )
          }
        }

        // Add back stock to inventory and log movements
        for (const [inventoryId, qtyToRestore] of restoreMap.entries()) {
          const { data: invItem } = await supabaseAdmin
            .from('inventory')
            .select('stock_qty')
            .eq('id', inventoryId)
            .single()

          if (invItem) {
            const currentQty = Number(invItem.stock_qty)
            const newQty = currentQty + qtyToRestore

            await supabaseAdmin
              .from('inventory')
              .update({ stock_qty: newQty })
              .eq('id', inventoryId)

            await supabaseAdmin.from('inventory_movements').insert({
              inventory_id: inventoryId,
              order_id: order.id,
              movement_type: 'adjustment',
              qty_change: qtyToRestore,
              qty_before: currentQty,
              qty_after: newQty,
              performed_by: staffProfile.id,
              notes: `Void reversal for Order #${order.order_number}${reason ? ` (${reason})` : ''}`,
            })
          }
        }
      }

      // Update order status to void
      const { data: updatedOrder, error: updateError } = await supabaseAdmin
        .from('orders')
        .update({
          status: 'void',
          notes: order.notes ? `${order.notes} [VOIDED: ${reason || 'Customer request'}]` : `[VOIDED: ${reason || 'Customer request'}]`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*, order_items(*)')
        .single()

      if (updateError) {
        res.status(500).json({ message: updateError.message })
        return
      }

      res.json({ message: 'Order voided and inventory reversed successfully.', order: updatedOrder })
    } catch (err) {
      console.error('Void order error:', err)
      res.status(500).json({ message: 'Failed to void order.' })
    }
  }
)

export default router
