import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { StaffRole } from '@/types'

interface SignUpPageProps {
  onSwitchToLogin: () => void
  onRegistered?: (email: string) => void
}

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

// Password requirement checker
function checkPwd(p: string) {
  return {
    length:    p.length >= 8,
    uppercase: /[A-Z]/.test(p),
    number:    /[0-9]/.test(p),
    special:   /[^A-Za-z0-9]/.test(p),
  }
}

function Req({ met, label }: { met: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
      <span style={{ color: met ? '#15803d' : '#9ca3af', fontWeight: 700, fontSize: 13, lineHeight: 1 }}>
        {met ? '✓' : '○'}
      </span>
      <span style={{ color: met ? '#15803d' : 'var(--muted-foreground)', fontWeight: met ? 600 : 400 }}>{label}</span>
    </div>
  )
}

export default function SignUpPage({ onSwitchToLogin, onRegistered }: SignUpPageProps) {
  const { signUp } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<StaffRole>('admin')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Turnstile
  const turnstileRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileReady, setTurnstileReady] = useState(false)

  const reqs = checkPwd(password)
  const allReqsMet = reqs.length && reqs.uppercase && reqs.number && reqs.special
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0

  useEffect(() => {
    if (document.getElementById('cf-turnstile-script')) { setTurnstileReady(true); return }
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
    if (widgetIdRef.current) return
    widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token: string) => setTurnstileToken(token),
      'expired-callback': () => setTurnstileToken(null),
      'error-callback': () => setTurnstileToken(null),
      theme: 'light',
    })
  }, [turnstileReady])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError('Access Denied: Internet is not connected.')
      return
    }
    if (!allReqsMet) {
      setError('Password does not meet all requirements. Please check the checklist below.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter identical passwords.')
      return
    }
    if (!turnstileToken) {
      setError('Please complete the security check.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const res = await signUp(email, password, fullName, role)
      if (res.requiresConfirmation) {
        if (onRegistered) {
          onRegistered(email)
        } else {
          setSuccessMsg('Account created! A confirmation email has been sent to ' + email + '. Please verify your email before signing in.')
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign up failed. Please try again.'
      if (msg.toLowerCase().includes('rate limit')) {
        setError('Email rate limit reached: Supabase limits free projects to 3–4 confirmation emails per hour. Please wait a short while, disable "Confirm email" for testing in Supabase, or connect custom SMTP (e.g. Resend).')
      } else {
        setError(msg)
      }
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current)
        setTurnstileToken(null)
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Eye icon helpers ──────────────────────────────────────
  const EyeOff = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
  const Eye = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )

  const eyeBtnStyle: React.CSSProperties = {
    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer', padding: 4,
    display: 'flex', alignItems: 'center', color: 'var(--muted-foreground)',
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        overflowY: 'auto',   /* FIX: allow page to scroll so fields aren't cut off */
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        background: '#FFC8A7',
        padding: '32px 16px',
      }}
    >
      <div className="fade-in" style={{ width: '100%', maxWidth: 540 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{
            width: 76, height: 76, borderRadius: '50%', overflow: 'hidden',
            margin: '0 auto 14px', boxShadow: '0 10px 28px rgba(154,52,18,0.3)',
            border: '3px solid rgba(255,255,255,0.8)', background: '#ea580c',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img src="/logo.png" alt="Wingtrack Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <h1 style={{ fontFamily: 'Fraunces', fontSize: 32, fontWeight: 700, color: '#1c1917', lineHeight: 1.15 }}>
            <span style={{ color: '#c2410c' }}>WING</span>TRACK
          </h1>
          <p style={{ fontSize: 14, color: '#431407', marginTop: 6, fontWeight: 600 }}>Create Staff Account</p>
        </div>

        {/* Form Card */}
        <div
          className="card"
          style={{
            background: '#ffffff',
            padding: '34px 32px',
            borderRadius: 16,
            boxShadow: '0 16px 40px rgba(124,45,18,0.15)',
          }}
        >
          {successMsg ? (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{
                width: 58, height: 58, borderRadius: '50%', background: '#e8f5e9',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
              }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div style={{ color: '#15803d', fontWeight: 700, fontSize: 17, marginBottom: 10 }}>
                Registration Successful!
              </div>
              <p style={{ fontSize: 14, color: 'var(--foreground)', lineHeight: 1.6, marginBottom: 22 }}>
                {successMsg}
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={onSwitchToLogin}
                style={{ padding: '12px 24px', fontSize: 14, borderRadius: 10 }}
              >
                Go to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Full Name */}
              <div>
                <label htmlFor="signup-name" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>
                  Full Name
                </label>
                <input
                  id="signup-name" className="input" type="text" required
                  placeholder="e.g. Maria Santos"
                  value={fullName} onChange={e => setFullName(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', fontSize: 14 }}
                />
              </div>

              {/* Email */}
              <div>
                <label htmlFor="signup-email" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>
                  Email Address
                </label>
                <input
                  id="signup-email" className="input" type="email" autoComplete="email" required
                  placeholder="staff@wingtrack.ph"
                  value={email} onChange={e => setEmail(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', fontSize: 14 }}
                />
              </div>

              {/* Role */}
              <div>
                <label htmlFor="signup-role" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>
                  Staff Role
                </label>
                <select
                  id="signup-role" className="input" value={role}
                  onChange={e => setRole(e.target.value as StaffRole)}
                  style={{ width: '100%', padding: '12px 14px', fontSize: 14, background: 'var(--card)' }}
                >
                  <option value="admin">Admin / Manager (Full Access)</option>
                  <option value="cashier">Cashier (Point of Sale)</option>
                  <option value="inventory_personnel">Inventory Personnel (Stock & Inventory)</option>
                </select>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="signup-password" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="signup-password" className="input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password" required placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)}
                    style={{ width: '100%', padding: '12px 42px 12px 14px', fontSize: 14 }}
                  />
                  <button type="button" id="toggle-signup-password" onClick={() => setShowPassword(p => !p)} style={eyeBtnStyle} title="Toggle password">
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>

                {/* Real-time requirements */}
                {password.length > 0 && (
                  <div style={{ marginTop: 9, padding: '10px 12px', background: 'var(--muted)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <Req met={reqs.length}    label="At least 8 characters" />
                    <Req met={reqs.uppercase} label="One uppercase letter (A–Z)" />
                    <Req met={reqs.number}    label="One number (0–9)" />
                    <Req met={reqs.special}   label="One special character (!@#$…)" />
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label htmlFor="signup-confirm-password" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>
                  Confirm Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="signup-confirm-password" className="input"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password" required placeholder="••••••••"
                    value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    style={{
                      width: '100%', padding: '12px 42px 12px 14px', fontSize: 14,
                      borderColor: confirmPassword.length > 0 ? (passwordsMatch ? '#15803d' : '#b91c1c') : undefined,
                    }}
                  />
                  <button type="button" id="toggle-signup-confirm-password" onClick={() => setShowConfirmPassword(p => !p)} style={eyeBtnStyle} title="Toggle password">
                    {showConfirmPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>
                {confirmPassword.length > 0 && (
                  <p style={{ fontSize: 12, marginTop: 4, color: passwordsMatch ? '#15803d' : '#b91c1c', fontWeight: 500 }}>
                    {passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </p>
                )}
              </div>

              {/* Email confirmation notice */}
              <div style={{ display: 'flex', gap: 10, padding: '10px 13px', background: 'rgba(234,88,12,0.06)', border: '1px solid rgba(234,88,12,0.2)', borderRadius: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p style={{ fontSize: 12, color: '#9a3412', lineHeight: 1.5 }}>
                  <strong>Email confirmation required.</strong> After registering, you must verify your email before you can log in.
                </p>
              </div>

              {/* Turnstile */}
              <div>
                <div ref={turnstileRef} />
                {!turnstileReady && <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4 }}>Loading security check...</p>}
              </div>

              {/* Error */}
              {error && (
                <div style={{ background: 'var(--danger-bg)', border: '1px solid #fca5a5', borderRadius: 8, padding: '11px 14px', fontSize: 13, color: 'var(--danger)', fontWeight: 500 }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>Sign Up Error</div>
                  <div>{error}</div>
                </div>
              )}

              {/* Submit */}
              <button
                id="signup-submit"
                type="submit"
                className="btn-primary"
                disabled={loading || !turnstileToken || !allReqsMet || !passwordsMatch}
                style={{ marginTop: 4, padding: '13px', fontSize: 15, fontWeight: 600, borderRadius: 10 }}
              >
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <span className="spinner" style={{ width: 18, height: 18 }} />
                    Creating Account...
                  </span>
                ) : 'Create Account'}
              </button>

              {/* Link to Sign In */}
              <div style={{ textAlign: 'center', marginTop: 2 }}>
                <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Already have an account? </span>
                <button
                  type="button"
                  id="switch-to-login-btn"
                  onClick={onSwitchToLogin}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, fontSize: 13, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                >
                  Sign in here
                </button>
              </div>
            </form>
          )}
        </div>

        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}
