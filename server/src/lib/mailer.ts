/**
 * Transactional email sender for WINGTRACK authentication codes.
 *
 * WHY THIS EXISTS
 * ---------------
 * Supabase's built-in mailer is restricted: it only delivers to addresses that
 * belong to the project's own team, and it is rate-limited to roughly two
 * messages per hour. Any staff member outside the Supabase team therefore never
 * receives a login code, and Supabase still answers `200 OK` — so the failure is
 * completely silent from the app's point of view.
 *
 * When `SMTP_*` variables are present we send the code ourselves, which removes
 * both restrictions. When they are absent we return `{ configured: false }` and
 * the caller falls back to Supabase's mailer, so the app keeps working in
 * development without any extra setup.
 *
 * This module intentionally uses Node's built-in `tls` socket rather than
 * pulling in a dependency: we only ever need to submit one small, plain-text
 * message, and keeping the dependency surface minimal matters for a POS system.
 */

import tls from 'node:tls'

export interface MailDeliveryResult {
  configured: boolean
  delivered: boolean
  /** Populated when delivery was attempted and failed. */
  error?: string
}

/** Reads the SMTP configuration from the environment, if it is complete. */
export function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim()
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.trim()
  const from = process.env.SMTP_FROM?.trim()

  if (!host || !user || !pass || !from) return null

  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 465),
    user,
    pass,
    from,
    fromName: process.env.SMTP_FROM_NAME?.trim() || 'WINGTRACK',
  }
}

/** True when a custom SMTP relay is configured for this deployment. */
export function isSmtpConfigured(): boolean {
  return getSmtpConfig() !== null
}

/**
 * Sends a message over SMTP using implicit TLS (SMTPS, port 465).
 *
 * This is deliberately minimal — it handles the single case we need (authenticated
 * submission of one plain-text body to one recipient) and fails loudly rather
 * than silently, so a misconfiguration is visible in the server log.
 */
export async function sendMail(opts: {
  to: string
  subject: string
  text: string
}): Promise<MailDeliveryResult> {
  const config = getSmtpConfig()
  if (!config) return { configured: false, delivered: false }

  try {
    await deliver(config, opts)
    return { configured: true, delivered: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[mailer] delivery failed:', message)
    return { configured: true, delivered: false, error: message }
  }
}

function deliver(
  config: NonNullable<ReturnType<typeof getSmtpConfig>>,
  opts: { to: string; subject: string; text: string },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host: config.host, port: config.port, servername: config.host },
      () => {
        // Connected; the conversation is driven by the response handler below.
      },
    )

    socket.setTimeout(15_000)

    let buffer = ''
    let step = 0
    let settled = false

    const finish = (err?: Error) => {
      if (settled) return
      settled = true
      socket.destroy()
      err ? reject(err) : resolve()
    }

    const send = (line: string) => socket.write(`${line}\r\n`)

    // Each step advances once the server replies with a final (non-continuation)
    // status line, i.e. code followed by a space rather than a hyphen.
    const steps: Array<(reply: string) => void> = [
      () => send(`EHLO wingtrack.local`),
      () => send('AUTH LOGIN'),
      () => send(Buffer.from(config.user).toString('base64')),
      () => send(Buffer.from(config.pass).toString('base64')),
      () => send(`MAIL FROM:<${config.from}>`),
      () => send(`RCPT TO:<${opts.to}>`),
      () => send('DATA'),
      () => {
        const headers = [
          `From: "${config.fromName}" <${config.from}>`,
          `To: <${opts.to}>`,
          `Subject: ${opts.subject}`,
          `Date: ${new Date().toUTCString()}`,
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset=UTF-8',
        ].join('\r\n')
        // Dot-stuffing: a leading "." in the body must be doubled.
        const body = opts.text.replace(/^\./gm, '..')
        socket.write(`${headers}\r\n\r\n${body}\r\n.\r\n`)
      },
      () => send('QUIT'),
    ]

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')

      // Only react to complete lines.
      let newline: number
      while ((newline = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 2)

        // A continuation line ("250-...") means more of the same reply follows.
        if (line.length >= 4 && line[3] === '-') continue
        if (!/^[23]/.test(line)) {
          finish(new Error(`SMTP rejected the message: ${line}`))
          return
        }

        const stepFn = steps[step++]
        if (!stepFn) {
          finish()
          return
        }
        stepFn(line)
      }
    })

    socket.on('timeout', () => finish(new Error('SMTP connection timed out')))
    socket.on('error', (err) => finish(err))
    socket.on('end', () => finish(new Error('SMTP connection closed unexpectedly')))
  })
}

/** The email body used for both signup and login one-time codes. */
export function buildOtpEmail(code: string): { subject: string; text: string } {
  return {
    subject: `Your WINGTRACK sign-in code: ${code}`,
    text: [
      'WINGTRACK',
      '',
      `Your one-time sign-in code is: ${code}`,
      '',
      'This code expires in 5 minutes.',
      'If you did not request this code, you can safely ignore this email.',
      '',
      '— WINGTRACK POS',
    ].join('\n'),
  }
}
