import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { apiCreateStaff, apiDeactivateStaff } from '@/lib/api'
import type { StaffProfile, StaffRole } from '@/types'

const ROLES: { value: StaffRole; label: string }[] = [
  { value: 'cashier',              label: 'Cashier'              },
  { value: 'inventory_personnel', label: 'Inventory Personnel'   },
  { value: 'admin',               label: 'Admin / Manager'       },
]

const roleBadge: Record<StaffRole, { bg: string; color: string }> = {
  admin:               { bg: 'rgba(155,94,40,0.12)', color: '#9b5e28' },
  cashier:             { bg: 'rgba(21,128,61,0.1)',  color: '#15803d' },
  inventory_personnel: { bg: 'rgba(30,64,175,0.1)',  color: '#1d4ed8' },
}

export default function StaffManager() {
  const [staff, setStaff] = useState<StaffProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'cashier' as StaffRole })
  const [formError, setFormError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  async function fetchStaff() {
    const { data } = await supabase
      .from('staff_profiles')
      .select('*')
      .order('created_at', { ascending: false })
    setStaff((data ?? []) as StaffProfile[])
    setLoading(false)
  }

  useEffect(() => { fetchStaff() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setFormLoading(true)
    try {
      await apiCreateStaff(form)
      setShowModal(false)
      setForm({ full_name: '', email: '', password: '', role: 'cashier' })
      await fetchStaff()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create staff')
    } finally {
      setFormLoading(false)
    }
  }

  async function handleDeactivate(id: string, name: string) {
    if (!confirm(`Deactivate ${name}? They will no longer be able to log in.`)) return
    try {
      await apiDeactivateStaff(id)
      await fetchStaff()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Deactivation failed')
    }
  }

  const roleLabel: Record<StaffRole, string> = {
    admin: 'Admin / Manager',
    cashier: 'Cashier',
    inventory_personnel: 'Inventory Personnel',
  }

  return (
    <div style={{ padding: '28px 36px', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'Fraunces', fontSize: 26, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>Staff Manager</h1>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Provision and manage Wing's Zone staff accounts</p>
        </div>
        <button
          id="btn-add-staff"
          className="btn-primary"
          onClick={() => setShowModal(true)}
          style={{ padding: '12px 20px', fontSize: 14 }}
        >
          + Add Staff Member
        </button>
      </div>

      {/* Staff table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px 170px 90px 110px', gap: 0, padding: '12px 22px', borderBottom: '1px solid var(--border)' }}>
            {['Name', 'Email', 'Role', 'Status', 'Actions'].map(h => (
              <span key={h} style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
            ))}
          </div>
          {staff.map((s, i) => (
            <div
              key={s.id}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 220px 170px 90px 110px', gap: 0,
                padding: '16px 22px', borderBottom: i < staff.length - 1 ? '1px solid var(--muted)' : 'none',
                alignItems: 'center', transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--muted)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>{s.full_name}</p>
                <p style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>ID: {s.id.slice(0, 8)}...</p>
              </div>
              <span style={{ fontSize: 13, color: 'var(--muted-foreground)', fontFamily: 'DM Mono', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</span>
              <div>
                <span style={{
                  fontSize: 12, padding: '4px 11px', borderRadius: 20, fontWeight: 600, display: 'inline-block',
                  background: roleBadge[s.role].bg, color: roleBadge[s.role].color,
                }}>
                  {roleLabel[s.role]}
                </span>
              </div>
              <div>
                <span style={{
                  fontSize: 12, padding: '4px 10px', borderRadius: 20, fontWeight: 700,
                  background: s.is_active ? '#e8f5e9' : '#f3f4f6', color: s.is_active ? '#15803d' : '#6b7280', display: 'inline-block',
                }}>
                  {s.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div>
                {s.is_active && (
                  <button
                    id={`btn-deactivate-${s.id}`}
                    onClick={() => handleDeactivate(s.id, s.full_name)}
                    style={{
                      fontSize: 12, padding: '5px 12px', borderRadius: 6,
                      background: 'transparent', border: '1px solid #fca5a5',
                      color: 'var(--danger)', cursor: 'pointer', fontWeight: 600,
                    }}
                  >
                    Deactivate
                  </button>
                )}
              </div>
            </div>
          ))}
          {staff.length === 0 && (
            <p style={{ padding: '40px 24px', fontSize: 14, color: 'var(--muted-foreground)' }}>No staff accounts yet. Add your first staff member above.</p>
          )}
        </div>
      )}

      {/* Add Staff Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div className="card fade-in" style={{ width: '100%', maxWidth: 460, padding: '32px 28px' }}>
            <h2 style={{ fontFamily: 'Fraunces', fontSize: 20, fontWeight: 700, color: 'var(--foreground)', marginBottom: 22 }}>
              Add Staff Member
            </h2>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label htmlFor="staff-name" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>Full Name</label>
                <input
                  id="staff-name" className="input" type="text" required
                  placeholder="Maria Santos"
                  value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  style={{ padding: '11px 14px', fontSize: 14 }}
                />
              </div>
              <div>
                <label htmlFor="staff-email" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>Email</label>
                <input
                  id="staff-email" className="input" type="email" required
                  placeholder="maria@wingszone.ph"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  style={{ padding: '11px 14px', fontSize: 14 }}
                />
              </div>
              <div>
                <label htmlFor="staff-password" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>Temporary Password</label>
                <input
                  id="staff-password" className="input" type="password" required minLength={8}
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  style={{ padding: '11px 14px', fontSize: 14 }}
                />
              </div>
              <div>
                <label htmlFor="staff-role" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>Role</label>
                <select
                  id="staff-role"
                  className="input"
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as StaffRole }))}
                  style={{ padding: '11px 14px', fontSize: 14 }}
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              {formError && (
                <div style={{ background: 'var(--danger-bg)', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', fontWeight: 500 }}>
                  {formError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" className="btn-ghost" onClick={() => setShowModal(false)} style={{ flex: 1, padding: '12px' }}>Cancel</button>
                <button id="btn-create-staff" type="submit" className="btn-primary" disabled={formLoading} style={{ flex: 2, padding: '12px' }}>
                  {formLoading ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
