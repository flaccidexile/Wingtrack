import { createPortal } from 'react-dom'
import type { Order } from '@/types'

interface ReceiptModalProps {
  order: Order
  onClose: () => void
}

export default function ReceiptModal({ order, onClose }: ReceiptModalProps) {
  function handlePrint() {
    window.print()
  }

  const dateStr = new Date(order.created_at).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

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
      <div
        className="card fade-in"
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#ffffff',
          color: '#1a1a1a',
          padding: '28px 24px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
          borderRadius: 12,
        }}
      >
        {/* Printable Receipt Body */}
        <div id="printable-receipt" style={{ fontFamily: 'Courier New, monospace' }}>
          <div style={{ textAlign: 'center', marginBottom: 16, borderBottom: '1px dashed #999', paddingBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <img
                src="/logo.png"
                alt="Wingtrack"
                style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover' }}
              />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 900, letterSpacing: '0.05em', margin: 0, color: '#1a1a1a' }}>WINGTRACK</h2>
            <p style={{ fontSize: 11, color: '#666', margin: '4px 0 0 0' }}>Integrated POS & Inventory System</p>
            <p style={{ fontSize: 11, color: '#666', margin: '2px 0 0 0' }}>Order #{order.order_number}</p>
            <p style={{ fontSize: 11, color: '#666', margin: '2px 0 0 0' }}>{dateStr}</p>
            {order.status === 'void' && (
              <div style={{ marginTop: 8, padding: '4px 8px', background: '#fee2e2', color: '#991b1b', fontWeight: 'bold', fontSize: 13, borderRadius: 4, display: 'inline-block' }}>
                *** VOIDED TRANSACTION ***
              </div>
            )}
          </div>

          <div style={{ fontSize: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#555', marginBottom: 6, fontSize: 11, fontWeight: 'bold', borderBottom: '1px solid #eee', paddingBottom: 4 }}>
              <span>ITEM</span>
              <span>QTY × PRICE</span>
              <span>TOTAL</span>
            </div>

            {(order.order_items ?? []).map((item, idx) => (
              <div key={item.id ?? idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ flex: 1, paddingRight: 8 }}>{item.product_name}</span>
                <span style={{ color: '#555', marginRight: 12 }}>{item.quantity} × ₱{Number(item.unit_price).toFixed(2)}</span>
                <span style={{ fontWeight: 'bold' }}>₱{Number(item.line_total ?? item.unit_price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px dashed #999', paddingTop: 10, fontSize: 12, marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#666' }}>Subtotal:</span>
              <span>₱{Number(order.subtotal).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#666' }}>VAT (12%):</span>
              <span>₱{Number(order.vat_amount).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 15, marginTop: 6, borderTop: '1px solid #111', paddingTop: 6 }}>
              <span>TOTAL:</span>
              <span>₱{Number(order.total_amount).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: '#555' }}>
              <span>Payment Method:</span>
              <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{order.payment_method}</span>
            </div>
            {order.notes && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#666', fontStyle: 'italic' }}>
                Note: {order.notes}
              </div>
            )}
          </div>

          <div style={{ textAlign: 'center', marginTop: 18, borderTop: '1px dashed #999', paddingTop: 12, fontSize: 11, color: '#777' }}>
            <p style={{ margin: 0 }}>Thank you for ordering at Wingtrack!</p>
            <p style={{ margin: '2px 0 0 0' }}>Please come again.</p>
          </div>
        </div>

        {/* Modal Buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
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
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
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
