import { useEffect, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import type { Order } from '@/types'

const PIE_COLORS = ['#9b5e28', '#c47a2e', '#dba96a', '#ecddd0']
const PERIODS = ['Last 30 Days', 'Last 6 Months', 'Last Year'] as const

export default function Analytics() {
  const [period, setPeriod] = useState<typeof PERIODS[number]>('Last 6 Months')
  const [monthlyData, setMonthlyData] = useState<{ month: string; revenue: number; orders: number }[]>([])
  const [categoryData, setCategoryData] = useState<{ name: string; value: number }[]>([])
  const [topProducts, setTopProducts] = useState<{ name: string; orders: number; revenue: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const now = new Date()
      let since: Date
      if (period === 'Last 30 Days') since = new Date(now.getTime() - 30 * 86400000)
      else if (period === 'Last 6 Months') since = new Date(now.getTime() - 180 * 86400000)
      else since = new Date(now.getTime() - 365 * 86400000)

      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*, products(name, category:product_categories(name)))')
        .eq('status', 'completed')
        .gte('created_at', since.toISOString())

      const orders: Order[] = data ?? []

      // Chronological aggregation based on period
      if (period === 'Last 30 Days') {
        const dayMap = new Map<string, { label: string; revenue: number; orders: number; timestamp: number }>()
        for (let i = 29; i >= 0; i--) {
          const d = new Date(now.getTime() - i * 86400000)
          const key = d.toISOString().split('T')[0]
          const label = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
          dayMap.set(key, { label, revenue: 0, orders: 0, timestamp: d.getTime() })
        }
        for (const o of orders) {
          const key = new Date(o.created_at).toISOString().split('T')[0]
          const existing = dayMap.get(key)
          if (existing) {
            existing.revenue += Number(o.total_amount)
            existing.orders += 1
          }
        }
        setMonthlyData(
          Array.from(dayMap.values())
            .sort((a, b) => a.timestamp - b.timestamp)
            .map(item => ({ month: item.label, revenue: Math.round(item.revenue * 100) / 100, orders: item.orders }))
        )
      } else {
        const monthMap = new Map<string, { label: string; revenue: number; orders: number; timestamp: number }>()
        const monthsCount = period === 'Last 6 Months' ? 6 : 12
        for (let i = monthsCount - 1; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          const label = d.toLocaleDateString('en-PH', { month: 'short', year: '2-digit' })
          monthMap.set(key, { label, revenue: 0, orders: 0, timestamp: d.getTime() })
        }
        for (const o of orders) {
          const d = new Date(o.created_at)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          const existing = monthMap.get(key)
          if (existing) {
            existing.revenue += Number(o.total_amount)
            existing.orders += 1
          } else {
            const label = d.toLocaleDateString('en-PH', { month: 'short', year: '2-digit' })
            monthMap.set(key, { label, revenue: Number(o.total_amount), orders: 1, timestamp: d.getTime() })
          }
        }
        setMonthlyData(
          Array.from(monthMap.values())
            .sort((a, b) => a.timestamp - b.timestamp)
            .map(item => ({ month: item.label, revenue: Math.round(item.revenue * 100) / 100, orders: item.orders }))
        )
      }

      // Category breakdown
      const catMap: Record<string, number> = {}
      for (const o of orders) {
        for (const item of (o.order_items as unknown as Array<{ quantity: number; products?: { category?: { name: string } } }> ?? [])) {
          const cat = item.products?.category?.name ?? 'Other'
          catMap[cat] = (catMap[cat] ?? 0) + item.quantity
        }
      }
      const catTotal = Object.values(catMap).reduce((s, v) => s + v, 0)
      setCategoryData(Object.entries(catMap).map(([name, v]) => ({ name, value: Math.round((v / catTotal) * 100) })))

      // Top products
      const prodMap: Record<string, { orders: number; revenue: number }> = {}
      for (const o of orders) {
        for (const item of (o.order_items as unknown as Array<{ product_name: string; quantity: number; line_total: number }> ?? [])) {
          if (!prodMap[item.product_name]) prodMap[item.product_name] = { orders: 0, revenue: 0 }
          prodMap[item.product_name].orders += item.quantity
          prodMap[item.product_name].revenue += Number(item.line_total)
        }
      }
      setTopProducts(
        Object.entries(prodMap)
          .map(([name, v]) => ({ name, ...v }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 6)
      )

      setLoading(false)
    }
    fetchData()
  }, [period])

  const totalRev  = monthlyData.reduce((s, m) => s + m.revenue, 0)
  const totalOrd  = monthlyData.reduce((s, m) => s + m.orders, 0)
  const avgOrder  = totalOrd > 0 ? totalRev / totalOrd : 0
  const bestMonth = monthlyData.reduce((best, m) => m.revenue > (best?.revenue ?? 0) ? m : best, monthlyData[0])

  return (
    <div style={{ padding: '28px 36px', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: 26, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'Fraunces', fontSize: 26, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>Sales Analytics</h1>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Performance overview for Wingtrack</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {PERIODS.map(p => (
            <button key={p} id={`analytics-period-${p.replace(/\s/g,'-').toLowerCase()}`} onClick={() => setPeriod(p)} style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid var(--border)',
              background: period === p ? 'var(--primary)' : 'var(--card)',
              color: period === p ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
            }}>{p}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        </div>
      ) : (
        <>
          {/* Summary KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 26 }}>
            {[
              { label: 'Total Revenue',   val: `\u20B1${(totalRev/1000).toFixed(0)}k`, note: period,              color: '#9b5e28' },
              { label: 'Total Orders',    val: totalOrd.toLocaleString(),              note: 'Completed',         color: '#c47a2e' },
              { label: 'Avg Order Value', val: `\u20B1${avgOrder.toFixed(0)}`,         note: 'Per transaction',   color: '#7a4520' },
              { label: 'Best Month',      val: bestMonth?.month ?? '-',                note: `\u20B1${bestMonth?.revenue.toLocaleString() ?? 0}`, color: '#4a7c4e' },
            ].map(k => (
              <div key={k.label} className="card" style={{ padding: '22px 24px' }}>
                <p style={{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, fontFamily: 'DM Mono' }}>{k.label}</p>
                <p style={{ fontFamily: 'Fraunces', fontSize: 28, fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.val}</p>
                <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 8 }}>{k.note}</p>
              </div>
            ))}
          </div>

          {/* Revenue trend + pie */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 18, marginBottom: 20 }}>
            <div className="card" style={{ padding: '24px 26px' }}>
              <h3 style={{ fontFamily: 'Fraunces', fontSize: 17, fontWeight: 600, marginBottom: 4, color: 'var(--foreground)' }}>Monthly Revenue Trend</h3>
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 18 }}>{period}</p>
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="mrev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#c47a2e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#c47a2e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--muted-foreground)', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} tickFormatter={v => `\u20B1${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: 'var(--sidebar)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} labelStyle={{ color: 'var(--sidebar-muted)', fontSize: 12 }} formatter={(v) => [`₱${Number(v).toLocaleString()}`, 'Revenue']} itemStyle={{ color: 'var(--sidebar-foreground)', fontSize: 13 }} />
                  <Area type="monotone" dataKey="revenue" stroke="#c47a2e" strokeWidth={2.5} fill="url(#mrev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="card" style={{ padding: '24px 26px' }}>
              <h3 style={{ fontFamily: 'Fraunces', fontSize: 17, fontWeight: 600, marginBottom: 4, color: 'var(--foreground)' }}>Sales by Category</h3>
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 12 }}>% of total orders</p>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={40} outerRadius={68} paddingAngle={3} dataKey="value">
                    {categoryData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v}%`, '']} contentStyle={{ background: 'var(--sidebar)', border: 'none', borderRadius: 8, fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {categoryData.map((c, i) => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length], display: 'inline-block' }} />
                      <span style={{ fontSize: 12, color: 'var(--foreground)' }}>{c.name}</span>
                    </div>
                    <span style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--muted-foreground)' }}>{c.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Products */}
          <div className="card" style={{ padding: '24px 26px' }}>
            <h3 style={{ fontFamily: 'Fraunces', fontSize: 17, fontWeight: 600, marginBottom: 18, color: 'var(--foreground)' }}>Top Products by Revenue</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 120px', gap: 10, padding: '0 0 10px', borderBottom: '1px solid var(--border)', marginBottom: 10 }}>
              {['Product', 'Orders', 'Revenue'].map(h => <span key={h} style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>)}
            </div>
            {topProducts.map((p, i) => (
              <div key={p.name} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 120px', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--muted)', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--muted-foreground)', minWidth: 16 }}>{i + 1}</span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--foreground)' }}>{p.name}</span>
                </div>
                <span style={{ fontSize: 13, fontFamily: 'DM Mono', color: 'var(--muted-foreground)' }}>{p.orders}</span>
                <span style={{ fontSize: 14, fontFamily: 'DM Mono', fontWeight: 700, color: 'var(--primary)' }}>&#8369;{(p.revenue/1000).toFixed(0)}k</span>
              </div>
            ))}
            {topProducts.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--muted-foreground)', paddingTop: 14 }}>No data for this period.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
