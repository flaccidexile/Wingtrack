import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { apiProvisionSelf, apiVerifyRegistrationOtp, apiResendRegistrationOtp } from '@/lib/api'
import AuthShell from './AuthShell'

interface OTPVerificationPageProps {
  email: string
  devOtp?: string
  onVerified: () => void
  onBack: () => void
}

const OTP_EXPIRY_SECONDS = 300 // 5 minutes

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function OTPVerificationPage({
  email,
  devOtp,
  onVerified,
  onBack,
}: OTPVerificationPageProps) {
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [currentDevOtp, setCurrentDevOtp] = useState<string | undefined>(devOtp)
  const [loading, setLoading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const [resendMsg, setResendMsg] = useState<string | null>(null)

  // 5-minute expiry countdown
  const [expiry, setExpiry] = useState(OTP_EXPIRY_SECONDS)
  const [expired, setExpired] = useState(false)

  // Resend cooldown (30 s)
  const [resendCooldown, setResendCooldown] = useState(30)

  const refs = useRef<(HTMLInputElement | null)[]>([])

  // 5-minute expiry ticker
  useEffect(() => {
    if (expired) return
    if (expiry <= 0) {
      setExpired(true)
      return
    }
    const t = setTimeout(() => setExpiry(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [expiry, expired])

  // Resend button cooldown ticker
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  function handleChange(index: number, value: string) {
    if (expired) return
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...otp]
    next[index] = digit
    setOtp(next)
    setError(null)
    if (digit && index < 5) refs.current[index + 1]?.focus()
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (otp[index]) {
        const next = [...otp]
        next[index] = ''
        setOtp(next)
      } else if (index > 0) {
        refs.current[index - 1]?.focus()
        const next = [...otp]
        next[index - 1] = ''
        setOtp(next)
      }
    } else if (e.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus()
    else if (e.key === 'ArrowRight' && index < 5) refs.current[index + 1]?.focus()
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    const next = [...otp]
    for (let i = 0; i < text.length; i++) next[i] = text[i]
    setOtp(next)
    refs.current[Math.min(text.length, 5)]?.focus()
  }

  function handleFillCode(code: string) {
    const chars = code.slice(0, 6).split('')
    const next = ['', '', '', '', '', '']
    chars.forEach((c, idx) => {
      if (idx < 6) next[idx] = c
    })
    setOtp(next)
    setError(null)
    refs.current[5]?.focus()
  }

  async function handleVerify() {
    if (expired) {
      setError('This code has expired. Please request a new one.')
      return
    }
    const code = otp.join('')
    if (code.length < 6) {
      setError('Please enter the full 6-digit code.')
      return
    }
    setError(null)
    setLoading(true)

    try {
      // 1. Try server verification first (validates code & confirms user & provisions profile)
      let verifiedOnServer = false
      try {
        const serverRes = await apiVerifyRegistrationOtp({ email, token: code })
        if (serverRes.verified) {
          verifiedOnServer = true
        }
      } catch (err: unknown) {
        // If server gave an explicit invalid-code or expired error, surface it
        const msg = err instanceof Error ? err.message : ''
        if (msg.includes('Invalid') || msg.includes('expired') || msg.includes('Too many')) {
          throw err
        }
      }

      // 2. If not verified on server, try client Supabase verifyOtp
      if (!verifiedOnServer) {
        const { error: err1 } = await supabase.auth.verifyOtp({ email, token: code, type: 'signup' })
        if (err1) {
          const { error: err2 } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
          if (err2) throw err1
        }
      }

      setShowSuccess(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (
        msg.toLowerCase().includes('expired') ||
        msg.toLowerCase().includes('invalid') ||
        msg.toLowerCase().includes('otp')
      ) {
        setError('This code is invalid or has expired. Please request a new code.')
      } else if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('no user')) {
        setError('No pending verification found. Please go back and register again.')
      } else {
        setError(msg || 'Verification failed. Please try again.')
      }
      setOtp(['', '', '', '', '', ''])
      refs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  const handleResend = useCallback(async () => {
    setResending(true)
    setError(null)
    setResendMsg(null)

    try {
      let sent = false
      try {
        const res = await apiResendRegistrationOtp(email)
        sent = true
        if (res.devOtp) {
          setCurrentDevOtp(res.devOtp)
        }
        setResendMsg('A new verification code has been generated.')
      } catch {
        // fallback to supabase auth resend
        const { error } = await supabase.auth.resend({ type: 'signup', email })
        if (error) throw error
        sent = true
        setResendMsg('A new confirmation email has been sent.')
      }

      if (sent) {
        setExpiry(OTP_EXPIRY_SECONDS)
        setExpired(false)
        setResendCooldown(30)
        setOtp(['', '', '', '', '', ''])
        refs.current[0]?.focus()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resend code.'
      if (msg.toLowerCase().includes('rate limit')) {
        setError(
          'Email rate limit reached: Supabase limits email sending on free projects. Please wait before requesting another code.'
        )
      } else {
        setError(msg)
      }
    } finally {
      setResending(false)
    }
  }, [email])

  const allFilled = otp.every(d => d !== '')

  async function handleGoToLogin() {
    setFinishing(true)
    try {
      await apiProvisionSelf()
    } catch {
      // ignore
    }
    try {
      await supabase.auth.signOut()
    } catch {
      // ignore
    }
    onVerified()
  }

  // Expiry bar colour
  const barPct = (expiry / OTP_EXPIRY_SECONDS) * 100
  const barColor = expiry > 120 ? '#15803d' : expiry > 60 ? '#d97706' : '#b91c1c'

  if (showSuccess) {
    return (
      <AuthShell>
        <div className="auth-card fade-in" style={{ textAlign: 'center' }}>
          {/* Animated checkmark */}
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #15803d, #22c55e)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              boxShadow: '0 8px 24px rgba(34,197,94,0.35)',
            }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h1
            style={{
              fontFamily: 'Inter',
              fontSize: 24,
              fontWeight: 800,
              color: 'var(--foreground)',
              marginBottom: 8,
            }}
          >
            Email Verified!
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'var(--muted-foreground)',
              lineHeight: 1.6,
              marginBottom: 28,
            }}
          >
            Your account has been confirmed and provisioned successfully. You can now sign in with
            your email and password.
          </p>

          <button
            type="button"
            className="btn-primary"
            onClick={handleGoToLogin}
            disabled={finishing}
            style={{
              width: '100%',
              padding: '13px',
              fontSize: 15,
              fontWeight: 600,
              borderRadius: 10,
            }}
          >
            {finishing ? (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <span className="spinner" style={{ width: 18, height: 18 }} />
                Redirecting...
              </span>
            ) : (
              'Sign In with Account'
            )}
          </button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <div className="auth-card fade-in">
        <p className="auth-card__eyebrow">Staff Portal</p>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: '50%',
              background: 'rgba(234,88,12,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ea580c"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <h2
            style={{
              fontFamily: 'Inter',
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--foreground)',
              marginBottom: 6,
            }}
          >
            Enter Verification Code
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
            A <strong>6-digit verification code</strong> was sent to
            <br />
            <strong style={{ color: 'var(--foreground)' }}>{email}</strong>
          </p>
        </div>

        {/* Development / Demo Mode Code Banner */}
        {currentDevOtp && !expired && (
          <div
            style={{
              background: '#f0fdf4',
              border: '1px solid #86efac',
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' }}>
                Verification Code
              </p>
              <p style={{ fontSize: 20, fontWeight: 800, fontFamily: 'IBM Plex Mono', color: '#166534', margin: 0, letterSpacing: '0.15em' }}>
                {currentDevOtp}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleFillCode(currentDevOtp)}
              style={{
                background: '#15803d',
                color: '#fff',
                border: 'none',
                borderRadius: 7,
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Auto-fill Code
            </button>
          </div>
        )}

        {/* 5-minute expiry bar */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--muted-foreground)' }}>Code expires in</span>
            <span style={{ fontSize: 13, fontFamily: 'IBM Plex Mono', fontWeight: 700, color: barColor }}>
              {expired ? 'EXPIRED' : formatTime(expiry)}
            </span>
          </div>
          <div style={{ height: 5, background: 'var(--muted)', borderRadius: 3, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                borderRadius: 3,
                width: `${expired ? 0 : barPct}%`,
                background: barColor,
                transition: 'width 1s linear, background 0.5s',
              }}
            />
          </div>
        </div>

        {/* Expired banner */}
        {expired && (
          <div
            style={{
              background: '#fce8e8',
              border: '1px solid #fca5a5',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 13,
              color: '#b91c1c',
              textAlign: 'center',
              marginBottom: 16,
            }}
          >
            Your code has expired. Please request a new one below.
          </div>
        )}

        {/* Resend success notice */}
        {resendMsg && !expired && (
          <div
            style={{
              background: '#f0fdf4',
              border: '1px solid #86efac',
              borderRadius: 8,
              padding: '9px 13px',
              fontSize: 12,
              color: '#15803d',
              textAlign: 'center',
              marginBottom: 14,
            }}
          >
            {resendMsg}
          </div>
        )}

        {/* OTP input boxes */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', margin: '0 0 20px' }} onPaste={handlePaste}>
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={el => {
                refs.current[i] = el
              }}
              id={`otp-digit-${i}`}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              disabled={expired}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              onFocus={e => e.target.select()}
              style={{
                width: 52,
                height: 60,
                borderRadius: 10,
                border: `2px solid ${expired ? 'var(--muted)' : digit ? 'var(--primary)' : error ? '#b91c1c' : 'var(--border)'}`,
                textAlign: 'center',
                fontSize: 24,
                fontWeight: 700,
                fontFamily: 'IBM Plex Mono',
                color: expired ? 'var(--muted-foreground)' : 'var(--foreground)',
                background: expired ? 'var(--muted)' : digit ? 'rgba(234,88,12,0.05)' : 'var(--card)',
                outline: 'none',
                transition: 'all 0.15s',
                boxShadow: digit && !expired ? '0 0 0 3px rgba(234,88,12,0.12)' : 'none',
                cursor: expired ? 'not-allowed' : 'text',
              }}
            />
          ))}
        </div>

        {/* Error */}
        {error && !expired && (
          <div
            style={{
              background: '#fce8e8',
              border: '1px solid #fca5a5',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 13,
              color: '#b91c1c',
              textAlign: 'center',
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        {/* Verify button */}
        {!expired && (
          <button
            id="otp-verify-btn"
            onClick={handleVerify}
            className="btn-primary"
            disabled={loading || !allFilled}
            style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: 600, borderRadius: 10, marginBottom: 16 }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <span className="spinner" style={{ width: 18, height: 18 }} /> Verifying...
              </span>
            ) : (
              'Verify & Confirm Account'
            )}
          </button>
        )}

        {/* Resend section */}
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 8 }}>
            {"Didn't receive a code?"}
          </p>
          {resendCooldown > 0 && !expired ? (
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
              Resend available in{' '}
              <span style={{ fontFamily: 'IBM Plex Mono', fontWeight: 600, color: 'var(--foreground)' }}>
                {resendCooldown}s
              </span>
            </p>
          ) : (
            <button
              id="otp-resend-btn"
              onClick={handleResend}
              disabled={resending}
              className="btn-primary"
              style={{ padding: '9px 20px', fontSize: 13, fontWeight: 600, borderRadius: 8 }}
            >
              {resending ? 'Sending...' : 'Request New Code'}
            </button>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--border)', marginTop: 20, paddingTop: 16, textAlign: 'center' }}>
          <button
            type="button"
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
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to Sign In
          </button>
        </div>
      </div>
    </AuthShell>
  )
}
