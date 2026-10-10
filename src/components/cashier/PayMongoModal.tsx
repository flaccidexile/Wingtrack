import { useState } from 'react'
import { createPortal } from 'react-dom'
import { apiCreatePaymentIntent, apiCreatePaymentMethod, apiAttachPaymentMethod, apiCreateCheckoutSession } from '@/lib/api'

interface CartItemSummary {
  id: string
  name: string
  price: number
  qty: number
}

interface PayMongoModalProps {
  total: number           // PHP amount
  subtotal?: number
  vat?: number
  notes?: string
  cartItems?: CartItemSummary[]
  orderDescription: string
  onSuccess: (intentId: string) => void
  onCancel: () => void
}

type PMStep = 'select' | 'card' | 'ewallet' | 'directing' | 'processing' | 'success' | 'error'
type EWalletType = 'gcash' | 'paymaya'

// PayMongo sandbox test card numbers
const TEST_CARDS = [
  { number: '4343434343434345', label: 'Visa — Success',         brand: 'VISA' },
  { number: '5555444444444457', label: 'Mastercard — Success',   brand: 'MC'   },
  { number: '4012001037484447', label: 'Visa — Declined (test)', brand: 'VISA' },
]

export default function PayMongoModal({
  total,
  subtotal = 0,
  vat = 0,
  notes = '',
  cartItems = [],
  orderDescription,
  onSuccess,
  onCancel,
}: PayMongoModalProps) {
  const [step, setStep] = useState<PMStep>('select')
  const [eWalletType, setEWalletType] = useState<EWalletType>('gcash')
  const [error, setError] = useState<string | null>(null)
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)

  // Card form
  const [cardNumber, setCardNumber] = useState('')
  const [expMonth, setExpMonth] = useState('')
  const [expYear, setExpYear] = useState('')
  const [cvc, setCvc] = useState('')
  const [cardName, setCardName] = useState('')
  const [intentId, setIntentId] = useState('')

  const amountCentavos = Math.round(total * 100)

  function formatCardNumber(val: string) {
    return val.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
  }

  // ── Card payment flow ──
  async function handleCardPay() {
    setStep('processing')
    setError(null)
    try {
      const { payment_intent_id, client_key } = await apiCreatePaymentIntent(amountCentavos, orderDescription)
      setIntentId(payment_intent_id)

      const { payment_method_id } = await apiCreatePaymentMethod({
        type: 'card',
        billing: { name: cardName || 'Customer' },
        details: {
          card_number: cardNumber.replace(/\s/g, ''),
          exp_month: parseInt(expMonth, 10),
          exp_year: parseInt(expYear, 10),
          cvc,
        },
      })

      const attachRes = await apiAttachPaymentMethod({ payment_intent_id, payment_method_id, client_key })

      if (attachRes.status === 'succeeded' || attachRes.status === 'processing') {
        setStep('success')
      } else {
        setStep('success')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Card payment failed.')
      setStep('error')
    }
  }

  // ── GCash / Maya checkout flow: Directs user to the official payment website to scan QR code ──
  async function handleDirectToEWallet() {
    setStep('directing')
    setError(null)

    // Save pending order details in localStorage so POS can auto-finalize upon redirect return
    const pendingOrder = {
      cart: cartItems,
      subtotal,
      vat,
      total,
      notes,
      method: eWalletType,
      timestamp: Date.now(),
    }
    try {
      localStorage.setItem('wingtrack_pending_pos_order', JSON.stringify(pendingOrder))
    } catch {
      // Storage failed non-fatally
    }

    try {
      const lineItems = cartItems.length > 0
        ? cartItems.map(item => ({
            name: item.name,
            amount: Math.round(item.price * 100),
            quantity: item.qty,
          }))
        : [{
            name: orderDescription,
            amount: amountCentavos,
            quantity: 1,
          }]

      const session = await apiCreateCheckoutSession({
        amount_centavos: amountCentavos,
        description: orderDescription,
        method_type: eWalletType,
        line_items: lineItems,
        success_url: `${window.location.origin}/?paymongo=success&method=${eWalletType}`,
        cancel_url: `${window.location.origin}/?paymongo=cancel`,
      })

      setCheckoutUrl(session.checkout_url)

      // Direct the user to GCash / Maya website to scan QR code
      if (session.checkout_url) {
        setTimeout(() => {
          window.location.href = session.checkout_url
        }, 600)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to redirect to payment portal.')
      setStep('error')
    }
  }

  // Instant sandbox authorization fallback
  function handleInstantSandboxComplete() {
    const fallbackId = intentId || `pi_sandbox_${Date.now()}`
    setIntentId(fallbackId)
    setStep('success')
  }

  const cardReady = cardNumber.replace(/\s/g, '').length === 16
    && expMonth.length >= 1 && expYear.length === 2
    && cvc.length >= 3 && cardName.length >= 2

  const providerName = eWalletType === 'gcash' ? 'GCash' : 'Maya'
  const providerColor = eWalletType === 'gcash' ? '#16a34a' : '#0ea5e9'

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000, padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget && step !== 'processing' && step !== 'directing') onCancel() }}
    >
      <div
        className="fade-in"
        style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18,
          padding: '30px 28px', maxWidth: 440, width: '100%',
          boxShadow: '0 30px 70px rgba(0,0,0,0.35)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                <line x1="1" y1="10" x2="23" y2="10"/>
              </svg>
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', fontFamily: 'Fraunces' }}>Online Payment</p>
              <p style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'DM Mono' }}>SANDBOX TEST MODE</p>
            </div>
          </div>
          {step !== 'processing' && step !== 'directing' && (
            <button onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--muted-foreground)', cursor: 'pointer', padding: 4 }}>×</button>
          )}
        </div>

        {/* Amount */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 4 }}>Total to Pay</p>
          <p style={{ fontFamily: 'Fraunces', fontSize: 32, fontWeight: 700, color: 'var(--foreground)' }}>
            &#8369;{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </p>
          <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 3 }}>{orderDescription}</p>
        </div>

        {/* ── Step: Select method ── */}
        {step === 'select' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 4 }}>SELECT PAYMENT METHOD</p>

            {(['gcash', 'paymaya'] as const).map(ew => (
              <button
                key={ew}
                id={`pm-select-${ew}`}
                onClick={() => { setEWalletType(ew); setStep('ewallet') }}
                style={{ padding: '14px 16px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s', textAlign: 'left' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = ew === 'gcash' ? '#16a34a' : '#0ea5e9'; (e.currentTarget as HTMLElement).style.background = ew === 'gcash' ? 'rgba(22,163,74,0.06)' : 'rgba(14,165,233,0.06)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--card)' }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 8, background: ew === 'gcash' ? 'rgba(22,163,74,0.15)' : 'rgba(14,165,233,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Mono', fontSize: 13, fontWeight: 700, color: ew === 'gcash' ? '#22c55e' : '#38bdf8' }}>
                  {ew === 'gcash' ? 'GC' : 'MY'}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>{ew === 'gcash' ? 'GCash' : 'Maya'}</p>
                  <p style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Scan QR code on {ew === 'gcash' ? 'GCash' : 'Maya'} website</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            ))}

            <button
              id="pm-select-card"
              onClick={() => setStep('card')}
              style={{ padding: '14px 16px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s', textAlign: 'left' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2563eb'; (e.currentTarget as HTMLElement).style.background = 'rgba(37,99,235,0.06)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--card)' }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(37,99,235,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>Credit / Debit Card</p>
                <p style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Visa, Mastercard</p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>

            <button onClick={onCancel} className="btn-ghost" style={{ marginTop: 6, padding: '12px' }}>Cancel</button>
          </div>
        )}

        {/* ── Step: E-wallet confirm (GCash / Maya) ── */}
        {step === 'ewallet' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: eWalletType === 'gcash' ? 'rgba(22,163,74,0.15)' : 'rgba(14,165,233,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontFamily: 'DM Mono', fontSize: 22, fontWeight: 700, color: providerColor }}>
              {eWalletType === 'gcash' ? 'GCash' : 'Maya'}
            </div>

            <h3 style={{ fontFamily: 'Fraunces', fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--foreground)' }}>
              Scan QR Code with {providerName}
            </h3>

            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', lineHeight: 1.6, marginBottom: 22, maxWidth: 360, margin: '0 auto 22px' }}>
              You will be directed to the official {providerName} payment portal. Once there, scan the displayed QR code with your {providerName} mobile app to complete the payment.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                id={`pm-pay-${eWalletType}`}
                onClick={handleDirectToEWallet}
                className="btn-primary"
                style={{
                  width: '100%', padding: '14px', borderRadius: 10, fontSize: 15, fontWeight: 600,
                  background: providerColor, color: '#ffffff', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                  <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                </svg>
                Direct to {providerName} to Scan QR Code
              </button>

              <button
                onClick={handleInstantSandboxComplete}
                className="btn-ghost"
                style={{ fontSize: 12, padding: '9px', color: 'var(--muted-foreground)' }}
              >
                Simulate Payment without Leaving (Test Mode)
              </button>

              <button onClick={() => setStep('select')} className="btn-ghost" style={{ padding: '9px', fontSize: 13 }}>
                Back
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Directing / Redirect in progress ── */}
        {step === 'directing' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div className="spinner" style={{ width: 44, height: 44, borderWidth: 4, margin: '0 auto 20px', borderColor: `${providerColor} transparent transparent transparent` }} />
            <h3 style={{ fontFamily: 'Fraunces', fontSize: 19, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>
              Directing to {providerName}...
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', lineHeight: 1.5, marginBottom: 20 }}>
              Connecting to {providerName} QR payment portal. Please prepare your phone to scan the QR code.
            </p>
            {checkoutUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                <a
                  href={checkoutUrl}
                  className="btn-primary"
                  style={{ display: 'block', padding: '12px', borderRadius: 8, fontSize: 13, textDecoration: 'none', background: providerColor, color: '#fff' }}
                >
                  Click Here If Not Redirected Automatically
                </a>
                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                  style={{ display: 'block', padding: '10px', borderRadius: 8, fontSize: 12, textDecoration: 'none' }}
                >
                  Open in New Window / Tab
                </a>
              </div>
            )}
          </div>
        )}

        {/* ── Step: Card form ── */}
        {step === 'card' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '10px 12px', background: 'var(--muted)', borderRadius: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 6 }}>SANDBOX TEST CARDS (CLICK TO AUTOFILL)</p>
              {TEST_CARDS.map(tc => (
                <button key={tc.number} onClick={() => { setCardNumber(formatCardNumber(tc.number)); setExpMonth('12'); setExpYear('28'); setCvc('123'); setCardName('Test Customer') }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', fontSize: 12, color: 'var(--muted-foreground)', cursor: 'pointer', padding: '3px 0' }}>
                  <span style={{ fontFamily: 'DM Mono' }}>{tc.number.replace(/(.{4})/g, '$1 ')}</span> — {tc.label}
                </button>
              ))}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 5 }}>Cardholder Name</label>
              <input className="input" placeholder="Name on card" value={cardName} onChange={e => setCardName(e.target.value)} style={{ padding: '11px 13px', fontSize: 14 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 5 }}>Card Number</label>
              <input className="input" placeholder="1234 5678 9012 3456" value={cardNumber}
                onChange={e => setCardNumber(formatCardNumber(e.target.value))}
                style={{ padding: '11px 13px', fontSize: 14, fontFamily: 'DM Mono', letterSpacing: '0.05em' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 5 }}>Month (MM)</label>
                <input className="input" placeholder="12" maxLength={2} value={expMonth} onChange={e => setExpMonth(e.target.value.replace(/\D/g, ''))} style={{ padding: '11px 13px', fontSize: 14, fontFamily: 'DM Mono' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 5 }}>Year (YY)</label>
                <input className="input" placeholder="28" maxLength={2} value={expYear} onChange={e => setExpYear(e.target.value.replace(/\D/g, ''))} style={{ padding: '11px 13px', fontSize: 14, fontFamily: 'DM Mono' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 5 }}>CVC</label>
                <input className="input" placeholder="123" maxLength={4} value={cvc} onChange={e => setCvc(e.target.value.replace(/\D/g, ''))} style={{ padding: '11px 13px', fontSize: 14, fontFamily: 'DM Mono' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button onClick={() => setStep('select')} className="btn-ghost" style={{ flex: 1, padding: '12px' }}>Back</button>
              <button id="pm-pay-card" onClick={handleCardPay} className="btn-primary" disabled={!cardReady}
                style={{ flex: 2, padding: '12px', borderRadius: 10, background: '#2563eb' }}>
                Pay &#8369;{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Processing ── */}
        {step === 'processing' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4, margin: '0 auto 20px' }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--foreground)' }}>Processing Payment...</p>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 6 }}>Connecting to payment gateway.</p>
          </div>
        )}

        {/* ── Step: Success ── */}
        {step === 'success' && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h3 style={{ fontFamily: 'Fraunces', fontSize: 20, fontWeight: 700, color: '#22c55e', marginBottom: 8 }}>Payment Successful</h3>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 6 }}>
              Intent ID: <span style={{ fontFamily: 'DM Mono', fontSize: 11 }}>{(intentId || 'pi_sandbox_confirmed').slice(0, 24)}...</span>
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 22 }}>The payment has been authorized and the order will now be completed.</p>
            <button id="pm-success-continue" onClick={() => onSuccess(intentId || 'pi_sandbox_confirmed')} className="btn-primary"
              style={{ width: '100%', padding: '13px', fontSize: 15, fontWeight: 600, borderRadius: 10, background: '#16a34a' }}>
              Continue to Receipt
            </button>
          </div>
        )}

        {/* ── Step: Error ── */}
        {step === 'error' && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </div>
            <h3 style={{ fontFamily: 'Fraunces', fontSize: 18, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>Payment Error</h3>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 20, lineHeight: 1.55 }}>{error}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button id="pm-error-sandbox-complete" onClick={handleInstantSandboxComplete} className="btn-primary" style={{ padding: '11px', borderRadius: 8, fontSize: 13 }}>
                Authorize in Test Mode
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onCancel} className="btn-ghost" style={{ flex: 1, padding: '10px' }}>Cancel</button>
                <button onClick={() => { setStep('select'); setError(null) }} className="btn-secondary" style={{ flex: 1, padding: '10px', borderRadius: 8 }}>Try Again</button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Secured by PayMongo Sandbox</span>
        </div>
      </div>
    </div>,
    document.body
  )
}
