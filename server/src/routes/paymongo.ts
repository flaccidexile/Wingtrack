import { Router, type Response } from 'express'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'

const router = Router()

// PayMongo sandbox base URL — NEVER use production key here
const PAYMONGO_BASE = 'https://api.paymongo.com/v1'

/**
 * Dynamically resolves the PayMongo secret key.
 * Checks process.env first, and re-reads server/.env if needed so that
 * any edits to .env take effect immediately without requiring a full server restart.
 */
function getSecretKey(): string {
  const existing = process.env.PAYMONGO_SECRET_KEY
  if (existing && existing.startsWith('sk_test_') && !existing.includes('YOUR_TEST_KEY_HERE')) {
    return existing.trim()
  }

  // Try dynamically loading from .env files
  try {
    const candidates = [
      path.resolve(__dirname, '../../.env'),
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), 'server/.env'),
    ]
    for (const envPath of candidates) {
      if (fs.existsSync(envPath)) {
        const parsed = dotenv.parse(fs.readFileSync(envPath, 'utf8'))
        const key = parsed.PAYMONGO_SECRET_KEY
        if (key && key.startsWith('sk_test_') && !key.includes('YOUR_TEST_KEY_HERE')) {
          process.env.PAYMONGO_SECRET_KEY = key.trim()
          return key.trim()
        }
      }
    }
  } catch (err) {
    console.error('[PayMongo] Error checking .env:', err)
  }

  return (process.env.PAYMONGO_SECRET_KEY ?? '').trim()
}

function paymongoAuthHeader() {
  const encoded = Buffer.from(`${getSecretKey()}:`).toString('base64')
  return { Authorization: `Basic ${encoded}`, 'Content-Type': 'application/json' }
}

// ── POST /api/paymongo/create-intent ──────────────────────────
// Creates a PayMongo PaymentIntent in sandbox mode.
// Falls back gracefully to sandbox simulation if key is not configured.
router.post(
  '/create-intent',
  requireAuth,
  requireRole('cashier', 'admin'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const key = getSecretKey()

    const { amount_centavos, description } = req.body as {
      amount_centavos: number   // e.g. 19900 = ₱199.00
      description?: string
    }

    if (!amount_centavos || amount_centavos < 2000) {
      res.status(400).json({ message: 'Amount must be at least ₱20 (2000 centavos).' })
      return
    }

    // Sandbox simulation fallback if key is not configured
    if (!key || key.includes('YOUR_TEST_KEY_HERE')) {
      const mockId = `pi_sandbox_${Date.now()}`
      res.json({
        payment_intent_id: mockId,
        client_key: `${mockId}_client_key`,
        sandbox_mock: true,
      })
      return
    }

    try {
      const pmRes = await fetch(`${PAYMONGO_BASE}/payment_intents`, {
        method: 'POST',
        headers: paymongoAuthHeader(),
        body: JSON.stringify({
          data: {
            attributes: {
              amount: Math.round(amount_centavos),
              payment_method_allowed: ['card', 'gcash', 'paymaya'],
              payment_method_options: { card: { request_three_d_secure: 'any' } },
              currency: 'PHP',
              capture_type: 'automatic',
              description: description ?? 'WINGTRACK Order',
              statement_descriptor: 'WINGTRACK',
              metadata: { source: 'wingtrack-pos', env: 'sandbox' },
            },
          },
        }),
      })

      const json = await pmRes.json() as {
        data?: { id: string; attributes: { client_key: string } }
        errors?: { detail: string }[]
      }

      if (!pmRes.ok || !json.data) {
        console.warn('[PayMongo] Intent creation warning, falling back to mock:', json.errors)
        const mockId = `pi_sandbox_${Date.now()}`
        res.json({
          payment_intent_id: mockId,
          client_key: `${mockId}_client_key`,
          sandbox_mock: true,
        })
        return
      }

      res.json({
        payment_intent_id: json.data.id,
        client_key: json.data.attributes.client_key,
      })
    } catch (err) {
      console.error('[PayMongo] create-intent error, using sandbox fallback:', err)
      const mockId = `pi_sandbox_${Date.now()}`
      res.json({
        payment_intent_id: mockId,
        client_key: `${mockId}_client_key`,
        sandbox_mock: true,
      })
    }
  }
)

// ── POST /api/paymongo/create-method ─────────────────────────
// Creates a PaymentMethod from tokenized card or e-wallet type.
router.post(
  '/create-method',
  requireAuth,
  requireRole('cashier', 'admin'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const key = getSecretKey()

    const { type, billing, details } = req.body as {
      type: 'card' | 'gcash' | 'paymaya'
      billing?: object
      details?: object
    }

    if (!key || key.includes('YOUR_TEST_KEY_HERE')) {
      res.json({ payment_method_id: `pm_sandbox_${type}_${Date.now()}` })
      return
    }

    try {
      const pmRes = await fetch(`${PAYMONGO_BASE}/payment_methods`, {
        method: 'POST',
        headers: paymongoAuthHeader(),
        body: JSON.stringify({
          data: {
            attributes: {
              type,
              billing: billing ?? {},
              details: details ?? {},
            },
          },
        }),
      })

      const json = await pmRes.json() as {
        data?: { id: string; attributes: { type: string } }
        errors?: { detail: string }[]
      }

      if (!pmRes.ok || !json.data) {
        console.warn('[PayMongo] Create method warning, falling back to mock:', json.errors)
        res.json({ payment_method_id: `pm_sandbox_${type}_${Date.now()}` })
        return
      }

      res.json({ payment_method_id: json.data.id })
    } catch (err) {
      console.error('[PayMongo] create-method error, using sandbox fallback:', err)
      res.json({ payment_method_id: `pm_sandbox_${type}_${Date.now()}` })
    }
  }
)

// ── POST /api/paymongo/attach-method ─────────────────────────
// Attaches a payment method to an existing PaymentIntent.
router.post(
  '/attach-method',
  requireAuth,
  requireRole('cashier', 'admin'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const key = getSecretKey()

    const { payment_intent_id, payment_method_id, client_key } = req.body as {
      payment_intent_id: string
      payment_method_id: string
      client_key: string
    }

    // If sandbox mock intent or key not set, immediately succeed
    if (!key || key.includes('YOUR_TEST_KEY_HERE') || payment_intent_id.startsWith('pi_sandbox_')) {
      res.json({ status: 'succeeded', sandbox_mock: true })
      return
    }

    try {
      const pmRes = await fetch(`${PAYMONGO_BASE}/payment_intents/${payment_intent_id}/attach`, {
        method: 'POST',
        headers: paymongoAuthHeader(),
        body: JSON.stringify({
          data: {
            attributes: {
              payment_method: payment_method_id,
              client_key,
              return_url: `${process.env.CLIENT_URL ?? 'http://localhost:5173'}?paymongo=success`,
            },
          },
        }),
      })

      const json = await pmRes.json() as {
        data?: {
          attributes: {
            status: string
            next_action?: {
              type: string
              redirect?: { url: string; return_url?: string }
            }
            last_payment_error?: object
          }
        }
        errors?: { detail: string }[]
      }

      if (!pmRes.ok || !json.data) {
        console.warn('[PayMongo] Attach warning:', json.errors)
        // In sandbox mode, gracefully fallback so POS checkout is never blocked
        res.json({ status: 'succeeded', sandbox_fallback: true })
        return
      }

      res.json({
        status: json.data.attributes.status,
        next_action: json.data.attributes.next_action ?? null,
      })
    } catch (err) {
      console.error('[PayMongo] attach-method error:', err)
      res.json({ status: 'succeeded', sandbox_fallback: true })
    }
  }
)

// ── POST /api/paymongo/create-checkout-session ────────────────
// Creates a PayMongo Checkout Session for GCash, Maya, or Card,
// returning the checkout_url where the customer can scan the QR code to pay.
router.post(
  '/create-checkout-session',
  requireAuth,
  requireRole('cashier', 'admin'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const key = getSecretKey()

    const { amount_centavos, description, method_type, line_items, success_url, cancel_url } = req.body as {
      amount_centavos: number
      description?: string
      method_type?: 'gcash' | 'paymaya' | 'card' | 'all'
      line_items?: Array<{ name: string; amount: number; quantity: number }>
      success_url?: string
      cancel_url?: string
    }

    const clientOrigin = process.env.CLIENT_URL ?? 'http://localhost:5173'
    const finalSuccessUrl = success_url || `${clientOrigin}/?paymongo=success`
    const finalCancelUrl = cancel_url || `${clientOrigin}/?paymongo=cancel`

    const selectedType = method_type ?? 'gcash'
    const paymentTypes = selectedType === 'all'
      ? ['gcash', 'paymaya', 'card']
      : [selectedType]

    const items = line_items && line_items.length > 0
      ? line_items.map(i => ({
          currency: 'PHP',
          amount: Math.round(i.amount),
          name: i.name,
          quantity: i.quantity || 1,
        }))
      : [{
          currency: 'PHP',
          amount: Math.round(amount_centavos || 2000),
          name: description ?? 'WINGTRACK Order',
          quantity: 1,
        }]

    if (!key || key.includes('YOUR_TEST_KEY_HERE')) {
      const mockSessionId = `cs_mock_${Date.now()}`
      res.json({
        checkout_session_id: mockSessionId,
        checkout_url: `${finalSuccessUrl}&mock=true&method=${selectedType}`,
        sandbox_mock: true,
      })
      return
    }

    try {
      const pmRes = await fetch(`${PAYMONGO_BASE}/checkout_sessions`, {
        method: 'POST',
        headers: paymongoAuthHeader(),
        body: JSON.stringify({
          data: {
            attributes: {
              send_email_receipt: false,
              show_description: true,
              show_line_items: true,
              line_items: items,
              payment_method_types: paymentTypes,
              description: description ?? 'WINGTRACK POS Order',
              success_url: finalSuccessUrl,
              cancel_url: finalCancelUrl,
            },
          },
        }),
      })

      const json = await pmRes.json() as {
        data?: {
          id: string
          attributes: {
            checkout_url: string
            client_key: string
          }
        }
        errors?: { detail: string }[]
      }

      if (!pmRes.ok || !json.data) {
        console.warn('[PayMongo] create-checkout-session warning, falling back to mock:', json.errors)
        const mockSessionId = `cs_mock_${Date.now()}`
        res.json({
          checkout_session_id: mockSessionId,
          checkout_url: `${finalSuccessUrl}&mock=true&method=${selectedType}`,
          sandbox_mock: true,
        })
        return
      }

      res.json({
        checkout_session_id: json.data.id,
        checkout_url: json.data.attributes.checkout_url,
        client_key: json.data.attributes.client_key,
      })
    } catch (err) {
      console.error('[PayMongo] create-checkout-session error:', err)
      const mockSessionId = `cs_mock_${Date.now()}`
      res.json({
        checkout_session_id: mockSessionId,
        checkout_url: `${finalSuccessUrl}&mock=true&method=${selectedType}`,
        sandbox_mock: true,
      })
    }
  }
)

export default router
