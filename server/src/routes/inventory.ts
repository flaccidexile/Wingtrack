import { Router, type Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'
import { supabaseAdmin } from '../lib/supabase'

const router = Router()

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
    const { qty_change, movement_type, notes } = req.body as {
      qty_change: number
      movement_type: 'restock' | 'adjustment' | 'waste'
      notes?: string
    }

    if (typeof qty_change !== 'number' || qty_change === 0) {
      res.status(400).json({ message: 'qty_change must be a non-zero number.' })
      return
    }

    // Fetch current stock
    const { data: invItem, error: fetchError } = await supabaseAdmin
      .from('inventory')
      .select('id, stock_qty, name')
      .eq('id', id)
      .single()

    if (fetchError || !invItem) {
      res.status(404).json({ message: 'Inventory item not found.' })
      return
    }

    const currentQty = Number(invItem.stock_qty)
    const newQty     = Math.max(0, currentQty + qty_change)

    // Update stock
    const { error: updateError } = await supabaseAdmin
      .from('inventory')
      .update({ stock_qty: newQty })
      .eq('id', id)

    if (updateError) {
      res.status(500).json({ message: updateError.message })
      return
    }

    // Get staff profile for audit log
    const { data: staffProfile } = await supabaseAdmin
      .from('staff_profiles')
      .select('id')
      .eq('user_id', req.userId!)
      .single()

    // Log movement
    await supabaseAdmin.from('inventory_movements').insert({
      inventory_id:  id,
      movement_type,
      qty_change,
      qty_before:    currentQty,
      qty_after:     newQty,
      performed_by:  staffProfile?.id ?? null,
      notes:         notes ?? null,
    })

    res.json({ id, previous_qty: currentQty, new_qty: newQty, qty_change })
  }
)

export default router
