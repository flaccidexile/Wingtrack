import { Router, type Request, type Response } from 'express'
import { supabaseAdmin } from '../lib/supabase'

const router = Router()

/**
 * POST /api/auth/signup
 * Public sign-up endpoint that creates an authenticated Supabase user
 * and automatically provisions their staff profile in public.staff_profiles.
 */
router.post('/signup', async (req: Request, res: Response): Promise<void> => {
  const { email, password, full_name, role = 'admin' } = req.body as {
    email: string
    password: string
    full_name: string
    role?: 'admin' | 'cashier' | 'inventory_personnel'
  }

  if (!email || !password || !full_name) {
    res.status(400).json({ message: 'Full name, email, and password are required.' })
    return
  }

  if (password.length < 6) {
    res.status(400).json({ message: 'Password must be at least 6 characters.' })
    return
  }

  try {
    // 1. Create auth user with pre-confirmed email so they can log in immediately
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        role,
      },
    })

    if (authError || !authData?.user) {
      res.status(400).json({ message: authError?.message ?? 'Failed to create user account.' })
      return
    }

    const userId = authData.user.id

    // 2. Provision or link the staff profile
    const { data: existingProfile } = await supabaseAdmin
      .from('staff_profiles')
      .select('id')
      .ilike('email', email)
      .maybeSingle()

    if (existingProfile) {
      await supabaseAdmin
        .from('staff_profiles')
        .update({
          user_id: userId,
          full_name,
          role,
          is_active: true,
        })
        .eq('id', existingProfile.id)
    } else {
      await supabaseAdmin.from('staff_profiles').insert({
        user_id: userId,
        full_name,
        email,
        role,
        is_active: true,
      })
    }

    res.status(201).json({
      success: true,
      message: 'Account successfully registered and profile provisioned.',
      user: {
        id: userId,
        email,
        full_name,
        role,
      },
    })
  } catch (err: unknown) {
    console.error('Registration error in /api/auth/signup:', err)
    res.status(500).json({
      message: err instanceof Error ? err.message : 'Internal registration error.',
    })
  }
})

export default router
