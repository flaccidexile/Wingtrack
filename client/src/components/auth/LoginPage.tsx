import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'

interface LoginPageProps {
  onSwitchToSignUp?: () => void
  onForgotPassword?: () => void
}

// Cloudflare Turnstile site key from env (falls back to test key)
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: object) => string
      reset: (id: string) => void
      remove: (id: string) => void
    }
  }
}

export default function LoginPage({ onSwitchToSignUp, onForgotPassword }: LoginPageProps) {
  const { signIn, signInWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  // Turnstile
  const turnstileRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileReady, setTurnstileReady] = useState(false)

  useEffect(() => {
    // Load Turnstile script
    if (document.getElementById('cf-turnstile-script')) {
      setTurnstileReady(true)
      return
    }
    const script = document.createElement('script')
    script.id = 'cf-turnstile-script'
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.onload = () => setTurnstileReady(true)
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (!turnstileReady || !turnstileRef.current || !window.turnstile) return
    if (widgetIdRef.current) return // already rendered

    widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token: string) => setTurnstileToken(token),
      'expired-callback': () => setTurnstileToken(null),
      'error-callback': () => setTurnstileToken(null),
      theme: 'light',
      size: 'normal',
    })
  }, [turnstileReady])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError('Access Denied: Internet is not connected.')
      return
    }
    if (!turnstileToken) {
      setError('Please complete the security check.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed. Please try again.'
      setError(msg)
      // Reset Turnstile on error
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current)
        setTurnstileToken(null)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.')
      setGoogleLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#FFC8A7',
        padding: '24px 16px',
      }}
    >
      <div className="fade-in" style={{ width: '100%', maxWidth: 520 }}>
        {/* Logo Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div
            style={{
              width: 88, height: 88, borderRadius: '50%', overflow: 'hidden',
              margin: '0 auto 18px', boxShadow: '0 10px 28px rgba(154,52,18,0.3)',
              border: '3px solid rgba(255,255,255,0.8)', background: '#ea580c',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <img src="/logo.png" alt="Wingtrack Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <h1 style={{ fontFamily: 'Fraunces', fontSize: 36, fontWeight: 700, color: '#1c1917', lineHeight: 1.15 }}>
            <span style={{ color: '#c2410c' }}>WING</span>TRACK
          </h1>
          <p style={{ fontSize: 14, color: '#431407', marginTop: 8, fontWeight: 600 }}>
            Wingtrack — Staff Portal
          </p>
        </div>

        {/* Form Card */}
        <form
          onSubmit={handleSubmit}
          className="card"
          style={{
            background: '#ffffff', padding: '40px 36px',
            display: 'flex', flexDirection: 'column', gap: 20,
            borderRadius: 16, boxShadow: '0 16px 40px rgba(124,45,18,0.15)',
          }}
        >
          {/* Google Sign-In */}
          <button
            id="login-google"
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            style={{
              width: '100%', padding: '13px 16px', borderRadius: 10,
              border: '1.5px solid var(--border)', background: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              fontSize: 15, fontWeight: 600, color: '#1c1917', cursor: 'pointer',
              transition: 'all 0.15s', fontFamily: 'DM Sans',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; (e.currentTarget as HTMLElement).style.borderColor = '#d1d5db' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
          >
            {googleLoading ? (
              <span className="spinner" style={{ width: 18, height: 18 }} />
            ) : (
              <svg width="20" height="20" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
            )}
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 500 }}>or sign in with email</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="login-email" style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--foreground)', marginBottom: 8 }}>
              Email Address
            </label>
            <input
              id="login-email"
              className="input"
              type="email"
              autoComplete="email"
              required
              placeholder="you@wingtrack.ph"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ width: '100%', padding: '14px 16px', fontSize: 15 }}
            />
          </div>

          {/* Password */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label htmlFor="login-password" style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>
                Password
              </label>
              {onForgotPassword && (
                <button
                  type="button"
                  id="forgot-password-link"
                  onClick={onForgotPassword}
                  style={{
                    background: 'none', border: 'none', color: 'var(--primary)',
                    fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 0,
                  }}
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                className="input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ width: '100%', padding: '14px 46px 14px 16px', fontSize: 15 }}
              />
              <button
                type="button"
                id="toggle-login-password"
                onClick={() => setShowPassword(prev => !prev)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--muted-foreground)', borderRadius: 6,
                }}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Turnstile widget */}
          <div>
            <div ref={turnstileRef} />
            {!turnstileReady && (
              <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4 }}>Loading security check...</div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                background: 'var(--danger-bg)', border: '1px solid #fca5a5',
                borderRadius: 8, padding: '12px 16px', fontSize: 14,
                color: 'var(--danger)', fontWeight: 500, lineHeight: 1.45,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 3 }}>Sign In Error</div>
              <div>{error}</div>
            </div>
          )}

          {/* Submit */}
          <button
            id="login-submit"
            type="submit"
            className="btn-primary"
            disabled={loading || !turnstileToken}
            style={{ marginTop: 4, padding: '15px', fontSize: 16, fontWeight: 600, borderRadius: 10 }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <span className="spinner" style={{ width: 18, height: 18 }} />
                Signing in...
              </span>
            ) : 'Sign In'}
          </button>

          {/* Switch to Sign Up */}
          {onSwitchToSignUp && (
            <div style={{ textAlign: 'center', marginTop: 2 }}>
              <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Don't have an account? </span>
              <button
                type="button"
                id="switch-to-signup-btn"
                onClick={onSwitchToSignUp}
                style={{
                  background: 'none', border: 'none', color: 'var(--accent)',
                  fontWeight: 600, fontSize: 13, cursor: 'pointer', textDecoration: 'underline', padding: 0,
                }}
              >
                Sign up here
              </button>
            </div>
          )}

          <p style={{ fontSize: 12, color: 'var(--muted-foreground)', textAlign: 'center', lineHeight: 1.5 }}>
            Need help? Contact your store administrator.
          </p>
        </form>
      </div>
    </div>
  )
}
