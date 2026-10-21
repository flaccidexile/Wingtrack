import { Router, type Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'
import { supabaseAdmin } from '../lib/supabase'
import { getAllOrderItemCosts, getAllProductCosts } from '../lib/productMetadata'

const router = Router()

/**
 * Enriches order items with their unit_cost from the database or metadata fallback.
 */
function enrichOrderItems(
  order: any,
  itemCostsMap: Record<string, number>,
  productCostsMap: Record<string, number>
) {
  if (!order || !Array.isArray(order.order_items)) return order
  const enrichedItems = order.order_items.map((item: any) => {
    let cost = item.unit_cost != null ? Number(item.unit_cost) : null
    if (cost === null || Number.isNaN(cost)) {
      cost = itemCostsMap[item.id] ?? productCostsMap[item.product_id] ?? 0
    }
    return {
      ...item,
      unit_cost: cost,
    }
  })
  return {
    ...order,
    order_items: enrichedItems,
  }
}

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
      const enrichedOrders = (orders ?? []).map((o: any) => enrichOrderItems(o, itemCostsMap, productCostsMap))

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
      res.json(enrichOrderItems(order, itemCostsMap, productCostsMap))
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
