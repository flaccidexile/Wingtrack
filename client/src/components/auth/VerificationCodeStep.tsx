import { useEffect, useState } from 'react'

/** Seconds before another code may be requested (mirrors the server cooldown). */
const RESEND_COOLDOWN_SECONDS = 60

interface VerificationCodeStepProps {
  /** Address the code was sent to. */
  email: string
  /** Development-only code returned when SMTP is not configured. */
  devCode?: string
  code: string
  onCodeChange: (value: string) => void
  /** Requests a fresh code. Throw to surface an error. */
  onResend: () => Promise<void>
  disabled?: boolean
  inputId?: string
}

/**
 * Step-up verification: 6-digit code entry with a resend countdown.
 * Shared by the Change Password and Change Email flows in Settings.
 */
export default function VerificationCodeStep({
  email, devCode, code, onCodeChange, onResend, disabled = false, inputId = 'verification-code',
}: VerificationCodeStepProps) {
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS)
  const [resending, setResending] = useState(false)
  const [resendNote, setResendNote] = useState<string | null>(null)
  const [resendError, setResendError] = useState<string | null>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function handleResend() {
    setResending(true)
    setResendNote(null)
    setResendError(null)
    try {
      await onResend()
      setCooldown(RESEND_COOLDOWN_SECONDS)
      setResendNote('A new code has been sent.')
    } catch (err: unknown) {
      setResendError(err instanceof Error ? err.message : 'Could not resend the code.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'var(--muted)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--foreground)', lineHeight: 1.5 }}>
        We sent a 6-digit verification code to{' '}
        <strong style={{ overflowWrap: 'anywhere' }}>{email}</strong>. It expires in 5 minutes.
      </div>

      {devCode && (
        <div role="note" style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: '#78350f', lineHeight: 1.5 }}>
          <strong>Development mode:</strong> SMTP is not configured, so the code was not emailed.
          Your code is <strong style={{ fontFamily: 'monospace', fontSize: 14, letterSpacing: 2 }}>{devCode}</strong>.
        </div>
      )}

      <div>
        <label htmlFor={inputId} style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 7 }}>
          Verification Code
        </label>
        <input
          id={inputId}
          className="input"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          placeholder="••••••"
          value={code}
          disabled={disabled}
          onChange={e => onCodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '12px 14px',
            fontSize: 22, fontWeight: 700, letterSpacing: 10, textAlign: 'center',
            fontFamily: 'monospace',
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 12.5 }}>
        <span style={{ color: 'var(--muted-foreground)' }}>Didn&apos;t get it? Check your spam folder.</span>
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending || disabled}
          style={{
            background: 'none', border: 'none', padding: 0, fontSize: 12.5, fontWeight: 600,
            color: cooldown > 0 || resending ? 'var(--muted-foreground)' : 'var(--primary)',
            cursor: cooldown > 0 || resending ? 'default' : 'pointer',
            textDecoration: cooldown > 0 || resending ? 'none' : 'underline',
          }}
        >
          {resending ? 'Sending…' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
      </div>

      {resendNote && !resendError && (
        <p role="status" style={{ fontSize: 12.5, color: 'var(--success)', margin: 0, fontWeight: 600 }}>{resendNote}</p>
      )}
      {resendError && (
        <p role="alert" style={{ fontSize: 12.5, color: 'var(--danger)', margin: 0, fontWeight: 600 }}>{resendError}</p>
      )}
    </div>
  )
}
