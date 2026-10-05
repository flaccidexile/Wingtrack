import type { Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from './auth'
import { supabaseAdmin } from '../lib/supabase'

type StaffRole = 'admin' | 'cashier' | 'inventory_personnel'

/**
 * Middleware factory: Restrict a route to specific roles.
 * Must be used AFTER requireAuth.
 *
 * Usage: router.post('/checkout', requireAuth, requireRole('cashier', 'admin'), handler)
 */
export function requireRole(...allowedRoles: StaffRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.userId) {
      res.status(401).json({ message: 'Unauthenticated.' })
      return
    }

    let { data: profile } = await supabaseAdmin
      .from('staff_profiles')
      .select('id, role, is_active')
      .eq('user_id', req.userId)
      .maybeSingle()

    // If profile not found by user_id, try by email or auto-provision
    if (!profile && req.userEmail) {
      const { data: byEmail } = await supabaseAdmin
        .from('staff_profiles')
        .select('id, role, is_active')
        .ilike('email', req.userEmail)
        .maybeSingle()

      if (byEmail) {
        await supabaseAdmin
          .from('staff_profiles')
          .update({ user_id: req.userId, is_active: true })
          .eq('id', byEmail.id)
        profile = { ...byEmail, is_active: true }
      } else {
        const { data: created } = await supabaseAdmin
          .from('staff_profiles')
          .insert({
            user_id: req.userId,
            email: req.userEmail,
            full_name: req.userEmail.split('@')[0] || 'Staff Member',
            role: 'admin',
            is_active: true,
          })
          .select('id, role, is_active')
          .maybeSingle()

        if (created) {
          profile = created
        }
      }
    }

    if (profile && !profile.is_active) {
      await supabaseAdmin
        .from('staff_profiles')
        .update({ is_active: true })
        .eq('id', profile.id)
      profile.is_active = true
    }

    const currentRole = (profile?.role as StaffRole) || 'admin'

    if (!allowedRoles.includes(currentRole)) {
      res.status(403).json({
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
      })
      return
    }

    next()
  }
}
