import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { apiAdjustInventory, apiGetInventoryMovements, apiCreateInventoryItem } from '@/lib/api'
import type { InventoryItem, InventoryAdjustmentPayload, InventoryMovement } from '@/types'

const CATS = ['All', 'Proteins', 'Sauces', 'Sides', 'Produce', 'Cooking', 'Spices', 'Staples', 'Packaging']

const STATUS_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  ok:       { label: 'In Stock', bg: '#e8f5e9', color: '#15803d' },
  low:      { label: 'Low',      bg: '#fff7e6', color: '#b45309' },
  critical: { label: 'Critical', bg: '#fce8e8', color: '#b91c1c' },
}

function getItemStatus(item: InventoryItem): 'ok' | 'low' | 'critical' {
  if (item.status && (item.status === 'ok' || item.status === 'low' || item.status === 'critical')) {
    return item.status as 'ok' | 'low' | 'critical'
  }
  const qty = Number(item.stock_qty)
  const min = Number(item.min_stock_level)
  if (qty <= 0.6 * min) return 'critical'
  if (qty <= min) return 'low'
  return 'ok'
}

interface AdjustModal {
  item: InventoryItem
  type: 'restock' | 'adjustment' | 'waste'
}

export default function Inventory() {
  const [activeTab, setActiveTab] = useState<'stock' | 'movements'>('stock')
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState('All')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'low' | 'critical'>('all')

  // Adjust modal state
  const [adjustModal, setAdjustModal] = useState<AdjustModal | null>(null)
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustNotes, setAdjustNotes] = useState('')
  const [adjustLoading, setAdjustLoading] = useState(false)
  const [adjustError, setAdjustError] = useState<string | null>(null)

  // Movements audit log state
  const [movements, setMovements] = useState<InventoryMovement[]>([])
  const [movementsLoading, setMovementsLoading] = useState(false)
  const [movementsError, setMovementsError] = useState<string | null>(null)

  // Add Item modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemCat, setNewItemCat] = useState('Proteins')
  const [newItemUnit, setNewItemUnit] = useState('kg')
  const [newItemStock, setNewItemStock] = useState('')
  const [newItemMin, setNewItemMin] = useState('')
  const [newItemCost, setNewItemCost] = useState('')
  const [newItemSupplier, setNewItemSupplier] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Export state
  const [exportFilter, setExportFilter] = useState<'week' | 'month'>('week')
  const [showExportMenu, setShowExportMenu] = useState(false)

  useEffect(() => {
    if (adjustModal || showAddModal) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [adjustModal, showAddModal])

  const fetchInventory = useCallback(async () => {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .order('name')
    if (error) { console.error(error); return }
    setItems((data ?? []) as InventoryItem[])
    setLoading(false)
  }, [])

  const fetchMovements = useCallback(async () => {
    setMovementsLoading(true)
    setMovementsError(null)
    try {
      const data = await apiGetInventoryMovements()
      setMovements(data)
    } catch (err: unknown) {
      setMovementsError(err instanceof Error ? err.message : 'Failed to load movements')
    } finally {
      setMovementsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchInventory()
  }, [fetchInventory])

  useEffect(() => {
    if (activeTab === 'movements') {
      fetchMovements()
    }
  }, [activeTab, fetchMovements])

  // Real-time updates
  useEffect(() => {
    const channel = supabase
      .channel('inventory-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        fetchInventory()
        if (activeTab === 'movements') fetchMovements()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchInventory, fetchMovements, activeTab])

  const okCount   = items.filter(i => getItemStatus(i) === 'ok').length
  const lowCount  = items.filter(i => getItemStatus(i) === 'low').length
  const critCount = items.filter(i => getItemStatus(i) === 'critical').length

  const filtered = items
    .filter(i => cat === 'All' || i.category === cat)
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    .filter(i => statusFilter === 'all' || getItemStatus(i) === statusFilter)

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
      if (activeTab === 'movements') await fetchMovements()
    } catch (err: unknown) {
      setAdjustError(err instanceof Error ? err.message : 'Adjustment failed')
    } finally {
      setAdjustLoading(false)
    }
  }

  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault()
    setAddError(null)
    setAddLoading(true)
    try {
      await apiCreateInventoryItem({
        name: newItemName.trim(),
        category: newItemCat,
        unit: newItemUnit.trim(),
        stock_qty: newItemStock ? parseFloat(newItemStock) : 0,
        min_stock_level: newItemMin ? parseFloat(newItemMin) : 0,
        unit_cost: newItemCost ? parseFloat(newItemCost) : 0,
        supplier: newItemSupplier.trim() || undefined,
      })
      setShowAddModal(false)
      setNewItemName('')
      setNewItemStock('')
      setNewItemMin('')
      setNewItemCost('')
      setNewItemSupplier('')
      await fetchInventory()
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Failed to add item')
    } finally {
      setAddLoading(false)
    }
  }

  function handleExport(period: 'week' | 'month') {
    setShowExportMenu(false)
    const now = new Date()
    const cutoff = new Date(now)
    if (period === 'week') {
      cutoff.setDate(now.getDate() - 7)
    } else {
      cutoff.setMonth(now.getMonth() - 1)
    }

    const filtered = movements.filter(m => new Date(m.created_at) >= cutoff)
    const periodLabel = period === 'week' ? 'Last 7 Days' : 'Last 30 Days'

    const rows = filtered.map(m => {
      const dateStr = new Date(m.created_at).toLocaleString('en-PH', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
      const changeStr = m.qty_change > 0 ? `+${m.qty_change}` : String(m.qty_change)
      return `
        <tr>
          <td>${dateStr}</td>
          <td>${m.inventory?.name ?? 'Unknown'}</td>
          <td style="text-transform:capitalize">${m.movement_type}</td>
          <td style="color:${m.qty_change > 0 ? '#15803d' : '#b91c1c'}">${changeStr} ${m.inventory?.unit ?? ''}</td>
          <td>${Number(m.qty_before).toFixed(2)} → ${Number(m.qty_after).toFixed(2)}</td>
          <td>${m.staff?.full_name ?? 'System'}</td>
          <td>${m.notes || '-'}</td>
        </tr>`
    }).join('')

    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Inventory Report – ${periodLabel}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 24px; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    p.meta { color: #666; font-size: 11px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f3f4f6; text-align: left; padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e5e7eb; }
    td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>WINGTRACK — Inventory Movement Report</h1>
  <p class="meta">Period: ${periodLabel} &nbsp;|&nbsp; Generated: ${now.toLocaleString('en-PH')} &nbsp;|&nbsp; ${filtered.length} record(s)</p>
  <table>
    <thead><tr><th>Timestamp</th><th>Item</th><th>Type</th><th>Change</th><th>Before → After</th><th>Staff</th><th>Notes</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#888;padding:20px">No records for this period.</td></tr>'}</tbody>
  </table>
</body>
</html>`

    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
      win.focus()
      setTimeout(() => win.print(), 400)
    }
  }

  return (
    <div style={{ padding: '28px 36px', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Fraunces', fontSize: 26, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>
            Inventory Management
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
            {items.length} raw ingredients & packaging items · Real-time stock tracking
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            id="btn-add-inventory-item"
            className="btn-primary"
            onClick={() => setShowAddModal(true)}
            style={{ padding: '9px 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            + Add New Item
          </button>

          {/* Export Button */}
          <div style={{ position: 'relative' }}>
            <button
              id="btn-export-inventory"
              onClick={() => setShowExportMenu(prev => !prev)}
              style={{
                padding: '9px 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
                border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer',
                fontWeight: 600, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--muted)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              Export / Print
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {showExportMenu && (
              <div
                style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 6px)',
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                  zIndex: 200, minWidth: 200, overflow: 'hidden',
                }}
              >
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>Export Movement Audit</p>
                  <p style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>Opens a printable report</p>
                </div>
                {[{ label: '📅 Last 7 Days (Week)', value: 'week' as const }, { label: '📆 Last 30 Days (Month)', value: 'month' as const }].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setExportFilter(opt.value); handleExport(opt.value) }}
                    style={{
                      width: '100%', padding: '11px 14px', background: exportFilter === opt.value ? 'rgba(234,88,12,0.07)' : 'transparent',
                      border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer',
                      color: exportFilter === opt.value ? 'var(--primary)' : 'var(--foreground)',
                      fontWeight: exportFilter === opt.value ? 600 : 400,
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--muted)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = exportFilter === opt.value ? 'rgba(234,88,12,0.07)' : 'transparent' }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs: Stock vs Movement Audit */}
      <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab('stock')}
          style={{
            padding: '10px 16px',
            fontSize: 14,
            fontWeight: 600,
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'stock' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'stock' ? 'var(--primary)' : 'var(--muted-foreground)',
            cursor: 'pointer',
          }}
        >
          Stock Items ({items.length})
        </button>
        <button
          onClick={() => setActiveTab('movements')}
          style={{
            padding: '10px 16px',
            fontSize: 14,
            fontWeight: 600,
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'movements' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'movements' ? 'var(--primary)' : 'var(--muted-foreground)',
            cursor: 'pointer',
          }}
        >
          Movement Audit Trail
        </button>
      </div>

      {activeTab === 'stock' ? (
        <>
          {/* Alert strip */}
          {(lowCount > 0 || critCount > 0) && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              {critCount > 0 && (
                <div
                  id="inv-banner-critical"
                  onClick={() => setStatusFilter(statusFilter === 'critical' ? 'all' : 'critical')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 16px',
                    borderRadius: 8,
                    background: '#fce8e8',
                    border: statusFilter === 'critical' ? '2px solid #b91c1c' : '1px solid #fca5a5',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  title="Click to filter critical stock items"
                >
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#b91c1c', display: 'inline-block' }} />
                  <span style={{ fontSize: 13, color: '#b91c1c', fontWeight: 600 }}>
                    {critCount} item{critCount > 1 ? 's' : ''} critically low — reorder immediately
                  </span>
                  <span style={{ fontSize: 11, background: '#b91c1c', color: '#fff', padding: '2px 8px', borderRadius: 4, marginLeft: 6, fontWeight: 600 }}>
                    {statusFilter === 'critical' ? 'Active Filter ✕' : 'Filter Critical'}
                  </span>
                </div>
              )}
              {lowCount > 0 && (
                <div
                  id="inv-banner-low"
                  onClick={() => setStatusFilter(statusFilter === 'low' ? 'all' : 'low')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 16px',
                    borderRadius: 8,
                    background: '#fff7e6',
                    border: statusFilter === 'low' ? '2px solid #b45309' : '1px solid #fcd34d',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  title="Click to filter low stock items"
                >
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#b45309', display: 'inline-block' }} />
                  <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>
                    {lowCount} item{lowCount > 1 ? 's' : ''} below minimum stock level
                  </span>
                  <span style={{ fontSize: 11, background: '#b45309', color: '#fff', padding: '2px 8px', borderRadius: 4, marginLeft: 6, fontWeight: 600 }}>
                    {statusFilter === 'low' ? 'Active Filter ✕' : 'Filter Low'}
                  </span>
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
              style={{ width: 220, padding: '9px 14px', fontSize: 13 }}
            />

            {/* Stock Status Dropdown Filter */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <select
                id="inv-status-dropdown"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as 'all' | 'ok' | 'low' | 'critical')}
                style={{
                  padding: '9px 34px 9px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 'var(--radius)',
                  border: statusFilter !== 'all' ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--foreground)',
                  cursor: 'pointer',
                  outline: 'none',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  minWidth: 175,
                  boxShadow: statusFilter !== 'all' ? '0 0 0 3px rgba(234, 88, 12, 0.12)' : 'none',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
              >
                <option value="all">All Stocks ({items.length})</option>
                <option value="ok">In stock ({okCount})</option>
                <option value="low">Low ({lowCount})</option>
                <option value="critical">Critical ({critCount})</option>
              </select>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  position: 'absolute',
                  right: 12,
                  pointerEvents: 'none',
                  color: 'var(--muted-foreground)',
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            {/* Clear filter shortcut if status is filtered */}
            {statusFilter !== 'all' && (
              <button
                id="inv-clear-status-filter"
                onClick={() => setStatusFilter('all')}
                style={{
                  padding: '7px 11px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  border: '1px dashed var(--border)',
                  background: 'var(--card)',
                  color: 'var(--muted-foreground)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--foreground)'; e.currentTarget.style.borderColor = 'var(--foreground)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted-foreground)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                title="Reset stock status filter"
              >
                Reset Status ✕
              </button>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
              {CATS.map(c => (
                <button
                  key={c}
                  id={`inv-cat-${c.toLowerCase()}`}
                  onClick={() => setCat(c)}
                  style={{
                    padding: '7px 14px', borderRadius: 22, fontSize: 12, cursor: 'pointer',
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
                const status = getItemStatus(item)
                const s = STATUS_STYLES[status] || STATUS_STYLES.ok
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
                        Adjust
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
        </>
      ) : (
        /* Movements Audit Table */
        <div>
          {movementsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
              <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
            </div>
          ) : movementsError ? (
            <div style={{ padding: '14px', background: '#fee2e2', color: '#b91c1c', borderRadius: 8, fontSize: 13 }}>
              {movementsError}
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '150px 200px 110px 100px 140px 140px 1fr', gap: 0, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                {['Timestamp', 'Item', 'Type', 'Change', 'Before → After', 'Staff', 'Notes'].map(h => (
                  <span key={h} style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                ))}
              </div>
              {movements.map((m, i) => {
                const dateStr = new Date(m.created_at).toLocaleString('en-PH', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })
                const isPositive = m.qty_change > 0
                const typeColor = m.movement_type === 'restock' ? '#15803d' : m.movement_type === 'deduction' ? '#c47a2e' : m.movement_type === 'waste' ? '#b91c1c' : '#4b5563'
                const typeBg = m.movement_type === 'restock' ? '#e8f5e9' : m.movement_type === 'deduction' ? '#fff7ed' : m.movement_type === 'waste' ? '#fce8e8' : '#f3f4f6'

                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'grid', gridTemplateColumns: '150px 200px 110px 100px 140px 140px 1fr', gap: 0,
                      padding: '12px 20px', borderBottom: i < movements.length - 1 ? '1px solid var(--muted)' : 'none',
                      alignItems: 'center', fontSize: 13,
                    }}
                  >
                    <span style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--muted-foreground)' }}>{dateStr}</span>
                    <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{m.inventory?.name ?? 'Unknown item'}</span>
                    <div>
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, background: typeBg, color: typeColor, textTransform: 'uppercase', fontWeight: 700 }}>
                        {m.movement_type}
                      </span>
                    </div>
                    <span style={{ fontFamily: 'DM Mono', fontWeight: 700, color: isPositive ? '#15803d' : '#b91c1c' }}>
                      {isPositive ? `+${m.qty_change}` : m.qty_change} {m.inventory?.unit ?? ''}
                    </span>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--muted-foreground)' }}>
                      {Number(m.qty_before).toFixed(1)} → {Number(m.qty_after).toFixed(1)}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--foreground)' }}>
                      {m.staff?.full_name ?? 'System'}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.notes || '-'}
                    </span>
                  </div>
                )
              })}
              {movements.length === 0 && (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 14 }}>
                  No inventory movements recorded yet.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Adjust Modal */}
      {adjustModal && typeof document !== 'undefined' && createPortal(
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
          onClick={e => { if (e.target === e.currentTarget) setAdjustModal(null) }}
        >
          <div className="card fade-in" style={{ width: '100%', maxWidth: 440, padding: '30px 26px', boxShadow: '0 25px 60px rgba(0,0,0,0.35)' }}>
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
                <input id="adj-qty" autoFocus className="input" type="number" step="0.001" min="0.001" required placeholder="0.00" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} style={{ padding: '11px 14px', fontSize: 14 }} />
              </div>
              <div>
                <label htmlFor="adj-notes" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>Notes (optional)</label>
                <input id="adj-notes" className="input" type="text" placeholder="e.g. Delivery from supplier" value={adjustNotes} onChange={e => setAdjustNotes(e.target.value)} style={{ padding: '11px 14px', fontSize: 14 }} />
              </div>
              {adjustModal.type === 'restock' && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', background: 'rgba(21,128,61,0.07)', border: '1px solid rgba(21,128,61,0.2)', borderRadius: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <p style={{ fontSize: 12, color: '#15803d', lineHeight: 1.5 }}>
                    <strong>FIFO Active:</strong> Remaining old stock will be dispensed first before new stock is consumed. New quantity is added on top of the current balance.
                  </p>
                </div>
              )}
              {adjustError && (
                <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b91c1c' }}>{adjustError}</div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button type="button" className="btn-ghost" onClick={() => setAdjustModal(null)} style={{ flex: 1, padding: '12px' }}>Cancel</button>
                <button id="btn-save-adjustment" type="submit" className="btn-primary" disabled={adjustLoading} style={{ flex: 2, padding: '12px' }}>
                  {adjustLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Add New Item Modal */}
      {showAddModal && typeof document !== 'undefined' && createPortal(
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
          onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false) }}
        >
          <div className="card fade-in" style={{ width: '100%', maxWidth: 460, padding: '28px 26px', boxShadow: '0 25px 60px rgba(0,0,0,0.35)' }}>
            <h2 style={{ fontFamily: 'Fraunces', fontSize: 20, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>
              Add New Inventory Item
            </h2>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 18 }}>
              Register a raw ingredient, side item, or packaging material.
            </p>

            <form onSubmit={handleCreateItem} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>Item Name *</label>
                <input className="input" autoFocus required value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="e.g. Garlic Parmesan Seasoning" style={{ width: '100%', padding: '9px 12px', fontSize: 13 }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>Category *</label>
                  <select className="input" value={newItemCat} onChange={e => setNewItemCat(e.target.value)} style={{ width: '100%', padding: '9px 12px', fontSize: 13 }}>
                    {CATS.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>Measurement Unit *</label>
                  <input className="input" required value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)} placeholder="e.g. kg, liters, pcs" style={{ width: '100%', padding: '9px 12px', fontSize: 13 }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>Initial Stock Qty</label>
                  <input className="input" type="number" step="0.01" min="0" value={newItemStock} onChange={e => setNewItemStock(e.target.value)} placeholder="0" style={{ width: '100%', padding: '9px 12px', fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>Minimum Stock Level</label>
                  <input className="input" type="number" step="0.01" min="0" value={newItemMin} onChange={e => setNewItemMin(e.target.value)} placeholder="0" style={{ width: '100%', padding: '9px 12px', fontSize: 13 }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>Unit Cost (₱)</label>
                  <input className="input" type="number" step="0.01" min="0" value={newItemCost} onChange={e => setNewItemCost(e.target.value)} placeholder="0.00" style={{ width: '100%', padding: '9px 12px', fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>Supplier</label>
                  <input className="input" value={newItemSupplier} onChange={e => setNewItemSupplier(e.target.value)} placeholder="e.g. Metro Poultry Supply" style={{ width: '100%', padding: '9px 12px', fontSize: 13 }} />
                </div>
              </div>

              {addError && (
                <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#b91c1c' }}>
                  {addError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button type="button" className="btn-ghost" onClick={() => setShowAddModal(false)} style={{ flex: 1, padding: '10px' }}>Cancel</button>
                <button id="btn-save-new-item" type="submit" className="btn-primary" disabled={addLoading} style={{ flex: 2, padding: '10px' }}>
                  {addLoading ? 'Saving...' : 'Add Item'}
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
