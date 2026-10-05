import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { StaffRole } from '@/types'

interface SignUpPageProps {
  onSwitchToLogin: () => void
}

export default function SignUpPage({ onSwitchToLogin }: SignUpPageProps) {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError('Access Denied: Internet is not connected. Please connect to the internet and try again.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter identical passwords.')
      return
    }

    setError(null)
    setLoading(true)

    try {
      const res = await signUp(email, password, fullName, role)
      if (res.requiresConfirmation) {
        setSuccessMsg(
          'Registration submitted! A confirmation link has been sent to your email. Please verify your email to log in.'
        )
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign up failed. Please try again.'
      if (
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        msg.toLowerCase().includes('failed to fetch') ||
        msg.toLowerCase().includes('network')
      ) {
        setError('Access Denied: Internet is not connected. Please check your network connection.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
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
        padding: '28px 16px',
      }}
    >
      <div className="fade-in" style={{ width: '100%', maxWidth: 540 }}>
        {/* Logo Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              overflow: 'hidden',
              margin: '0 auto 16px',
              boxShadow: '0 10px 28px rgba(154, 52, 18, 0.3)',
              border: '3px solid rgba(255, 255, 255, 0.8)',
              background: '#ea580c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src="/logo.png"
              alt="Wingtrack Logo"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <h1
            style={{
              fontFamily: 'Fraunces',
              fontSize: 34,
              fontWeight: 700,
              color: '#1c1917',
              lineHeight: 1.15,
            }}
          >
            <span style={{ color: '#c2410c' }}>WING</span>TRACK
          </h1>
          <p style={{ fontSize: 14, color: '#431407', marginTop: 6, fontWeight: 600 }}>
            Create Staff Account
          </p>
        </div>

        {/* Form Card */}
        <form
          onSubmit={handleSubmit}
          className="card"
          style={{
            background: '#ffffff',
            padding: '36px 34px',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            borderRadius: 16,
            boxShadow: '0 16px 40px rgba(124, 45, 18, 0.15)',
          }}
        >
          {successMsg ? (
            <div
              style={{
                background: 'rgba(21,128,61,0.08)',
                border: '1px solid rgba(21,128,61,0.25)',
                borderRadius: 8,
                padding: '20px',
                textAlign: 'center',
              }}
            >
              <div style={{ color: '#15803d', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
                Registration Successful
              </div>
              <p style={{ fontSize: 14, color: 'var(--foreground)', lineHeight: 1.5, marginBottom: 16 }}>
                {successMsg}
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={onSwitchToLogin}
                style={{ padding: '10px 20px', fontSize: 14 }}
              >
                Go to Sign In
              </button>
            </div>
          ) : (
            <>
              {/* Full Name */}
              <div>
                <label
                  htmlFor="signup-name"
                  style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}
                >
                  Full Name
                </label>
                <input
                  id="signup-name"
                  className="input"
                  type="text"
                  required
                  placeholder="e.g. Maria Santos"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', fontSize: 14 }}
                />
              </div>

              {/* Email Address */}
              <div>
                <label
                  htmlFor="signup-email"
                  style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}
                >
                  Email Address
                </label>
                <input
                  id="signup-email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="staff@wingtrack.ph"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', fontSize: 14 }}
                />
              </div>

              {/* Role Selection */}
              <div>
                <label
                  htmlFor="signup-role"
                  style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}
                >
                  Staff Role
                </label>
                <select
                  id="signup-role"
                  className="input"
                  value={role}
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
                <label
                  htmlFor="signup-password"
                  style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}
                >
                  Password (min. 6 characters)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="signup-password"
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={{ width: '100%', padding: '12px 42px 12px 14px', fontSize: 14 }}
                  />
                  <button
                    type="button"
                    id="toggle-signup-password"
                    onClick={() => setShowPassword(prev => !prev)}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 4,
                      display: 'flex',
                      alignItems: 'center',
                      color: 'var(--muted-foreground)',
                    }}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label
                  htmlFor="signup-confirm-password"
                  style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}
                >
                  Confirm Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="signup-confirm-password"
                    className="input"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    style={{ width: '100%', padding: '12px 42px 12px 14px', fontSize: 14 }}
                  />
                  <button
                    type="button"
                    id="toggle-signup-confirm-password"
                    onClick={() => setShowConfirmPassword(prev => !prev)}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 4,
                      display: 'flex',
                      alignItems: 'center',
                      color: 'var(--muted-foreground)',
                    }}
                    title={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div
                  style={{
                    background: 'var(--danger-bg)',
                    border: '1px solid #fca5a5',
                    borderRadius: 8,
                    padding: '12px 14px',
                    fontSize: 13,
                    color: 'var(--danger)',
                    fontWeight: 500,
                    lineHeight: 1.45,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>Sign Up Error</div>
                  <div>{error}</div>
                </div>
              )}

              {/* Submit Button */}
              <button
                id="signup-submit"
                type="submit"
                className="btn-primary"
                disabled={loading}
                style={{ marginTop: 6, padding: '14px', fontSize: 15, fontWeight: 600, borderRadius: 10 }}
              >
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <span className="spinner" style={{ width: 18, height: 18 }} />
                    Creating Account...
                  </span>
                ) : (
                  'Create Account'
                )}
              </button>

              {/* Link to Sign In */}
              <div style={{ textAlign: 'center', marginTop: 4 }}>
                <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                  Already have an account?{' '}
                </span>
                <button
                  type="button"
                  id="switch-to-login-btn"
                  onClick={onSwitchToLogin}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  Sign in here
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  )
}
