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

/**
 * Page size for the audit trail.
 *
 * Every ingredient deduction writes a row here, so this table grows with sales
 * volume, not with the size of the menu. The previous implementation returned a
 * bare `.limit(100)` with no offset: the trail was readable only as the newest
 * 100 movements, and anything older was unreachable from the UI even though it
 * was still on disk. That is a paging defect, not an archiving one — nothing is
 * ever deleted from an audit log, so the fix is to walk it, not to prune it.
 */
const DEFAULT_MOVEMENTS_PAGE_SIZE = 100
const MAX_MOVEMENTS_PAGE_SIZE = 500

/** Upper bound on rows a single inventory read may return. */
const MAX_INVENTORY_ROWS = 1000

// GET /api/inventory — Admin + Inventory Personnel
//
// The ingredient catalogue, not a log: it is bounded by the number of raw
// materials the kitchen stocks (dozens, not millions), so it is returned in one
// read to keep the Inventory screen and its client-side search simple. The
// `limit` is a guard rail against runaway growth, not a paging control — it
// sits high enough that no realistic catalogue is ever truncated.
router.get('/', requireAuth, requireRole('admin', 'inventory_personnel'), async (_req, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('inventory')
    .select('*')
    .order('name')
    .limit(MAX_INVENTORY_ROWS)

  if (error) {
    console.error('Fetch inventory failed:', error)
    res.status(500).json({ message: 'Failed to fetch inventory.' })
    return
  }
  res.json(data ?? [])
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
//
// Paged. Returns `{ movements, total, limit, offset }` so the client can show
// "showing X of Y" and walk back through the whole trail instead of only the
// newest page. Optional `inventory_id` narrows the trail to one ingredient,
// which is what an investigation into a single stock discrepancy needs.
router.get(
  '/movements',
  requireAuth,
  requireRole('admin', 'inventory_personnel'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    // Same clamping discipline as /api/orders: a nonsense window falls back to
    // the default rather than reaching PostgREST.
    const rawLimit = Number(req.query.limit)
    const rawOffset = Number(req.query.offset)
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_MOVEMENTS_PAGE_SIZE)
      : DEFAULT_MOVEMENTS_PAGE_SIZE
    const offset = Number.isFinite(rawOffset) && rawOffset > 0
      ? Math.floor(rawOffset)
      : 0

    const inventoryId = typeof req.query.inventory_id === 'string' && req.query.inventory_id.trim() !== ''
      ? req.query.inventory_id.trim()
      : null

    let query = supabaseAdmin
      .from('inventory_movements')
      .select(
        '*, inventory:inventory_id(name, unit), staff:performed_by(full_name)',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      // `id` breaks ties on created_at so a burst of rows written in the same
      // millisecond cannot shuffle between pages and be shown twice.
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1)

    if (inventoryId) {
      query = query.eq('inventory_id', inventoryId)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Fetch inventory movements failed:', error)
      res.status(500).json({ message: 'Failed to fetch inventory movements.' })
      return
    }

    res.json({
      movements: data ?? [],
      total: count ?? (data?.length ?? 0),
      limit,
      offset,
    })
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

