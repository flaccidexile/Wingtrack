import { Router, type Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'
import { supabaseAdmin } from '../lib/supabase'

const router = Router()

/** Movement types the audit log accepts. Anything else is rejected. */
const MOVEMENT_TYPES = ['restock', 'adjustment', 'waste'] as const
type MovementType = (typeof MOVEMENT_TYPES)[number]

/** Upper bound for a single manual adjustment, to catch fat-finger entries. */
const MAX_ADJUSTMENT = 1_000_000

// GET /api/inventory — Admin + Inventory Personnel
router.get('/', requireAuth, requireRole('admin', 'inventory_personnel'), async (_req, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('inventory')
    .select('*')
    .order('name')

  if (error) { res.status(500).json({ message: error.message }); return }
  res.json(data)
})

// PATCH /api/inventory/:id/adjust — Manual stock adjustment
router.patch(
  '/:id/adjust',
  requireAuth,
  requireRole('admin', 'inventory_personnel'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params
    const body = (req.body ?? {}) as Record<string, unknown>
    const qtyChange    = body.qty_change
    const movementType = body.movement_type
    const rawNotes     = body.notes

    // ── Validation ───────────────────────────────────────────
    // Every value is checked at runtime. The body is typed as `unknown` above
    // because a type assertion is erased at compile time and would let a string
    // or an arbitrary movement_type reach the database.
    if (typeof qtyChange !== 'number' || !Number.isFinite(qtyChange)) {
      res.status(400).json({ message: 'qty_change must be a number.' })
      return
    }
    if (qtyChange === 0) {
      res.status(400).json({ message: 'qty_change must be a non-zero number.' })
      return
    }
    if (Math.abs(qtyChange) > MAX_ADJUSTMENT) {
      res.status(400).json({ message: `qty_change cannot exceed ${MAX_ADJUSTMENT} in one adjustment.` })
      return
    }
    if (typeof movementType !== 'string' || !(MOVEMENT_TYPES as readonly string[]).includes(movementType)) {
      res.status(400).json({
        message: `movement_type must be one of: ${MOVEMENT_TYPES.join(', ')}.`,
      })
      return
    }

    const notes = typeof rawNotes === 'string' && rawNotes.trim() !== ''
      ? rawNotes.trim().slice(0, 500)
      : null

    // Fetch current stock
    const { data: invItem, error: fetchError } = await supabaseAdmin
      .from('inventory')
      .select('id, stock_qty, name')
      .eq('id', id)
      .maybeSingle()

    if (fetchError || !invItem) {
      res.status(404).json({ message: 'Inventory item not found.' })
      return
    }

    const currentQty = Number(invItem.stock_qty)
    const newQty     = Math.max(0, currentQty + qtyChange)

    // Update stock
    const { error: updateError } = await supabaseAdmin
      .from('inventory')
      .update({ stock_qty: newQty })
      .eq('id', id)

    if (updateError) {
      console.error('Inventory update error:', updateError)
      res.status(500).json({ message: 'Failed to update stock. Please try again.' })
      return
    }

    // Get staff profile for audit log. maybeSingle() so an unlinked account
    // yields null (performed_by: null) instead of throwing PGRST116.
    const { data: staffProfile } = await supabaseAdmin
      .from('staff_profiles')
      .select('id')
      .eq('user_id', req.userId!)
      .maybeSingle()

    // ── Audit log ────────────────────────────────────────────
    // The movement record is part of the change, not a side effect. If it
    // cannot be written, the stock update is reverted — otherwise the stock
    // level and its audit trail diverge, which defeats the purpose of keeping
    // a trail at all. The previous implementation discarded this error, so a
    // rejected insert left stock changed with no record and still returned 200.
    const { error: movementError } = await supabaseAdmin
      .from('inventory_movements')
      .insert({
        inventory_id:  id,
        movement_type: movementType as MovementType,
        qty_change:    qtyChange,
        qty_before:    currentQty,
        qty_after:     newQty,
        performed_by:  staffProfile?.id ?? null,
        notes,
      })

    if (movementError) {
      console.error('Movement log insert error — reverting stock:', movementError)
      const { error: revertError } = await supabaseAdmin
        .from('inventory')
        .update({ stock_qty: currentQty })
        .eq('id', id)

      if (revertError) {
        // Both writes failed: surface it loudly, stock may be inconsistent.
        console.error('CRITICAL: failed to revert stock after audit-log failure:', revertError)
      }

      res.status(500).json({
        message: 'Could not record this adjustment in the audit log, so it was cancelled.',
      })
      return
    }

    res.json({ id, previous_qty: currentQty, new_qty: newQty, qty_change: qtyChange })
  }
)

// GET /api/inventory/movements — Admin + Inventory Personnel: audit trail
router.get(
  '/movements',
  requireAuth,
  requireRole('admin', 'inventory_personnel'),
  async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { data, error } = await supabaseAdmin
      .from('inventory_movements')
      .select('*, inventory:inventory_id(name, unit), staff:performed_by(full_name)')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      res.status(500).json({ message: error.message })
      return
    }

    res.json(data ?? [])
  }
)

// POST /api/inventory — Admin + Inventory Personnel: add new raw material / item
router.post(
  '/',
  requireAuth,
  requireRole('admin', 'inventory_personnel'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { name, category, unit, stock_qty, min_stock_level, unit_cost, supplier } = req.body as {
      name: string
      category: string
      unit: string
      stock_qty?: number
      min_stock_level?: number
      unit_cost?: number
      supplier?: string
    }

    if (!name || !category || !unit) {
      res.status(400).json({ message: 'Name, category, and unit are required.' })
      return
    }

    const initialQty = typeof stock_qty === 'number' ? Math.max(0, stock_qty) : 0
    const minLevel = typeof min_stock_level === 'number' ? Math.max(0, min_stock_level) : 0
    const cost = typeof unit_cost === 'number' ? Math.max(0, unit_cost) : 0

    const { data: newItem, error: createError } = await supabaseAdmin
      .from('inventory')
      .insert({
        name,
        category,
        unit,
        stock_qty: initialQty,
        min_stock_level: minLevel,
        unit_cost: cost,
        supplier: supplier || null,
      })
      .select()
      .single()

    if (createError || !newItem) {
      console.error('Inventory create error:', createError)
      // Surface only known-safe conditions; never leak raw Postgres text.
      const duplicate = createError?.code === '23505'
      res.status(duplicate ? 409 : 400).json({
        message: duplicate
          ? 'An item with that name already exists.'
          : 'Failed to create the inventory item. Please check the values and try again.',
      })
      return
    }

    // Get staff profile (maybeSingle: unlinked account -> null, not a throw)
    const { data: staffProfile } = await supabaseAdmin
      .from('staff_profiles')
      .select('id')
      .eq('user_id', req.userId!)
      .maybeSingle()

    if (initialQty > 0) {
      // A new item's opening balance must be recorded, or its stock level would
      // have no history. If the log cannot be written, remove the item rather
      // than leave an unexplained quantity on the books.
      const { error: openingError } = await supabaseAdmin
        .from('inventory_movements')
        .insert({
          inventory_id: newItem.id,
          movement_type: 'restock',
          qty_change: initialQty,
          qty_before: 0,
          qty_after: initialQty,
          performed_by: staffProfile?.id ?? null,
          notes: 'Initial inventory item setup',
        })

      if (openingError) {
        console.error('Opening-balance log failed — removing item:', openingError)
        await supabaseAdmin.from('inventory').delete().eq('id', newItem.id)
        res.status(500).json({
          message: 'Could not record the opening stock balance, so the item was not created.',
        })
        return
      }
    }

    res.status(201).json(newItem)
  }
)

export default router

