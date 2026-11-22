import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiImportPreviousOrder } from '@/lib/api'
import type { DiscountType, ImportOrderItemPayload, ImportOrderPayload, OrderType } from '@/types'

interface DraftLine {
  key: number
  name: string
  quantity: string
  unit_price: string
  unit_cost: string
}

let nextKey = 1
function newLine(partial: Partial<DraftLine> = {}): DraftLine {
  return {
    key: nextKey++,
    name: partial.name ?? '',
    quantity: partial.quantity ?? '1',
    unit_price: partial.unit_price ?? '',
    unit_cost: partial.unit_cost ?? '',
  }
}

/** Local datetime-local value for "now" (the field wants YYYY-MM-DDTHH:mm). */
function nowLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
  { value: 'card', label: 'Card' },
] as const

const ORDER_TYPES: Array<{ value: OrderType; label: string }> = [
  { value: 'dine_in', label: 'Dine-In' },
  { value: 'take_out', label: 'Take-Out' },
]

const DISCOUNT_TYPES: Array<{ value: DiscountType; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'senior', label: 'Senior 20%' },
  { value: 'pwd', label: 'PWD 20%' },
]

const money = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fieldStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', fontSize: 13 }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--foreground)' }

export default function ImportPreviousOrderModal({
  onClose,
  onImported,
}: {
  onClose: () => void
  onImported: (orderNumber: number) => void
}) {
  const [createdAt, setCreatedAt] = useState(nowLocal())
  const [lines, setLines] = useState<DraftLine[]>([newLine()])
  const [paymentMethod, setPaymentMethod] = useState<string>('cash')
  const [orderType, setOrderType] = useState<OrderType>('dine_in')
  const [tableNumber, setTableNumber] = useState('')
  const [discountType, setDiscountType] = useState<DiscountType>('none')
  const [discountId, setDiscountId] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Lock background scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const updateLine = (key: number, patch: Partial<DraftLine>) => {
    setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)))
  }

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, l) => {
      const q = Number(l.quantity) || 0
      const p = Number(l.unit_price) || 0
      return sum + q * p
    }, 0)
    const isScPwd = discountType === 'senior' || discountType === 'pwd'
    const discount = isScPwd ? Math.round(subtotal * 0.20 * 100) / 100 : 0
    const vat = isScPwd ? 0 : Math.round(subtotal * 0.12 * 100) / 100
    const total = Math.round((isScPwd ? subtotal - discount : subtotal + vat) * 100) / 100
    return { subtotal: Math.round(subtotal * 100) / 100, discount, vat, total }
  }, [lines, discountType])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const clean = lines.filter(l => l.name.trim() !== '')
    if (clean.length === 0) {
      setError('Add at least one item with a name.')
      return
    }
    for (const l of clean) {
      const q = Number(l.quantity)
      const p = Number(l.unit_price)
      if (!Number.isInteger(q) || q < 1 || q > 999) {
        setError(`"${l.name}" needs a whole-number quantity from 1 to 999.`)
        return
      }
      if (!Number.isFinite(p) || p < 0 || p > 1_000_000) {
        setError(`"${l.name}" needs a valid price (0 – 1,000,000).`)
        return
      }
    }
    if (!createdAt) {
      setError('Enter the date & time of the original sale.')
      return
    }

    const items: ImportOrderItemPayload[] = clean.map(l => ({
      name: l.name.trim(),
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
      unit_cost: l.unit_cost.trim() === '' ? 0 : Number(l.unit_cost),
    }))

    const payload: ImportOrderPayload = {
      created_at: new Date(createdAt).toISOString(),
      items,
      payment_method: paymentMethod as ImportOrderPayload['payment_method'],
        order_type: orderType,
        table_number: orderType === 'dine_in' && tableNumber.trim() ? tableNumber.trim() : null,
        discount_type: discountType,
        discount_id: discountType !== 'none' && discountId.trim() ? discountId.trim() : null,
      payment_reference: paymentReference.trim() || null,
      notes: notes.trim() || undefined,
    }

    setSubmitting(true)
    try {
      const result = await apiImportPreviousOrder(payload)
      onImported(result.order_number)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to import the order.')
    } finally {
      setSubmitting(false)
    }
  }

  return typeof document !== 'undefined' ? createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        zIndex: 9999, padding: '24px 16px', overflowY: 'auto',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card fade-in" style={{ width: '100%', maxWidth: 640, padding: '24px', boxShadow: '0 25px 60px rgba(0,0,0,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
          <div>
            <h3 style={{ fontSize: 18, color: 'var(--foreground)', marginBottom: 4 }}>Input Previous Data</h3>
            <p style={{ fontSize: 12.5, color: 'var(--muted-foreground)' }}>
              Transfer a sale from your previous system. It will be backdated and marked as previous data. Stock is not affected.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '10px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12, color: '#1e40af', margin: '12px 0 18px' }}>
          Saved orders carry the note <strong>inserted</strong> — meaning this is previous data brought over from the old system.
        </div>

        <form onSubmit={handleSubmit}>
          {/* Date & time */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Date &amp; Time of Original Sale</label>
            <input className="input" type="datetime-local" value={createdAt} onChange={e => setCreatedAt(e.target.value)} required style={fieldStyle} />
          </div>

          {/* Items */}
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Items</label>
            <button type="button" onClick={() => setLines(ls => [...ls, newLine()])} style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
              + Add item
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {lines.map((line, idx) => (
              <div key={line.key} className="card" style={{ padding: 12, background: 'var(--muted, #f8fafc)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--muted-foreground)' }}>ITEM {idx + 1}</span>
                  {lines.length > 1 && (
                    <button type="button" onClick={() => setLines(ls => ls.filter(l => l.key !== line.key))} style={{ fontSize: 11, color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) 70px 100px 100px', gap: 8 }}>
                  <input className="input" placeholder="Item name" value={line.name} onChange={e => updateLine(line.key, { name: e.target.value })} style={{ padding: '8px 10px', fontSize: 13 }} />
                  <input className="input" type="number" min="1" max="999" step="1" placeholder="Qty" value={line.quantity} onChange={e => updateLine(line.key, { quantity: e.target.value })} style={{ padding: '8px 6px', fontSize: 13 }} />
                  <input className="input" type="number" min="0" step="0.01" placeholder="Price" value={line.unit_price} onChange={e => updateLine(line.key, { unit_price: e.target.value })} style={{ padding: '8px 8px', fontSize: 13 }} />
                  <input className="input" type="number" min="0" step="0.01" placeholder="Cost (opt.)" value={line.unit_cost} onChange={e => updateLine(line.key, { unit_cost: e.target.value })} style={{ padding: '8px 8px', fontSize: 13 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Order details grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Payment Method</label>
              <select className="input" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={fieldStyle}>
                {PAYMENT_METHODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Order Type</label>
              <select className="input" value={orderType} onChange={e => setOrderType(e.target.value as OrderType)} style={fieldStyle}>
                {ORDER_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {orderType === 'dine_in' && (
              <div>
                <label style={labelStyle}>Table # (optional)</label>
                <input className="input" value={tableNumber} onChange={e => setTableNumber(e.target.value)} placeholder="e.g. Table 4" style={fieldStyle} />
              </div>
            )}
            <div>
              <label style={labelStyle}>Discount</label>
              <select className="input" value={discountType} onChange={e => setDiscountType(e.target.value as DiscountType)} style={fieldStyle}>
                {DISCOUNT_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            {(discountType === 'senior' || discountType === 'pwd') && (
              <div>
                <label style={labelStyle}>ID # (optional)</label>
                <input className="input" value={discountId} onChange={e => setDiscountId(e.target.value)} placeholder="Senior / PWD ID" style={fieldStyle} />
              </div>
            )}
            <div>
              <label style={labelStyle}>Payment Ref # (optional)</label>
              <input className="input" value={paymentReference} onChange={e => setPaymentReference(e.target.value)} placeholder="Old receipt / reference #" style={fieldStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Notes (optional)</label>
            <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything from the old record worth keeping" rows={2} style={{ ...fieldStyle, resize: 'vertical' }} />
          </div>

          {/* Totals preview */}
          <div className="card" style={{ padding: '14px 16px', marginBottom: 16, background: 'var(--muted, #f8fafc)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: 'var(--muted-foreground)' }}>Subtotal</span>
              <span style={{ fontFamily: 'IBM Plex Mono' }}>{money(totals.subtotal)}</span>
            </div>
            {(discountType === 'senior' || discountType === 'pwd') ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: 'var(--muted-foreground)' }}>Discount (20%)</span>
                <span style={{ fontFamily: 'IBM Plex Mono', color: '#b91c1c' }}>−{money(totals.discount)}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: 'var(--muted-foreground)' }}>VAT (12%)</span>
                <span style={{ fontFamily: 'IBM Plex Mono' }}>{money(totals.vat)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Total</span>
              <span style={{ fontSize: 18, fontWeight: 700, fontFamily: 'IBM Plex Mono' }}>{money(totals.total)}</span>
            </div>
          </div>

          {error && (
            <div role="alert" style={{ padding: '10px 12px', background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 12.5, marginBottom: 14 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} className="btn-ghost" style={{ padding: '9px 18px', fontSize: 13 }}>Cancel</button>
            <button type="submit" disabled={submitting} style={{ padding: '9px 20px', borderRadius: 8, background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', fontWeight: 600, fontSize: 13, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Saving...' : 'Save Previous Order'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  ) : null
}
