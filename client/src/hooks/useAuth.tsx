import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { apiCheckRegistered, apiProvisionSelf, apiSendLoginOtp } from '@/lib/api'
import type { StaffProfile, StaffRole } from '@/types'

/**
 * Raised when OTP sign-in is attempted for an email that is not a provisioned,
 * active staff account. Distinct from transport/session errors so the caller
 * can present it as guidance rather than as a failure.
 */
export class RegistrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RegistrationError'
  }
}

/**
 * Raised when Supabase accepts an OTP request but cannot deliver the message.
 * This is a server-side mail configuration problem (no custom SMTP), not a
 * client bug — so it is surfaced as guidance rather than as a generic failure.
 */
export class OtpDeliveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OtpDeliveryError'
  }
}

/**
 * Turns raw Supabase auth errors into messages a staff member can act on.
 *
 * The important case is rate limiting: the default Supabase mailer allows only
 * a couple of messages per hour and will not deliver to addresses outside the
 * project's team. Without this mapping those failures read as "email sent".
 */
function describeOtpError(raw: string): string {
  const msg = raw.toLowerCase()
  if (msg.includes('rate limit') || msg.includes('over_email_send_rate_limit')) {
    return 'Email rate limit reached. Supabase allows only a few codes per hour on the default mailer — please wait about an hour, then try again.'
  }
  if (msg.includes('not authorized') || msg.includes('email address not authorized')) {
    return "This project's mail service can only deliver to the Supabase team's own inboxes. Ask an administrator to configure custom SMTP before using emailed codes."
  }
  return raw
}

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
  /**
   * Looks up whether an email belongs to a provisioned, active staff member.
   * Used to gate OTP sign-in: a code is only sent to already-registered staff.
   */
  checkStaffRegistered: (email: string) => Promise<{ registered: boolean; active: boolean }>
  /** Sends a one-time login code to an already-registered staff email. */
  sendLoginOtp: (email: string) => Promise<void>
  /** Verifies a login OTP code, establishing a session on success. */
  verifyLoginOtp: (email: string, token: string) => Promise<void>
  /**
   * How the current session was established. Used to decide whether an
   * unprovisioned account should be shown the "Access Not Provisioned"
   * screen (new / self-service accounts) or treated as a provisioning gap
   * for an existing staff member (who goes straight to the login page).
   */
  sessionOrigin: SessionOrigin
}

/** How the current session was established — drives the unprovisioned screen. */
export type SessionOrigin = 'password' | 'google' | 'signup' | 'otp' | null

export type AccountState = 'active' | 'deactivated' | 'unprovisioned' | null

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [accountState, setAccountState] = useState<AccountState>(null)
  const [sessionOrigin, setSessionOrigin] = useState<SessionOrigin>(null)
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

    /** Reads the profile row for this user, by user_id then by email. */
    async function lookup(): Promise<StaffProfile | null> {
      // 1. Authoritative lookup by user_id.
      const { data, error } = await supabase
        .from('staff_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      if (!error && data) return data as StaffProfile

      // 2. Fall back to an email match — a profile may have been provisioned
      //    before the user first signed in.
      if (userEmail) {
        const { data: byEmail } = await supabase
          .from('staff_profiles')
          .select('*')
          .ilike('email', userEmail)
          .maybeSingle()
        if (byEmail) return byEmail as StaffProfile
      }

      return null
    }

    try {
      let profile = await lookup()

      // 3. Authenticated but no profile yet: this is a completed sign-up whose
      //    row was never created. Ask the server to provision it (idempotent,
      //    role clamped to non-admin). This is what stops self-registered
      //    users from being locked out permanently.
      if (!profile) {
        try {
          await apiProvisionSelf({
            full_name: (currentUser.user_metadata?.full_name as string | undefined),
            role: (currentUser.user_metadata?.role as string | undefined),
          })
          profile = await lookup()
        } catch (provisionErr) {
          // Someone else (an admin action, a race) may have created it, or the
          // call may have failed — either way fall through to the normal
          // no-profile handling rather than throwing.
          console.warn('Self-provisioning did not complete:', provisionErr)
        }
      }

      if (profile) {
        if (!profile.is_active) {
          setAccountState('deactivated')
          return null
        }
        setAccountState('active')
        return profile
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
    setSessionOrigin('password')
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
    setSessionOrigin('signup')

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
    setSessionOrigin('google')
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
    setSessionOrigin(null)
  }

  /**
   * Reports whether an email belongs to a provisioned staff member.
   *
   * OTP sign-in is restricted to staff who already have a staff_profiles row —
   * it is a login method, not a registration method. This is enforced
   * server-side in POST /api/auth/check-registered; the frontend never decides
   * on its own who may receive a code.
   */
  async function checkStaffRegistered(email: string): Promise<{ registered: boolean; active: boolean }> {
    const normalized = email.trim().toLowerCase()
    if (!normalized) return { registered: false, active: false }

    const { registered, active, message } = await apiCheckRegistered(normalized)

    // Surface the server's reason so the caller can show an accurate message.
    if (!registered || !active) {
      throw new RegistrationError(
        registered
          ? 'This account has been deactivated. Contact an administrator.'
          : message || 'This email is not registered as staff.'
      )
    }

    return { registered, active }
  }

  /**
   * Sends a one-time login code to an already-registered staff email.
   * Throws before contacting Supabase when the email is not provisioned, so
   * codes are never issued for unregistered addresses.
   */
  async function sendLoginOtp(email: string) {
    const normalized = email.trim().toLowerCase()
    await checkStaffRegistered(normalized) // throws if not registered / inactive

    // Prefer the server's own mailer when it has SMTP configured: Supabase's
    // built-in mailer only reaches the project team and is capped at a couple
    // of messages per hour, which silently drops codes for real staff.
    const viaServer = await apiSendLoginOtp(normalized)
    if (viaServer.sent) return

    // No SMTP on the server (local development, or setup not finished yet) —
    // fall back to Supabase's mailer so the flow still works where it can.
    const { error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: { shouldCreateUser: false }, // never create accounts from the login page
    })
    if (error) throw new Error(describeOtpError(error.message))
  }

  /** Verifies a login OTP, which establishes the session on success. */
  async function verifyLoginOtp(email: string, token: string) {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: 'email',
    })
    if (error) throw new Error(describeOtpError(error.message))
    setSessionOrigin('otp')
  }

  return (
    <AuthContext.Provider
      value={{ session, user, profile, role: profile?.role ?? null, loading, accountState, sessionOrigin, signIn, signUp, signOut, signInWithGoogle, sendPasswordReset, updatePassword, checkStaffRegistered, sendLoginOtp, verifyLoginOtp }}
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
