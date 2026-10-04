import { useState } from 'react'

const MENU = [
  // Wings
  { id: 1, name: 'Classic Buffalo Wings', price: 199, cat: 'Wings' },
  { id: 2, name: 'Honey Garlic Wings', price: 199, cat: 'Wings' },
  { id: 3, name: 'Spicy Sriracha Wings', price: 199, cat: 'Wings' },
  { id: 4, name: 'BBQ Smokey Wings', price: 199, cat: 'Wings' },
  { id: 5, name: 'Lemon Pepper Wings', price: 199, cat: 'Wings' },
  { id: 6, name: 'Party Bucket (20pcs)', price: 599, cat: 'Wings' },

  // Sizzling
  { id: 7, name: 'Sizzling Pork Sisig', price: 189, cat: 'Sizzling' },
  { id: 8, name: 'Sizzling Chicken Steak', price: 179, cat: 'Sizzling' },
  { id: 9, name: 'Sizzling Beef Tapa', price: 199, cat: 'Sizzling' },
  { id: 10, name: 'Sizzling Pork Chop', price: 169, cat: 'Sizzling' },

  // Silog
  { id: 11, name: 'Tapsilog Special', price: 149, cat: 'Silog' },
  { id: 12, name: 'Tocilog Delight', price: 139, cat: 'Silog' },
  { id: 13, name: 'Chicksilog Wing Meal', price: 149, cat: 'Silog' },
  { id: 14, name: 'Bangsilog Supreme', price: 159, cat: 'Silog' },
  { id: 15, name: 'Longsilog Classic', price: 129, cat: 'Silog' },

  // Shake
  { id: 16, name: 'Fresh Mango Shake', price: 89, cat: 'Shake' },
  { id: 17, name: 'Strawberry Milkshake', price: 89, cat: 'Shake' },
  { id: 18, name: 'Rich Chocolate Shake', price: 89, cat: 'Shake' },
  { id: 19, name: 'House Blend Iced Tea', price: 45, cat: 'Shake' },
  { id: 20, name: 'Bottomless Soda', price: 65, cat: 'Shake' },

  // Burger
  { id: 21, name: 'Classic Beef Burger', price: 119, cat: 'Burger' },
  { id: 22, name: 'Cheesy Bacon Burger', price: 159, cat: 'Burger' },
  { id: 23, name: 'Crispy Chicken Burger', price: 149, cat: 'Burger' },
  { id: 24, name: 'Double Smash Burger', price: 189, cat: 'Burger' },

  // Fries & Pure Cheesestick
  { id: 25, name: 'Pure Mozzarella Cheesesticks (6pcs)', price: 129, cat: 'Fries & Pure Cheesestick' },
  { id: 26, name: 'Crispy Golden Fries', price: 79, cat: 'Fries & Pure Cheesestick' },
  { id: 27, name: 'Loaded Cheese Fries', price: 99, cat: 'Fries & Pure Cheesestick' },
  { id: 28, name: 'Cheesestick & Fries Combo', price: 169, cat: 'Fries & Pure Cheesestick' },
]

const CATS = ['All', 'Wings', 'Sizzling', 'Silog', 'Shake', 'Burger', 'Fries & Pure Cheesestick']

type CartItem = { id: number; name: string; price: number; cat: string; qty: number }

export default function PointOfSale() {
  const [cat, setCat] = useState('All')
  const [cart, setCart] = useState<CartItem[]>([])
  const [method, setMethod] = useState('Cash')
  const [orderNum] = useState(892)

  const filtered = cat === 'All' ? MENU : MENU.filter(m => m.cat === cat)

  const addItem = (item: typeof MENU[0]) => {
    setCart(prev => {
      const exists = prev.find(c => c.id === item.id)
      if (exists) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { ...item, qty: 1 }]
    })
  }

  const updateQty = (id: number, delta: number) => {
    setCart(prev => prev.map(c => c.id === id ? { ...c, qty: c.qty + delta } : c).filter(c => c.qty > 0))
  }

  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0)
  const tax = Math.round(subtotal * 0.12)
  const total = subtotal + tax

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', height: '100vh', overflow: 'hidden' }}>
      {/* Menu panel */}
      <div style={{ padding: '24px 28px', overflow: 'auto' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: 'Fraunces', fontSize: 22, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>Point of Sale</h1>
          <p style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Order #{orderNum} · Sep 30, 2026</p>
        </div>

        {/* Category tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {CATS.map(c => (
            <button key={c} onClick={() => setCat(c)} style={{
              padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1px solid var(--border)', transition: 'all 0.15s',
              background: cat === c ? 'var(--primary)' : 'var(--card)',
              color: cat === c ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
            }}>{c}</button>
          ))}
        </div>

        {/* Menu grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {filtered.map(item => {
            const inCart = cart.find(c => c.id === item.id)
            return (
              <button key={item.id} onClick={() => addItem(item)} style={{
                background: inCart ? 'rgba(155,94,40,0.08)' : 'var(--card)',
                border: `1px solid ${inCart ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 8, padding: '14px 12px', cursor: 'pointer', textAlign: 'left',
                transition: 'all 0.15s',
              }}>
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'DM Mono' }}>{item.cat}</span>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', lineHeight: 1.3, marginBottom: 6 }}>{item.name}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontFamily: 'DM Mono', fontWeight: 700, color: 'var(--primary)' }}>₱{item.price}</span>
                  {inCart && <span style={{ fontSize: 10, background: 'var(--primary)', color: 'var(--primary-foreground)', borderRadius: 10, padding: '1px 7px', fontWeight: 700 }}>×{inCart.qty}</span>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Cart panel */}
      <div style={{ background: 'var(--sidebar)', display: 'flex', flexDirection: 'column', height: '100vh', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 style={{ fontFamily: 'Fraunces', fontSize: 16, fontWeight: 600, color: 'var(--sidebar-foreground)' }}>Current Order</h2>
          <p style={{ fontSize: 11, color: 'var(--sidebar-muted)', marginTop: 2, fontFamily: 'DM Mono' }}>#{orderNum}</p>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--sidebar-muted)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 10px', display: 'block', opacity: 0.7 }}>
                <circle cx="9" cy="21" r="1"/>
                <circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--sidebar-foreground)' }}>No items yet</p>
              <p style={{ fontSize: 11, marginTop: 4, color: 'var(--sidebar-muted)' }}>Tap menu items to add</p>
            </div>
          ) : cart.map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--sidebar-foreground)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                <p style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--sidebar-active)', marginTop: 1, fontWeight: 500 }}>₱{(item.price * item.qty).toLocaleString()}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => updateQty(item.id, -1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.05)', color: 'var(--sidebar-foreground)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <span style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--sidebar-foreground)', minWidth: 14, textAlign: 'center', fontWeight: 600 }}>{item.qty}</span>
                <button onClick={() => updateQty(item.id, 1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.05)', color: 'var(--sidebar-foreground)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              </div>
            </div>
          ))}
        </div>

        {/* Totals + checkout */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ marginBottom: 14 }}>
            {[['Subtotal', `₱${subtotal.toLocaleString()}`], ['VAT (12%)', `₱${tax.toLocaleString()}`]].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--sidebar-muted)' }}>{k}</span>
                <span style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--sidebar-foreground)', fontWeight: 500 }}>{v}</span>
              </div>
            ))}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '10px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--sidebar-foreground)', fontFamily: 'Fraunces' }}>Total</span>
              <span style={{ fontSize: 16, fontFamily: 'DM Mono', fontWeight: 700, color: 'var(--sidebar-active)' }}>₱{total.toLocaleString()}</span>
            </div>
          </div>

          {/* Payment method */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {['Cash', 'GCash', 'Card'].map(m => (
              <button key={m} onClick={() => setMethod(m)} style={{
                flex: 1, padding: '7px 4px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${method === m ? 'var(--sidebar-active)' : 'rgba(255,255,255,0.18)'}`,
                background: method === m ? 'rgba(240,155,58,0.22)' : 'rgba(255,255,255,0.04)',
                color: method === m ? 'var(--sidebar-active)' : 'var(--sidebar-muted)',
              }}>{m}</button>
            ))}
          </div>

          <button
            disabled={cart.length === 0}
            onClick={() => setCart([])}
            style={{
              width: '100%', padding: '12px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: cart.length ? 'pointer' : 'not-allowed',
              background: cart.length ? 'var(--sidebar-active)' : 'rgba(255,255,255,0.08)',
              color: cart.length ? '#1c0f06' : 'rgba(255,255,255,0.45)',
              border: 'none', fontFamily: 'Fraunces', transition: 'all 0.15s',
            }}
          >
            {cart.length ? `Charge ₱${total.toLocaleString()}` : 'Add items to continue'}
          </button>
          {cart.length > 0 && (
            <button onClick={() => setCart([])} style={{ width: '100%', marginTop: 8, padding: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6, fontSize: 12, color: 'var(--sidebar-muted)', cursor: 'pointer' }}>
              Void Order
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
