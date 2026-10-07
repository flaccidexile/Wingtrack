import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'

interface ForgotPasswordPageProps {
  onBack: () => void
}

export default function ForgotPasswordPage({ onBack }: ForgotPasswordPageProps) {
  const { sendPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setError(null)
    setLoading(true)
    try {
      await sendPasswordReset(email.trim())
      setSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email. Please try again.')
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
        padding: '24px 16px',
      }}
    >
      <div className="fade-in" style={{ width: '100%', maxWidth: 480 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              overflow: 'hidden',
              margin: '0 auto 16px',
              boxShadow: '0 10px 28px rgba(154,52,18,0.3)',
              border: '3px solid rgba(255,255,255,0.8)',
              background: '#ea580c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img src="/logo.png" alt="Wingtrack Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <h1 style={{ fontFamily: 'Fraunces', fontSize: 30, fontWeight: 700, color: '#1c1917', lineHeight: 1.15 }}>
            <span style={{ color: '#c2410c' }}>WING</span>TRACK
          </h1>
          <p style={{ fontSize: 14, color: '#431407', marginTop: 6, fontWeight: 600 }}>Reset Your Password</p>
        </div>

        <div
          className="card"
          style={{
            background: '#ffffff',
            padding: '38px 36px',
            borderRadius: 16,
            boxShadow: '0 16px 40px rgba(124,45,18,0.15)',
          }}
        >
          {sent ? (
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: '50%',
                  background: '#e8f5e9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 18px',
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <h2 style={{ fontFamily: 'Fraunces', fontSize: 20, fontWeight: 700, color: 'var(--foreground)', marginBottom: 10 }}>
                Check Your Email
              </h2>
              <p style={{ fontSize: 14, color: 'var(--muted-foreground)', lineHeight: 1.6, marginBottom: 24 }}>
                A password reset link has been sent to <strong style={{ color: 'var(--foreground)' }}>{email}</strong>.
                Please check your inbox and follow the link to reset your password.
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 24 }}>
                {"Didn't receive the email? Check your spam folder or "}
                <button
                  onClick={() => setSent(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}
                >
                  try again
                </button>.
              </p>
              <button
                id="forgot-back-to-login"
                onClick={onBack}
                className="btn-primary"
                style={{ width: '100%', padding: '13px', fontSize: 15, fontWeight: 600, borderRadius: 10 }}
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ fontFamily: 'Fraunces', fontSize: 22, fontWeight: 700, color: 'var(--foreground)', marginBottom: 8 }}>
                  Forgot Password
                </h2>
                <p style={{ fontSize: 14, color: 'var(--muted-foreground)', lineHeight: 1.55 }}>
                  Enter your staff email address and we'll send you a secure link to reset your password.
                </p>
              </div>

              <div>
                <label htmlFor="forgot-email" style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--foreground)', marginBottom: 8 }}>
                  Email Address
                </label>
                <input
                  id="forgot-email"
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

              {error && (
                <div
                  style={{
                    background: '#fce8e8',
                    border: '1px solid #fca5a5',
                    borderRadius: 8,
                    padding: '12px 14px',
                    fontSize: 13,
                    color: '#b91c1c',
                    fontWeight: 500,
                  }}
                >
                  {error}
                </div>
              )}

              <button
                id="forgot-submit"
                type="submit"
                className="btn-primary"
                disabled={loading || !email.trim()}
                style={{ padding: '14px', fontSize: 15, fontWeight: 600, borderRadius: 10 }}
              >
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <span className="spinner" style={{ width: 18, height: 18 }} />
                    Sending...
                  </span>
                ) : (
                  'Send Reset Link'
                )}
              </button>

              <div style={{ textAlign: 'center' }}>
                <button
                  type="button"
                  id="forgot-back-btn"
                  onClick={onBack}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--muted-foreground)',
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                  Back to Sign In
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
