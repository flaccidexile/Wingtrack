import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

interface ResetPasswordPageProps {
  onDone: () => void
}

type Step = 'choose' | 'verify-email' | 'verify-phone' | 'new-password' | 'done'

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
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
      <span style={{ color: met ? '#15803d' : '#9ca3af', fontSize: 14, lineHeight: 1 }}>
        {met ? '✓' : '○'}
      </span>
      <span style={{ color: met ? '#15803d' : 'var(--muted-foreground)', fontWeight: met ? 600 : 400 }}>{label}</span>
    </div>
  )
}

// 6-digit OTP input component
function OtpInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([])

  function handleChange(i: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...value]; next[i] = digit; onChange(next)
    if (digit && i < 5) refs.current[i + 1]?.focus()
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (value[i]) { const n = [...value]; n[i] = ''; onChange(n) }
      else if (i > 0) { refs.current[i - 1]?.focus(); const n = [...value]; n[i - 1] = ''; onChange(n) }
    } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    else if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus()
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    const next = [...value]
    for (let i = 0; i < text.length; i++) next[i] = text[i]
    onChange(next)
    refs.current[Math.min(text.length, 5)]?.focus()
  }

  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }} onPaste={handlePaste}>
      {value.map((digit, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el }}
          id={`reset-otp-${i}`}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onFocus={e => e.target.select()}
          style={{
            width: 50, height: 58, borderRadius: 10,
            border: `2px solid ${digit ? 'var(--primary)' : 'var(--border)'}`,
            textAlign: 'center', fontSize: 22, fontWeight: 700, fontFamily: 'DM Mono',
            color: 'var(--foreground)', background: digit ? 'rgba(234,88,12,0.05)' : 'var(--card)',
            outline: 'none', transition: 'all 0.15s',
            boxShadow: digit ? '0 0 0 3px rgba(234,88,12,0.12)' : 'none',
          }}
        />
      ))}
    </div>
  )
}

export default function ResetPasswordPage({ onDone }: ResetPasswordPageProps) {
  const { updatePassword } = useAuth()

  // Step management
  const [step, setStep] = useState<Step>('choose')

  // OTP verification state
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpError, setOtpError] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)

  // 5-minute OTP expiry
  const OTP_EXPIRY = 300
  const [expiry, setExpiry]   = useState(OTP_EXPIRY)
  const [expired, setExpired] = useState(false)

  // New password state
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pwdLoading, setPwdLoading] = useState(false)
  const [pwdError, setPwdError] = useState<string | null>(null)

  const reqs = checkPwd(password)
  const allReqsMet = reqs.length && reqs.uppercase && reqs.number && reqs.special
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0
  const allOtpFilled = otp.every(d => d !== '')

  // Resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  // Expiry countdown — starts when OTP is sent (step changes to verify-*)
  useEffect(() => {
    if (step !== 'verify-email' && step !== 'verify-phone') return
    if (expired || expiry <= 0) { setExpired(true); return }
    const t = setTimeout(() => setExpiry(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [expiry, expired, step])

  // Auto-redirect after done
  useEffect(() => {
    if (step === 'done') {
      const t = setTimeout(onDone, 2500)
      return () => clearTimeout(t)
    }
  }, [step, onDone])

  // ── Send Email OTP ────────────────────────────────────────
  async function sendEmailOtp() {
    if (!email.trim()) { setOtpError('Please enter your email address.'); return }
    setOtpError(null); setOtpLoading(true)
    try {
      // Use Supabase email OTP for password recovery
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false },
      })
      if (error) throw error
      setResendCooldown(60)
      setStep('verify-email')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send OTP. Please try again.'
      if (msg.toLowerCase().includes('rate limit')) {
        setOtpError('Rate limit reached: Too many emails requested. Please wait a short while or configure custom SMTP in Supabase.')
      } else {
        setOtpError(msg)
      }
    } finally {
      setOtpLoading(false)
    }
  }

  // ── Send Phone OTP ────────────────────────────────────────
  async function sendPhoneOtp() {
    if (!phone.trim()) { setOtpError('Please enter your phone number.'); return }
    setOtpError(null); setOtpLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: phone.trim(),
      })
      if (error) throw error
      setResendCooldown(60)
      setStep('verify-phone')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send SMS OTP. Please try again.'
      if (msg.toLowerCase().includes('rate limit')) {
        setOtpError('Rate limit reached: Too many SMS requests. Please wait a short while.')
      } else {
        setOtpError(msg)
      }
    } finally {
      setOtpLoading(false)
    }
  }

  // ── Verify OTP ────────────────────────────────────────────
  async function verifyOtp() {
    if (expired) { setOtpError('This code has expired. Please request a new one.'); return }
    const code = otp.join('')
    if (code.length < 6) { setOtpError('Please enter the full 6-digit code.'); return }
    setOtpError(null); setOtpLoading(true)
    try {
      const isPhone = step === 'verify-phone'
      const { error } = isPhone
        ? await supabase.auth.verifyOtp({ phone: phone.trim(), token: code, type: 'sms' })
        : await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'email' })
      if (error) throw error
      setStep('new-password')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('invalid')) {
        setOtpError('This code is invalid or has expired. Please request a new code.')
      } else {
        setOtpError(msg || 'Verification failed. Please try again.')
      }
      setOtp(['', '', '', '', '', ''])
    } finally {
      setOtpLoading(false)
    }
  }

  // ── Resend OTP ────────────────────────────────────────────
  async function resendOtp() {
    setOtp(['', '', '', '', '', '']); setOtpError(null)
    // Reset expiry
    setExpiry(OTP_EXPIRY); setExpired(false); setResendCooldown(60)
    if (step === 'verify-email') await sendEmailOtp()
    else await sendPhoneOtp()
  }

  // ── Update Password ───────────────────────────────────────
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!allReqsMet) { setPwdError('Please meet all password requirements.'); return }
    if (!passwordsMatch) { setPwdError('Passwords do not match.'); return }
    setPwdError(null); setPwdLoading(true)
    try {
      await updatePassword(password)
      setStep('done')
    } catch (err: unknown) {
      setPwdError(err instanceof Error ? err.message : 'Failed to update password. Please try again.')
    } finally {
      setPwdLoading(false)
    }
  }

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

  // Step indicator dots
  const steps: Step[] = ['choose', 'verify-email', 'new-password']
  const stepLabels = ['Choose Method', 'Verify Identity', 'New Password']
  const currentIdx = step === 'verify-phone' ? 1 : step === 'done' ? 3
    : steps.indexOf(step as typeof steps[number])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFC8A7', padding: '24px 16px', overflowY: 'auto' }}>
      <div className="fade-in" style={{ width: '100%', maxWidth: 480 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', margin: '0 auto 12px', boxShadow: '0 10px 28px rgba(154,52,18,0.3)', border: '3px solid rgba(255,255,255,0.8)', background: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/logo.png" alt="Wingtrack Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <h1 style={{ fontFamily: 'Fraunces', fontSize: 26, fontWeight: 700, color: '#1c1917', lineHeight: 1.15 }}>
            <span style={{ color: '#c2410c' }}>WING</span>TRACK
          </h1>
          <p style={{ fontSize: 13, color: '#431407', marginTop: 5, fontWeight: 600 }}>Change Password</p>
        </div>

        {/* Progress stepper */}
        {step !== 'done' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22, gap: 0 }}>
            {stepLabels.map((label, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, fontFamily: 'DM Mono',
                    background: i < currentIdx ? 'var(--primary)' : i === currentIdx ? 'var(--primary)' : 'var(--muted)',
                    color: i <= currentIdx ? 'white' : 'var(--muted-foreground)',
                    boxShadow: i === currentIdx ? '0 0 0 3px rgba(234,88,12,0.25)' : 'none',
                    transition: 'all 0.3s',
                  }}>
                    {i < currentIdx ? '✓' : i + 1}
                  </div>
                  <span style={{ fontSize: 10, color: i === currentIdx ? 'var(--foreground)' : 'var(--muted-foreground)', fontWeight: i === currentIdx ? 700 : 400, whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                </div>
                {i < stepLabels.length - 1 && (
                  <div style={{ width: 48, height: 2, background: i < currentIdx ? 'var(--primary)' : 'var(--border)', margin: '0 4px', marginBottom: 18, transition: 'background 0.3s' }} />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="card" style={{ background: '#fff', padding: '30px 28px', borderRadius: 16, boxShadow: '0 16px 40px rgba(124,45,18,0.15)' }}>

          {/* ── Step 1: Choose method ── */}
          {step === 'choose' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <h2 style={{ fontFamily: 'Fraunces', fontSize: 20, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>Verify Your Identity</h2>
                <p style={{ fontSize: 13, color: 'var(--muted-foreground)', lineHeight: 1.55 }}>
                  For your security, please verify your identity before changing your password. Choose how you'd like to receive your one-time code.
                </p>
              </div>

              {/* Email option */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', border: '1.5px solid var(--border)', borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLElement).style.background = 'rgba(234,88,12,0.03)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = '' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(234,88,12,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--foreground)', marginBottom: 2 }}>Email OTP</p>
                    <p style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Receive a 6-digit code in your email</p>
                  </div>
                  <input
                    type="radio"
                    name="verify-method"
                    value="email"
                    defaultChecked
                    style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
                  />
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', border: '1.5px solid var(--border)', borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLElement).style.background = 'rgba(234,88,12,0.03)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = '' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(22,163,74,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 14 19.79 19.79 0 0 1 1.61 5.5 2 2 0 0 1 3.59 3h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 10a16 16 0 0 0 6 6l.85-.85a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 17.32z"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--foreground)', marginBottom: 2 }}>Phone OTP (SMS)</p>
                    <p style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Receive a 6-digit code via SMS</p>
                  </div>
                  <input
                    type="radio"
                    name="verify-method"
                    value="phone"
                    style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
                  />
                </label>
              </div>

              {/* Email input */}
              <div>
                <label htmlFor="reset-email" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>
                  Email Address
                </label>
                <input
                  id="reset-email"
                  className="input"
                  type="email"
                  placeholder="you@wingtrack.ph"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', fontSize: 14 }}
                />
              </div>

              {/* Phone input */}
              <div>
                <label htmlFor="reset-phone" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>
                  Phone Number <span style={{ color: 'var(--muted-foreground)', fontWeight: 400 }}>(for SMS only)</span>
                </label>
                <input
                  id="reset-phone"
                  className="input"
                  type="tel"
                  placeholder="+639XXXXXXXXX"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', fontSize: 14 }}
                />
              </div>

              {otpError && (
                <div style={{ background: '#fce8e8', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b91c1c' }}>
                  {otpError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  id="reset-send-email-otp"
                  onClick={() => { setOtpError(null); sendEmailOtp() }}
                  className="btn-primary"
                  disabled={otpLoading || !email.trim()}
                  style={{ flex: 1, padding: '12px', fontSize: 14, fontWeight: 600, borderRadius: 10 }}
                >
                  {otpLoading ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><span className="spinner" style={{ width: 16, height: 16 }} />Sending...</span> : 'Send via Email'}
                </button>
                <button
                  id="reset-send-phone-otp"
                  onClick={() => { setOtpError(null); sendPhoneOtp() }}
                  disabled={otpLoading || !phone.trim()}
                  style={{
                    flex: 1, padding: '12px', fontSize: 14, fontWeight: 600, borderRadius: 10,
                    border: '1.5px solid #16a34a', background: phone.trim() ? 'rgba(22,163,74,0.08)' : 'var(--muted)',
                    color: phone.trim() ? '#16a34a' : 'var(--muted-foreground)', cursor: phone.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  Send via SMS
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Verify OTP ── */}
          {(step === 'verify-email' || step === 'verify-phone') && (() => {
            const barPct = (expiry / OTP_EXPIRY) * 100
            const barColor = expiry > 120 ? '#15803d' : expiry > 60 ? '#d97706' : '#b91c1c'
            const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(234,88,12,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                    {step === 'verify-email'
                      ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                      : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 14 19.79 19.79 0 0 1 1.61 5.5 2 2 0 0 1 3.59 3h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 10a16 16 0 0 0 6 6l.85-.85a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 17.32z"/></svg>
                    }
                  </div>
                  <h2 style={{ fontFamily: 'Fraunces', fontSize: 19, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>Enter Verification Code</h2>
                  <p style={{ fontSize: 13, color: 'var(--muted-foreground)', lineHeight: 1.55 }}>
                    A 6-digit code was sent to<br />
                    <strong style={{ color: 'var(--foreground)' }}>{step === 'verify-email' ? email : phone}</strong>
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4 }}>Open the message and type the code shown below.</p>
                </div>

                {/* Expiry countdown bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--muted-foreground)' }}>Code expires in</span>
                    <span style={{ fontSize: 13, fontFamily: 'DM Mono', fontWeight: 700, color: barColor }}>
                      {expired ? 'EXPIRED' : formatTime(expiry)}
                    </span>
                  </div>
                  <div style={{ height: 5, background: 'var(--muted)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 3, width: `${expired ? 0 : barPct}%`, background: barColor, transition: 'width 1s linear, background 0.5s' }} />
                  </div>
                </div>

                {/* Expired banner */}
                {expired && (
                  <div style={{ background: '#fce8e8', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b91c1c', textAlign: 'center' }}>
                    Your code has expired. Please request a new one below.
                  </div>
                )}

                <OtpInput value={otp} onChange={(v) => { if (!expired) setOtp(v) }} />

                {otpError && !expired && (
                  <div style={{ background: '#fce8e8', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b91c1c', textAlign: 'center' }}>
                    {otpError}
                  </div>
                )}

                {!expired && (
                  <button
                    id="reset-verify-otp"
                    onClick={verifyOtp}
                    className="btn-primary"
                    disabled={otpLoading || !allOtpFilled}
                    style={{ padding: '13px', fontSize: 15, fontWeight: 600, borderRadius: 10 }}
                  >
                    {otpLoading ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><span className="spinner" style={{ width: 18, height: 18 }} />Verifying...</span> : 'Verify Code'}
                  </button>
                )}

                <div style={{ textAlign: 'center' }}>
                  {expired ? (
                    <button
                      id="reset-resend-otp"
                      onClick={resendOtp}
                      className="btn-primary"
                      disabled={otpLoading}
                      style={{ padding: '11px 24px', fontSize: 14, fontWeight: 600, borderRadius: 9 }}
                    >
                      {otpLoading ? 'Sending...' : 'Send a New Code'}
                    </button>
                  ) : resendCooldown > 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                      Resend in <span style={{ fontFamily: 'DM Mono', fontWeight: 600 }}>{resendCooldown}s</span>
                    </p>
                  ) : (
                    <button onClick={resendOtp} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
                      Resend Code
                    </button>
                  )}
                </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, textAlign: 'center' }}>
                <button type="button" onClick={() => { setStep('choose'); setOtp(['','','','','','']); setOtpError(null) }}
                  style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                  Change verification method
                </button>
              </div>
            </div>
            )
          })()}

          {/* ── Step 3: New password ── */}
          {step === 'new-password' && (
            <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <h2 style={{ fontFamily: 'Fraunces', fontSize: 20, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>Create New Password</h2>
                <p style={{ fontSize: 13, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
                  Identity verified — Choose a strong password to secure your account.
                </p>
              </div>

              {/* New Password */}
              <div>
                <label htmlFor="reset-pwd" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 7 }}>New Password</label>
                <div style={{ position: 'relative' }}>
                  <input id="reset-pwd" className="input" type={showPwd ? 'text' : 'password'} autoComplete="new-password" required placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', padding: '13px 44px 13px 14px', fontSize: 14 }} />
                  <button type="button" onClick={() => setShowPwd(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center' }}>
                    {showPwd ? <EyeOff /> : <Eye />}
                  </button>
                </div>
                {password.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5, padding: '10px 12px', background: 'var(--muted)', borderRadius: 8 }}>
                    <Req met={reqs.length}    label="At least 8 characters" />
                    <Req met={reqs.uppercase} label="One uppercase letter (A–Z)" />
                    <Req met={reqs.number}    label="One number (0–9)" />
                    <Req met={reqs.special}   label="One special character (!@#$…)" />
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label htmlFor="reset-confirm" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 7 }}>Confirm New Password</label>
                <div style={{ position: 'relative' }}>
                  <input id="reset-confirm" className="input" type={showConfirm ? 'text' : 'password'} autoComplete="new-password" required placeholder="••••••••" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    style={{ width: '100%', padding: '13px 44px 13px 14px', fontSize: 14, borderColor: confirmPassword.length > 0 ? (passwordsMatch ? '#15803d' : '#b91c1c') : undefined }} />
                  <button type="button" onClick={() => setShowConfirm(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center' }}>
                    {showConfirm ? <EyeOff /> : <Eye />}
                  </button>
                </div>
                {confirmPassword.length > 0 && (
                  <p style={{ fontSize: 12, marginTop: 5, color: passwordsMatch ? '#15803d' : '#b91c1c', fontWeight: 500 }}>
                    {passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </p>
                )}
              </div>

              {pwdError && (
                <div style={{ background: '#fce8e8', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b91c1c' }}>{pwdError}</div>
              )}

              <button id="reset-submit" type="submit" className="btn-primary" disabled={pwdLoading || !allReqsMet || !passwordsMatch} style={{ padding: '14px', fontSize: 15, fontWeight: 600, borderRadius: 10 }}>
                {pwdLoading ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}><span className="spinner" style={{ width: 18, height: 18 }} />Updating...</span> : 'Update Password'}
              </button>
            </form>
          )}

          {/* ── Done ── */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ width: 58, height: 58, borderRadius: '50%', background: '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <h2 style={{ fontFamily: 'Fraunces', fontSize: 20, fontWeight: 700, color: 'var(--foreground)', marginBottom: 8 }}>Password Updated!</h2>
              <p style={{ fontSize: 14, color: 'var(--muted-foreground)', lineHeight: 1.55, marginBottom: 20 }}>
                Your password has been successfully reset. Redirecting you to sign in...
              </p>
              <div className="spinner" style={{ margin: '0 auto', width: 22, height: 22 }} />
            </div>
          )}
        </div>

        <div style={{ height: 24 }} />
      </div>
    </div>
  )
}
