import { useState, useEffect, useRef } from 'react'
import { useAuth, RegistrationError } from '@/hooks/useAuth'
import AuthShell from './AuthShell'

interface LoginPageProps {
  onSwitchToSignUp?: () => void
  onForgotPassword?: () => void
}

type LoginTab = 'email' | 'otp'

/* ── Card glyphs ─────────────────────────────────────────────
 * Defined once here rather than inline at each use, because the mail glyph
 * appears in the segmented control AND as the field's leading icon, and the
 * two must stay identical.
 */
const MailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
    <path d="M3 6.5l9 6 9-6" />
  </svg>
)

const KeyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7.8" cy="15.2" r="4.2" />
    <path d="M10.8 12.2 20 3M16.6 6.4l2.6 2.6M14.1 8.9l2.6 2.6" />
  </svg>
)

const ArrowRightIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12h15M13 6l6 6-6 6" />
  </svg>
)

const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.8 20 6v6c0 4.6-3.2 8.3-8 9.2C7.2 20.3 4 16.6 4 12V6z" />
    <path d="M9.2 12.2l2 2 3.6-3.9" />
  </svg>
)

export default function LoginPage({ onSwitchToSignUp, onForgotPassword }: LoginPageProps) {
  const { signIn, signInWithGoogle, sendLoginOtp, verifyLoginOtp } = useAuth()
  const [tab, setTab] = useState<LoginTab>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  // ── OTP sign-in state ─────────────────────────────────────
  const [otpStage, setOtpStage] = useState<'request' | 'verify'>('request')
  const [otpEmail, setOtpEmail] = useState('')
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', ''])
  const [otpError, setOtpError] = useState<string | null>(null)
  const [otpInfo, setOtpInfo] = useState<string | null>(null)
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError('Access Denied: Internet is not connected.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed. Please try again.'
      setError(msg)
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

  // ── OTP sign-in handlers ──────────────────────────────────

  // Resend cooldown ticker (60 s)
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  function switchTab(next: LoginTab) {
    setTab(next)
    setError(null)
    setOtpError(null)
    setOtpInfo(null)
  }

  /** Step 1: verify the email is registered staff, then send a one-time code. */
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setOtpError('Access Denied: Internet is not connected.')
      return
    }
    const target = otpEmail.trim()
    if (!target) { setOtpError('Please enter your email address.'); return }

    setOtpError(null); setOtpInfo(null); setOtpLoading(true)
    try {
      await sendLoginOtp(target)
      setOtpStage('verify')
      setOtpDigits(['', '', '', '', '', ''])
      setResendCooldown(60)
      setOtpInfo(`A 6-digit code was sent to ${target.toLowerCase()}.`)
      setTimeout(() => otpRefs.current[0]?.focus(), 50)
    } catch (err: unknown) {
      // RegistrationError ⇒ not staff / deactivated: point the user at an
      // administrator rather than presenting it as a delivery failure.
      if (err instanceof RegistrationError) {
        setOtpError(err.message)
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to send code.'
        setOtpError(msg.toLowerCase().includes('rate limit')
          ? 'Email rate limit reached. Please wait a moment before requesting another code.'
          : msg)
      }
    } finally {
      setOtpLoading(false)
    }
  }

  function handleOtpChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...otpDigits]; next[index] = digit; setOtpDigits(next)
    setOtpError(null)
    if (digit && index < 5) otpRefs.current[index + 1]?.focus()
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (otpDigits[index]) {
        const next = [...otpDigits]; next[index] = ''; setOtpDigits(next)
      } else if (index > 0) {
        otpRefs.current[index - 1]?.focus()
        const next = [...otpDigits]; next[index - 1] = ''; setOtpDigits(next)
      }
    } else if (e.key === 'ArrowLeft' && index > 0) otpRefs.current[index - 1]?.focus()
    else if (e.key === 'ArrowRight' && index < 5) otpRefs.current[index + 1]?.focus()
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    const next = [...otpDigits]
    for (let i = 0; i < text.length; i++) next[i] = text[i]
    setOtpDigits(next)
    otpRefs.current[Math.min(text.length, 5)]?.focus()
  }

  /** Step 2: verify the code — a successful verify establishes the session. */
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    const code = otpDigits.join('')
    if (code.length < 6) { setOtpError('Please enter the full 6-digit code.'); return }

    setOtpError(null); setOtpVerifying(true)
    try {
      await verifyLoginOtp(otpEmail, code)
      // onAuthStateChange in AuthProvider picks up the session and App renders
      // the shell; nothing further to do here.
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      setOtpError(
        msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('invalid')
          ? 'This code is invalid or has expired. Please request a new one.'
          : msg || 'Verification failed. Please try again.'
      )
      setOtpDigits(['', '', '', '', '', ''])
      otpRefs.current[0]?.focus()
    } finally {
      setOtpVerifying(false)
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0) return
    setOtpError(null); setOtpInfo(null); setOtpLoading(true)
    try {
      await sendLoginOtp(otpEmail)
      setOtpDigits(['', '', '', '', '', ''])
      setResendCooldown(60)
      setOtpInfo(`A new code was sent to ${otpEmail.toLowerCase()}.`)
      otpRefs.current[0]?.focus()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resend code.'
      setOtpError(msg.toLowerCase().includes('rate limit')
        ? 'Email rate limit reached. Please wait a moment before requesting another code.'
        : msg)
    } finally {
      setOtpLoading(false)
    }
  }

  const otpAllFilled = otpDigits.every(d => d !== '')

  return (
    <AuthShell>
      {/* Form Card */}
      <form
        onSubmit={tab === 'email' ? handleSubmit : otpStage === 'request' ? handleSendOtp : handleVerifyOtp}
        className="auth-card fade-in"
      >
        {/* The logo and wordmark now live in the shell's brand panel, so the
            card leads with the task instead of repeating the identity. */}
        <div className="auth-card__head">
          <p className="auth-card__eyebrow">Staff Portal</p>
          <h1 className="auth-card__title">Welcome back</h1>
          <p className="auth-card__subtitle">Sign in to your account to continue.</p>
        </div>

        {/* Sign-in method tabs */}
        <div role="tablist" aria-label="Sign-in method" className="auth-seg">
          {([
            { id: 'email' as LoginTab, label: 'Email', icon: <MailIcon /> },
            { id: 'otp' as LoginTab,   label: 'OTP',   icon: <KeyIcon />  },
          ]).map(({ id, label, icon }) => (
            <button
              key={id}
              id={`login-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => switchTab(id)}
              className="auth-seg__btn"
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* ── Email (password) sign-in ───────────────────── */}
        {tab === 'email' && (
          <>
            {/* Email */}
            <div>
              <label htmlFor="login-email" style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--foreground)', marginBottom: 8 }}>
                Email Address
              </label>
              <div className="auth-field">
                <span className="auth-field__icon" aria-hidden="true">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
                    <path d="M3 6.5l9 6 9-6" />
                  </svg>
                </span>
                <input
                  id="login-email"
                  className="auth-input"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@wingtrack.ph"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label htmlFor="login-password" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--foreground)' }}>
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
              <div className="auth-field">
                <span className="auth-field__icon" aria-hidden="true">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
                    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
                  </svg>
                </span>
                <input
                  id="login-password"
                  className="auth-input auth-input--trailing"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
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
              className="auth-submit"
              disabled={loading}
              style={{ marginTop: 3 }}
            >
              {loading ? (
                <>
                  <span className="spinner" style={{ width: 18, height: 18 }} />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRightIcon />
                </>
              )}
            </button>
          </>
        )}

        {/* ── OTP sign-in ────────────────────────────────── */}
        {tab === 'otp' && (
          <>
            {otpStage === 'request' ? (
              <>
                {/* Registered-staff notice */}
                <div style={{ background: 'rgba(234,88,12,0.07)', border: '1px solid rgba(234,88,12,0.2)', borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c2410c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                  <p style={{ fontSize: 12.5, color: '#7c2d12', lineHeight: 1.5, margin: 0 }}>
                    Code sign-in is for <strong>registered staff only</strong>. If you have not been
                    given an account yet, ask an administrator to create one first.
                  </p>
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="otp-email" style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--foreground)', marginBottom: 8 }}>
                    Registered Email Address
                  </label>
                  <div className="auth-field">
                    <span className="auth-field__icon" aria-hidden="true">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
                        <path d="M3 6.5l9 6 9-6" />
                      </svg>
                    </span>
                    <input
                      id="otp-email"
                      className="auth-input"
                      type="email"
                      autoComplete="email"
                      placeholder="you@wingtrack.ph"
                      value={otpEmail}
                      onChange={e => { setOtpEmail(e.target.value); setOtpError(null) }}
                    />
                  </div>
                </div>

                {/* Error */}
                {otpError && (
                  <div style={{ background: 'var(--danger-bg)', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', fontSize: 14, color: 'var(--danger)', fontWeight: 500, lineHeight: 1.45 }}>
                    <div style={{ fontWeight: 600, marginBottom: 3 }}>Cannot Send Code</div>
                    <div>{otpError}</div>
                  </div>
                )}

                {/* Send code */}
                <button
                  id="otp-send-code"
                  type="submit"
                  className="auth-submit"
                  disabled={otpLoading || !otpEmail.trim()}
                  style={{ marginTop: 3 }}
                >
                  {otpLoading ? (
                    <>
                      <span className="spinner" style={{ width: 18, height: 18 }} />
                      Checking &amp; sending...
                    </>
                  ) : (
                    <>
                      Send Code
                      <ArrowRightIcon />
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                {/* Sent-to summary */}
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 13.5, color: 'var(--muted-foreground)', lineHeight: 1.6, margin: 0 }}>
                    Enter the <strong>6-digit code</strong> sent to<br />
                    <strong style={{ color: 'var(--foreground)' }}>{otpEmail.toLowerCase()}</strong>
                  </p>
                </div>

                {otpInfo && (
                  <div style={{ background: '#e8f5e9', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#15803d', textAlign: 'center' }}>
                    {otpInfo}
                  </div>
                )}

                {/* OTP digit inputs */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }} onPaste={handleOtpPaste}>
                  {otpDigits.map((digit, i) => (
                    <input
                      key={i}
                      ref={el => { otpRefs.current[i] = el }}
                      id={`login-otp-digit-${i}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleOtpChange(i, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(i, e)}
                      onFocus={e => e.target.select()}
                      style={{
                        width: 48, height: 56, borderRadius: 10,
                        border: `2px solid ${digit ? 'var(--primary)' : otpError ? '#b91c1c' : 'var(--border)'}`,
                        textAlign: 'center', fontSize: 22, fontWeight: 700, fontFamily: 'DM Mono',
                        color: 'var(--foreground)',
                        background: digit ? 'rgba(234,88,12,0.05)' : 'var(--card)',
                        outline: 'none', transition: 'all 0.15s',
                        boxShadow: digit ? '0 0 0 3px rgba(234,88,12,0.12)' : 'none',
                      }}
                    />
                  ))}
                </div>

                {/* Error */}
                {otpError && (
                  <div style={{ background: 'var(--danger-bg)', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', fontSize: 14, color: 'var(--danger)', fontWeight: 500, lineHeight: 1.45, textAlign: 'center' }}>
                    {otpError}
                  </div>
                )}

                {/* Verify */}
                <button
                  id="otp-verify-login"
                  type="submit"
                  className="auth-submit"
                  disabled={otpVerifying || !otpAllFilled}
                >
                  {otpVerifying ? (
                    <>
                      <span className="spinner" style={{ width: 18, height: 18 }} />
                      Verifying...
                    </>
                  ) : (
                    <>
                      Verify &amp; Sign In
                      <ArrowRightIcon />
                    </>
                  )}
                </button>

                {/* Delivery hint — helps when a code is delayed or filtered */}
                <p style={{ fontSize: 12.5, color: 'var(--muted-foreground)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
                  Didn&apos;t get the code? Check your spam folder, then use{' '}
                  <strong>Resend</strong> below.
                </p>

                {/* Resend / change email */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    id="otp-change-email"
                    onClick={() => { setOtpStage('request'); setOtpDigits(['', '', '', '', '', '']); setOtpInfo(null); setOtpError(null) }}
                    style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                  >
                    Change email
                  </button>
                  <button
                    type="button"
                    id="otp-resend-login"
                    onClick={handleResendOtp}
                    disabled={resendCooldown > 0 || otpLoading}
                    style={{
                      background: 'none', border: 'none', padding: 0,
                      color: resendCooldown > 0 ? 'var(--muted-foreground)' : 'var(--primary)',
                      fontSize: 13, fontWeight: 600,
                      cursor: resendCooldown > 0 ? 'default' : 'pointer',
                    }}
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Google — password sign-in only ─────────────── */}
        {tab === 'email' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 500 }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            <button
              id="login-google"
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="auth-oauth"
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
          </>
        )}

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

      </form>

      {/* Outside the card on purpose: the card should end on the sign-up
          call to action, with the support line as a footnote to the whole
          pane rather than another element competing inside the form. */}
      <p className="auth-help">
        <ShieldIcon />
        Need help? Contact your store administrator.
      </p>
    </AuthShell>
  )
}
