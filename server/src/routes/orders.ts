import { Router, type Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'
import { supabaseAdmin } from '../lib/supabase'

const router = Router()

/** Default and maximum number of orders returned in one page. */
const DEFAULT_PAGE_SIZE = 100
const MAX_PAGE_SIZE = 500

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

      let query = supabaseAdmin
        .from('orders')
        .select('*, order_items(*), cashier:cashier_id(full_name, email)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      // Cashiers can only see their own orders per proposal & RLS rules
      if (staffProfile.role === 'cashier') {
        query = query.eq('cashier_id', staffProfile.id)
      }

      if (status === 'completed' || status === 'void') {
        query = query.eq('status', status)
      }

      if (from && !Number.isNaN(Date.parse(from))) {
        query = query.gte('created_at', new Date(from).toISOString())
      }
      if (to && !Number.isNaN(Date.parse(to))) {
        // `to` is treated as inclusive of the whole day.
        const end = new Date(to)
        end.setHours(23, 59, 59, 999)
        query = query.lte('created_at', end.toISOString())
      }

      // Free-text search by order number when the term is numeric.
      if (search && /^\d+$/.test(search.trim())) {
        query = query.eq('order_number', Number(search.trim()))
      }

      const { data: orders, error, count } = await query

      if (error) {
        console.error('Fetch orders — query failed:', error)
        res.status(500).json({ message: 'Failed to fetch orders.' })
        return
      }

      res.json({
        orders: orders ?? [],
        total: count ?? (orders?.length ?? 0),
        limit,
        offset,
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

      res.json(order)
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
