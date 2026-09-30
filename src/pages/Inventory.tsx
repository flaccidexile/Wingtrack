import { useState } from 'react'

const STOCK = [
  { id: 1, name: 'Chicken Wings (Raw)', unit: 'kg', stock: 24.5, min: 10, cost: 280, cat: 'Proteins', supplier: 'FreshFarm Supply' },
  { id: 2, name: 'Honey Garlic Sauce', unit: 'bottles', stock: 8, min: 12, cost: 185, cat: 'Sauces', supplier: 'Flavor House PH' },
  { id: 3, name: 'Buffalo Hot Sauce', unit: 'bottles', stock: 15, min: 10, cost: 210, cat: 'Sauces', supplier: 'Flavor House PH' },
  { id: 4, name: 'Sriracha Sauce', unit: 'bottles', stock: 5, min: 8, cost: 195, cat: 'Sauces', supplier: 'Flavor House PH' },
  { id: 5, name: 'Cooking Oil (Palm)', unit: 'liters', stock: 42, min: 20, cost: 90, cat: 'Cooking', supplier: 'Metro Grocery' },
  { id: 6, name: 'Frozen Fries', unit: 'kg', stock: 18, min: 15, cost: 120, cat: 'Sides', supplier: 'FreshFarm Supply' },
  { id: 7, name: 'Garlic (Peeled)', unit: 'kg', stock: 3.2, min: 5, cost: 160, cat: 'Produce', supplier: 'Metro Grocery' },
  { id: 8, name: 'Coleslaw Mix', unit: 'kg', stock: 6, min: 4, cost: 85, cat: 'Produce', supplier: 'FreshFarm Supply' },
  { id: 9, name: 'BBQ Sauce', unit: 'bottles', stock: 11, min: 10, cost: 175, cat: 'Sauces', supplier: 'Flavor House PH' },
  { id: 10, name: 'Lemon Pepper Blend', unit: 'packs', stock: 9, min: 6, cost: 145, cat: 'Spices', supplier: 'Spice Central' },
  { id: 11, name: 'White Rice (Sacks)', unit: 'sacks', stock: 4, min: 3, cost: 2200, cat: 'Staples', supplier: 'Metro Grocery' },
  { id: 12, name: 'Disposable Cups', unit: 'pcs', stock: 520, min: 200, cost: 2.5, cat: 'Packaging', supplier: 'PackPro' },
  { id: 13, name: 'Take-out Boxes', unit: 'pcs', stock: 145, min: 100, cost: 8, cat: 'Packaging', supplier: 'PackPro' },
  { id: 14, name: 'Napkins (Packs)', unit: 'packs', stock: 28, min: 20, cost: 35, cat: 'Packaging', supplier: 'PackPro' },
]

const CATS = ['All', 'Proteins', 'Sauces', 'Sides', 'Produce', 'Cooking', 'Spices', 'Staples', 'Packaging']

function statusOf(stock: number, min: number) {
  const ratio = stock / min
  if (ratio <= 0.6) return { label: 'Critical', bg: '#fce8e8', color: '#b91c1c' }
  if (ratio <= 1) return { label: 'Low', bg: '#fff7e6', color: '#b45309' }
  return { label: 'OK', bg: '#e8f5e9', color: '#15803d' }
}

export default function Inventory() {
  const [cat, setCat] = useState('All')
  const [search, setSearch] = useState('')

  const filtered = STOCK
    .filter(s => cat === 'All' || s.cat === cat)
    .filter(s => s.name.toLowerCase().includes(search.toLowerCase()))

  const lowCount = STOCK.filter(s => s.stock <= s.min).length
  const critCount = STOCK.filter(s => s.stock / s.min <= 0.6).length

  return (
    <div style={{ padding: '24px 32px', minHeight: '100vh' }}>
      <div style={{ marginBottom: 22, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'Fraunces', fontSize: 22, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>Inventory Management</h1>
          <p style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{STOCK.length} items · Last updated Sep 30, 2026 2:47 PM</p>
        </div>
        <button style={{ padding: '8px 18px', background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Fraunces' }}>
          + Add Item
        </button>
      </div>

      {/* Alert strip */}
      {(lowCount > 0 || critCount > 0) && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {critCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 6, background: '#fce8e8', border: '1px solid #fca5a5' }}>
              <span>🔴</span>
              <span style={{ fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>{critCount} item{critCount > 1 ? 's' : ''} critically low — reorder immediately</span>
            </div>
          )}
          {lowCount - critCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 6, background: '#fff7e6', border: '1px solid #fcd34d' }}>
              <span>⚠️</span>
              <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>{lowCount - critCount} item{lowCount - critCount > 1 ? 's' : ''} below minimum stock level</span>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search items…"
          style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', fontSize: 12, fontFamily: 'DM Sans', outline: 'none', width: 200 }}
        />
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {CATS.map(c => (
            <button key={c} onClick={() => setCat(c)} style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 11, cursor: 'pointer', border: '1px solid var(--border)',
              background: cat === c ? 'var(--primary)' : 'var(--card)',
              color: cat === c ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
              fontWeight: cat === c ? 600 : 400,
            }}>{c}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 90px 90px 100px 140px 80px', gap: 0, padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
          {['Item Name', 'Unit', 'In Stock', 'Min Level', 'Unit Cost', 'Supplier', 'Status'].map(h => (
            <span key={h} style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
          ))}
        </div>
        {filtered.map((item, i) => {
          const s = statusOf(item.stock, item.min)
          return (
            <div key={item.id} style={{
              display: 'grid', gridTemplateColumns: '2fr 80px 90px 90px 100px 140px 80px', gap: 0,
              padding: '12px 20px', borderBottom: i < filtered.length - 1 ? '1px solid var(--muted)' : 'none',
              alignItems: 'center', transition: 'background 0.1s',
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--muted)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>{item.name}</p>
                <p style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 1 }}>{item.cat}</p>
              </div>
              <span style={{ fontSize: 12, color: 'var(--muted-foreground)', fontFamily: 'DM Mono' }}>{item.unit}</span>
              <span style={{ fontSize: 13, fontFamily: 'DM Mono', fontWeight: 700, color: item.stock <= item.min ? '#b91c1c' : 'var(--foreground)' }}>{item.stock}</span>
              <span style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--muted-foreground)' }}>{item.min}</span>
              <span style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--foreground)' }}>₱{item.cost.toLocaleString()}</span>
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{item.supplier}</span>
              <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, fontWeight: 700, background: s.bg, color: s.color, textAlign: 'center', display: 'inline-block' }}>{s.label}</span>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 13 }}>No items match your search.</div>
        )}
      </div>
    </div>
  )
}
