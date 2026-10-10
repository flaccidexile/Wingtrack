import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { apiCheckout } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import type { Product, ProductCategory, CartItem, Order } from '@/types'
import ReceiptModal from '@/components/receipt/ReceiptModal'
import CashPaymentCalculator from '@/components/cashier/CashPaymentCalculator'
import PayMongoModal from '@/components/cashier/PayMongoModal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

const DEFAULT_CATS = ['All', 'Wings', 'Sizzling', 'Silog', 'Shake', 'Burger', 'Fries & Pure Cheesestick']

const FALLBACK_PRODUCTS: Product[] = [
  // Wings
  { id: 'p-1', name: 'Classic Buffalo Wings', price: 199, is_available: true, category_id: 'c-wings', category: { id: 'c-wings', name: 'Wings', sort_order: 1 } },
  { id: 'p-2', name: 'Honey Garlic Wings', price: 199, is_available: true, category_id: 'c-wings', category: { id: 'c-wings', name: 'Wings', sort_order: 1 } },
  { id: 'p-3', name: 'Spicy Sriracha Wings', price: 199, is_available: true, category_id: 'c-wings', category: { id: 'c-wings', name: 'Wings', sort_order: 1 } },
  { id: 'p-4', name: 'BBQ Smokey Wings', price: 199, is_available: true, category_id: 'c-wings', category: { id: 'c-wings', name: 'Wings', sort_order: 1 } },
  { id: 'p-5', name: 'Lemon Pepper Wings', price: 199, is_available: true, category_id: 'c-wings', category: { id: 'c-wings', name: 'Wings', sort_order: 1 } },
  { id: 'p-6', name: 'Party Bucket (20pcs)', price: 599, is_available: true, category_id: 'c-wings', category: { id: 'c-wings', name: 'Wings', sort_order: 1 } },

  // Sizzling
  { id: 'p-7', name: 'Sizzling Pork Sisig', price: 189, is_available: true, category_id: 'c-sizzling', category: { id: 'c-sizzling', name: 'Sizzling', sort_order: 2 } },
  { id: 'p-8', name: 'Sizzling Chicken Steak', price: 179, is_available: true, category_id: 'c-sizzling', category: { id: 'c-sizzling', name: 'Sizzling', sort_order: 2 } },
  { id: 'p-9', name: 'Sizzling Beef Tapa', price: 199, is_available: true, category_id: 'c-sizzling', category: { id: 'c-sizzling', name: 'Sizzling', sort_order: 2 } },
  { id: 'p-10', name: 'Sizzling Pork Chop', price: 169, is_available: true, category_id: 'c-sizzling', category: { id: 'c-sizzling', name: 'Sizzling', sort_order: 2 } },

  // Silog
  { id: 'p-11', name: 'Tapsilog Special', price: 149, is_available: true, category_id: 'c-silog', category: { id: 'c-silog', name: 'Silog', sort_order: 3 } },
  { id: 'p-12', name: 'Tocilog Delight', price: 139, is_available: true, category_id: 'c-silog', category: { id: 'c-silog', name: 'Silog', sort_order: 3 } },
  { id: 'p-13', name: 'Chicksilog Wing Meal', price: 149, is_available: true, category_id: 'c-silog', category: { id: 'c-silog', name: 'Silog', sort_order: 3 } },
  { id: 'p-14', name: 'Bangsilog Supreme', price: 159, is_available: true, category_id: 'c-silog', category: { id: 'c-silog', name: 'Silog', sort_order: 3 } },
  { id: 'p-15', name: 'Longsilog Classic', price: 129, is_available: true, category_id: 'c-silog', category: { id: 'c-silog', name: 'Silog', sort_order: 3 } },

  // Shake
  { id: 'p-16', name: 'Fresh Mango Shake', price: 89, is_available: true, category_id: 'c-shake', category: { id: 'c-shake', name: 'Shake', sort_order: 4 } },
  { id: 'p-17', name: 'Strawberry Milkshake', price: 89, is_available: true, category_id: 'c-shake', category: { id: 'c-shake', name: 'Shake', sort_order: 4 } },
  { id: 'p-18', name: 'Rich Chocolate Shake', price: 89, is_available: true, category_id: 'c-shake', category: { id: 'c-shake', name: 'Shake', sort_order: 4 } },
  { id: 'p-19', name: 'House Blend Iced Tea', price: 45, is_available: true, category_id: 'c-shake', category: { id: 'c-shake', name: 'Shake', sort_order: 4 } },
  { id: 'p-20', name: 'Bottomless Soda', price: 65, is_available: true, category_id: 'c-shake', category: { id: 'c-shake', name: 'Shake', sort_order: 4 } },

  // Burger
  { id: 'p-21', name: 'Classic Beef Burger', price: 119, is_available: true, category_id: 'c-burger', category: { id: 'c-burger', name: 'Burger', sort_order: 5 } },
  { id: 'p-22', name: 'Cheesy Bacon Burger', price: 159, is_available: true, category_id: 'c-burger', category: { id: 'c-burger', name: 'Burger', sort_order: 5 } },
  { id: 'p-23', name: 'Crispy Chicken Burger', price: 149, is_available: true, category_id: 'c-burger', category: { id: 'c-burger', name: 'Burger', sort_order: 5 } },
  { id: 'p-24', name: 'Double Smash Burger', price: 189, is_available: true, category_id: 'c-burger', category: { id: 'c-burger', name: 'Burger', sort_order: 5 } },

  // Fries & Pure Cheesestick
  { id: 'p-25', name: 'Pure Mozzarella Cheesesticks (6pcs)', price: 129, is_available: true, category_id: 'c-sticks', category: { id: 'c-sticks', name: 'Fries & Pure Cheesestick', sort_order: 6 } },
  { id: 'p-26', name: 'Crispy Golden Fries', price: 79, is_available: true, category_id: 'c-sticks', category: { id: 'c-sticks', name: 'Fries & Pure Cheesestick', sort_order: 6 } },
  { id: 'p-27', name: 'Loaded Cheese Fries', price: 99, is_available: true, category_id: 'c-sticks', category: { id: 'c-sticks', name: 'Fries & Pure Cheesestick', sort_order: 6 } },
  { id: 'p-28', name: 'Cheesestick & Fries Combo', price: 169, is_available: true, category_id: 'c-sticks', category: { id: 'c-sticks', name: 'Fries & Pure Cheesestick', sort_order: 6 } },
]

export default function PointOfSale() {
  const { profile } = useAuth()
  const [products, setProducts] = useState<Product[]>(FALLBACK_PRODUCTS)
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATS)
  const [cat, setCat] = useState('All')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [method, setMethod] = useState<'cash' | 'online'>('cash')
  const [notes, setNotes] = useState('')
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutSuccess, setCheckoutSuccess] = useState(false)
  const [orderNum, setOrderNum] = useState<number | null>(null)
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCashCalc, setShowCashCalc] = useState(false)
  const [showPayMongo, setShowPayMongo] = useState(false)
  const [lastCashReceived, setLastCashReceived] = useState<number | null>(null)
  const [lastChangeGiven, setLastChangeGiven] = useState<number | null>(null)
  /**
   * Whether the mobile cart sheet is expanded.
   *
   * On narrow screens the cart lives in a bottom sheet instead of a side rail,
   * so the checkout button stays within thumb reach no matter how long the
   * product list is.
   */
  const [cartSheetOpen, setCartSheetOpen] = useState(false)

  const fetchProducts = useCallback(async () => {
    try {
      const [prodsRes, catsRes] = await Promise.all([
        supabase
          .from('products')
          .select('*, category:product_categories(id, name, sort_order)')
          .eq('is_available', true)
          .order('name'),
        supabase
          .from('product_categories')
          .select('name')
          .order('sort_order'),
      ])

      if (prodsRes.data && prodsRes.data.length > 0) {
        setProducts(prodsRes.data as Product[])
      } else {
        setProducts(FALLBACK_PRODUCTS)
      }

      if (catsRes.data && catsRes.data.length > 0) {
        setCategories(['All', ...catsRes.data.map(c => c.name)])
      } else {
        setCategories(DEFAULT_CATS)
      }
    } catch {
      setProducts(FALLBACK_PRODUCTS)
      setCategories(DEFAULT_CATS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  // Handle returning from PayMongo online payment redirect (GCash / Maya QR scan)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const pmStatus = params.get('paymongo')
    if (pmStatus === 'success') {
      const savedRaw = localStorage.getItem('wingtrack_pending_pos_order')
      if (savedRaw) {
        try {
          const saved = JSON.parse(savedRaw)
          if (saved.cart && saved.cart.length > 0 && profile) {
            setCheckoutLoading(true)
            const chosenMethod = (saved.method === 'gcash' ? 'gcash' : 'card') as 'cash' | 'gcash' | 'card'
            apiCheckout({
              items: saved.cart.map((c: CartItem) => ({ product_id: c.id, quantity: c.qty })),
              payment_method: chosenMethod,
              notes: saved.notes || '',
            }).then(result => {
              setOrderNum(result.order_number)
              setCompletedOrder({
                id: result.id,
                order_number: result.order_number,
                cashier_id: profile.id,
                status: 'completed',
                payment_method: chosenMethod,
                subtotal: saved.subtotal,
                vat_amount: saved.vat,
                total_amount: saved.total,
                notes: saved.notes || '',
                created_at: new Date().toISOString(),
                order_items: saved.cart.map((c: CartItem) => ({
                  id: c.id,
                  order_id: result.id,
                  product_id: c.id,
                  product_name: c.name,
                  unit_price: c.price,
                  quantity: c.qty,
                  line_total: c.price * c.qty,
                })),
              })
              setCheckoutSuccess(true)
              setCart([])
              setNotes('')
              localStorage.removeItem('wingtrack_pending_pos_order')
              window.history.replaceState({}, '', window.location.pathname)
            }).catch(err => {
              setError(err instanceof Error ? err.message : 'Failed to finalize order after payment.')
              localStorage.removeItem('wingtrack_pending_pos_order')
              window.history.replaceState({}, '', window.location.pathname)
            }).finally(() => {
              setCheckoutLoading(false)
            })
          }
        } catch {
          localStorage.removeItem('wingtrack_pending_pos_order')
          window.history.replaceState({}, '', window.location.pathname)
        }
      } else {
        window.history.replaceState({}, '', window.location.pathname)
      }
    } else if (pmStatus === 'cancel') {
      const savedRaw = localStorage.getItem('wingtrack_pending_pos_order')
      if (savedRaw) {
        try {
          const saved = JSON.parse(savedRaw)
          if (saved.cart && saved.cart.length > 0) {
            setCart(saved.cart)
          }
        } catch {
          // ignore
        }
        localStorage.removeItem('wingtrack_pending_pos_order')
      }
      setError('Payment was cancelled on the payment portal.')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [profile])

  const filtered = products
    .filter(p => cat === 'All' || (p.category as unknown as ProductCategory)?.name === cat)
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  const addItem = (item: Product) => {
    setCart(prev => {
      const exists = prev.find(c => c.id === item.id)
      if (exists) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { ...item, qty: 1 }]
    })
  }

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(c => c.id === id ? { ...c, qty: c.qty + delta } : c).filter(c => c.qty > 0))
  }

  const removeItem = (id: string) => {
    setCart(prev => prev.filter(c => c.id !== id))
  }

  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0)
  const vat      = Math.round(subtotal * 0.12 * 100) / 100
  const total    = Math.round((subtotal + vat) * 100) / 100
  /** Total units in the cart (not the number of distinct lines). */
  const cartCount = cart.reduce((s, c) => s + c.qty, 0)

  // When "Charge" is clicked: route to appropriate payment flow
  function handleChargeClick() {
    if (cart.length === 0 || !profile) return
    if (method === 'cash') {
      setShowCashCalc(true)
    } else if (method === 'online') {
      setShowPayMongo(true)
    } else {
      executeCheckout()
    }
  }

  // Called after cash calc confirmation or directly for non-cash methods
  async function executeCheckout(cashReceived?: number, changeGiven?: number) {
    if (cart.length === 0 || !profile) return
    setShowCashCalc(false)
    setCheckoutLoading(true)
    setError(null)

    // Store cash info for the success modal
    if (cashReceived !== undefined && changeGiven !== undefined) {
      setLastCashReceived(cashReceived)
      setLastChangeGiven(changeGiven)
    } else {
      setLastCashReceived(null)
      setLastChangeGiven(null)
    }

    const currentCart = [...cart]
    try {
      const result = await apiCheckout({
        items: currentCart.map(c => ({ product_id: c.id, quantity: c.qty })),
        payment_method: (method === 'online' ? 'card' : 'cash') as 'cash' | 'gcash' | 'card',
        notes,
      })
      setOrderNum(result.order_number)
      setCompletedOrder({
        id: result.id,
        order_number: result.order_number,
        cashier_id: profile.id,
        status: 'completed',
        payment_method: (method === 'online' ? 'card' : 'cash') as 'cash' | 'gcash' | 'card',
        subtotal,
        vat_amount: vat,
        total_amount: total,
        notes,
        created_at: new Date().toISOString(),
        order_items: currentCart.map(c => ({
          id: c.id,
          order_id: result.id,
          product_id: c.id,
          product_name: c.name,
          unit_price: c.price,
          quantity: c.qty,
          line_total: c.price * c.qty,
        })),
      })
      setCheckoutSuccess(true)
      setCart([])
      setNotes('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
    } finally {
      setCheckoutLoading(false)
    }
  }

  /** Whether the clear-cart confirmation is showing. */
  const [showVoidConfirm, setShowVoidConfirm] = useState(false)

  function handleVoid() {
    setShowVoidConfirm(true)
  }

  function dismissSuccess() {
    setCheckoutSuccess(false)
    setOrderNum(null)
    setCompletedOrder(null)
    setShowReceipt(false)
    setLastCashReceived(null)
    setLastChangeGiven(null)
  }

  return (
    <div className="pos-shell">
      {/* Menu Panel */}
      <div className="pos-menu">
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontFamily: 'Fraunces', fontSize: 30, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>Point of Sale</h1>
          <p style={{ fontSize: 15, color: 'var(--muted-foreground)' }}>
            {new Date().toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · {profile?.full_name}
          </p>
        </div>

        {/* Search & Category filter */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 22, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            id="pos-search"
            className="input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products..."
            style={{ width: 220, maxWidth: '100%', padding: '9px 14px', fontSize: 13 }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {categories.map(c => (
              <button
                key={c}
                id={`pos-cat-${c.toLowerCase()}`}
                onClick={() => setCat(c)}
                style={{
                  padding: '8px 18px', borderRadius: 24, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  border: '1px solid var(--border)', transition: 'all 0.15s',
                  background: cat === c ? 'var(--primary)' : 'var(--card)',
                  color: cat === c ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {filtered.map(item => {
              const inCart = cart.find(c => c.id === item.id)
              const catName = (item.category as unknown as ProductCategory)?.name ?? ''
              return (
                <button
                  key={item.id}
                  id={`pos-item-${item.id}`}
                  onClick={() => addItem(item)}
                  style={{
                    background: inCart ? 'rgba(234,88,12,0.08)' : 'var(--card)',
                    border: `1px solid ${inCart ? 'var(--primary)' : 'var(--border)'}`,
                    borderRadius: 14, padding: '22px 20px', cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                >
                  <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 10, fontFamily: 'DM Mono', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{catName}</p>
                  <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--foreground)', lineHeight: 1.3, marginBottom: 14 }}>{item.name}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 18, fontFamily: 'DM Mono', fontWeight: 700, color: 'var(--primary)' }}>&#8369;{Number(item.price).toFixed(2)}</span>
                    {inCart && <span style={{ fontSize: 13, background: 'var(--primary)', color: 'var(--primary-foreground)', borderRadius: 12, padding: '4px 12px', fontWeight: 700 }}>x{inCart.qty}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Cart Panel */}
      {/*
        Layout (display/height/border) lives in `.pos-cart` in index.css, NOT in
        an inline style — inline styles outrank media queries, which would stop
        the ≤767px `display: none` rule from ever applying.
      */}
      <div
        className="pos-cart"
        style={{
          background: 'var(--sidebar)',
        }}
      >
        <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontFamily: 'Fraunces', fontSize: 20, fontWeight: 600, color: 'var(--sidebar-foreground)' }}>Current Order</h2>
            <p style={{ fontSize: 13, color: 'var(--sidebar-muted)', marginTop: 2, fontFamily: 'DM Mono' }}>{cart.length} item{cart.length !== 1 ? 's' : ''}</p>
          </div>
          <div style={{ textAlign: 'right', background: 'rgba(255,255,255,0.08)', padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)' }}>
            <span style={{ fontSize: 11, color: 'var(--sidebar-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', fontFamily: 'DM Mono', fontWeight: 500 }}>Cashier</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--sidebar-active)' }}>{profile?.full_name ?? 'Staff'}</span>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 18px' }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--sidebar-muted)' }}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', margin: '0 auto 14px', opacity: 0.75 }}>
                <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
              <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--sidebar-foreground)' }}>No items yet</p>
              <p style={{ fontSize: 13, marginTop: 5, color: 'var(--sidebar-muted)' }}>Tap menu items to add</p>
            </div>
          ) : cart.map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--sidebar-foreground)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                <p style={{ fontSize: 14, fontFamily: 'DM Mono', color: 'var(--sidebar-active)', marginTop: 3, fontWeight: 500 }}>&#8369;{(item.price * item.qty).toLocaleString()}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button id={`cart-dec-${item.id}`} onClick={() => updateQty(item.id, -1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.05)', color: 'var(--sidebar-foreground)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>-</button>
                <span style={{ fontSize: 14, fontFamily: 'DM Mono', color: 'var(--sidebar-foreground)', minWidth: 22, textAlign: 'center', fontWeight: 600 }}>{item.qty}</span>
                <button id={`cart-inc-${item.id}`} onClick={() => updateQty(item.id, 1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.05)', color: 'var(--sidebar-foreground)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                <button
                  id={`cart-remove-${item.id}`}
                  onClick={() => removeItem(item.id)}
                  title="Remove item"
                  style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(255,100,100,0.25)', background: 'rgba(185,28,28,0.1)', color: '#fca5a5', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', marginLeft: 2 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(185,28,28,0.3)'; (e.currentTarget as HTMLElement).style.color = '#fecaca' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(185,28,28,0.1)'; (e.currentTarget as HTMLElement).style.color = '#fca5a5' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Totals & Checkout */}
        <div style={{ padding: '14px 20px 18px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          {error && (
            <div style={{ background: 'rgba(185,28,28,0.25)', border: '1px solid rgba(185,28,28,0.5)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#fca5a5', marginBottom: 10 }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            {[['Subtotal', `\u20B1${subtotal.toLocaleString()}`], ['VAT (12%)', `\u20B1${vat.toLocaleString()}`]].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 13, color: 'var(--sidebar-muted)' }}>{k}</span>
                <span style={{ fontSize: 13, fontFamily: 'DM Mono', color: 'var(--sidebar-foreground)', fontWeight: 500 }}>{v}</span>
              </div>
            ))}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '10px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--sidebar-foreground)', fontFamily: 'Fraunces' }}>Total</span>
              <span style={{ fontSize: 19, fontFamily: 'DM Mono', fontWeight: 700, color: 'var(--sidebar-active)' }}>&#8369;{total.toLocaleString()}</span>
            </div>
          </div>

          {/* Notes */}
          <textarea
            className="sidebar-textarea"
            placeholder="Order notes (optional)..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={1}
            style={{
              width: '100%', resize: 'none', marginBottom: 12,
              padding: '10px 12px', borderRadius: 6, height: 40,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--sidebar-foreground)',
              fontSize: 13, fontFamily: 'DM Sans', outline: 'none',
            }}
          />

          {/* Payment method */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {/* Cash */}
            <button
              id="pos-pay-cash"
              onClick={() => setMethod('cash')}
              style={{
                flex: 1, padding: '9px 4px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${method === 'cash' ? 'var(--sidebar-active)' : 'rgba(255,255,255,0.18)'}`,
                background: method === 'cash' ? 'rgba(240,155,58,0.22)' : 'rgba(255,255,255,0.04)',
                color: method === 'cash' ? 'var(--sidebar-active)' : 'var(--sidebar-muted)',
              }}
            >
              Cash
            </button>
            {/* Online payment via PayMongo (Card, GCash, Maya) */}
            <button
              id="pos-pay-online"
              onClick={() => setMethod('online')}
              style={{
                flex: 1, padding: '9px 4px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${method === 'online' ? '#818cf8' : 'rgba(255,255,255,0.18)'}`,
                background: method === 'online' ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.04)',
                color: method === 'online' ? '#a5b4fc' : 'var(--sidebar-muted)',
              }}
            >
              Online
            </button>
          </div>

          <button
            id="btn-checkout"
            disabled={cart.length === 0 || checkoutLoading}
            onClick={handleChargeClick}
            style={{
              width: '100%', padding: '14px', borderRadius: 8, fontSize: 16, fontWeight: 700,
              cursor: cart.length && !checkoutLoading ? 'pointer' : 'not-allowed',
              background: cart.length ? 'var(--sidebar-active)' : 'rgba(255,255,255,0.08)',
              color: cart.length ? '#1c0f06' : 'rgba(255,255,255,0.45)',
              border: 'none', fontFamily: 'Fraunces', transition: 'all 0.15s',
            }}
          >
            {checkoutLoading
              ? 'Processing...'
              : cart.length
              ? `Charge \u20B1${total.toLocaleString()}`
              : 'Add items to continue'}
          </button>

          {cart.length > 0 && (
            <button
              id="btn-void"
              onClick={handleVoid}
              style={{ width: '100%', marginTop: 8, padding: '9px', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6, fontSize: 13, color: 'var(--sidebar-muted)', cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fca5a5'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(252,165,165,0.3)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.14)' }}
            >
              Void Order
            </button>
          )}
        </div>
      </div>

      {/* ── Mobile sticky cart bar ─────────────────────────────
          Always visible at the bottom of the screen on narrow viewports, so
          the cashier can reach checkout without scrolling past the menu.
          Hidden on desktop, where the side rail is always in view. */}
      <div className="pos-mobile-bar">
        <button
          type="button"
          id="btn-mobile-cart"
          onClick={() => setCartSheetOpen(true)}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 12,
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: '4px 2px', textAlign: 'left', minWidth: 0,
          }}
        >
          <span style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--sidebar-foreground)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            {cartCount > 0 && (
              <span
                style={{
                  position: 'absolute', top: -5, right: -7,
                  minWidth: 18, height: 18, padding: '0 5px',
                  borderRadius: 9, background: 'var(--sidebar-active)', color: '#1c0f06',
                  fontSize: 11, fontWeight: 700, fontFamily: 'DM Mono',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {cartCount}
              </span>
            )}
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--sidebar-muted)', fontFamily: 'DM Mono', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {cartCount === 0 ? 'Cart empty' : `${cartCount} item${cartCount === 1 ? '' : 's'}`}
            </span>
            <span style={{ display: 'block', fontSize: 17, fontWeight: 700, color: 'var(--sidebar-active)', fontFamily: 'DM Mono', lineHeight: 1.25 }}>
              &#8369;{total.toLocaleString()}
            </span>
          </span>
        </button>

        <button
          type="button"
          id="btn-mobile-checkout"
          disabled={cartCount === 0 || checkoutLoading}
          onClick={() => (cartCount === 0 ? setCartSheetOpen(true) : handleChargeClick())}
          style={{
            flexShrink: 0, padding: '13px 22px', borderRadius: 9, border: 'none',
            fontSize: 15, fontWeight: 700, fontFamily: 'Fraunces',
            cursor: cartCount === 0 || checkoutLoading ? 'not-allowed' : 'pointer',
            background: cartCount ? 'var(--sidebar-active)' : 'rgba(255,255,255,0.08)',
            color: cartCount ? '#1c0f06' : 'rgba(255,255,255,0.45)',
            transition: 'all 0.15s',
          }}
        >
          {checkoutLoading ? 'Processing…' : cartCount === 0 ? 'View cart' : 'Charge'}
        </button>
      </div>

      {/* ── Mobile cart sheet ─────────────────────────────────
          Full cart contents, notes and payment method, presented as a
          bottom sheet so nothing needs its own scroll to reach. */}
      {cartSheetOpen && createPortal(
        <div
          className="pos-sheet-backdrop"
          onClick={e => { if (e.target === e.currentTarget) setCartSheetOpen(false) }}
        >
          <div className="pos-sheet" role="dialog" aria-modal="true" aria-label="Current order">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
              <div>
                <h2 style={{ fontFamily: 'Fraunces', fontSize: 19, fontWeight: 600, color: 'var(--sidebar-foreground)' }}>Current Order</h2>
                <p style={{ fontSize: 12.5, color: 'var(--sidebar-muted)', marginTop: 2, fontFamily: 'DM Mono' }}>
                  {cartCount} item{cartCount === 1 ? '' : 's'} · &#8369;{total.toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCartSheetOpen(false)}
                aria-label="Close cart"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--sidebar-muted)', padding: 8, display: 'flex' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Cart lines — the only scrolling region in the sheet */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 18px' }}>
              {cartCount === 0 ? (
                <div style={{ textAlign: 'center', padding: '44px 20px', color: 'var(--sidebar-muted)' }}>
                  <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--sidebar-foreground)' }}>No items yet</p>
                  <p style={{ fontSize: 13, marginTop: 5 }}>Tap menu items to add them</p>
                </div>
              ) : cart.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--sidebar-foreground)', lineHeight: 1.3 }}>{item.name}</p>
                    <p style={{ fontSize: 14, fontFamily: 'DM Mono', color: 'var(--sidebar-active)', marginTop: 3, fontWeight: 500 }}>&#8369;{(item.price * item.qty).toLocaleString()}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button type="button" onClick={() => updateQty(item.id, -1)} aria-label={`Decrease ${item.name}`} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.05)', color: 'var(--sidebar-foreground)', fontSize: 17, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>-</button>
                    <span style={{ fontSize: 14, fontFamily: 'DM Mono', color: 'var(--sidebar-foreground)', minWidth: 22, textAlign: 'center', fontWeight: 600 }}>{item.qty}</span>
                    <button type="button" onClick={() => updateQty(item.id, 1)} aria-label={`Increase ${item.name}`} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.05)', color: 'var(--sidebar-foreground)', fontSize: 17, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                    <button type="button" onClick={() => removeItem(item.id)} aria-label={`Remove ${item.name}`} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid rgba(252,165,165,0.3)', background: 'transparent', color: '#fca5a5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals + payment + checkout — pinned to the bottom of the sheet */}
            <div style={{ padding: '14px 18px calc(16px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
              {error && (
                <div style={{ background: 'rgba(185,28,28,0.25)', border: '1px solid rgba(185,28,28,0.5)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#fca5a5', marginBottom: 10 }}>
                  {error}
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                {[['Subtotal', `\u20B1${subtotal.toLocaleString()}`], ['VAT (12%)', `\u20B1${vat.toLocaleString()}`]].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 13, color: 'var(--sidebar-muted)' }}>{k}</span>
                    <span style={{ fontSize: 13, fontFamily: 'DM Mono', color: 'var(--sidebar-foreground)', fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
                <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '10px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--sidebar-foreground)', fontFamily: 'Fraunces' }}>Total</span>
                  <span style={{ fontSize: 19, fontFamily: 'DM Mono', fontWeight: 700, color: 'var(--sidebar-active)' }}>&#8369;{total.toLocaleString()}</span>
                </div>
              </div>

              <textarea
                className="sidebar-textarea"
                placeholder="Order notes (optional)..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={1}
                style={{
                  width: '100%', resize: 'none', marginBottom: 12,
                  padding: '10px 12px', borderRadius: 6, height: 40,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.06)',
                  color: 'var(--sidebar-foreground)',
                  fontSize: 16, fontFamily: 'DM Sans', outline: 'none',
                }}
              />

              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => setMethod('cash')}
                  style={{
                    flex: 1, padding: '11px 4px', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${method === 'cash' ? 'var(--sidebar-active)' : 'rgba(255,255,255,0.18)'}`,
                    background: method === 'cash' ? 'rgba(240,155,58,0.22)' : 'rgba(255,255,255,0.04)',
                    color: method === 'cash' ? 'var(--sidebar-active)' : 'var(--sidebar-muted)',
                  }}
                >
                  Cash
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('online')}
                  style={{
                    flex: 1, padding: '11px 4px', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${method === 'online' ? '#818cf8' : 'rgba(255,255,255,0.18)'}`,
                    background: method === 'online' ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.04)',
                    color: method === 'online' ? '#a5b4fc' : 'var(--sidebar-muted)',
                  }}
                >
                  Online
                </button>
              </div>

              <button
                type="button"
                disabled={cartCount === 0 || checkoutLoading}
                onClick={() => { setCartSheetOpen(false); handleChargeClick() }}
                style={{
                  width: '100%', padding: '15px', borderRadius: 8, fontSize: 16, fontWeight: 700,
                  cursor: cartCount && !checkoutLoading ? 'pointer' : 'not-allowed',
                  background: cartCount ? 'var(--sidebar-active)' : 'rgba(255,255,255,0.08)',
                  color: cartCount ? '#1c0f06' : 'rgba(255,255,255,0.45)',
                  border: 'none', fontFamily: 'Fraunces', transition: 'all 0.15s',
                }}
              >
                {checkoutLoading
                  ? 'Processing...'
                  : cartCount
                  ? `Charge \u20B1${total.toLocaleString()}`
                  : 'Add items to continue'}
              </button>

              {cartCount > 0 && (
                <button
                  type="button"
                  onClick={() => { setCartSheetOpen(false); handleVoid() }}
                  style={{ width: '100%', marginTop: 8, padding: '11px', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6, fontSize: 13.5, color: 'var(--sidebar-muted)', cursor: 'pointer' }}
                >
                  Void Order
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Success Modal — rendered via portal to escape transform containing block */}
      {checkoutSuccess && createPortal(
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
            zIndex: 9999,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) dismissSuccess() }}
        >
          <div className="card fade-in" style={{ padding: '36px 32px', maxWidth: 400, width: '90%', textAlign: 'center', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ width: 58, height: 58, borderRadius: '50%', background: '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h2 style={{ fontFamily: 'Fraunces', fontSize: 22, fontWeight: 700, color: 'var(--foreground)', marginBottom: 8 }}>Payment Received</h2>
            <p style={{ fontSize: 14, color: 'var(--muted-foreground)', marginBottom: 4 }}>Order #{orderNum} completed</p>
            {lastCashReceived !== null && lastChangeGiven !== null && (
              <div style={{ background: 'var(--muted)', borderRadius: 10, padding: '14px 18px', margin: '14px 0', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Cash Received</span>
                  <span style={{ fontSize: 14, fontFamily: 'DM Mono', fontWeight: 600, color: 'var(--foreground)' }}>₱{lastCashReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Change Given</span>
                  <span style={{ fontSize: 14, fontFamily: 'DM Mono', fontWeight: 700, color: lastChangeGiven > 0 ? 'var(--success)' : 'var(--foreground)' }}>₱{lastChangeGiven.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            )}
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 22 }}>Inventory has been updated automatically.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                id="btn-pos-print-receipt"
                onClick={() => setShowReceipt(true)}
                style={{
                  width: '100%', padding: '12px', fontSize: 14, fontWeight: 600,
                  borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)',
                  color: 'var(--foreground)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9"/>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                  <rect x="6" y="14" width="12" height="8"/>
                </svg>
                View / Print Receipt
              </button>
              <button id="btn-new-order" className="btn-primary" onClick={dismissSuccess} style={{ width: '100%', padding: '13px', fontSize: 15 }}>
                New Order
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Cash Payment Calculator Modal */}
      {showCashCalc && (
        <CashPaymentCalculator
          total={total}
          onConfirm={(cashReceived, change) => executeCheckout(cashReceived, change)}
          onCancel={() => setShowCashCalc(false)}
        />
      )}

      {/* PayMongo Online Payment Modal (Sandbox) */}
      {showPayMongo && (
        <PayMongoModal
          total={total}
          subtotal={subtotal}
          vat={vat}
          notes={notes}
          cartItems={cart.map(c => ({ id: c.id, name: c.name, price: c.price, qty: c.qty }))}
          orderDescription={`WINGTRACK Order — ${cart.length} item${cart.length !== 1 ? 's' : ''}`}
          onSuccess={(_intentId) => {
            setShowPayMongo(false)
            executeCheckout()
          }}
          onCancel={() => setShowPayMongo(false)}
        />
      )}

      {/* Printable Receipt Modal */}
      {showReceipt && completedOrder && (
        <ReceiptModal order={completedOrder} onClose={() => setShowReceipt(false)} />
      )}

      {/* Clear cart confirmation */}
      <ConfirmDialog
        open={showVoidConfirm}
        tone="danger"
        title="Clear this order?"
        message={`All ${cart.length} item${cart.length !== 1 ? 's' : ''} will be removed from the current cart. Nothing is charged, and inventory is not affected.`}
        confirmLabel="Clear cart"
        onConfirm={() => { setCart([]); setShowVoidConfirm(false) }}
        onCancel={() => setShowVoidConfirm(false)}
      />
    </div>
  )
}

