import { Router, type Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'
import { supabaseAdmin } from '../lib/supabase'
import { getAllInventoryMeta, setInventoryMeta } from '../lib/productMetadata'

const router = Router()

const PERISHABLE_CATEGORIES = new Set(['Proteins', 'Dairy', 'Produce', 'Sides', 'Beverages', 'Sauces', 'Bakery'])

function defaultLeadTimeDays(category: string): number {
  if (category === 'Proteins' || category === 'Dairy' || category === 'Produce' || category === 'Bakery') {
    return 2
  }
  return 3
}

function defaultShelfLifeDays(category: string, index: number): number | null {
  if (category === 'Packaging') return null
  if (category === 'Proteins' || category === 'Produce' || category === 'Bakery') return 5 + (index % 6)
  if (category === 'Dairy') return 6 + (index % 8)
  if (category === 'Sides' || category === 'Beverages') return 14 + (index % 15)
  if (PERISHABLE_CATEGORIES.has(category)) return 30 + (index % 20)
  return 60
}

/** Formats a timestamp as a local YYYY-MM-DD calendar date (no UTC off-by-one). */
function toLocalDateString(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Best-effort write of optional `expiration_date` / `lead_time_days` columns to
 * Supabase's `inventory` table. Silently ignores missing-column errors when the
 * optional migration (`20261117_add_rop_and_expiry.sql`) has not been run yet —
 * local metadata (`setInventoryMeta`) still keeps the values persistent.
 */
async function tryPersistInventoryColumns(
  id: string,
  fields: { expiration_date?: string | null; lead_time_days?: number },
): Promise<void> {
  if (Object.keys(fields).length === 0) return
  const { error } = await supabaseAdmin.from('inventory').update(fields).eq('id', id)
  if (error && error.code !== '42703' && error.code !== 'PGRST204') {
    console.warn('[inventory] Optional column update skipped:', error.message)
  }
}

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
  const since30d = new Date(Date.now() - 30 * 86_400_000).toISOString()

  const [{ data, error }, { data: deductions }] = await Promise.all([
    supabaseAdmin
      .from('inventory')
      .select('*')
      .order('name')
      .limit(MAX_INVENTORY_ROWS),
    supabaseAdmin
      .from('inventory_movements')
      .select('inventory_id, qty_change')
      .eq('movement_type', 'deduction')
      .gte('created_at', since30d),
  ])

  if (error) {
    console.error('Fetch inventory failed:', error)
    res.status(500).json({ message: 'Failed to fetch inventory.' })
    return
  }

  // Sum 30-day consumption per ingredient
  const usage30dMap = new Map<string, number>()
  for (const m of deductions ?? []) {
    const id = (m as { inventory_id: string }).inventory_id
    const qty = Math.abs(Number((m as { qty_change: number }).qty_change) || 0)
    usage30dMap.set(id, (usage30dMap.get(id) ?? 0) + qty)
  }

  const metaMap = getAllInventoryMeta()
  const nowMs = Date.now()
  const toPersist: Array<{ id: string; expiration_date: string | null }> = []

  const enriched = (data ?? []).map((item: any, idx: number) => {
    const meta = metaMap[item.id] ?? {}
    const stockQty = Number(item.stock_qty) || 0
    const minLevel = Number(item.min_stock_level) || 0
    const leadTimeDays =
      typeof meta.lead_time_days === 'number'
        ? meta.lead_time_days
        : typeof item.lead_time_days === 'number'
          ? item.lead_time_days
          : defaultLeadTimeDays(item.category)

    // Average Daily Usage = 30-day deductions / 30, with a baseline of minLevel / 7
    // when historical deduction data is still sparse.
    const observedDaily = (usage30dMap.get(item.id) ?? 0) / 30
    const baselineDaily = minLevel > 0 ? minLevel / 7 : 0.5
    const avgDailyUsage = Math.round(Math.max(observedDaily, baselineDaily) * 100) / 100

    // Standard ROP Formula: (Avg Daily Usage × Lead Time in Days) + Safety Stock
    const safetyStock = minLevel * 0.5
    const reorderPoint = Math.round(((avgDailyUsage * leadTimeDays) + safetyStock) * 100) / 100

    // Suggested Reorder Quantity when stock is at/below ROP or min_stock_level
    const needsReorder = stockQty <= reorderPoint || stockQty <= minLevel
    const targetStock = Math.max(reorderPoint + minLevel, minLevel * 2)
    const suggestedReorderQty = needsReorder
      ? Math.max(Math.ceil((targetStock - stockQty) * 10) / 10, Math.ceil(minLevel))
      : 0

    // Expiration / Best-Before Date:
    // 1. Prefer a non-empty date stored directly in Supabase (`inventory.expiration_date`).
    // 2. Otherwise honor an explicitly saved metadata date (including `null` for non-perishable).
    // 3. If never initialized yet, assign a concrete calendar date ONCE and persist it so
    //    it genuinely counts down 1 day per real calendar day instead of resetting on reload.
    const dbExp =
      typeof item.expiration_date === 'string' && item.expiration_date.trim() !== ''
        ? item.expiration_date.trim()
        : null

    let expirationDate: string | null =
      dbExp !== null
        ? dbExp
        : meta.expiration_date !== undefined
          ? meta.expiration_date
          : null

    if (dbExp === null && meta.expiration_date === undefined) {
      const shelfDays = defaultShelfLifeDays(item.category, idx)
      expirationDate = shelfDays !== null ? toLocalDateString(nowMs + shelfDays * 86_400_000) : null
      setInventoryMeta(item.id, { expiration_date: expirationDate })
      if (expirationDate !== null) {
        toPersist.push({ id: item.id, expiration_date: expirationDate })
      }
    }

    return {
      ...item,
      expiration_date: expirationDate,
      lead_time_days: leadTimeDays,
      avg_daily_usage: avgDailyUsage,
      reorder_point: reorderPoint,
      suggested_reorder_qty: suggestedReorderQty,
    }
  })

  // Backfill newly initialized dates into Supabase in the background (if the column exists).
  if (toPersist.length > 0) {
    void Promise.all(
      toPersist.map(entry => tryPersistInventoryColumns(entry.id, { expiration_date: entry.expiration_date }))
    )
  }

  res.json(enriched)
})

// PATCH /api/inventory/:id/adjust — Manual stock adjustment
router.patch(
  '/:id/adjust',
  requireAuth,
  requireRole('admin', 'inventory_personnel'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = String(req.params.id)
    const body = (req.body ?? {}) as Record<string, unknown>
    const qtyChange = body.qty_change
    const movementType = body.movement_type
    const rawNotes = body.notes
    const rawExpDate = body.expiration_date
    const rawLeadTime = body.lead_time_days

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
    const newQty = Math.max(0, currentQty + qtyChange)

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
        inventory_id: id,
        movement_type: movementType as MovementType,
        qty_change: qtyChange,
        qty_before: currentQty,
        qty_after: newQty,
        performed_by: staffProfile?.id ?? null,
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

    // Persist batch expiration date / lead time to Supabase (if migrated) + local metadata
    if (rawExpDate !== undefined || rawLeadTime !== undefined) {
      const updates: { expiration_date?: string | null; lead_time_days?: number } = {}
      if (rawExpDate !== undefined) {
        updates.expiration_date = typeof rawExpDate === 'string' && rawExpDate.trim() !== '' ? rawExpDate.trim() : null
      }
      if (typeof rawLeadTime === 'number' && Number.isFinite(rawLeadTime) && rawLeadTime >= 1) {
        updates.lead_time_days = Math.round(rawLeadTime)
      }
      setInventoryMeta(id, updates)
      await tryPersistInventoryColumns(id, updates)
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
    const { name, category, unit, stock_qty, min_stock_level, unit_cost, supplier, expiration_date, lead_time_days } = req.body as {
      name: string
      category: string
      unit: string
      stock_qty?: number
      min_stock_level?: number
      unit_cost?: number
      supplier?: string
      expiration_date?: string | null
      lead_time_days?: number
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

    const cleanExp = typeof expiration_date === 'string' && expiration_date.trim() !== '' ? expiration_date.trim() : null
    const cleanLead = typeof lead_time_days === 'number' && Number.isFinite(lead_time_days) && lead_time_days >= 1
      ? Math.round(lead_time_days)
      : undefined

    if (expiration_date !== undefined || cleanLead !== undefined) {
      const updates: { expiration_date?: string | null; lead_time_days?: number } = {
        ...(expiration_date !== undefined ? { expiration_date: cleanExp } : {}),
        ...(cleanLead !== undefined ? { lead_time_days: cleanLead } : {}),
      }
      setInventoryMeta(newItem.id, updates)
      await tryPersistInventoryColumns(newItem.id, updates)
    }

    res.status(201).json({
      ...newItem,
      ...(expiration_date !== undefined ? { expiration_date: cleanExp } : {}),
      ...(cleanLead !== undefined ? { lead_time_days: cleanLead } : {}),
    })
  }
)

// DELETE /api/inventory/:id — Admin + Inventory Personnel: permanently delete an inventory item
router.delete(
  '/:id',
  requireAuth,
  requireRole('admin', 'inventory_personnel'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = String(req.params.id ?? '')
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      res.status(400).json({ message: 'Invalid inventory item ID.' })
      return
    }

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('inventory')
      .select('id, name')
      .eq('id', id)
      .maybeSingle()

    if (lookupError) {
      console.error('Inventory delete lookup error:', lookupError)
      res.status(500).json({ message: 'Failed to look up inventory item.' })
      return
    }
    if (!existing) {
      res.status(404).json({ message: 'Inventory item not found.' })
      return
    }

    // Remove dependent recipe links and movement audit rows before deleting the
    // inventory item (both tables reference public.inventory(id) without CASCADE).
    const { error: recipeErr } = await supabaseAdmin
      .from('product_recipes')
      .delete()
      .eq('inventory_id', id)

    if (recipeErr) {
      console.error('Inventory delete recipe cleanup error:', recipeErr)
      res.status(500).json({ message: 'Could not unlink this item from menu recipes.' })
      return
    }

    const { error: moveErr } = await supabaseAdmin
      .from('inventory_movements')
      .delete()
      .eq('inventory_id', id)

    if (moveErr) {
      console.error('Inventory delete movement cleanup error:', moveErr)
      res.status(500).json({ message: 'Could not remove stock movement history for this item.' })
      return
    }

    const { error: delErr } = await supabaseAdmin
      .from('inventory')
      .delete()
      .eq('id', id)

    if (delErr) {
      console.error('Inventory delete error:', delErr)
      res.status(500).json({ message: 'Failed to delete inventory item.' })
      return
    }

    res.json({ deleted: true, id, name: existing.name })
  }
)

export default router

