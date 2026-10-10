import type { Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from './auth'
import { supabaseAdmin } from '../lib/supabase'

type StaffRole = 'admin' | 'cashier' | 'inventory_personnel'

const VALID_ROLES: readonly StaffRole[] = ['admin', 'cashier', 'inventory_personnel']

function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (VALID_ROLES as readonly string[]).includes(value)
}

/**
 * Middleware factory: Restrict a route to specific roles.
 * Must be used AFTER requireAuth.
 *
 * Fail-closed by design: a request is denied unless an active staff profile
 * with an explicitly allowed role can be resolved. This middleware does NOT
 * auto-provision profiles, does NOT reactivate deactivated accounts, and
 * never falls back to a privileged role.
 *
 * Usage: router.post('/checkout', requireAuth, requireRole('cashier', 'admin'), handler)
 */
export function requireRole(...allowedRoles: StaffRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.userId) {
      res.status(401).json({ message: 'Unauthenticated.' })
      return
    }

    // Resolve the staff profile by user_id (authoritative link).
    let { data: profile } = await supabaseAdmin
      .from('staff_profiles')
      .select('id, role, is_active')
      .eq('user_id', req.userId)
      .maybeSingle()

    // Fall back to matching on email only to LINK a pre-provisioned profile to
    // this auth user. If the email row is inactive we refuse — we never
    // reactivate an account implicitly.
    if (!profile && req.userEmail) {
      const { data: byEmail } = await supabaseAdmin
        .from('staff_profiles')
        .select('id, role, is_active')
        .ilike('email', req.userEmail)
        .maybeSingle()

      if (byEmail) {
        if (!byEmail.is_active) {
          res.status(403).json({ message: 'This account has been deactivated. Contact an administrator.' })
          return
        }

        const { error: linkError } = await supabaseAdmin
          .from('staff_profiles')
          .update({ user_id: req.userId })
          .eq('id', byEmail.id)

        if (linkError) {
          console.error('[RBAC] Failed to link staff profile by email:', linkError)
          res.status(403).json({ message: 'No staff profile is linked to this account.' })
          return
        }

        profile = byEmail
      }
    }

    // No profile ⇒ deny. Do NOT auto-provision.
    if (!profile) {
      res.status(403).json({
        message: 'No staff profile is associated with this account. Contact an administrator.',
      })
      return
    }

    // Deactivated accounts are refused outright.
    if (!profile.is_active) {
      res.status(403).json({ message: 'This account has been deactivated. Contact an administrator.' })
      return
    }

    const currentRole = profile.role

    if (!isStaffRole(currentRole) || !allowedRoles.includes(currentRole)) {
      res.status(403).json({
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
      })
      return
    }

    next()
  }
}
