import { useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts'

const monthly = [
  { month: 'Apr', revenue: 182000, orders: 1020, avg: 178 },
  { month: 'May', revenue: 196000, orders: 1105, avg: 177 },
  { month: 'Jun', revenue: 178000, orders: 990, avg: 179 },
  { month: 'Jul', revenue: 221000, orders: 1240, avg: 178 },
  { month: 'Aug', revenue: 245000, orders: 1380, avg: 177 },
  { month: 'Sep', revenue: 267000, orders: 1498, avg: 178 },
]

const byCat = [
  { name: 'Wings', value: 58 },
  { name: 'Combos', value: 22 },
  { name: 'Sides', value: 12 },
  { name: 'Drinks', value: 8 },
]

const topProducts = [
  { name: 'Classic Buffalo Wings', orders: 842, revenue: 167558 },
  { name: 'BBQ Combo Platter', orders: 581, revenue: 173719 },
  { name: 'Honey Garlic Wings', orders: 704, revenue: 140096 },
  { name: 'Loaded Fries', orders: 1204, revenue: 96320 },
  { name: 'Party Bucket (20pcs)', orders: 289, revenue: 173111 },
  { name: 'Spicy Sriracha Wings', orders: 531, revenue: 105669 },
]

const hourly = [
  { h: '10am', orders: 12 }, { h: '11am', orders: 28 }, { h: '12pm', orders: 72 },
  { h: '1pm', orders: 84 }, { h: '2pm', orders: 61 }, { h: '3pm', orders: 35 },
  { h: '4pm', orders: 29 }, { h: '5pm', orders: 58 }, { h: '6pm', orders: 95 },
  { h: '7pm', orders: 108 }, { h: '8pm', orders: 76 }, { h: '9pm', orders: 41 },
]

const PIE_COLORS = ['#9b5e28', '#c47a2e', '#dba96a', '#ecddd0']

const PERIODS = ['Last 30 Days', 'Last 6 Months', 'Last Year']

export default function Analytics() {
  const [period, setPeriod] = useState('Last 6 Months')

  const totalRev = monthly.reduce((s, m) => s + m.revenue, 0)
  const totalOrd = monthly.reduce((s, m) => s + m.orders, 0)

  return (
    <div style={{ padding: '24px 32px', minHeight: '100vh' }}>
      <div style={{ marginBottom: 22, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'Fraunces', fontSize: 22, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>Sales Analytics</h1>
          <p style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Performance overview for Wingtrack</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1px solid var(--border)',
              background: period === p ? 'var(--primary)' : 'var(--card)',
              color: period === p ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
            }}>{p}</button>
          ))}
        </div>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        {[
          { label: 'Total Revenue', val: `₱${(totalRev / 1000).toFixed(0)}k`, note: 'Apr – Sep 2026', color: '#9b5e28' },
          { label: 'Total Orders', val: totalOrd.toLocaleString(), note: '6-month period', color: '#c47a2e' },
          { label: 'Avg Order Value', val: '₱178', note: 'Consistent month-on-month', color: '#7a4520' },
          { label: 'Best Month', val: 'September', note: '₱267,000 revenue', color: '#4a7c4e' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px' }}>
            <p style={{ fontSize: 10, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, fontFamily: 'DM Mono' }}>{k.label}</p>
            <p style={{ fontFamily: 'Fraunces', fontSize: 26, fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.val}</p>
            <p style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 6 }}>{k.note}</p>
          </div>
        ))}
      </div>

      {/* Revenue trend + pie */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16, marginBottom: 16 }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 22px' }}>
          <h3 style={{ fontFamily: 'Fraunces', fontSize: 15, fontWeight: 600, marginBottom: 4, color: 'var(--foreground)' }}>Monthly Revenue Trend</h3>
          <p style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 16 }}>Apr – Sep 2026 · Wingtrack</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={monthly}>
              <defs>
                <linearGradient id="mrev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#c47a2e" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#c47a2e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} tickFormatter={v => `₱${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: 'var(--sidebar)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--sidebar-muted)', fontSize: 11, fontFamily: 'DM Mono' }}
                formatter={(v: number) => [`₱${v.toLocaleString()}`, 'Revenue']}
                itemStyle={{ color: 'var(--sidebar-foreground)', fontSize: 12 }}
              />
              <Area type="monotone" dataKey="revenue" stroke="#c47a2e" strokeWidth={2.5} fill="url(#mrev)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 22px' }}>
          <h3 style={{ fontFamily: 'Fraunces', fontSize: 15, fontWeight: 600, marginBottom: 4, color: 'var(--foreground)' }}>Sales by Category</h3>
          <p style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 8 }}>% of total orders</p>
          <ResponsiveContainer width="100%" height={130}>
            <PieChart>
              <Pie data={byCat} cx="50%" cy="50%" innerRadius={35} outerRadius={58} paddingAngle={3} dataKey="value">
                {byCat.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => [`${v}%`, '']} contentStyle={{ background: 'var(--sidebar)', border: 'none', borderRadius: 6, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
            {byCat.map((c, i) => (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[i], display: 'inline-block' }} />
                  <span style={{ fontSize: 11, color: 'var(--foreground)' }}>{c.name}</span>
                </div>
                <span style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--muted-foreground)' }}>{c.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hourly + Top Products */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 22px' }}>
          <h3 style={{ fontFamily: 'Fraunces', fontSize: 15, fontWeight: 600, marginBottom: 4, color: 'var(--foreground)' }}>Peak Hours</h3>
          <p style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 14 }}>Average orders per hour · Today</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={hourly} barSize={16}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="h" tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'var(--sidebar)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} labelStyle={{ color: 'var(--sidebar-muted)', fontSize: 11 }} itemStyle={{ color: 'var(--sidebar-foreground)', fontSize: 12 }} />
              <Bar dataKey="orders" fill="var(--accent)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 22px' }}>
          <h3 style={{ fontFamily: 'Fraunces', fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--foreground)' }}>Top Products by Revenue</h3>
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px', gap: 8, padding: '0 0 8px', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
              {['Product', 'Orders', 'Revenue'].map(h => <span key={h} style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>)}
            </div>
            {topProducts.sort((a, b) => b.revenue - a.revenue).map((p, i) => (
              <div key={p.name} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--muted)', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--muted-foreground)', minWidth: 14 }}>{i + 1}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--foreground)' }}>{p.name}</span>
                </div>
                <span style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--muted-foreground)' }}>{p.orders}</span>
                <span style={{ fontSize: 12, fontFamily: 'DM Mono', fontWeight: 700, color: 'var(--primary)' }}>₱{(p.revenue / 1000).toFixed(0)}k</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
