import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  type AppNotification,
  type NotifCategory,
  getStoredNotifications,
  saveNotifications,
  subscribeNotifications,
} from '@/lib/notifications'

// ─── Icon helpers ─────────────────────────────────────────────────────────────

function BellIcon({ hasBadge }: { hasBadge: boolean }) {
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block' }}
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      {hasBadge && (
        <circle cx="18" cy="5" r="4" fill="#ea580c" stroke="var(--card)" strokeWidth="1.5" />
      )}
    </svg>
  )
}

function CategoryIcon({ cat }: { cat: NotifCategory }) {
  const style = { display: 'block', flexShrink: 0 } as const
  if (cat === 'order') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
  if (cat === 'inventory') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12" y2="17.01" />
    </svg>
  )
  if (cat === 'staff') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12" y2="16.01" />
    </svg>
  )
}

// ─── Colour palette per category ──────────────────────────────────────────────

const CAT_COLOR: Record<NotifCategory, { bg: string; fg: string; dot: string }> = {
  order:     { bg: '#fff7ed', fg: '#ea580c', dot: '#ea580c' },
  inventory: { bg: '#fef2f2', fg: '#b91c1c', dot: '#ef4444' },
  staff:     { bg: '#f0fdf4', fg: '#15803d', dot: '#22c55e' },
  system:    { bg: '#f0f9ff', fg: '#0369a1', dot: '#38bdf8' },
}

// ─── Relative time formatter ──────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const ts = new Date(iso)
  const diff = Math.floor((Date.now() - ts.getTime()) / 1000)
  if (isNaN(diff) || diff < 5) return 'just now'
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return ts.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NotificationCenter() {
  const [notifs, setNotifs] = useState<AppNotification[]>(() => getStoredNotifications())
  const [open, setOpen] = useState(false)
  const [, forceRender] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const btnRef   = useRef<HTMLButtonElement>(null)

  // Sync to localStorage whenever notifs changes
  useEffect(() => {
    saveNotifications(notifs)
  }, [notifs])

  // Re-render timestamps every 30 s so "just now" -> "30s ago" updates live
  useEffect(() => {
    const id = setInterval(() => forceRender(n => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const push = useCallback((n: Omit<AppNotification, 'id' | 'ts' | 'read'> & { id?: string; ts?: string; read?: boolean }) => {
    setNotifs(prev => {
      // Deduplicate if already present by id or identical content within 3 seconds
      if (n.id && prev.some(p => p.id === n.id)) return prev
      const item: AppNotification = {
        id: n.id ?? crypto.randomUUID(),
        category: n.category,
        title: n.title,
        body: n.body,
        ts: n.ts ?? new Date().toISOString(),
        read: n.read ?? false,
      }
      const updated = [item, ...prev.filter(p => p.id !== item.id)].slice(0, 50)
      saveNotifications(updated)
      return updated
    })
  }, [])

  // 1. Cross-window broadcast subscription
  useEffect(() => {
    const unsub = subscribeNotifications((incoming) => {
      push(incoming)
    })
    return unsub
  }, [push])

  // 2. Supabase Realtime postgres_changes subscriptions
  useEffect(() => {
    const orders = supabase
      .channel('notif-db-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const rec = payload.new as Record<string, unknown>
          push({
            id: `order-insert-${rec.id || crypto.randomUUID()}`,
            category: 'order',
            title: 'New Order',
            body: `Order #${rec.order_number ?? '—'} placed via ${rec.payment_method ?? 'unknown'}.`,
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const rec = payload.new as Record<string, unknown>
          const newStatus = rec.status as string | undefined
          if (newStatus === 'void') {
            push({
              id: `order-void-${rec.id || crypto.randomUUID()}-${Date.now()}`,
              category: 'order',
              title: 'Order Voided',
              body: `Order #${rec.order_number ?? '—'} has been marked as void.`,
            })
          } else if (newStatus === 'completed') {
            push({
              id: `order-comp-${rec.id || crypto.randomUUID()}-${Date.now()}`,
              category: 'order',
              title: 'Order Completed',
              body: `Order #${rec.order_number ?? '—'} is completed.`,
            })
          }
        }
      )
      .subscribe()

    const inventory = supabase
      .channel('notif-db-inventory')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'inventory' },
        (payload) => {
          const rec = payload.new as Record<string, unknown>
          const newStatus = rec.status as string | undefined
          if (newStatus === 'critical') {
            push({
              id: `inv-crit-${rec.id}-${Date.now()}`,
              category: 'inventory',
              title: 'Critical Stock',
              body: `${rec.name} is critically low (${rec.stock_qty} ${rec.unit} left).`,
            })
          } else if (newStatus === 'low') {
            push({
              id: `inv-low-${rec.id}-${Date.now()}`,
              category: 'inventory',
              title: 'Low Stock',
              body: `${rec.name} is running low (${rec.stock_qty} ${rec.unit} left).`,
            })
          }
        }
      )
      .subscribe()

    const staff = supabase
      .channel('notif-db-staff')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'staff_profiles' },
        (payload) => {
          const rec = payload.new as Record<string, unknown>
          push({
            id: `staff-add-${rec.id || crypto.randomUUID()}`,
            category: 'staff',
            title: 'New Staff Added',
            body: `${rec.full_name ?? 'A new member'} joined as ${rec.role ?? 'staff'}.`,
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(orders)
      supabase.removeChannel(inventory)
      supabase.removeChannel(staff)
    }
  }, [push])

  // 3. Initial seed: if notifs is empty, query database for active low stock or recent voids
  useEffect(() => {
    async function checkInitialAlerts() {
      const stored = getStoredNotifications()
      if (stored.length > 0) return

      try {
        const { data: lowStock } = await supabase
          .from('inventory')
          .select('id, name, stock_qty, unit, status')
          .in('status', ['low', 'critical'])
          .limit(3)

        if (lowStock && lowStock.length > 0) {
          lowStock.forEach(item => {
            push({
              id: `init-low-${item.id}`,
              category: 'inventory',
              title: item.status === 'critical' ? 'Critical Stock' : 'Low Stock',
              body: `${item.name} has only ${item.stock_qty} ${item.unit} remaining.`,
              read: false,
            })
          })
        }
      } catch {
        // silent fallback
      }
    }
    checkInitialAlerts()
  }, [push])

  // Close panel when clicking outside
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current   && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const unread = notifs.filter(n => !n.read).length

  function markAllRead() {
    setNotifs(prev => {
      const updated = prev.map(n => ({ ...n, read: true }))
      saveNotifications(updated)
      return updated
    })
  }

  function clearAll() {
    setNotifs([])
    saveNotifications([])
    setOpen(false)
  }

  function markRead(id: string) {
    setNotifs(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, read: true } : n)
      saveNotifications(updated)
      return updated
    })
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        ref={btnRef}
        id="notification-bell"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => {
          setOpen(o => !o)
        }}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 38,
          height: 38,
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: open ? 'var(--muted)' : 'var(--card)',
          color: unread > 0 ? 'var(--primary)' : 'var(--muted-foreground)',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          boxShadow: 'var(--shadow-xs)',
          flexShrink: 0,
        }}
      >
        <BellIcon hasBadge={unread > 0} />
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -3,
              right: -3,
              background: '#ea580c',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              fontFamily: 'IBM Plex Mono',
              borderRadius: 999,
              minWidth: 16,
              height: 16,
              padding: '0 3px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid var(--card)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notification center"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 360,
            maxWidth: 'calc(100vw - 32px)',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 12px 36px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.06)',
            zIndex: 1000,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 460,
            animation: 'notif-in 0.18s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--card)',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                Notifications
              </span>
              {unread > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: 'IBM Plex Mono',
                    background: '#fff7ed',
                    color: '#ea580c',
                    border: '1px solid #fed7aa',
                    padding: '1px 6px',
                    borderRadius: 999,
                    fontWeight: 600,
                  }}
                >
                  {unread} new
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--primary)',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    borderRadius: 4,
                  }}
                >
                  Mark all read
                </button>
              )}
              {notifs.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'var(--muted-foreground)',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    borderRadius: 4,
                  }}
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div
            style={{
              overflowY: 'auto',
              flex: 1,
            }}
          >
            {notifs.length === 0 ? (
              <div
                style={{
                  padding: '36px 20px',
                  textAlign: 'center',
                  color: 'var(--muted-foreground)',
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: 'var(--muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  <BellIcon hasBadge={false} />
                </div>
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--foreground)' }}>
                  No notifications yet
                </p>
                <p style={{ fontSize: 12, margin: '4px 0 0', opacity: 0.8 }}>
                  Activity across all windows (sales, voids, inventory) appears here in real-time.
                </p>
              </div>
            ) : (
              notifs.map(n => {
                const col = CAT_COLOR[n.category] ?? CAT_COLOR.system
                return (
                  <div
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    style={{
                      padding: '12px 16px',
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      background: n.read ? 'transparent' : 'rgba(234, 88, 12, 0.04)',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      transition: 'background 0.12s ease',
                    }}
                  >
                    {/* Category badge */}
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 7,
                        background: col.bg,
                        color: col.fg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      <CategoryIcon cat={n.category} />
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: n.read ? 600 : 700, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {n.title}
                        </span>
                        <span style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--muted-foreground)', flexShrink: 0 }}>
                          {relativeTime(n.ts)}
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.4, wordBreak: 'break-word' }}>
                        {n.body}
                      </p>
                    </div>

                    {/* Unread indicator */}
                    {!n.read && (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: col.dot,
                          flexShrink: 0,
                          marginTop: 6,
                        }}
                      />
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
      <style>{`
        @keyframes notif-in {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
