import { useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Order } from '@/types'

interface ReceiptModalProps {
  order: Order
  onClose: () => void
}

/**
 * Receipt styles, shared by the on-screen preview and the print frame so the
 * printout looks exactly like what the cashier sees. Sized for an 80mm
 * thermal roll, which also prints cleanly on A4/Letter as a narrow slip.
 */
const RECEIPT_CSS = `
  .rcpt { width: 72mm; max-width: 100%; margin: 0 auto; font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.35; color: #000; background: #fff; }
  .rcpt * { box-sizing: border-box; }
  .rcpt p { margin: 0; }
  .rcpt .c { text-align: center; }
  .rcpt .logo { display: block; width: 48px; height: 48px; margin: 0 auto 6px; border-radius: 50%; object-fit: cover; }
  .rcpt .store { font-size: 17px; font-weight: 900; letter-spacing: 0.06em; }
  .rcpt .muted { font-size: 11px; }
  .rcpt .rule { border: 0; border-top: 1px dashed #000; margin: 8px 0; }
  .rcpt .rule-solid { border: 0; border-top: 1px solid #000; margin: 6px 0; }
  .rcpt .row { display: flex; justify-content: space-between; gap: 8px; }
  .rcpt .row > span:last-child { text-align: right; white-space: nowrap; }
  .rcpt .item { margin-bottom: 5px; }
  .rcpt .item-name { font-weight: 700; word-break: break-word; }
  .rcpt .item-sub { padding-left: 10px; }
  .rcpt .total { font-size: 15px; font-weight: 900; }
  .rcpt .void { margin: 6px 0; padding: 3px 0; border: 1px solid #000; font-weight: 900; text-align: center; }
  .rcpt .upper { text-transform: uppercase; }
`

const peso = (n: number) => `₱${n.toFixed(2)}`

export default function ReceiptModal({ order, onClose }: ReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement>(null)

  /**
   * Prints only the receipt, in an isolated hidden iframe.
   *
   * Printing the main window (with "hide everything else" CSS) was unreliable:
   * the modal's fixed/scrolling containers clipped the receipt and only the
   * logo came out. A dedicated document avoids all of that.
   */
  function handlePrint() {
    const node = receiptRef.current
    if (!node) return

    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument
    const win = iframe.contentWindow
    if (!doc || !win) { iframe.remove(); return }

    doc.open()
    doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <base href="${window.location.origin}/" />
  <title>Receipt #${order.order_number}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { padding: 4mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    ${RECEIPT_CSS}
  </style>
</head>
<body>${node.outerHTML}</body>
</html>`)
    doc.close()

    let printed = false
    const doPrint = () => {
      if (printed) return
      printed = true
      win.focus()
      win.print()
      // Remove the frame once the print dialog has been dismissed.
      setTimeout(() => iframe.remove(), 1000)
    }
    // Wait for the logo to load so it is not missing from the printout.
    win.onload = doPrint
    setTimeout(doPrint, 1500)
  }

  const dateStr = new Date(order.created_at).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  const items = order.order_items ?? []
  const isVoid = order.status === 'void'
  const itemCount = items.reduce((s, i) => s + Number(i.quantity ?? 0), 0)
  const subtotalNum = Number(order.subtotal ?? 0)
  const vatNum = Number(order.vat_amount ?? 0)
  const discountType = order.discount_type ?? 'none'
  const isScPwd = discountType === 'senior' || discountType === 'pwd'
  const discountNum = Number(order.discount_amount ?? (isScPwd ? Math.round(subtotalNum * 0.2 * 100) / 100 : 0))
  const vatableSales = isScPwd ? 0 : subtotalNum
  const vatExemptSales = isScPwd ? subtotalNum : 0
  const orderTypeLabel =
    order.order_type === 'take_out'
      ? 'TAKE-OUT'
      : order.order_type === 'delivery'
        ? 'DELIVERY'
        : order.table_number
          ? `DINE-IN (${order.table_number})`
          : 'DINE-IN'

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <style>{RECEIPT_CSS}</style>
      <div
        className="card fade-in"
        style={{
          width: '100%',
          maxWidth: 380,
          maxHeight: '92vh',
          overflowY: 'auto',
          background: '#ffffff',
          color: '#000',
          padding: '22px 18px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
          borderRadius: 12,
        }}
      >
        {/* Printable Receipt Body */}
        <div ref={receiptRef} className="rcpt">
          <div className="c">
            <img className="logo" src="/logo.png" alt="Wing's Zone" />
            <p className="store">WING'S ZONE</p>
            <p className="muted">Powered by WINGTRACK</p>
          </div>

          <hr className="rule" />

          <div className="row"><span>Order #</span><span>{order.order_number}</span></div>
          <div className="row"><span>Date</span><span>{dateStr}</span></div>
          <div className="row"><span>Type</span><span className="upper">{orderTypeLabel}</span></div>
          <div className="row"><span>Payment</span><span className="upper">{order.payment_method}</span></div>
          {order.payment_reference && (
            <div className="row"><span>Ref #</span><span>{order.payment_reference}</span></div>
          )}
          {isVoid && <div className="void">*** VOIDED ***</div>}

          <hr className="rule" />

          {items.map((item, idx) => {
            const qty = Number(item.quantity ?? 1)
            const price = Number(item.unit_price ?? 0)
            const line = Number(item.line_total ?? price * qty)
            return (
              <div key={item.id ?? idx} className="item">
                <p className="item-name">{item.product_name}</p>
                <div className="row item-sub">
                  <span>{qty} x {peso(price)}</span>
                  <span>{peso(line)}</span>
                </div>
              </div>
            )
          })}

          <hr className="rule" />

          <div className="row"><span>Items</span><span>{itemCount}</span></div>
          <div className="row"><span>VATable Sales</span><span>{peso(vatableSales)}</span></div>
          <div className="row"><span>VAT-Exempt Sales</span><span>{peso(vatExemptSales)}</span></div>
          <div className="row"><span>VAT (12%)</span><span>{peso(vatNum)}</span></div>
          {isScPwd && (
            <>
              <div className="row">
                <span>{discountType === 'senior' ? 'Senior Disc (20%)' : 'PWD Disc (20%)'}</span>
                <span>-{peso(discountNum)}</span>
              </div>
              {order.discount_id && (
                <div className="row muted">
                  <span>{discountType === 'senior' ? 'SC ID #' : 'PWD ID #'}</span>
                  <span>{order.discount_id}</span>
                </div>
              )}
            </>
          )}
          <hr className="rule-solid" />
          <div className="row total"><span>TOTAL</span><span>{peso(Number(order.total_amount ?? 0))}</span></div>

          {order.notes && (
            <>
              <hr className="rule" />
              <p className="muted">Note: {order.notes}</p>
            </>
          )}

          <hr className="rule" />

          <div className="c muted">
            <p>Thank you for ordering at Wing's Zone!</p>
            <p>Please come again.</p>
          </div>
        </div>

        {/* Modal Buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            onClick={handlePrint}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: 8,
              background: 'var(--primary, #c47a2e)',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print Receipt
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              background: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              fontWeight: 500,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
