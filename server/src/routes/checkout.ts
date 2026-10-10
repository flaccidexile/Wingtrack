import { Router, type Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'
import { supabaseAdmin } from '../lib/supabase'

const router = Router()

/** Payment methods the checkout accepts. Anything else is rejected outright. */
const PAYMENT_METHODS = ['cash', 'gcash', 'card'] as const
type PaymentMethod = (typeof PAYMENT_METHODS)[number]

/** Upper bound on a single line's quantity — guards against fat-finger entry. */
const MAX_QUANTITY = 999

/** VAT rate. Kept as a named constant so it is not buried in the arithmetic. */
const VAT_RATE = 0.12

/** Shape of an order line, validated before any database work happens. */
interface ValidatedLine {
  product_id: string
  quantity: number
}

/**
 * Validates the raw request body.
 *
 * Returns either a list of clean lines or a human-readable reason to reject.
 *
 * This exists because the previous implementation trusted a TypeScript type
 * assertion (`req.body as { items: {...}[] }`), which is erased at compile time
 * and therefore validates nothing. A request with `quantity: -5` reached the
 * database and produced an order with negative revenue; `quantity: 0` and
 * `1.7` produced orders with no line items. Money-handling endpoints must
 * verify their input at runtime.
 */
function validateCheckoutBody(body: unknown):
  | { ok: true; items: ValidatedLine[]; paymentMethod: PaymentMethod; notes: string | null }
  | { ok: false; message: string } {
  const b = (body ?? {}) as Record<string, unknown>

  if (!Array.isArray(b.items) || b.items.length === 0) {
    return { ok: false, message: 'Order must contain at least one item.' }
  }

  const paymentMethod = b.payment_method
  if (typeof paymentMethod !== 'string' || !(PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) {
    return {
      ok: false,
      message: `Payment method must be one of: ${PAYMENT_METHODS.join(', ')}.`,
    }
  }

  const items: ValidatedLine[] = []
  for (let i = 0; i < b.items.length; i++) {
    const raw = b.items[i] as Record<string, unknown> | null
    const label = `Item ${i + 1}`

    if (!raw || typeof raw !== 'object') {
      return { ok: false, message: `${label} is malformed.` }
    }
    if (typeof raw.product_id !== 'string' || raw.product_id.trim() === '') {
      return { ok: false, message: `${label} is missing a product.` }
    }
    // Reject strings and booleans: only a genuine integer passes.
    if (typeof raw.quantity !== 'number' || !Number.isFinite(raw.quantity)) {
      return { ok: false, message: `${label} has an invalid quantity.` }
    }
    if (!Number.isInteger(raw.quantity)) {
      return { ok: false, message: `${label} quantity must be a whole number.` }
    }
    if (raw.quantity < 1) {
      return { ok: false, message: `${label} quantity must be at least 1.` }
    }
    if (raw.quantity > MAX_QUANTITY) {
      return { ok: false, message: `${label} quantity cannot exceed ${MAX_QUANTITY}.` }
    }

    items.push({ product_id: raw.product_id, quantity: raw.quantity })
  }

  let notes: string | null = null
  if (typeof b.notes === 'string' && b.notes.trim() !== '') {
    notes = b.notes.trim().slice(0, 500)
  }

  return { ok: true, items, paymentMethod: paymentMethod as PaymentMethod, notes }
}

// ────────────────────────────────────────────────────────────
// POST /api/checkout
// 1. Validates input (see validateCheckoutBody).
// 2. Loads the recipe map for every ordered product.
// 3. Checks inventory availability.
// 4. Either calls the atomic create_order() RPC, or — when that SQL has not
//    been applied yet — performs the writes and compensates on failure.
// ────────────────────────────────────────────────────────────
router.post(
  '/',
  requireAuth,
  requireRole('cashier', 'admin'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    // ── Step 0: Validate input before touching the database ──
    const validation = validateCheckoutBody(req.body)
    if (!validation.ok) {
      res.status(400).json({ message: validation.message })
      return
    }
    const { items, paymentMethod, notes } = validation

    // ── Step 1: Load product prices ──────────────────────────
    const productIds = items.map(i => i.product_id)
    const { data: products, error: prodError } = await supabaseAdmin
      .from('products')
      .select('id, name, price')
      .in('id', productIds)

    if (prodError || !products || products.length !== productIds.length) {
      res.status(400).json({ message: 'One or more products not found or unavailable.' })
      return
    }

    const productMap = new Map(products.map(p => [p.id, p]))

    // ── Step 2: Calculate totals ─────────────────────────────
    const orderItems = items.map(i => {
      const p = productMap.get(i.product_id)!
      const unitPrice = Number(p.price)
      return {
        product_id:   i.product_id,
        product_name: p.name as string,
        unit_price:   unitPrice,
        quantity:     i.quantity,
        line_total:   Math.round(unitPrice * i.quantity * 100) / 100,
      }
    })

    const subtotal     = orderItems.reduce((s, i) => s + i.line_total, 0)
    const vat_amount   = Math.round(subtotal * VAT_RATE * 100) / 100
    const total_amount = Math.round((subtotal + vat_amount) * 100) / 100

    // ── Step 3: Fetch cashier staff_profile id ───────────────
    // maybeSingle() so a missing profile is a clean 403, not a PGRST116 500.
    const { data: staffProfile } = await supabaseAdmin
      .from('staff_profiles')
      .select('id')
      .eq('user_id', req.userId!)
      .maybeSingle()

    if (!staffProfile) {
      res.status(403).json({ message: 'Staff profile not found.' })
      return
    }

    // ── Step 4: Load recipes and calculate required inventory ─
    const { data: recipes, error: recipeError } = await supabaseAdmin
      .from('product_recipes')
      .select('product_id, inventory_id, qty_per_unit')
      .in('product_id', productIds)

    if (recipeError) {
      console.error('Recipe fetch error:', recipeError)
      res.status(500).json({ message: 'Failed to verify product ingredients.' })
      return
    }

    const deductionMap = new Map<string, number>()
    for (const item of items) {
      const itemRecipes = (recipes ?? []).filter(r => r.product_id === item.product_id)
      for (const recipe of itemRecipes) {
        const totalDeduct = Number(recipe.qty_per_unit) * item.quantity
        deductionMap.set(
          recipe.inventory_id,
          (deductionMap.get(recipe.inventory_id) ?? 0) + totalDeduct
        )
      }
    }

    // ── Step 5: Validate inventory availability ───────────────
    let inventoryItems: Array<{ id: string; stock_qty: number; name: string; unit: string }> = []
    if (deductionMap.size > 0) {
      const inventoryIds = [...deductionMap.keys()]
      const { data: invData, error: invFetchError } = await supabaseAdmin
        .from('inventory')
        .select('id, stock_qty, name, unit')
        .in('id', inventoryIds)

      if (invFetchError || !invData) {
        console.error('Inventory fetch error:', invFetchError)
        res.status(500).json({ message: 'Failed to check inventory levels.' })
        return
      }

      inventoryItems = invData.map(i => ({ ...i, stock_qty: Number(i.stock_qty) }))

      const insufficient: string[] = []
      for (const inv of inventoryItems) {
        const required = deductionMap.get(inv.id) ?? 0
        if (inv.stock_qty < required) {
          insufficient.push(`${inv.name} (need ${required} ${inv.unit}, only ${inv.stock_qty} available)`)
        }
      }

      if (insufficient.length > 0) {
        res.status(400).json({
          message: `Insufficient stock to fulfill order: ${insufficient.join(', ')}`,
        })
        return
      }
    }

    // ── Step 6: Persist the order atomically ─────────────────
    //
    // The order header, its line items, the stock updates and the movement log
    // must all land together. Previously they were four independent writes, so
    // a failure after the header insert left a "completed" order with no line
    // items — which inflates order counts and corrupts sales analytics.
    //
    // Preferred path: a single Postgres function executed as one transaction.
    // Fallback path: sequential writes with compensating cleanup, for
    // deployments where the migration has not been applied yet.
    const rpcResult = await supabaseAdmin.rpc('create_order', {
      p_cashier_id:     staffProfile.id,
      p_payment_method: paymentMethod,
      p_subtotal:       subtotal,
      p_vat_amount:     vat_amount,
      p_total_amount:   total_amount,
      p_notes:          notes,
      p_items:          orderItems,
      p_deductions:     inventoryItems.map(inv => ({
        inventory_id: inv.id,
        qty:          deductionMap.get(inv.id) ?? 0,
      })),
    })

    // PGRST202 = function not found → this deployment has not run the migration.
    const rpcMissing =
      rpcResult.error &&
      (rpcResult.error.code === 'PGRST202' ||
        /create_order/i.test(rpcResult.error.message ?? ''))

    if (!rpcResult.error && rpcResult.data) {
      const row = (Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data) as {
        id: string
        order_number: number
        deductions_applied: number
      }
      res.status(201).json({
        id:                 row.id,
        order_number:       row.order_number,
        deductions_applied: row.deductions_applied ?? deductionMap.size,
      })
      return
    }

    if (rpcResult.error && !rpcMissing) {
      console.error('create_order RPC error:', rpcResult.error)
      res.status(500).json({ message: 'Failed to record the order. Nothing was saved.' })
      return
    }

    // ── Fallback path (migration not applied) ────────────────
    console.warn(
      '[checkout] create_order() RPC unavailable — using non-atomic fallback. ' +
        'Apply supabase/migrations/20261010_create_order.sql for guaranteed atomicity.'
    )

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        cashier_id:     staffProfile.id,
        status:         'completed',
        payment_method: paymentMethod,
        subtotal,
        vat_amount,
        total_amount,
        notes,
      })
      .select('id, order_number')
      .single()

    if (orderError || !order) {
      console.error('Order insert error:', orderError)
      res.status(500).json({ message: 'Failed to create order.' })
      return
    }

    /**
     * Undo everything written so far. Used when a later step fails, so a
     * partial order never survives as a phantom "completed" sale.
     */
    const rollback = async (reason: string) => {
      console.error('[checkout] rolling back order', order.order_number, '—', reason)
      // Movements and items reference the order; delete children first.
      await supabaseAdmin.from('inventory_movements').delete().eq('order_id', order.id)
      await supabaseAdmin.from('order_items').delete().eq('order_id', order.id)
      await supabaseAdmin.from('orders').delete().eq('id', order.id)
    }

    const { error: itemsError } = await supabaseAdmin
      .from('order_items')
      .insert(orderItems.map(i => ({ ...i, order_id: order.id })))

    if (itemsError) {
      await rollback('order_items insert failed: ' + itemsError.message)
      res.status(500).json({ message: 'Failed to save order items. The order was not recorded.' })
      return
    }

    if (deductionMap.size === 0) {
      res.status(201).json({ ...order, deductions_applied: 0 })
      return
    }

    // ── Apply deductions + log movements ─────────────────────
    const restoredStock: Array<{ id: string; qty: number }> = []
    const movementInserts: object[] = []
    let deductionFailure: string | null = null

    for (const invItem of inventoryItems) {
      const deductQty  = deductionMap.get(invItem.id) ?? 0
      const currentQty = Number(invItem.stock_qty)
      const newQty     = Math.max(0, currentQty - deductQty) // floor at 0

      const { error: updateError } = await supabaseAdmin
        .from('inventory')
        .update({ stock_qty: newQty })
        .eq('id', invItem.id)

      if (updateError) {
        deductionFailure = `Failed to update ${invItem.name}: ${updateError.message}`
        break
      }

      restoredStock.push({ id: invItem.id, qty: currentQty })

      movementInserts.push({
        inventory_id:  invItem.id,
        order_id:      order.id,
        movement_type: 'deduction',
        qty_change:    -deductQty,
        qty_before:    currentQty,
        qty_after:     newQty,
        performed_by:  staffProfile.id,
        notes:         `Auto-deducted for Order #${order.order_number}`,
      })
    }

    if (deductionFailure) {
      // Restore any stock already decremented, then drop the whole order.
      for (const prev of restoredStock) {
        await supabaseAdmin.from('inventory').update({ stock_qty: prev.qty }).eq('id', prev.id)
      }
      await rollback(deductionFailure)
      res.status(500).json({
        message: 'Could not update stock for this order. Nothing was saved.',
      })
      return
    }

    // The movement log is part of the order record: if it cannot be written,
    // the order must not stand, or stock and its history would silently diverge.
    if (movementInserts.length > 0) {
      const { error: movementError } = await supabaseAdmin
        .from('inventory_movements')
        .insert(movementInserts)

      if (movementError) {
        console.error('Movement log insert error:', movementError)
        for (const prev of restoredStock) {
          await supabaseAdmin.from('inventory').update({ stock_qty: prev.qty }).eq('id', prev.id)
        }
        await rollback('inventory_movements insert failed: ' + movementError.message)
        res.status(500).json({
          message: 'Could not write the inventory audit log. Nothing was saved.',
        })
        return
      }
    }

    res.status(201).json({
      ...order,
      deductions_applied: deductionMap.size,
    })
  }
)

export default router
