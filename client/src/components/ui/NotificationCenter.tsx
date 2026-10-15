import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type NotifCategory = 'order' | 'inventory' | 'staff' | 'system'

interface Notification {
  id: string
  category: NotifCategory
  title: string
  body: string
  ts: Date
  read: boolean
}

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

function relativeTime(ts: Date): string {
  const diff = Math.floor((Date.now() - ts.getTime()) / 1000)
  if (diff < 5)    return 'just now'
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return ts.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NotificationCenter() {
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [, forceRender] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const btnRef   = useRef<HTMLButtonElement>(null)

  // Re-render timestamps every 30 s so "just now" -> "30s ago" updates live
  useEffect(() => {
    const id = setInterval(() => forceRender(n => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const push = useCallback((n: Omit<Notification, 'id' | 'ts' | 'read'>) => {
    setNotifs(prev => [
      { ...n, id: crypto.randomUUID(), ts: new Date(), read: false },
      ...prev.slice(0, 49),   // cap at 50
    ])
  }, [])

  // ── Supabase Realtime subscriptions ─────────────────────────────────────────
  useEffect(() => {
    // Orders channel
    const orders = supabase
      .channel('notif-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const rec = payload.new as Record<string, unknown>
          push({
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
          const old = payload.old as Record<string, unknown>
          if (rec.status !== old.status) {
            const verb =
              rec.status === 'completed' ? 'Completed' :
              rec.status === 'void'      ? 'Voided'    : 'Updated'
            push({
              category: 'order',
              title: `Order ${verb}`,
              body: `Order #${rec.order_number ?? '—'} is now ${rec.status}.`,
            })
          }
        }
      )
      .subscribe()

    // Inventory channel
    const inventory = supabase
      .channel('notif-inventory')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'inventory' },
        (payload) => {
          const rec = payload.new as Record<string, unknown>
          const old = payload.old as Record<string, unknown>
          if (rec.status !== old.status) {
            if (rec.status === 'critical') {
              push({
                category: 'inventory',
                title: 'Critical Stock',
                body: `${rec.name} is critically low (${rec.stock_qty} ${rec.unit} left).`,
              })
            } else if (rec.status === 'low') {
              push({
                category: 'inventory',
                title: 'Low Stock',
                body: `${rec.name} is running low (${rec.stock_qty} ${rec.unit} left).`,
              })
            } else if (old.status === 'low' || old.status === 'critical') {
              push({
                category: 'inventory',
                title: 'Stock Restocked',
                body: `${rec.name} is back to healthy levels.`,
              })
            }
          }
          // Restock — qty goes up while staying at ok
          if (
            typeof rec.stock_qty === 'number' &&
            typeof old.stock_qty === 'number' &&
            rec.stock_qty > (old.stock_qty as number) &&
            rec.status === 'ok' &&
            old.status === 'ok'
          ) {
            push({
              category: 'inventory',
              title: 'Inventory Restocked',
              body: `${rec.name} restocked to ${rec.stock_qty} ${rec.unit}.`,
            })
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inventory_movements' },
        (payload) => {
          const rec = payload.new as Record<string, unknown>
          if (rec.movement_type === 'waste') {
            push({
              category: 'inventory',
              title: 'Waste Recorded',
              body: `A waste entry of ${Math.abs(Number(rec.qty_change))} units was logged.`,
            })
          }
        }
      )
      .subscribe()

    // Staff channel
    const staff = supabase
      .channel('notif-staff')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'staff_profiles' },
        (payload) => {
          const rec = payload.new as Record<string, unknown>
          push({
            category: 'staff',
            title: 'New Staff Added',
            body: `${rec.full_name ?? 'A new member'} joined as ${rec.role ?? 'staff'}.`,
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'staff_profiles' },
        (payload) => {
          const rec = payload.new as Record<string, unknown>
          const old = payload.old as Record<string, unknown>
          if (rec.is_active !== old.is_active) {
            push({
              category: 'staff',
              title: rec.is_active ? 'Staff Reactivated' : 'Staff Deactivated',
              body: `${rec.full_name ?? 'Staff'} has been ${rec.is_active ? 'reactivated' : 'deactivated'}.`,
            })
          }
          if (rec.role !== old.role) {
            push({
              category: 'staff',
              title: 'Role Changed',
              body: `${rec.full_name ?? 'Staff'} role changed to ${rec.role}.`,
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(orders)
      supabase.removeChannel(inventory)
      supabase.removeChannel(staff)
    }
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
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
  }

  function clearAll() {
    setNotifs([])
    setOpen(false)
  }

  function markRead(id: string) {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
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
          if (!open && unread > 0) markAllRead()
        }}
        style={{
          position: 'relative',
          width: 38, height: 38,
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: open ? 'var(--primary)' : 'var(--card)',
          color: open ? 'var(--primary-foreground)' : 'var(--foreground)',
          display: 'grid', placeItems: 'center',
          cursor: 'pointer',
          boxShadow: open ? 'var(--shadow-brand)' : 'var(--shadow-xs)',
          transition: 'all 150ms ease',
          flexShrink: 0,
        }}
      >
        <BellIcon hasBadge={unread > 0} />
        {unread > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -4, right: -4,
              minWidth: 17, height: 17,
              borderRadius: 99,
              background: '#ea580c',
              border: '2px solid var(--background)',
              fontSize: 10,
              fontWeight: 700,
              fontFamily: 'Inter',
              color: '#fff',
              display: 'grid', placeItems: 'center',
              padding: '0 3px',
              lineHeight: 1,
            }}
          >
            {unread > 99 ? '99+' : unread}
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
            top: 'calc(100% + 10px)',
            right: 0,
            width: 360,
            maxHeight: 520,
            borderRadius: 14,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 200,
            animation: 'notif-panel-in 160ms cubic-bezier(0.16,1,0.3,1) both',
          }}
        >
          {/* Panel header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px 12px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Inter', color: 'var(--foreground)' }}>
                Notifications
              </span>
              {notifs.length > 0 && (
                <span style={{
                  fontSize: 11, fontFamily: 'IBM Plex Mono', fontWeight: 600,
                  background: 'var(--muted)', color: 'var(--muted-foreground)',
                  padding: '1px 7px', borderRadius: 99,
                }}>
                  {notifs.length}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {notifs.some(n => !n.read) && (
                <button
                  onClick={markAllRead}
                  style={{
                    fontSize: 11, fontFamily: 'Inter', fontWeight: 500,
                    color: 'var(--primary)', background: 'none', border: 'none',
                    cursor: 'pointer', padding: '3px 8px', borderRadius: 6,
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  Mark all read
                </button>
              )}
              {notifs.length > 0 && (
                <button
                  onClick={clearAll}
                  style={{
                    fontSize: 11, fontFamily: 'Inter', fontWeight: 500,
                    color: 'var(--muted-foreground)', background: 'none', border: 'none',
                    cursor: 'pointer', padding: '3px 8px', borderRadius: 6,
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Notification list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifs.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 10, padding: '40px 20px',
                color: 'var(--muted-foreground)',
              }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity={0.4}>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <p style={{ fontSize: 13, fontFamily: 'Inter', fontWeight: 500, margin: 0 }}>All caught up!</p>
                <p style={{ fontSize: 12, margin: 0, opacity: 0.7 }}>New activity will appear here in real time.</p>
              </div>
            ) : (
              notifs.map(n => {
                const colors = CAT_COLOR[n.category]
                return (
                  <div
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '28px 1fr auto',
                      gap: '0 10px',
                      alignItems: 'start',
                      padding: '11px 16px',
                      borderBottom: '1px solid var(--muted)',
                      cursor: 'default',
                      background: n.read ? 'transparent' : `${colors.fg}06`,
                      transition: 'background 120ms',
                      position: 'relative',
                    }}
                    onMouseEnter={e => { if (n.read) e.currentTarget.style.background = 'var(--muted)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = n.read ? 'transparent' : `${colors.fg}06` }}
                  >
                    {/* Unread dot */}
                    {!n.read && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute', left: 5, top: '50%', transform: 'translateY(-50%)',
                          width: 6, height: 6, borderRadius: '50%',
                          background: colors.dot,
                        }}
                      />
                    )}

                    {/* Category icon bubble */}
                    <span style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: colors.bg, color: colors.fg,
                      display: 'grid', placeItems: 'center', flexShrink: 0,
                      marginTop: 1,
                    }}>
                      <CategoryIcon cat={n.category} />
                    </span>

                    {/* Text */}
                    <div style={{ minWidth: 0 }}>
                      <p style={{
                        fontSize: 13, fontWeight: n.read ? 500 : 600,
                        fontFamily: 'Inter', color: 'var(--foreground)',
                        margin: 0, lineHeight: 1.35,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {n.title}
                      </p>
                      <p style={{
                        fontSize: 12, color: 'var(--muted-foreground)',
                        fontFamily: 'Inter', margin: '2px 0 0', lineHeight: 1.4,
                      }}>
                        {n.body}
                      </p>
                    </div>

                    {/* Timestamp */}
                    <span style={{
                      fontSize: 10, fontFamily: 'IBM Plex Mono',
                      color: 'var(--muted-foreground)', whiteSpace: 'nowrap',
                      marginTop: 3, flexShrink: 0,
                    }}>
                      {relativeTime(n.ts)}
                    </span>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer hint */}
          {notifs.length > 0 && (
            <div style={{
              padding: '8px 16px', borderTop: '1px solid var(--border)',
              flexShrink: 0,
            }}>
              <p style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'Inter', margin: 0, textAlign: 'center' }}>
                Showing last {notifs.length} notification{notifs.length !== 1 ? 's' : ''} · Live via Supabase Realtime
              </p>
            </div>
          )}
        </div>
      )}

      {/* Panel entrance animation */}
      <style>{`
        @keyframes notif-panel-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </div>
  )
}
