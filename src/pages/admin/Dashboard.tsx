import { useEffect, useState, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import type { Order } from '@/types'

interface DailyStat { day: string; revenue: number; orders: number }
interface TopItem { name: string; qty: number; revenue: number }

type PeriodPreset = 'today' | 'week' | 'month' | 'custom'

function KpiCard({ label, value, sub, color, trend }: { label: string; value: string; sub: string; color: string; trend: 'up' | 'down' | 'warn' }) {
  const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '!'
  const subColor = trend === 'up' ? '#4a7c4e' : trend === 'down' ? '#9b3a3a' : '#b84040'
  return (
    <div className="card" style={{ padding: '20px 22px' }}>
      <p style={{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, fontFamily: 'DM Mono' }}>{label}</p>
      <p style={{ fontFamily: 'Fraunces', fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 12, color: subColor, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>{arrow}</span>{sub}
      </p>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'var(--sidebar)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px' }}>
        <p style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--sidebar-muted)', marginBottom: 4 }}>{label}</p>
        <p style={{ fontFamily: 'Fraunces', fontSize: 16, fontWeight: 700, color: 'var(--sidebar-active)' }}>
          &#8369;{payload[0].value.toLocaleString()}
        </p>
        {payload[1] && <p style={{ fontSize: 11, color: 'var(--sidebar-foreground)' }}>{payload[1].value} orders</p>}
      </div>
    )
  }
  return null
}

// Format date as YYYY-MM-DD for <input type="date">
function toDateInput(d: Date) {
  return d.toISOString().split('T')[0]
}

export default function Dashboard() {
  const [period, setPeriod] = useState<PeriodPreset>('week')
  const [customFrom, setCustomFrom] = useState(() => toDateInput(new Date(Date.now() - 7 * 86400000)))
  const [customTo, setCustomTo]     = useState(() => toDateInput(new Date()))
  const [showCustom, setShowCustom] = useState(false)

  const [dailyStats, setDailyStats] = useState<DailyStat[]>([])
  const [topItems, setTopItems] = useState<TopItem[]>([])
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [lowStockCount, setLowStockCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const now = new Date()
    let since: Date
    let until: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) // tomorrow midnight

    if (period === 'today') {
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    } else if (period === 'week') {
      since = new Date(now.getTime() - 7 * 86400000)
    } else if (period === 'month') {
      since = new Date(now.getTime() - 30 * 86400000)
    } else {
      // custom
      since = new Date(customFrom + 'T00:00:00')
      until = new Date(customTo + 'T23:59:59')
    }

    const [ordersRes, inventoryRes] = await Promise.all([
      supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('status', 'completed')
        .gte('created_at', since.toISOString())
        .lte('created_at', until.toISOString())
        .order('created_at', { ascending: false }),
      supabase
        .from('inventory')
        .select('stock_qty, min_stock_level')
        .in('status', ['low', 'critical']),
    ])

    const orders: Order[] = ordersRes.data ?? []
    setLowStockCount((inventoryRes.data ?? []).length)

    // Build chronological stats
    const statsMap = new Map<string, { label: string; revenue: number; orders: number; timestamp: number }>()

    if (period === 'today') {
      for (let h = 8; h <= 22; h += 2) {
        const hourLabel = `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`
        const key = String(h).padStart(2, '0')
        statsMap.set(key, { label: hourLabel, revenue: 0, orders: 0, timestamp: h })
      }
      for (const o of orders) {
        const d = new Date(o.created_at)
        const h = d.getHours()
        const bucketHour = Math.floor(h / 2) * 2
        const key = String(bucketHour).padStart(2, '0')
        const existing = statsMap.get(key)
        if (existing) {
          existing.revenue += Number(o.total_amount)
          existing.orders += 1
        }
      }
    } else {
      // For week, month, and custom — iterate by day
      const msPerDay = 86400000
      const startDay = new Date(since.getFullYear(), since.getMonth(), since.getDate())
      const endDay = period === 'custom' ? new Date(customTo + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const dayCount = Math.round((endDay.getTime() - startDay.getTime()) / msPerDay) + 1

      for (let i = 0; i < dayCount; i++) {
        const d = new Date(startDay.getTime() + i * msPerDay)
        const dateKey = d.toISOString().split('T')[0]
        const label = d.toLocaleDateString('en-US', dayCount > 14 ? { month: 'short', day: 'numeric' } : { weekday: 'short', month: 'numeric', day: 'numeric' })
        statsMap.set(dateKey, { label, revenue: 0, orders: 0, timestamp: d.getTime() })
      }

      for (const o of orders) {
        const dateKey = new Date(o.created_at).toISOString().split('T')[0]
        const existing = statsMap.get(dateKey)
        if (existing) {
          existing.revenue += Number(o.total_amount)
          existing.orders += 1
        } else {
          const d = new Date(o.created_at)
          const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          statsMap.set(dateKey, { label, revenue: Number(o.total_amount), orders: 1, timestamp: d.getTime() })
        }
      }
    }

    const sortedStats = Array.from(statsMap.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(s => ({ day: s.label, revenue: Math.round(s.revenue * 100) / 100, orders: s.orders }))

    setDailyStats(sortedStats)

    // Top items
    const itemMap: Record<string, { qty: number; revenue: number }> = {}
    for (const o of orders) {
      for (const item of (o.order_items ?? [])) {
        if (!itemMap[item.product_name]) itemMap[item.product_name] = { qty: 0, revenue: 0 }
        itemMap[item.product_name].qty += item.quantity
        itemMap[item.product_name].revenue += Number(item.line_total)
      }
    }
    setTopItems(
      Object.entries(itemMap)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5)
    )

    setRecentOrders(orders.slice(0, 5))
    setLoading(false)
  }, [period, customFrom, customTo])

  useEffect(() => { fetchData() }, [fetchData])

  const totalRevenue = dailyStats.reduce((s, d) => s + d.revenue, 0)
  const totalOrders  = dailyStats.reduce((s, d) => s + d.orders, 0)
  const avgOrder     = totalOrders > 0 ? totalRevenue / totalOrders : 0

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  const periodLabel = period === 'today' ? 'Hourly revenue today'
    : period === 'week' ? 'Past 7 days'
    : period === 'month' ? 'Past 30 days'
    : `${customFrom} → ${customTo}`

  return (
    <div style={{ padding: '30px 36px', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'Fraunces', fontSize: 28, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>
            {greeting}, Manager
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>
            {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · Wingtrack
          </p>
        </div>

        {/* Period controls */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {(['today', 'week', 'month'] as const).map((p, i) => (
            <button
              key={p}
              id={`dashboard-period-${p}`}
              onClick={() => { setPeriod(p); setShowCustom(false) }}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                border: '1px solid var(--border)',
                background: period === p ? 'var(--primary)' : 'var(--card)',
                color: period === p ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
              }}
            >
              {['Today', 'This Week', 'This Month'][i]}
            </button>
          ))}

          {/* Custom date range toggle */}
          <button
            id="dashboard-period-custom"
            onClick={() => { setPeriod('custom'); setShowCustom(s => !s) }}
            style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
              border: '1px solid var(--border)',
              background: period === 'custom' ? 'var(--primary)' : 'var(--card)',
              color: period === 'custom' ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Custom Range
          </button>
        </div>
      </div>

      {/* Custom date picker row */}
      {showCustom && period === 'custom' && (
        <div className="card fade-in" style={{ padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>Date Range:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="dashboard-date-from"
              type="date"
              className="input"
              value={customFrom}
              max={customTo}
              onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: '8px 12px', fontSize: 13, width: 160 }}
            />
            <span style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>to</span>
            <input
              id="dashboard-date-to"
              type="date"
              className="input"
              value={customTo}
              min={customFrom}
              max={toDateInput(new Date())}
              onChange={e => setCustomTo(e.target.value)}
              style={{ padding: '8px 12px', fontSize: 13, width: 160 }}
            />
          </div>
          <button
            id="dashboard-apply-range"
            onClick={fetchData}
            className="btn-primary"
            style={{ padding: '8px 18px', fontSize: 13 }}
          >
            Apply
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
            <KpiCard label="Total Revenue"    value={`\u20B1${totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 0 })}`}  sub="Completed orders only"   color="#9b5e28"  trend="up"   />
            <KpiCard label="Total Orders"     value={totalOrders.toString()}   sub="Completed transactions"   color="#c47a2e"  trend="up"   />
            <KpiCard label="Avg. Order Value" value={`\u20B1${avgOrder.toFixed(2)}`}   sub="Per completed order"      color="#7a4520"  trend={avgOrder > 150 ? 'up' : 'down'} />
            <KpiCard label="Low Stock Items"  value={lowStockCount.toString()} sub="Needs attention"           color="#b84040"  trend="warn" />
          </div>

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 18, marginBottom: 28 }}>
            <div className="card" style={{ padding: '24px 26px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h3 style={{ fontFamily: 'Fraunces', fontSize: 17, fontWeight: 600, color: 'var(--foreground)' }}>Revenue Trend</h3>
                  <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 3 }}>{periodLabel}</p>
                </div>
                <span style={{ fontFamily: 'Fraunces', fontSize: 24, fontWeight: 700, color: 'var(--primary)' }}>
                  &#8369;{totalRevenue.toLocaleString()}
                </span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={dailyStats} margin={{ bottom: 20 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#c47a2e" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#c47a2e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false}
                    interval={dailyStats.length > 14 ? Math.ceil(dailyStats.length / 10) - 1 : 0}
                    angle={dailyStats.length > 10 ? -35 : 0}
                    textAnchor={dailyStats.length > 10 ? 'end' : 'middle'}
                    dy={dailyStats.length > 10 ? 8 : 0} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} tickFormatter={v => `\u20B1${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="revenue" stroke="#c47a2e" strokeWidth={2} fill="url(#rev)" />
                  <Area type="monotone" dataKey="orders" stroke="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="card" style={{ padding: '24px 26px' }}>
              <h3 style={{ fontFamily: 'Fraunces', fontSize: 17, fontWeight: 600, color: 'var(--foreground)', marginBottom: 18 }}>Top Sellers</h3>
              {topItems.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>No sales data yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {topItems.map((item, i) => (
                    <div key={item.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--muted-foreground)', minWidth: 18 }}>{i + 1}</span>
                          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--foreground)' }}>{item.name}</span>
                        </div>
                        <span style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--primary)', fontWeight: 500 }}>{item.qty} sold</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--muted)', borderRadius: 3 }}>
                        <div style={{ height: '100%', borderRadius: 3, background: i === 0 ? 'var(--accent)' : 'var(--primary)', width: `${(item.qty / (topItems[0]?.qty || 1)) * 100}%`, transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bottom row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            {/* Recent transactions */}
            <div className="card" style={{ padding: '24px 26px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h3 style={{ fontFamily: 'Fraunces', fontSize: 17, fontWeight: 600, color: 'var(--foreground)' }}>Recent Transactions</h3>
                <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{periodLabel}</span>
              </div>
              {recentOrders.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>No recent orders.</p>
              ) : (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 80px', gap: 10, padding: '0 0 10px', borderBottom: '1px solid var(--border)', marginBottom: 10 }}>
                    {['Order #', 'Method', 'Total', 'Status'].map(h => (
                      <span key={h} style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                    ))}
                  </div>
                  {recentOrders.map(o => (
                    <div key={o.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 80px', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--muted)', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontFamily: 'DM Mono', color: 'var(--foreground)', fontWeight: 500 }}>#{o.order_number}</span>
                      <span style={{ fontSize: 12, color: 'var(--muted-foreground)', textTransform: 'capitalize' }}>{o.payment_method}</span>
                      <span style={{ fontSize: 13, fontFamily: 'DM Mono', color: 'var(--foreground)', fontWeight: 600 }}>&#8369;{Number(o.total_amount).toLocaleString()}</span>
                      <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: o.status === 'void' ? '#fce8e8' : '#e8f5e9', color: o.status === 'void' ? '#c0392b' : '#2e7d32', fontWeight: 600, textAlign: 'center', textTransform: 'capitalize' }}>{o.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Orders per day bar */}
            <div className="card" style={{ padding: '24px 26px' }}>
              <h3 style={{ fontFamily: 'Fraunces', fontSize: 17, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>Orders by Day</h3>
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 18 }}>{totalOrders} total · &#8369;{totalRevenue.toLocaleString()}</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={dailyStats} barSize={dailyStats.length > 14 ? 16 : 32} margin={{ bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false}
                    interval={dailyStats.length > 14 ? Math.ceil(dailyStats.length / 10) - 1 : 0}
                    angle={dailyStats.length > 10 ? -35 : 0}
                    textAnchor={dailyStats.length > 10 ? 'end' : 'middle'}
                    dy={dailyStats.length > 10 ? 8 : 0} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--sidebar)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontFamily: 'DM Sans' }}
                    labelStyle={{ color: 'var(--sidebar-muted)', fontSize: 12, fontFamily: 'DM Mono' }}
                    itemStyle={{ color: 'var(--sidebar-foreground)', fontSize: 13 }} />
                  <Bar dataKey="orders" fill="var(--primary)" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
