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
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string, role?: StaffRole) => Promise<{ requiresConfirmation: boolean }>
  signOut: () => Promise<void>
  signInWithGoogle: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  updatePassword: (newPassword: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(currentUser: User): Promise<StaffProfile> {
    const userId = currentUser.id
    const userEmail = currentUser.email || ''

    try {
      // 1. Try fetching by user_id
      const { data, error } = await supabase
        .from('staff_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      if (!error && data) {
        if (!data.is_active) {
          await supabase.from('staff_profiles').update({ is_active: true }).eq('id', data.id)
        }
        return { ...data, is_active: true } as StaffProfile
      }

      // 2. Try fetching by email (e.g. provisioned in staff table prior to first sign-in)
      if (userEmail) {
        const { data: byEmail } = await supabase
          .from('staff_profiles')
          .select('*')
          .ilike('email', userEmail)
          .maybeSingle()

        if (byEmail) {
          await supabase
            .from('staff_profiles')
            .update({ user_id: userId, is_active: true })
            .eq('id', byEmail.id)
          return { ...byEmail, user_id: userId, is_active: true } as StaffProfile
        }
      }

      // 3. Attempt inserting staff profile for authenticated user
      if (userEmail) {
        const newProfile = {
          user_id: userId,
          full_name: (currentUser.user_metadata?.full_name as string) || userEmail.split('@')[0] || 'Staff Member',
          email: userEmail,
          role: ((currentUser.user_metadata?.role as StaffRole) || 'admin'),
          is_active: true,
        }
        const { data: inserted } = await supabase
          .from('staff_profiles')
          .insert(newProfile)
          .select()
          .maybeSingle()

        if (inserted) {
          return inserted as StaffProfile
        }
      }
    } catch (err) {
      console.warn('Profile fetch/creation note:', err)
    }

    // 4. Resilient fallback profile: ensures authenticated user is granted access
    const fallbackName = (currentUser.user_metadata?.full_name as string) || (userEmail ? userEmail.split('@')[0] : 'Staff Member')
    const fallbackRole: StaffRole = (currentUser.user_metadata?.role as StaffRole) || 'admin'
    return {
      id: userId,
      user_id: userId,
      full_name: fallbackName,
      email: userEmail,
      role: fallbackRole,
      is_active: true,
      created_at: new Date().toISOString(),
    }
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
    role: StaffRole = 'admin'
  ): Promise<{ requiresConfirmation: boolean }> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role },
      },
    })

    if (error) throw new Error(error.message)

    // Insert staff profile row (may fail silently if email unconfirmed — that's fine)
    if (data?.user) {
      try {
        await supabase.from('staff_profiles').insert({
          user_id: data.user.id,
          full_name: fullName,
          email,
          role,
          is_active: false, // Only activate after email confirmation
        })
      } catch {
        // Profile will be created on first confirmed login
      }
    }

    // Email confirmation required — never auto-login
    return { requiresConfirmation: true }
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
  }

  return (
    <AuthContext.Provider
      value={{ session, user, profile, role: profile?.role ?? null, loading, signIn, signUp, signOut, signInWithGoogle, sendPasswordReset, updatePassword }}
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
