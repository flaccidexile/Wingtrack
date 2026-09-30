import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { apiAdjustInventory } from '@/lib/api'
import type { InventoryItem, InventoryAdjustmentPayload } from '@/types'

const CATS = ['All', 'Proteins', 'Sauces', 'Sides', 'Produce', 'Cooking', 'Spices', 'Staples', 'Packaging']

const STATUS_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  ok:       { label: 'In Stock', bg: '#e8f5e9', color: '#15803d' },
  low:      { label: 'Low',      bg: '#fff7e6', color: '#b45309' },
  critical: { label: 'Critical', bg: '#fce8e8', color: '#b91c1c' },
}

/** Compute stock status from quantity using the store's thresholds:
 *  >= 10  → ok (In Stock)
 *   5–9   → low
 *  <= 4   → critical
 */
function getStockStatus(qty: number): 'ok' | 'low' | 'critical' {
  if (qty >= 10) return 'ok'
  if (qty >= 5)  return 'low'
  return 'critical'
}

interface AdjustModal {
  item: InventoryItem
  type: 'restock' | 'adjustment' | 'waste'
}

export default function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState('All')
  const [search, setSearch] = useState('')
  const [adjustModal, setAdjustModal] = useState<AdjustModal | null>(null)
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustNotes, setAdjustNotes] = useState('')
  const [adjustLoading, setAdjustLoading] = useState(false)
  const [adjustError, setAdjustError] = useState<string | null>(null)

  const fetchInventory = useCallback(async () => {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .order('name')
    if (error) { console.error(error); return }
    setItems((data ?? []) as InventoryItem[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchInventory() }, [fetchInventory])

  // Real-time updates
  useEffect(() => {
    const channel = supabase
      .channel('inventory-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => fetchInventory())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchInventory])

  const filtered = items
    .filter(i => cat === 'All' || i.category === cat)
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()))

  const lowCount  = items.filter(i => getStockStatus(Number(i.stock_qty)) === 'low').length
  const critCount = items.filter(i => getStockStatus(Number(i.stock_qty)) === 'critical').length

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault()
    if (!adjustModal) return
    setAdjustError(null)
    setAdjustLoading(true)

    const qtyChange = parseFloat(adjustQty)
    if (isNaN(qtyChange) || qtyChange === 0) {
      setAdjustError('Enter a valid non-zero quantity.')
      setAdjustLoading(false)
      return
    }

    const payload: InventoryAdjustmentPayload = {
      inventory_id: adjustModal.item.id,
      qty_change: adjustModal.type === 'waste' ? -Math.abs(qtyChange) : Math.abs(qtyChange),
      movement_type: adjustModal.type,
      notes: adjustNotes,
    }

    try {
      await apiAdjustInventory(payload)
      setAdjustModal(null)
      setAdjustQty('')
      setAdjustNotes('')
      await fetchInventory()
    } catch (err: unknown) {
      setAdjustError(err instanceof Error ? err.message : 'Adjustment failed')
    } finally {
      setAdjustLoading(false)
    }
  }

  return (
    <div style={{ padding: '28px 36px', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'Fraunces', fontSize: 26, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>Inventory Management</h1>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
            {items.length} items · Updates in real-time
          </p>
        </div>
      </div>

      {/* Alert strip */}
      {(lowCount > 0 || critCount > 0) && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {critCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 8, background: '#fce8e8', border: '1px solid #fca5a5' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#b91c1c', display: 'inline-block' }} />
              <span style={{ fontSize: 13, color: '#b91c1c', fontWeight: 600 }}>{critCount} item{critCount > 1 ? 's' : ''} critically low — reorder immediately</span>
            </div>
          )}
          {lowCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 8, background: '#fff7e6', border: '1px solid #fcd34d' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#b45309', display: 'inline-block' }} />
              <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>{lowCount} item{lowCount > 1 ? 's' : ''} below minimum stock level</span>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          id="inv-search"
          className="input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search items..."
          style={{ width: 240, padding: '10px 14px', fontSize: 14 }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CATS.map(c => (
            <button
              key={c}
              id={`inv-cat-${c.toLowerCase()}`}
              onClick={() => setCat(c)}
              style={{
                padding: '7px 16px', borderRadius: 22, fontSize: 12, cursor: 'pointer',
                border: '1px solid var(--border)',
                background: cat === c ? 'var(--primary)' : 'var(--card)',
                color: cat === c ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                fontWeight: cat === c ? 600 : 400,
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 105px 105px 115px 150px 90px 110px', gap: 0, padding: '12px 22px', borderBottom: '1px solid var(--border)' }}>
            {['Item Name', 'Unit', 'In Stock', 'Min Level', 'Unit Cost', 'Supplier', 'Status', 'Actions'].map(h => (
              <span key={h} style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
            ))}
          </div>
          {filtered.map((item, i) => {
            const status = getStockStatus(Number(item.stock_qty))
            const s = STATUS_STYLES[status]
            const qtyColor = status === 'ok' ? 'var(--success, #15803d)' : status === 'low' ? '#b45309' : '#b91c1c'
            return (
              <div
                key={item.id}
                style={{
                  display: 'grid', gridTemplateColumns: '2fr 80px 105px 105px 115px 150px 90px 110px', gap: 0,
                  padding: '14px 22px', borderBottom: i < filtered.length - 1 ? '1px solid var(--muted)' : 'none',
                  alignItems: 'center', transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--muted)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>{item.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>{item.category}</p>
                </div>
                <span style={{ fontSize: 13, color: 'var(--muted-foreground)', fontFamily: 'DM Mono' }}>{item.unit}</span>
                <span style={{ fontSize: 14, fontFamily: 'DM Mono', fontWeight: 700, color: qtyColor }}>{Number(item.stock_qty).toLocaleString()}</span>
                <span style={{ fontSize: 13, fontFamily: 'DM Mono', color: 'var(--muted-foreground)' }}>{Number(item.min_stock_level).toLocaleString()}</span>
                <span style={{ fontSize: 13, fontFamily: 'DM Mono', color: 'var(--foreground)' }}>&#8369;{Number(item.unit_cost).toLocaleString()}</span>
                <span style={{ fontSize: 12, color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.supplier ?? '-'}</span>
                <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, fontWeight: 700, background: s.bg, color: s.color, textAlign: 'center', display: 'inline-block' }}>{s.label}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    id={`inv-restock-${item.id}`}
                    onClick={() => { setAdjustModal({ item, type: 'restock' }); setAdjustQty(''); setAdjustNotes('') }}
                    style={{ fontSize: 12, padding: '5px 11px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Restock
                  </button>
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 14 }}>No items match your filter.</div>
          )}
        </div>
      )}

      {/* Adjust Modal */}
      {adjustModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={e => { if (e.target === e.currentTarget) setAdjustModal(null) }}>
          <div className="card fade-in" style={{ width: '100%', maxWidth: 440, padding: '30px 26px' }}>
            <h2 style={{ fontFamily: 'Fraunces', fontSize: 20, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>
              {adjustModal.type === 'restock' ? 'Restock' : adjustModal.type === 'waste' ? 'Record Waste' : 'Adjust Stock'}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 20 }}>
              {adjustModal.item.name} — current: {adjustModal.item.stock_qty} {adjustModal.item.unit}
            </p>
            <form onSubmit={handleAdjust} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label htmlFor="adj-type" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>Movement Type</label>
                <select id="adj-type" className="input" value={adjustModal.type} onChange={e => setAdjustModal(m => m ? { ...m, type: e.target.value as AdjustModal['type'] } : null)} style={{ padding: '11px 14px', fontSize: 14 }}>
                  <option value="restock">Restock (add stock)</option>
                  <option value="adjustment">Adjustment (correction)</option>
                  <option value="waste">Waste (remove stock)</option>
                </select>
              </div>
              <div>
                <label htmlFor="adj-qty" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>Quantity ({adjustModal.item.unit})</label>
                <input id="adj-qty" className="input" type="number" step="0.001" min="0.001" required placeholder="0.00" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} style={{ padding: '11px 14px', fontSize: 14 }} />
              </div>
              <div>
                <label htmlFor="adj-notes" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>Notes (optional)</label>
                <input id="adj-notes" className="input" type="text" placeholder="e.g. Delivery from supplier" value={adjustNotes} onChange={e => setAdjustNotes(e.target.value)} style={{ padding: '11px 14px', fontSize: 14 }} />
              </div>
              {adjustError && (
                <div style={{ background: 'var(--danger-bg)', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--danger)' }}>{adjustError}</div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button type="button" className="btn-ghost" onClick={() => setAdjustModal(null)} style={{ flex: 1, padding: '12px' }}>Cancel</button>
                <button id="btn-save-adjustment" type="submit" className="btn-primary" disabled={adjustLoading} style={{ flex: 2, padding: '12px' }}>
                  {adjustLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
