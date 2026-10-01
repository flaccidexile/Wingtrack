import { useState, useEffect, useCallback } from 'react'
import { apiGetOrders, apiVoidOrder } from '@/lib/api'
import type { Order } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import ReceiptModal from '@/components/receipt/ReceiptModal'

export default function OrdersList() {
  const { role } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'void'>('all')

  // Modals state
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<Order | null>(null)
  const [voidModalOrder, setVoidModalOrder] = useState<Order | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidLoading, setVoidLoading] = useState(false)
  const [voidError, setVoidError] = useState<string | null>(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGetOrders()
      setOrders(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch orders')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const filteredOrders = orders.filter(order => {
    if (statusFilter !== 'all' && order.status !== statusFilter) return false
    if (search.trim() !== '') {
      const q = search.toLowerCase()
      const matchesNum = String(order.order_number).includes(q)
      const matchesNotes = order.notes?.toLowerCase().includes(q)
      const matchesItems = order.order_items?.some(i => i.product_name.toLowerCase().includes(q))
      return matchesNum || matchesNotes || matchesItems
    }
    return true
  })

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
    <div style={{ padding: '28px 36px', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Fraunces', fontSize: 26, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>
            Order History & Transactions
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
        <div style={{ padding: '12px 16px', background: '#fce8e8', border: '1px solid #fca5a5', borderRadius: 8, color: '#b91c1c', marginBottom: 20, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Orders Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 150px 1fr 100px 110px 100px 140px', gap: 0, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
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
                      onClick={() => {
                        setVoidModalOrder(order)
                        setVoidReason('')
                        setVoidError(null)
                      }}
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
      )}

      {/* Receipt Modal */}
      {selectedReceiptOrder && (
        <ReceiptModal order={selectedReceiptOrder} onClose={() => setSelectedReceiptOrder(null)} />
      )}

      {/* Void Confirmation Modal */}
      {voidModalOrder && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 150,
          }}
          onClick={e => { if (e.target === e.currentTarget) setVoidModalOrder(null) }}
        >
          <div className="card fade-in" style={{ width: '100%', maxWidth: 420, padding: '26px' }}>
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
        </div>
      )}
    </div>
  )
}
