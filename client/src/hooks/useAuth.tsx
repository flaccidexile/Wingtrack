import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { apiCheckRegistered, apiProvisionSelf, apiSendHeartbeat, apiSendLoginOtp, apiSendPasswordReset } from '@/lib/api'
import { HEARTBEAT_INTERVAL_MS } from '@/lib/presence'
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

/**
 * How confident we can be that a reset email is on its way.
 *
 * `sent` means our own SMTP relay accepted the message — it was handed to a
 * mail server we control. `unconfirmed` means the request was accepted by
 * Supabase's built-in mailer, which only delivers to the project's own team
 * addresses and answers `200 OK` regardless, so the link may never arrive. The
 * caller shows different copy for the two, because promising an email that was
 * never queued is exactly the bug this replaced.
 */
export type PasswordResetOutcome = 'sent' | 'unconfirmed'

/**
 * Turns Supabase's reset errors into something a staff member can act on.
 *
 * The two cases worth naming are the ones its default mailer produces: a
 * restricted-delivery refusal, and a rate limit that reads like a bug.
 */
function describeResetError(raw: string): string {
  const msg = raw.toLowerCase()

  if (msg.includes('not authorized') || msg.includes('email address not authorized')) {
    return "This project's mail service can only deliver to the Supabase team's own inboxes. Ask an administrator to configure custom SMTP before using password reset."
  }

  if (msg.includes('rate limit') || msg.includes('you can only request this after')) {
    return `Too many reset requests for now. ${raw}`
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
  sendPasswordReset: (email: string) => Promise<PasswordResetOutcome>
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
  /**
   * Re-reads the caller's staff profile. Used after a self-service edit, and
   * by the heartbeat when it detects that an admin changed this account.
   */
  refreshProfile: () => Promise<void>
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
   * Mirrors of the latest profile and profile-refresh function, read by the
   * heartbeat interval. The interval is deliberately created once per session
   * rather than re-created on every profile change, so it cannot see the
   * current values through its closure — hence the refs.
   */
  const profileRef = useRef<StaffProfile | null>(null)
  useEffect(() => { profileRef.current = profile }, [profile])

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

        // `avatar_url` lives on the auth user until the presence migration adds
        // the column to staff_profiles. Reading it from the session user keeps
        // the sidebar and Settings photo working on an un-migrated database.
        const metaAvatar = currentUser.user_metadata?.avatar_url
        return {
          ...profile,
          avatar_url:
            profile.avatar_url ?? (typeof metaAvatar === 'string' ? metaAvatar : null),
        }
      }
    } catch (err) {
      console.warn('Profile lookup failed:', err)
    }

    // No profile — the account is authenticated but not provisioned for access.
    setAccountState('unprovisioned')
    return null
  }

  /**
   * Re-reads the current user's profile and republishes it.
   *
   * Called after a self-service profile edit, and by the heartbeat when it
   * notices the account's role or access flag changed underneath us — that is
   * what lets a deactivation take effect in an already-open tab.
   */
  const refreshProfile = useCallback(async () => {
    // `getUser()` re-reads the user from the auth server, so an avatar URL that
    // was just written to user metadata is visible straight away. Reading the
    // session alone would return the stale copy embedded at sign-in time, and
    // the photo would appear to upload but never show.
    const { data: fresh } = await supabase.auth.getUser()
    const currentUser = fresh.user ?? (await supabase.auth.getSession()).data.session?.user
    if (!currentUser) {
      setProfile(null)
      setAccountState(null)
      return
    }
    setProfile(await fetchProfile(currentUser))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshProfileRef = useRef(refreshProfile)
  useEffect(() => { refreshProfileRef.current = refreshProfile }, [refreshProfile])

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

  /**
   * Presence heartbeat.
   *
   * Two jobs:
   *
   * 1. Keeps `last_seen_at` fresh so the Staff Manager can show who is online
   *    right now. A hidden tab stops beating, so closing the app clears the
   *    indicator within the online window instead of leaving a ghost.
   *
   * 2. Carries admin changes back to an already-open session. The response
   *    echoes this account's live role and access flag, so a demotion or a
   *    deactivation is picked up on the next beat and the profile is re-read —
   *    the affected tab locks down without needing a reload.
   *
   * Runs once per signed-in session; the interval reads current values through
   * refs so it never has to be torn down and rebuilt.
   */
  useEffect(() => {
    if (!session || !profile) return

    /** Marks the browser session as having stamped `last_sign_in_at`. */
    const SIGNED_IN_FLAG = 'wingtrack.session-stamped'
    let cancelled = false

    async function beat() {
      // A hidden tab is not "online" — it just has the app open.
      if (document.visibilityState === 'hidden') return

      try {
        const signIn = !sessionStorage.getItem(SIGNED_IN_FLAG)
        const { profile: live } = await apiSendHeartbeat({ signIn })
        if (signIn) sessionStorage.setItem(SIGNED_IN_FLAG, '1')
        if (cancelled) return

        const current = profileRef.current
        if (!current) return

        // Anything an admin can change about this account that affects what
        // the UI is allowed to show or do.
        const changed =
          live.is_active === false ||
          live.role !== current.role ||
          live.full_name !== current.full_name

        if (changed) await refreshProfileRef.current()
      } catch {
        // A missed beat is not worth surfacing: the next tick retries, and the
        // online window tolerates a gap.
      }
    }

    beat()
    const timer = window.setInterval(beat, HEARTBEAT_INTERVAL_MS)

    // Coming back to the tab should read as online immediately, not up to
    // 45 seconds later.
    const onWake = () => { if (document.visibilityState === 'visible') void beat() }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [session, profile?.id])

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

  /**
   * Sends a password-reset link.
   *
   * Tries our own SMTP relay first, because Supabase's built-in mailer only
   * delivers to the project's own team addresses, is rate-limited to a couple
   * of messages per hour, and returns `200 OK` even when nothing was sent — so
   * it cannot be relied on to deliver to a real staff inbox.
   *
   * Falls back to Supabase's mailer when no relay is configured, or when the
   * API is unreachable, so the flow still works in a minimal setup. The return
   * value says which of the two happened, so the UI never claims a delivery it
   * cannot stand behind.
   */
  async function sendPasswordReset(email: string): Promise<PasswordResetOutcome> {
    const redirectTo = `${window.location.origin}?mode=reset`

    let viaServer: Awaited<ReturnType<typeof apiSendPasswordReset>> | null = null
    try {
      viaServer = await apiSendPasswordReset(email, redirectTo)
    } catch {
      // Server unreachable — fall through to Supabase rather than blocking the
      // user entirely.
    }

    if (viaServer?.sent) return 'sent'

    // A definitive answer from our own API (unknown email, deactivated
    // account, cooldown, or a relay that refused the message) is the real
    // problem. Retrying through Supabase would only hide it behind a success
    // screen.
    if (viaServer?.reason === 'refused' || viaServer?.reason === 'delivery') {
      throw new Error(viaServer.message ?? 'That reset link could not be sent.')
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) throw new Error(describeResetError(error.message))

    return 'unconfirmed'
  }

  /**
   * Completes a password reset.
   *
   * `updateUser` does NOT end the current session: following a recovery link
   * signs the user in, and Supabase keeps that session alive across the
   * password change. Without an explicit sign-out the app would treat the user
   * as authenticated the instant the new password was saved and drop them into
   * the system, bypassing the login page entirely.
   *
   * Resetting a forgotten password proves control of the inbox, not knowledge
   * of the new credential — so the session is cleared here and the caller
   * routes to the login page. This mirrors the signup flow, where a verified
   * account must also sign in explicitly.
   */
  async function updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw new Error(error.message)

    // Drop the recovery session so the user must sign in with the new password.
    await signOut()
  }

  async function signOut() {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.warn('Sign out warning:', err)
    }
    // Clear the "already stamped" marker so the next sign-in records a fresh
    // last_sign_in_at rather than inheriting this session's.
    try { sessionStorage.removeItem('wingtrack.session-stamped') } catch { /* private mode */ }
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
      value={{ session, user, profile, role: profile?.role ?? null, loading, accountState, sessionOrigin, refreshProfile, signIn, signUp, signOut, signInWithGoogle, sendPasswordReset, updatePassword, checkStaffRegistered, sendLoginOtp, verifyLoginOtp }}
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
