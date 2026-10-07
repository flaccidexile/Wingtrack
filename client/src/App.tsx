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
  const { session, loading, signOut } = useAuth()
  const [authMode, setAuthMode] = useState<AuthMode>(detectInitialMode)
  const [pendingEmail, setPendingEmail] = useState<string>('')
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  useEffect(() => {
    function handleOnline()  { setIsOnline(true) }
    function handleOffline() { setIsOnline(false) }
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button id="retry-connection-btn" className="btn-primary"
              onClick={() => { if (navigator.onLine) { setIsOnline(true); window.location.reload() } else { alert('Still offline. Please check your network connection.') } }}
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

  // ── Password Reset page ───────────────────────────────────
  if (authMode === 'reset') {
    return (
      <ResetPasswordPage
        onDone={() => {
          window.history.replaceState({}, '', window.location.pathname)
          setAuthMode('login')
        }}
      />
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
