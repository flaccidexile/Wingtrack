import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
// Load from server/.env if present, then fall back to repo root .env
dotenv.config()
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server/.env')
}

/**
 * Service-role client — bypasses RLS.
 * ONLY used server-side after JWT verification. Never expose to clients.
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/**
 * Checks an email/password pair without touching the shared admin client.
 *
 * A throwaway client is used so the sign-in session never leaks into
 * `supabaseAdmin`. The probe session is then revoked with `scope: 'local'`,
 * which ends only that session — the user's real browser session is untouched.
 */
export async function verifyUserPassword(email: string, password: string): Promise<boolean> {
  if (!email || !password) return false
  const probe = createClient(supabaseUrl as string, serviceRoleKey as string, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await probe.auth.signInWithPassword({ email, password })
  if (error || !data.session) return false
  await probe.auth.signOut({ scope: 'local' }).catch(() => undefined)
  return true
}
