import { Router, type Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'
import { supabaseAdmin } from '../lib/supabase'

const router = Router()

/** Roles that may be assigned to a newly provisioned staff account. */
const ASSIGNABLE_ROLES = ['admin', 'cashier', 'inventory_personnel'] as const
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

function isAssignableRole(value: unknown): value is AssignableRole {
  return typeof value === 'string' && (ASSIGNABLE_ROLES as readonly string[]).includes(value)
}

/**
 * POST /api/auth/signup — Admin only.
 *
 * Provisions a new staff account. This is NOT a public sign-up endpoint:
 * public self-registration is disabled by design, so an existing admin must
 * be authenticated to create an account. The role is validated against
 * ASSIGNABLE_ROLES and never inferred from the request body.
 *
 * For the very first admin account, insert the user directly in the Supabase
 * dashboard (Authentication → Users → Add User) and add the matching
 * public.staff_profiles row — see README "Create the First Admin Account".
 */
router.post(
  '/signup',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { email, password, full_name, role } = req.body as {
      email?: string
      password?: string
      full_name?: string
      role?: string
    }

    if (!email || !password || !full_name) {
      res.status(400).json({ message: 'Full name, email, and password are required.' })
      return
    }

    if (password.length < 8) {
      res.status(400).json({ message: 'Password must be at least 8 characters.' })
      return
    }

    // Role must be explicitly provided and must be a valid, non-privileged-by-default value.
    if (!isAssignableRole(role)) {
      res.status(400).json({
        message: `A valid role is required. One of: ${ASSIGNABLE_ROLES.join(', ')}.`,
      })
      return
    }

    // Never allow provisioning through this route to target the caller's own account.
    if (req.userEmail && req.userEmail.toLowerCase() === email.toLowerCase()) {
      res.status(400).json({ message: 'You cannot provision an account for your own email address.' })
      return
    }

    try {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, role },
      })

      if (authError || !authData?.user) {
        res.status(400).json({ message: authError?.message ?? 'Failed to create user account.' })
        return
      }

      const userId = authData.user.id

      // Resolve the calling admin's staff_profile id for the created_by audit field.
      const { data: adminProfile } = await supabaseAdmin
        .from('staff_profiles')
        .select('id')
        .eq('user_id', req.userId!)
        .maybeSingle()

      const { data: existingProfile } = await supabaseAdmin
        .from('staff_profiles')
        .select('id')
        .ilike('email', email)
        .maybeSingle()

      if (existingProfile) {
        const { error: updateError } = await supabaseAdmin
          .from('staff_profiles')
          .update({
            user_id: userId,
            full_name,
            role,
            is_active: true,
            created_by: adminProfile?.id ?? null,
          })
          .eq('id', existingProfile.id)

        if (updateError) {
          await supabaseAdmin.auth.admin.deleteUser(userId)
          res.status(500).json({ message: updateError.message })
          return
        }
      } else {
        const { error: insertError } = await supabaseAdmin.from('staff_profiles').insert({
          user_id: userId,
          full_name,
          email,
          role,
          is_active: true,
          created_by: adminProfile?.id ?? null,
        })

        if (insertError) {
          // Roll back the auth user so we don't leave an orphaned account.
          await supabaseAdmin.auth.admin.deleteUser(userId)
          res.status(500).json({ message: insertError.message })
          return
        }
      }

      res.status(201).json({
        success: true,
        message: 'Account successfully registered and profile provisioned.',
        user: { id: userId, email, full_name, role },
      })
    } catch (err: unknown) {
      console.error('Registration error in /api/auth/signup:', err)
      res.status(500).json({
        message: err instanceof Error ? err.message : 'Internal registration error.',
      })
    }
  }
)

export default router
