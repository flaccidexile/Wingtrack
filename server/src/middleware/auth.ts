import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
dotenv.config()

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? ''

export interface AuthenticatedRequest extends Request {
  userId?: string
  userEmail?: string
}

/**
 * Middleware: Verify Supabase JWT from Authorization: Bearer <token>
 * Attaches userId and userEmail to the request object on success.
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization']
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Missing or invalid Authorization header.' })
    return
  }

  const token = authHeader.slice(7)
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; email: string }
    req.userId    = decoded.sub
    req.userEmail = decoded.email
    next()
  } catch {
    res.status(401).json({ message: 'Invalid or expired token.' })
  }
}
