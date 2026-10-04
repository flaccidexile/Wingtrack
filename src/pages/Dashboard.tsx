import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'

const revenueData = [
  { day: 'Mon', revenue: 8420, orders: 47 },
  { day: 'Tue', revenue: 9100, orders: 51 },
  { day: 'Wed', revenue: 7650, orders: 43 },
  { day: 'Thu', revenue: 11200, orders: 64 },
  { day: 'Fri', revenue: 14800, orders: 82 },
  { day: 'Sat', revenue: 17400, orders: 98 },
  { day: 'Sun', revenue: 15900, orders: 89 },
]

const topItems = [
  { name: 'Classic Buffalo Wings', qty: 142, revenue: 28400 },
  { name: 'Honey Garlic Wings', qty: 118, revenue: 23600 },
  { name: 'BBQ Combo Platter', qty: 97, revenue: 29100 },
  { name: 'Spicy Sriracha Wings', qty: 89, revenue: 17800 },
  { name: 'Loaded Fries', qty: 204, revenue: 16320 },
]

const recentTx = [
  { id: 'TXN-0891', time: '2:47 PM', items: 3, total: 485, method: 'Cash', status: 'Completed' },
  { id: 'TXN-0890', time: '2:31 PM', items: 5, total: 920, method: 'GCash', status: 'Completed' },
  { id: 'TXN-0889', time: '2:14 PM', items: 2, total: 360, method: 'Cash', status: 'Completed' },
  { id: 'TXN-0888', time: '1:58 PM', items: 7, total: 1340, method: 'Card', status: 'Completed' },
  { id: 'TXN-0887', time: '1:42 PM', items: 4, total: 720, method: 'GCash', status: 'Void' },
]

const kpis = [
  { label: "Today's Revenue", value: '₱15,900', sub: '+12.4% vs yesterday', trend: 'up', color: '#9b5e28' },
  { label: 'Total Orders', value: '89', sub: '7 currently open', trend: 'up', color: '#c47a2e' },
  { label: 'Avg. Order Value', value: '₱178.65', sub: '-2.1% vs yesterday', trend: 'down', color: '#7a4520' },
  { label: 'Items Low Stock', value: '4', sub: 'Needs reorder', trend: 'warn', color: '#b84040' },
]

function KpiCard({ label, value, sub, color, trend }: { label: string, value: string, sub: string, color: string, trend: string }) {
  const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '!'
  const subColor = trend === 'up' ? '#4a7c4e' : trend === 'down' ? '#9b3a3a' : '#b84040'
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 22px' }}>
      <p style={{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, fontFamily: 'DM Mono' }}>{label}</p>
      <p style={{ fontFamily: 'Fraunces', fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 12, color: subColor, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>{arrow}</span>{sub}
      </p>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'var(--sidebar)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px' }}>
        <p style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--sidebar-muted)', marginBottom: 4 }}>{label}</p>
        <p style={{ fontFamily: 'Fraunces', fontSize: 16, fontWeight: 700, color: 'var(--sidebar-active)' }}>₱{payload[0].value.toLocaleString()}</p>
        <p style={{ fontSize: 11, color: 'var(--sidebar-foreground)' }}>{payload[1]?.value} orders</p>
      </div>
    )
  }
  return null
}

export default function Dashboard() {
  return (
    <div style={{ padding: '28px 32px', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'Fraunces', fontSize: 26, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>
            Good afternoon, Manager
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Wednesday, September 30, 2026 · Wingtrack</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['Today', 'This Week', 'This Month'].map((t, i) => (
            <button key={t} style={{
              padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1px solid var(--border)',
              background: i === 0 ? 'var(--primary)' : 'var(--card)',
              color: i === 0 ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, marginBottom: 24 }}>
        {/* Revenue chart */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div>
              <h3 style={{ fontFamily: 'Fraunces', fontSize: 15, fontWeight: 600, color: 'var(--foreground)' }}>Weekly Revenue</h3>
              <p style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>Sep 23 – Sep 30, 2026</p>
            </div>
            <span style={{ fontFamily: 'Fraunces', fontSize: 22, fontWeight: 700, color: 'var(--primary)' }}>₱84,470</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#c47a2e" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#c47a2e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} tickFormatter={v => `₱${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="revenue" stroke="#c47a2e" strokeWidth={2} fill="url(#rev)" />
              <Area type="monotone" dataKey="orders" stroke="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Top items */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 22px' }}>
          <h3 style={{ fontFamily: 'Fraunces', fontSize: 15, fontWeight: 600, color: 'var(--foreground)', marginBottom: 16 }}>Top Sellers</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {topItems.map((item, i) => (
              <div key={item.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--muted-foreground)', minWidth: 16 }}>{i + 1}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--foreground)' }}>{item.name}</span>
                  </div>
                  <span style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--primary)', fontWeight: 500 }}>{item.qty} sold</span>
                </div>
                <div style={{ height: 4, background: 'var(--muted)', borderRadius: 2 }}>
                  <div style={{ height: '100%', borderRadius: 2, background: i === 0 ? 'var(--accent)' : 'var(--primary)', width: `${(item.qty / 204) * 100}%`, transition: 'width 0.6s ease' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Orders by hour */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Recent transactions */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontFamily: 'Fraunces', fontSize: 15, fontWeight: 600, color: 'var(--foreground)' }}>Recent Transactions</h3>
            <button style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>View all →</button>
          </div>
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 80px 72px', gap: 8, padding: '0 0 8px', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
              {['ID', 'Time', 'Items', 'Total', 'Status'].map(h => (
                <span key={h} style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
              ))}
            </div>
            {recentTx.map(tx => (
              <div key={tx.id} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 80px 72px', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--muted)', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--foreground)', fontWeight: 500 }}>{tx.id}</span>
                <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{tx.time}</span>
                <span style={{ fontSize: 12, color: 'var(--foreground)' }}>{tx.items} items</span>
                <span style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--foreground)', fontWeight: 600 }}>₱{tx.total}</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: tx.status === 'Void' ? '#fce8e8' : '#e8f5e9', color: tx.status === 'Void' ? '#c0392b' : '#2e7d32', fontWeight: 600, textAlign: 'center' }}>{tx.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Orders per day bar */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 22px' }}>
          <h3 style={{ fontFamily: 'Fraunces', fontSize: 15, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>Orders This Week</h3>
          <p style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 16 }}>474 total orders · ₱84,470 revenue</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={revenueData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--sidebar)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontFamily: 'DM Sans' }}
                labelStyle={{ color: 'var(--sidebar-muted)', fontSize: 11, fontFamily: 'DM Mono' }}
                itemStyle={{ color: 'var(--sidebar-foreground)', fontSize: 12 }}
              />
              <Bar dataKey="orders" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
