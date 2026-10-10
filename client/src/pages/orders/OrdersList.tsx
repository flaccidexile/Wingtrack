import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { apiGetOrders, apiVoidOrder } from '@/lib/api'
import type { Order } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import { useIsCompact } from '@/hooks/useMediaQuery'
import ReceiptModal from '@/components/receipt/ReceiptModal'

/**
 * Compact presentation of a single order for phone-width viewports.
 *
 * Every field that the desktop grid shows is present here, laid out vertically
 * so nothing requires horizontal scrolling.
 */
function OrderCard({
  order,
  onReceipt,
  onVoid,
}: {
  order: Order
  onReceipt: (o: Order) => void
  onVoid: (o: Order) => void
}) {
  const isVoid = order.status === 'void'
  const dateStr = new Date(order.created_at).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  const items = order.order_items ?? []

  return (
    <div className="card" style={{ padding: '14px 16px', background: isVoid ? 'rgba(254, 242, 242, 0.5)' : undefined }}>
      {/* Row 1: order number + status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <span style={{ fontFamily: 'DM Mono', fontWeight: 700, fontSize: 15, color: 'var(--foreground)' }}>
          #{order.order_number}
        </span>
        <span
          style={{
            fontSize: 10,
            padding: '3px 8px',
            borderRadius: 12,
            fontWeight: 700,
            background: isVoid ? '#fee2e2' : '#e8f5e9',
            color: isVoid ? '#b91c1c' : '#15803d',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {order.status}
        </span>
      </div>

      {/* Row 2: when */}
      <p style={{ fontSize: 12, color: 'var(--muted-foreground)', fontFamily: 'DM Mono', marginBottom: 10 }}>
        {dateStr}
      </p>

      {/* Row 3: the items themselves (never truncated on mobile) */}
      {items.length > 0 ? (
        <ul style={{ listStyle: 'none', margin: '0 0 10px', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map(item => (
            <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
              <span style={{ color: 'var(--foreground)', minWidth: 0, overflowWrap: 'anywhere' }}>
                <span style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono' }}>{item.quantity}&times;</span>{' '}
                {item.product_name}
              </span>
              <span style={{ fontFamily: 'DM Mono', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                &#8369;{Number(item.line_total).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 10 }}>No items</p>
      )}

      {order.notes && (
        <p style={{ fontSize: 12, color: 'var(--muted-foreground)', fontStyle: 'italic', marginBottom: 10, overflowWrap: 'anywhere' }}>
          {order.notes}
        </p>
      )}

      {/* Row 4: payment + total */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          paddingTop: 10,
          borderTop: '1px solid var(--muted)',
        }}
      >
        <span style={{ fontSize: 11, textTransform: 'uppercase', fontFamily: 'DM Mono', color: 'var(--muted-foreground)' }}>
          {order.payment_method}
        </span>
        <span
          style={{
            fontSize: 16,
            fontFamily: 'DM Mono',
            fontWeight: 700,
            color: isVoid ? '#9ca3af' : 'var(--foreground)',
            textDecoration: isVoid ? 'line-through' : 'none',
          }}
        >
          &#8369;{Number(order.total_amount).toFixed(2)}
        </span>
      </div>

      {/* Row 5: actions, full-width tap targets */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          onClick={() => onReceipt(order)}
          style={{
            flex: 1,
            fontSize: 13,
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--foreground)',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Receipt
        </button>
        {!isVoid && (
          <button
            type="button"
            onClick={() => onVoid(order)}
            style={{
              flex: 1,
              fontSize: 13,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #fecaca',
              background: '#fef2f2',
              color: '#b91c1c',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Void
          </button>
        )}
      </div>
    </div>
  )
}

export default function OrdersList() {
  const { role } = useAuth()
  /** Phones get a card list; wider viewports keep the grid table. */
  const isCompact = useIsCompact()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'void'>('all')
  /** Total rows matching the current filter on the server, for pagination. */
  const [total, setTotal] = useState(0)
  const [limit, setLimit] = useState(100)
  const [offset, setOffset] = useState(0)

  // Modals state
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<Order | null>(null)
  const [voidModalOrder, setVoidModalOrder] = useState<Order | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidLoading, setVoidLoading] = useState(false)
  const [voidError, setVoidError] = useState<string | null>(null)

  // Reset to the first page whenever a filter changes.
  useEffect(() => {
    setOffset(0)
  }, [statusFilter])

  useEffect(() => {
    if (voidModalOrder) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [voidModalOrder])

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const page = await apiGetOrders({
        limit: 100,
        offset,
        status: statusFilter === 'all' ? undefined : statusFilter,
      })
      setOrders(page.orders)
      setTotal(page.total)
      setLimit(page.limit)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch orders')
    } finally {
      setLoading(false)
    }
  }, [offset, statusFilter])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  // Client-side narrow of the current server page. The status filter is also
  // applied server-side (see fetchOrders), and search matches against the
  // rows already returned.
  const filteredOrders = orders.filter(order => {
    if (search.trim() !== '') {
      const q = search.toLowerCase()
      const matchesNum = String(order.order_number).includes(q)
      const matchesNotes = order.notes?.toLowerCase().includes(q)
      const matchesItems = order.order_items?.some(i => i.product_name.toLowerCase().includes(q))
      return matchesNum || matchesNotes || matchesItems
    }
    return true
  })

  /** Opens the void confirmation for an order, resetting any prior state. */
  const openVoid = useCallback((order: Order) => {
    setVoidModalOrder(order)
    setVoidReason('')
    setVoidError(null)
  }, [])

  async function handleConfirmVoid(e: React.FormEvent) {
    e.preventDefault()
    if (!voidModalOrder) return
    setVoidLoading(true)
    setVoidError(null)
    try {
      await apiVoidOrder(voidModalOrder.id, voidReason || 'Voided by staff')
      setVoidModalOrder(null)
      setVoidReason('')
      await fetchOrders()
    } catch (err: unknown) {
      setVoidError(err instanceof Error ? err.message : 'Failed to void order')
    } finally {
      setVoidLoading(false)
    }
  }

  return (
    <div className="page">
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Fraunces', fontSize: 26, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>
            Transactions
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
            {role === 'admin' ? 'All store customer orders and transaction audits' : 'Your recorded sales and customer orders'}
          </p>
        </div>
        <button
          onClick={fetchOrders}
          className="btn-ghost"
          style={{ padding: '8px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          id="orders-search"
          className="input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by Order # or Item..."
          style={{ width: 280, padding: '9px 14px', fontSize: 13 }}
        />

        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'completed', 'void'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '7px 16px',
                borderRadius: 20,
                fontSize: 12,
                cursor: 'pointer',
                border: '1px solid var(--border)',
                textTransform: 'capitalize',
                background: statusFilter === s ? 'var(--primary)' : 'var(--card)',
                color: statusFilter === s ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                fontWeight: statusFilter === s ? 600 : 400,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            padding: '12px 16px', background: '#fce8e8', border: '1px solid #fca5a5',
            borderRadius: 8, color: '#b91c1c', marginBottom: 20, fontSize: 13,
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={fetchOrders}
            className="btn-ghost"
            style={{ padding: '6px 14px', fontSize: 13, border: '1px solid #fca5a5', color: '#b91c1c', whiteSpace: 'nowrap' }}
          >
            Try again
          </button>
        </div>
      )}

      {/* Orders list — a compact card stack on phones, a grid table above that.
          A 1330px grid inside a 360px viewport forced sideways scrolling to
          reach Payment/Total/Actions, which is not usable one-handed. */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        </div>
      ) : isCompact ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredOrders.map(order => (
            <OrderCard key={order.id} order={order} onReceipt={setSelectedReceiptOrder} onVoid={openVoid} />
          ))}
          {filteredOrders.length === 0 && (
            <div className="card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 14 }}>
              No orders found matching your criteria.
            </div>
          )}
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="scroll-x">
          <div style={{ display: 'grid', gridTemplateColumns: '80px 150px 1fr 100px 110px 100px 140px', gap: 0, padding: '12px 20px', borderBottom: '1px solid var(--border)', minWidth: 780 }}>
            {['Order #', 'Date & Time', 'Items Summary', 'Payment', 'Total', 'Status', 'Actions'].map(h => (
              <span key={h} style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {h}
              </span>
            ))}
          </div>

          {filteredOrders.map((order, i) => {
            const isVoid = order.status === 'void'
            const dateStr = new Date(order.created_at).toLocaleString('en-PH', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })
            const itemsSummary = (order.order_items ?? [])
              .map(item => `${item.quantity}x ${item.product_name}`)
              .join(', ')

            return (
              <div
                key={order.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 150px 1fr 100px 110px 100px 140px',
                  gap: 0,
                  padding: '14px 20px',
                  borderBottom: i < filteredOrders.length - 1 ? '1px solid var(--muted)' : 'none',
                  alignItems: 'center',
                  background: isVoid ? 'rgba(254, 242, 242, 0.4)' : 'transparent',
                  minWidth: 780,
                }}
              >
                <span style={{ fontFamily: 'DM Mono', fontWeight: 700, fontSize: 13, color: 'var(--foreground)' }}>
                  #{order.order_number}
                </span>

                <span style={{ fontSize: 12, color: 'var(--muted-foreground)', fontFamily: 'DM Mono' }}>
                  {dateStr}
                </span>

                <div style={{ paddingRight: 16 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {itemsSummary || 'No items'}
                  </p>
                  {order.notes && (
                    <p style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2, fontStyle: 'italic' }}>
                      {order.notes}
                    </p>
                  )}
                </div>

                <span style={{ fontSize: 12, textTransform: 'uppercase', fontFamily: 'DM Mono', color: 'var(--muted-foreground)' }}>
                  {order.payment_method}
                </span>

                <span style={{ fontSize: 14, fontFamily: 'DM Mono', fontWeight: 700, color: isVoid ? '#9ca3af' : 'var(--foreground)', textDecoration: isVoid ? 'line-through' : 'none' }}>
                  ₱{Number(order.total_amount).toFixed(2)}
                </span>

                <div>
                  <span
                    style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 12,
                      fontWeight: 600,
                      background: isVoid ? '#fee2e2' : '#e8f5e9',
                      color: isVoid ? '#b91c1c' : '#15803d',
                      textTransform: 'uppercase',
                    }}
                  >
                    {order.status}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => setSelectedReceiptOrder(order)}
                    style={{
                      fontSize: 12,
                      padding: '5px 9px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      color: 'var(--foreground)',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                    title="View & Print Receipt"
                  >
                    Receipt
                  </button>

                  {!isVoid && (
                    <button
                      onClick={() => openVoid(order)}
                      style={{
                        fontSize: 12,
                        padding: '5px 9px',
                        borderRadius: 6,
                        border: '1px solid #fecaca',
                        background: '#fef2f2',
                        color: '#b91c1c',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                      title="Void this transaction and reverse stock deductions"
                    >
                      Void
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {filteredOrders.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 14 }}>
              No orders found matching your criteria.
            </div>
          )}
          </div>

          {/* Pagination footer */}
          {total > 0 && (
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
                padding: '14px 20px', borderTop: '1px solid var(--border)',
              }}
            >
              <span style={{ fontSize: 12.5, color: 'var(--muted-foreground)' }}>
                Showing <strong style={{ color: 'var(--foreground)' }}>{offset + 1}–{Math.min(offset + orders.length, total)}</strong> of{' '}
                <strong style={{ color: 'var(--foreground)' }}>{total}</strong> transaction{total === 1 ? '' : 's'}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setOffset(o => Math.max(0, o - limit))}
                  disabled={offset === 0 || loading}
                  className="btn-ghost"
                  style={{ padding: '7px 14px', fontSize: 13, opacity: offset === 0 || loading ? 0.45 : 1, cursor: offset === 0 || loading ? 'not-allowed' : 'pointer' }}
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  onClick={() => setOffset(o => o + limit)}
                  disabled={offset + orders.length >= total || loading}
                  className="btn-ghost"
                  style={{ padding: '7px 14px', fontSize: 13, opacity: offset + orders.length >= total || loading ? 0.45 : 1, cursor: offset + orders.length >= total || loading ? 'not-allowed' : 'pointer' }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Receipt Modal */}
      {selectedReceiptOrder && (
        <ReceiptModal order={selectedReceiptOrder} onClose={() => setSelectedReceiptOrder(null)} />
      )}

      {/* Void Confirmation Modal */}
      {voidModalOrder && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
          onClick={e => { if (e.target === e.currentTarget) setVoidModalOrder(null) }}
        >
          <div className="card fade-in" style={{ width: '100%', maxWidth: 420, padding: '26px', boxShadow: '0 25px 60px rgba(0,0,0,0.35)' }}>
            <h3 style={{ fontFamily: 'Fraunces', fontSize: 18, color: '#b91c1c', marginBottom: 10 }}>
              Void Order #{voidModalOrder.order_number}?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 16 }}>
              Voiding will mark this order as void and <strong>restore all deducted ingredients back into inventory</strong> with an audit trail entry.
            </p>

            <form onSubmit={handleConfirmVoid}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--foreground)' }}>
                  Reason for Void:
                </label>
                <input
                  className="input"
                  autoFocus
                  value={voidReason}
                  onChange={e => setVoidReason(e.target.value)}
                  placeholder="e.g. Customer cancelled, wrong item selected"
                  required
                  style={{ width: '100%', padding: '9px 12px', fontSize: 13 }}
                />
              </div>

              {voidError && (
                <div style={{ padding: '8px 12px', background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 12, marginBottom: 14 }}>
                  {voidError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setVoidModalOrder(null)}
                  className="btn-ghost"
                  style={{ padding: '8px 16px', fontSize: 13 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={voidLoading}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    background: '#b91c1c',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: voidLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {voidLoading ? 'Voiding...' : 'Confirm Void'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
