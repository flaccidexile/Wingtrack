import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { StaffProfile, StaffRole } from '@/types'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: StaffProfile | null
  role: StaffRole | null
  loading: boolean
  /**
   * Why the current user has no usable profile (null while loading or when a
   * profile exists). `deactivated` = account switched off by an admin;
   * `unprovisioned` = authenticated but no staff_profiles row.
   */
  accountState: AccountState
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string, role?: StaffRole) => Promise<{ requiresConfirmation: boolean }>
  signOut: () => Promise<void>
  signInWithGoogle: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  updatePassword: (newPassword: string) => Promise<void>
}

export type AccountState = 'active' | 'deactivated' | 'unprovisioned' | null

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [accountState, setAccountState] = useState<AccountState>(null)
  const [loading, setLoading] = useState(true)

  /**
   * Resolves the staff profile for an authenticated user.
   *
   * Fail-closed: the profile is READ from the database and never synthesized.
   * The hook does not default a missing role to admin, does not create profile
   * rows, and does not reactivate deactivated accounts — the server and RLS
   * remain the source of truth for authorization.
   *
   * Returns `null` when the user has no usable profile; callers must treat that
   * as "no access".
   */
  async function fetchProfile(currentUser: User): Promise<StaffProfile | null> {
    const userId = currentUser.id
    const userEmail = currentUser.email || ''

    try {
      // 1. Authoritative lookup by user_id.
      const { data, error } = await supabase
        .from('staff_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      if (!error && data) {
        if (!data.is_active) {
          setAccountState('deactivated')
          return null
        }
        setAccountState('active')
        return data as StaffProfile
      }

      // 2. Fall back to an email match — a profile may have been provisioned
      //    before the user first signed in. An inactive match stays inactive:
      //    we never silently reactivate an account from the client.
      if (userEmail) {
        const { data: byEmail } = await supabase
          .from('staff_profiles')
          .select('*')
          .ilike('email', userEmail)
          .maybeSingle()

        if (byEmail) {
          if (!byEmail.is_active) {
            setAccountState('deactivated')
            return null
          }
          setAccountState('active')
          return byEmail as StaffProfile
        }
      }
    } catch (err) {
      console.warn('Profile lookup failed:', err)
    }

    // No profile — the account is authenticated but not provisioned for access.
    setAccountState('unprovisioned')
    return null
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const s = data.session
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user) {
        const p = await fetchProfile(s.user)
        setProfile(p)
      }
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user) {
        const p = await fetchProfile(s.user)
        setProfile(p)
      } else {
        setProfile(null)
        setAccountState(null)
      }
      setLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  }

  async function signUp(
    email: string,
    password: string,
    fullName: string,
    role: StaffRole = 'cashier'
  ): Promise<{ requiresConfirmation: boolean }> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role },
      },
    })

    if (error) throw new Error(error.message)

    // Note: no client-side staff_profiles insert. Profiles are provisioned
    // server-side by an admin; the row is created via /api/auth/signup.
    // We never write a role from the browser.

    // Email confirmation required — never auto-login.
    return { requiresConfirmation: Boolean(data?.user && !data.session) }
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
    if (error) throw new Error(error.message)
  }

  async function sendPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}?mode=reset`,
    })
    if (error) throw new Error(error.message)
  }

  async function updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw new Error(error.message)
  }

  async function signOut() {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.warn('Sign out warning:', err)
    }
    setSession(null)
    setUser(null)
    setProfile(null)
    setAccountState(null)
  }

  return (
    <AuthContext.Provider
      value={{ session, user, profile, role: profile?.role ?? null, loading, accountState, signIn, signUp, signOut, signInWithGoogle, sendPasswordReset, updatePassword }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
