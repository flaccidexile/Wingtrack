import { Router, type Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'
import { supabaseAdmin } from '../lib/supabase'

const router = Router()

// ────────────────────────────────────────────────────────────
// POST /api/checkout
// 1. Creates the order + order_items in Supabase.
// 2. Loads the recipe map for every ordered product.
// 3. Runs the inventory deduction loop.
// 4. Logs every deduction to inventory_movements.
// ────────────────────────────────────────────────────────────
router.post(
  '/',
  requireAuth,
  requireRole('cashier', 'admin'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { items, payment_method, notes } = req.body as {
      items: { product_id: string; quantity: number }[]
      payment_method: 'cash' | 'gcash' | 'card'
      notes?: string
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ message: 'Order must contain at least one item.' })
      return
    }

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
      return {
        product_id:   i.product_id,
        product_name: p.name as string,
        unit_price:   Number(p.price),
        quantity:     i.quantity,
      }
    })

    const subtotal   = orderItems.reduce((s, i) => s + i.unit_price * i.quantity, 0)
    const vat_amount = Math.round(subtotal * 0.12 * 100) / 100
    const total_amount = Math.round((subtotal + vat_amount) * 100) / 100

    // ── Step 3: Fetch cashier staff_profile id ───────────────
    const { data: staffProfile } = await supabaseAdmin
      .from('staff_profiles')
      .select('id')
      .eq('user_id', req.userId!)
      .single()

    if (!staffProfile) {
      res.status(403).json({ message: 'Staff profile not found.' })
      return
    }

    // ── Step 4: Insert the Order ─────────────────────────────
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        cashier_id:     staffProfile.id,
        status:         'completed',
        payment_method,
        subtotal,
        vat_amount,
        total_amount,
        notes: notes ?? null,
      })
      .select('id, order_number')
      .single()

    if (orderError || !order) {
      console.error('Order insert error:', orderError)
      res.status(500).json({ message: 'Failed to create order.' })
      return
    }

    // ── Step 5: Insert Order Items ───────────────────────────
    const { error: itemsError } = await supabaseAdmin
      .from('order_items')
      .insert(orderItems.map(i => ({ ...i, order_id: order.id })))

    if (itemsError) {
      console.error('Order items insert error:', itemsError)
      res.status(500).json({ message: 'Failed to save order items.' })
      return
    }

    // ── Step 6: Load Recipe Map ──────────────────────────────
    const { data: recipes, error: recipeError } = await supabaseAdmin
      .from('product_recipes')
      .select('product_id, inventory_id, qty_per_unit')
      .in('product_id', productIds)

    if (recipeError) {
      console.error('Recipe fetch error:', recipeError)
      // Non-fatal — order is saved, but log warning
      res.status(200).json({ ...order, warning: 'Order saved but inventory deduction skipped (recipe error).' })
      return
    }

    // ── Step 7: Aggregate inventory deductions ───────────────
    // Aggregate how much total to deduct per inventory item
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

    if (deductionMap.size === 0) {
      res.status(200).json(order)
      return
    }

    // ── Step 8: Fetch current stock levels ───────────────────
    const inventoryIds = [...deductionMap.keys()]
    const { data: inventoryItems, error: invFetchError } = await supabaseAdmin
      .from('inventory')
      .select('id, stock_qty, name')
      .in('id', inventoryIds)

    if (invFetchError || !inventoryItems) {
      console.error('Inventory fetch error:', invFetchError)
      res.status(200).json({ ...order, warning: 'Order saved but inventory deduction skipped.' })
      return
    }

    // ── Step 9: Apply deductions + log movements ─────────────
    const deductionErrors: string[] = []
    const movementInserts: object[] = []

    for (const invItem of inventoryItems) {
      const deductQty   = deductionMap.get(invItem.id) ?? 0
      const currentQty  = Number(invItem.stock_qty)
      const newQty      = Math.max(0, currentQty - deductQty) // floor at 0

      const { error: updateError } = await supabaseAdmin
        .from('inventory')
        .update({ stock_qty: newQty })
        .eq('id', invItem.id)

      if (updateError) {
        deductionErrors.push(`Failed to update ${invItem.name}: ${updateError.message}`)
        continue
      }

      movementInserts.push({
        inventory_id:   invItem.id,
        order_id:       order.id,
        movement_type:  'deduction',
        qty_change:     -deductQty,
        qty_before:     currentQty,
        qty_after:      newQty,
        performed_by:   staffProfile.id,
        notes:          `Auto-deducted for Order #${order.order_number}`,
      })
    }

    // ── Step 10: Bulk insert movement log ────────────────────
    if (movementInserts.length > 0) {
      await supabaseAdmin.from('inventory_movements').insert(movementInserts)
    }

    if (deductionErrors.length > 0) {
      console.warn('Partial inventory deduction errors:', deductionErrors)
    }

    res.status(201).json({
      ...order,
      deductions_applied: deductionMap.size - deductionErrors.length,
      warnings: deductionErrors.length > 0 ? deductionErrors : undefined,
    })
  }
)

export default router
