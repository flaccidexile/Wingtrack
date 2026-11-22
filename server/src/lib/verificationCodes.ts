/**
 * Step-up verification codes for sensitive account changes.
 *
 * Used when a signed-in user changes their sign-in email or password. A
 * 6-digit code is emailed (to the NEW address for an email change, to the
 * CURRENT address for a password change) and must be supplied with the change
 * request. This proves the user controls the inbox, so a typo can't lock an
 * account out and an unattended logged-in terminal can't be used to hijack it.
 *
 * Codes are kept in memory, hashed with SHA-256, expire after 5 minutes, allow
 * 5 wrong attempts, and enforce a 60-second resend cooldown. Losing them on a
 * server restart is harmless — the user simply requests a new code.
 */
import crypto from 'node:crypto'
import { sendMail, isSmtpConfigured, buildVerificationEmail, type VerificationPurpose } from './mailer'

export type { VerificationPurpose }

const CODE_TTL_MS = 5 * 60_000
const RESEND_COOLDOWN_MS = 60_000
const MAX_ATTEMPTS = 5

interface PendingCode {
  codeHash: string
  /** Email address the code was sent to (normalised, lower-case). */
  target: string
  expiresAt: number
  attempts: number
  sentAt: number
}

const pending = new Map<string, PendingCode>()

const keyFor = (userId: string, purpose: VerificationPurpose) => `${userId}:${purpose}`
const hashCode = (code: string) => crypto.createHash('sha256').update(code).digest('hex')

export type IssueResult =
  | { ok: true; delivered: boolean; devCode?: string }
  | { ok: false; status: number; message: string }

export type VerifyResult = { ok: true } | { ok: false; status: number; message: string }

/** Mints a code, stores its hash, and emails it to `target`. */
export async function issueVerificationCode(
  userId: string,
  purpose: VerificationPurpose,
  target: string,
): Promise<IssueResult> {
  const key = keyFor(userId, purpose)
  const existing = pending.get(key)

  if (existing && existing.target === target && Date.now() - existing.sentAt < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - existing.sentAt)) / 1000)
    return { ok: false, status: 429, message: `A code was just sent. Please wait ${wait}s before requesting another.` }
  }

  const smtpReady = isSmtpConfigured()
  const devMode = process.env.NODE_ENV !== 'production'

  if (!smtpReady && !devMode) {
    return {
      ok: false,
      status: 503,
      message: 'Email delivery is not configured on the server. Ask an administrator to set up SMTP.',
    }
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  pending.set(key, {
    codeHash: hashCode(code),
    target,
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0,
    sentAt: Date.now(),
  })

  if (smtpReady) {
    const { subject, text } = buildVerificationEmail(code, purpose)
    const delivery = await sendMail({ to: target, subject, text })
    if (!delivery.delivered) {
      pending.delete(key)
      return {
        ok: false,
        status: 502,
        message: 'The verification code could not be emailed. An administrator needs to check the mail settings.',
      }
    }
    return { ok: true, delivered: true }
  }

  // Development fallback only: no SMTP relay, so surface the code locally.
  console.log(
    `\n============================================================\n` +
    `[VERIFICATION CODE · ${purpose}] ${target}: ${code}\n` +
    `(SMTP is not configured — shown for development only)\n` +
    `============================================================\n`,
  )
  return { ok: true, delivered: false, devCode: code }
}

/**
 * Checks a submitted code. On success the code is consumed (single use).
 * Call this only after every other validation has passed, immediately before
 * applying the change.
 */
export function consumeVerificationCode(
  userId: string,
  purpose: VerificationPurpose,
  target: string,
  code: unknown,
): VerifyResult {
  const key = keyFor(userId, purpose)
  const entry = pending.get(key)

  if (!entry) {
    return { ok: false, status: 400, message: 'Please request a verification code first.' }
  }
  if (Date.now() > entry.expiresAt) {
    pending.delete(key)
    return { ok: false, status: 400, message: 'That verification code has expired. Please request a new one.' }
  }
  if (entry.target !== target) {
    return { ok: false, status: 400, message: 'The code was sent to a different address. Please request a new code.' }
  }
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
    return { ok: false, status: 400, message: 'Enter the 6-digit verification code.' }
  }

  const submitted = Buffer.from(hashCode(code.trim()), 'hex')
  const expected = Buffer.from(entry.codeHash, 'hex')
  if (!crypto.timingSafeEqual(submitted, expected)) {
    entry.attempts += 1
    if (entry.attempts >= MAX_ATTEMPTS) {
      pending.delete(key)
      return { ok: false, status: 429, message: 'Too many incorrect attempts. Please request a new code.' }
    }
    const left = MAX_ATTEMPTS - entry.attempts
    return { ok: false, status: 400, message: `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` }
  }

  pending.delete(key)
  return { ok: true }
}
