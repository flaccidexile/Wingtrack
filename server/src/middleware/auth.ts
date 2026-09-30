import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
import { supabaseAdmin } from '../lib/supabase'

dotenv.config()

export interface AuthenticatedRequest extends Request {
  userId?: string
  userEmail?: string
}

/**
 * Middleware: Verify Supabase JWT from Authorization: Bearer <token>
 * Attaches userId and userEmail to the request object on success.
 */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization']
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Missing or invalid Authorization header.' })
    return
  }

  const token = authHeader.slice(7)
  const secret = process.env.SUPABASE_JWT_SECRET ?? ''

  // Strategy 1: Verify using SUPABASE_JWT_SECRET as raw string (Supabase standard)
  if (secret) {
    try {
      const decoded = jwt.verify(token, secret) as { sub: string; email?: string }
      req.userId = decoded.sub
      req.userEmail = decoded.email
      next()
      return
    } catch {
      // Strategy 1b: Verify using Buffer decoded from base64
      try {
        const decoded = jwt.verify(token, Buffer.from(secret, 'base64')) as { sub: string; email?: string }
        req.userId = decoded.sub
        req.userEmail = decoded.email
        next()
        return
      } catch {
        // Fall through to Strategy 2
      }
    }
  }

  // Strategy 2: Supabase Auth server validation via getUser (handles all signing algorithms & token refresh)
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token)
    if (data?.user && !error) {
      req.userId = data.user.id
      req.userEmail = data.user.email
      next()
      return
    }
  } catch (err) {
    console.error('Supabase getUser error in requireAuth:', err)
  }

  res.status(401).json({ message: 'Invalid or expired token.' })
}
