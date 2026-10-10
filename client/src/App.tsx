import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import LoginPage from '@/components/auth/LoginPage'
import SignUpPage from '@/components/auth/SignUpPage'
import ForgotPasswordPage from '@/components/auth/ForgotPasswordPage'
import ResetPasswordPage from '@/components/auth/ResetPasswordPage'
import OTPVerificationPage from '@/components/auth/OTPVerificationPage'
import AppShell from '@/components/layout/AppShell'

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset' | 'otp'

function detectInitialMode(): AuthMode {
  const params = new URLSearchParams(window.location.search)
  // Supabase sends ?mode=reset in the redirectTo we set in sendPasswordReset
  if (params.get('mode') === 'reset') return 'reset'
  // Supabase also sets the hash #access_token when following a recovery link
  if (window.location.hash.includes('type=recovery')) return 'reset'
  return 'login'
}

function AppContent() {
  const { session, loading, signOut, accountState, sessionOrigin } = useAuth()
  const [authMode, setAuthMode] = useState<AuthMode>(detectInitialMode)
  const [pendingEmail, setPendingEmail] = useState<string>('')
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  /** Inline notice shown after a failed "Retry Connection" attempt. */
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null)

  useEffect(() => {
    function handleOnline()  { setIsOnline(true); setOfflineNotice(null) }
    function handleOffline() { setIsOnline(false) }
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Fallback guard. Self-registered users are now auto-provisioned on first
  // authenticated load (see fetchProfile -> apiProvisionSelf), so reaching here
  // with no profile means the provisioning call itself failed. Rather than
  // trapping an existing credential holder on an error card, sign them out and
  // let them retry. Run as an effect so we never signOut() during render.
  const unprovisionedExistingUser =
    accountState === 'unprovisioned' &&
    sessionOrigin !== 'google' &&
    sessionOrigin !== 'signup'

  useEffect(() => {
    if (session && unprovisionedExistingUser) signOut()
  }, [session, unprovisionedExistingUser, signOut])

  // ── Offline banner ────────────────────────────────────────
  if (!isOnline) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)', padding: '24px 16px' }}>
        <div className="card fade-in" style={{ padding: '36px 30px', maxWidth: 420, width: '100%', textAlign: 'center', boxShadow: '0 16px 40px rgba(0,0,0,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9"/>
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
              <line x1="12" y1="20" x2="12.01" y2="20"/>
            </svg>
          </div>
          <h2 style={{ fontFamily: 'Fraunces', fontSize: 22, fontWeight: 700, marginBottom: 10, color: 'var(--foreground)' }}>Access Denied</h2>
          <p style={{ fontSize: 14, color: '#ef4444', fontWeight: 600, marginBottom: 8 }}>Internet is not connected</p>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 24, lineHeight: 1.5 }}>
            You cannot access WINGTRACK while offline. Please check your network connection.
          </p>
          {offlineNotice && (
            <p
              role="alert"
              style={{ fontSize: 13, color: '#b91c1c', background: '#fee2e2', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontWeight: 500 }}
            >
              {offlineNotice}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button id="retry-connection-btn" className="btn-primary"
              onClick={() => {
                if (navigator.onLine) {
                  setIsOnline(true)
                  window.location.reload()
                } else {
                  setOfflineNotice('Still offline — your device has no network connection yet. Reconnect to Wi-Fi or mobile data, then try again.')
                }
              }}
              style={{ width: '100%', padding: '12px', fontWeight: 600 }}>
              Retry Connection
            </button>
            {session && (
              <button id="access-denied-signout" className="btn-ghost" onClick={() => signOut()} style={{ width: '100%', padding: '10px', fontSize: 13 }}>
                Sign Out
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Password Reset page ───────────────────────────────────
  // Deliberately rendered before the `loading` and `if (session)` branches.
  // A recovery link signs the user in, so waiting on the session would let the
  // app briefly treat them as authenticated and flash the main interface —
  // and the session must not be consulted at all while they are resetting.
  // updatePassword() clears the session once the new password is saved, so
  // finishing the flow lands on the login page.
  if (authMode === 'reset') {
    return (
      <ResetPasswordPage
        onDone={() => {
          // Strip both the query flag and the recovery hash so a refresh cannot
          // re-enter the reset flow with a stale token.
          window.history.replaceState({}, '', window.location.pathname)
          setAuthMode('login')
        }}
      />
    )
  }

  // ── Loading spinner ───────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
          <p style={{ marginTop: 14, fontSize: 13, color: 'var(--muted-foreground)', fontFamily: 'DM Mono' }}>Loading WINGTRACK...</p>
        </div>
      </div>
    )
  }

  // ── OTP verification page ─────────────────────────────────
  if (authMode === 'otp') {
    return (
      <OTPVerificationPage
        email={pendingEmail}
        onVerified={() => setAuthMode('login')}
        onBack={() => setAuthMode('login')}
      />
    )
  }

  // ── Unprovisioned account ─────────────────────────────────
  // The account authenticated but has no staff_profiles row. We never
  // synthesize a profile — but we also don't want to trap existing staff on an
  // error card. The screen is shown only when the session was created
  // self-service (Google OAuth or a fresh sign-up), i.e. a genuinely new
  // account. A password/OTP sign-in means the person already had credentials,
  // so an admin deactivating or never provisioning the profile is treated as a
  // provisioning gap: we sign them out and return them to the login page.
  if (session && accountState === 'unprovisioned') {
    // Existing staff (password/OTP) are being signed out via the effect above;
    // render nothing while that settles rather than flashing an error card.
    if (unprovisionedExistingUser) return null

    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)', padding: '24px 16px' }}>
        <div className="card fade-in" style={{ padding: '36px 30px', maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 16px 40px rgba(0,0,0,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h2 style={{ fontFamily: 'Fraunces', fontSize: 22, fontWeight: 700, marginBottom: 10, color: 'var(--foreground)' }}>
            Access Not Provisioned
          </h2>
          <p style={{ fontSize: 14, color: '#ef4444', fontWeight: 600, marginBottom: 8 }}>
            No staff profile is linked to this account
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 24, lineHeight: 1.5 }}>
            Your sign-in succeeded, but no staff profile has been set up for you yet. Please contact an administrator to be provisioned.
          </p>
          <button id="no-profile-signout" className="btn-primary" onClick={() => signOut()} style={{ width: '100%', padding: '12px', fontWeight: 600 }}>
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  // ── Deactivated account ───────────────────────────────────
  if (session && accountState === 'deactivated') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)', padding: '24px 16px' }}>
        <div className="card fade-in" style={{ padding: '36px 30px', maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 16px 40px rgba(0,0,0,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h2 style={{ fontFamily: 'Fraunces', fontSize: 22, fontWeight: 700, marginBottom: 10, color: 'var(--foreground)' }}>
            Account Deactivated
          </h2>
          <p style={{ fontSize: 14, color: '#ef4444', fontWeight: 600, marginBottom: 8 }}>
            This account has been switched off
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 24, lineHeight: 1.5 }}>
            An administrator has deactivated this account. Please contact your manager to restore access.
          </p>
          <button id="no-profile-signout" className="btn-primary" onClick={() => signOut()} style={{ width: '100%', padding: '12px', fontWeight: 600 }}>
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  // ── Authenticated ─────────────────────────────────────────
  if (session) return <AppShell />

  // ── Unauthenticated pages ─────────────────────────────────
  if (authMode === 'forgot') return <ForgotPasswordPage onBack={() => setAuthMode('login')} />

  if (authMode === 'signup') {
    return (
      <SignUpPage
        onSwitchToLogin={() => setAuthMode('login')}
        onRegistered={(email) => { setPendingEmail(email); setAuthMode('otp') }}
      />
    )
  }

  return (
    <LoginPage
      onSwitchToSignUp={() => setAuthMode('signup')}
      onForgotPassword={() => setAuthMode('forgot')}
    />
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
