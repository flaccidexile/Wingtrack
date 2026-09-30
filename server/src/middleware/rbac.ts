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

    const { data: profile, error } = await supabaseAdmin
      .from('staff_profiles')
      .select('role, is_active')
      .eq('user_id', req.userId)
      .single()

    if (error || !profile) {
      res.status(403).json({ message: 'Staff profile not found.' })
      return
    }

    if (!profile.is_active) {
      res.status(403).json({ message: 'Account is deactivated.' })
      return
    }

    if (!allowedRoles.includes(profile.role as StaffRole)) {
      res.status(403).json({
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
      })
      return
    }

    next()
  }
}
