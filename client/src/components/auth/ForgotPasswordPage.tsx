import { useState } from 'react'
import { useAuth, type PasswordResetOutcome } from '@/hooks/useAuth'
import AuthShell from './AuthShell'

interface ForgotPasswordPageProps {
  onBack: () => void
}

export default function ForgotPasswordPage({ onBack }: ForgotPasswordPageProps) {
  const { sendPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  /**
   * How the request resolved. `null` = the form is still showing.
   *
   * `sent` means our own mail relay took the message; `unconfirmed` means the
   * request was accepted by Supabase's built-in mailer, which only delivers to
   * the project's own team addresses — so we must not promise an email.
   */
  const [outcome, setOutcome] = useState<PasswordResetOutcome | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sent = outcome !== null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setError(null)
    setLoading(true)
    try {
      setOutcome(await sendPasswordReset(email.trim()))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <div className="auth-card fade-in">
        <p className="auth-card__eyebrow">Staff Portal</p>
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
            <h2 className="auth-card__title" style={{ fontSize: 22, marginBottom: 10 }}>
              Check Your Email
            </h2>
            <p style={{ fontSize: 14, color: 'var(--muted-foreground)', lineHeight: 1.6, marginBottom: 20 }}>
              {outcome === 'sent'
                ? <>A password reset link has been sent to <strong style={{ color: 'var(--foreground)' }}>{email}</strong>.</>
                : <>If <strong style={{ color: 'var(--foreground)' }}>{email}</strong> belongs to a staff account, a reset link is on its way.</>}
              {' '}Please check your inbox and follow the link to reset your password.
            </p>

            {/* Honest delivery notice. Supabase's built-in mailer accepts the
                request and returns 200 even when it delivers nothing, so
                without a configured relay we cannot promise an arrival. */}
            {outcome === 'unconfirmed' && (
              <div
                style={{
                  textAlign: 'left',
                  background: '#fffbeb',
                  border: '1px solid #fcd34d',
                  borderRadius: 8,
                  padding: '12px 14px',
                  fontSize: 12.5,
                  color: '#92400e',
                  lineHeight: 1.55,
                  marginBottom: 20,
                }}
              >
                <strong style={{ display: 'block', marginBottom: 3 }}>Not arrived within a few minutes?</strong>
                This project has no custom mail server configured, so password emails can be
                delayed or dropped. Ask an administrator to set up SMTP, or have them reset
                your password from Staff Manager.
              </div>
            )}

            <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 24 }}>
              {"Didn't receive the email? Check your spam folder or "}
              <button
                onClick={() => setOutcome(null)}
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
              <h2 className="auth-card__title" style={{ marginBottom: 8 }}>
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
    </AuthShell>
  )
}
