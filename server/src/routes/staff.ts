import { Router, type Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'
import { supabaseAdmin } from '../lib/supabase'

const router = Router()

// GET /api/staff — Admin only: list all staff
router.get('/', requireAuth, requireRole('admin'), async (_req, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('staff_profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) { res.status(500).json({ message: error.message }); return }
  res.json(data)
})

// POST /api/staff — Admin only: provision a new staff account
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { email, password, full_name, role } = req.body as {
      email: string
      password: string
      full_name: string
      role: 'cashier' | 'inventory_personnel' | 'admin'
    }

    if (!email || !password || !full_name || !role) {
      res.status(400).json({ message: 'email, password, full_name, and role are required.' })
      return
    }

    // Create auth user using admin API (bypasses email confirmation)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError || !authData?.user) {
      res.status(400).json({ message: authError?.message ?? 'Failed to create auth user.' })
      return
    }

    // Get the admin's staff_profile id for created_by
    const { data: adminProfile } = await supabaseAdmin
      .from('staff_profiles')
      .select('id')
      .eq('user_id', req.userId!)
      .maybeSingle()

    // Create staff profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('staff_profiles')
      .insert({
        user_id:    authData.user.id,
        full_name,
        email,
        role,
        is_active:  true,
        created_by: adminProfile?.id ?? null,
      })
      .select()
      .single()

    if (profileError) {
      // Rollback: delete the auth user we just created
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      res.status(500).json({ message: profileError.message })
      return
    }

    res.status(201).json(profile)
  }
)

// DELETE /api/staff/:id — Admin only: deactivate a staff member
router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params

    // Prevent admin from deactivating themselves
    const { data: selfProfile } = await supabaseAdmin
      .from('staff_profiles')
      .select('id')
      .eq('user_id', req.userId!)
      .maybeSingle()

    if (selfProfile?.id === id) {
      res.status(400).json({ message: 'You cannot deactivate your own account.' })
      return
    }

    const { error } = await supabaseAdmin
      .from('staff_profiles')
      .update({ is_active: false })
      .eq('id', id)

    if (error) { res.status(500).json({ message: error.message }); return }
    res.json({ id, is_active: false })
  }
)

// PATCH /api/staff/:id/reactivate — Admin only: reactivate a staff member
router.patch(
  '/:id/reactivate',
  requireAuth,
  requireRole('admin'),
  async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = _req.params

    const { error } = await supabaseAdmin
      .from('staff_profiles')
      .update({ is_active: true })
      .eq('id', id)

    if (error) { res.status(500).json({ message: error.message }); return }
    res.json({ id, is_active: true })
  }
)

// PATCH /api/staff/update-password — Authenticated user updates their own password
router.patch(
  '/update-password',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { password } = req.body as { password?: string }

    if (!password || password.length < 6) {
      res.status(400).json({ message: 'Password must be at least 6 characters long.' })
      return
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.userId!, {
      password,
    })

    if (error) {
      res.status(400).json({ message: error.message })
      return
    }

    res.json({ message: 'Password updated successfully.' })
  }
)

export default router

