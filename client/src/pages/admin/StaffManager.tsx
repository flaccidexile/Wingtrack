import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { apiCreateStaff, apiDeactivateStaff, apiGetStaff, apiReactivateStaff } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useIsCompact } from '@/hooks/useMediaQuery'
import { activityColor, describeActivity, isOnline } from '@/lib/presence'
import { ROLE_BADGE, STAFF_ROLES, roleLabel } from '@/lib/staff'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Avatar from '@/components/ui/Avatar'
import EditStaffModal from '@/components/staff/EditStaffModal'
import StaffDetailModal from '@/components/staff/StaffDetailModal'
import type { StaffProfile, StaffRole } from '@/types'

/** How often the relative timestamps are recomputed so they never go stale. */
const CLOCK_TICK_MS = 30_000

/**
 * How often the roster is re-fetched as a safety net.
 *
 * Realtime only carries changes to `staff_profiles`. On a database where the
 * presence migration has not been applied, a photo or sign-in time written to
 * `auth.users` emits no event at all, so a slow poll is the only thing that
 * makes those appear without a manual reload.
 */
const LIST_REFRESH_MS = 60_000

/**
 * Column template shared by the header row and every data row.
 *
 * The Actions column now carries three buttons (View / Edit / Deactivate), so
 * the space comes out of Email and Activity — both of which already truncate
 * or read fine when narrower — rather than by widening the table.
 */
const GRID = '1fr 190px 160px 88px 138px 210px'
const GRID_MIN_WIDTH = 990

// ============================================================
// Small building blocks
// ============================================================

/** The coloured dot + label used by the ACTIVITY column. */
function ActivityCell({ staff }: { staff: StaffProfile }) {
  const activity = describeActivity(staff)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
      <span
        style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: activityColor(activity.tone),
          // A soft halo makes "Active now" readable at a glance in a long list.
          boxShadow: activity.online ? `0 0 0 3px ${activityColor(activity.tone)}22` : undefined,
        }}
      />
      <span style={{ fontSize: 12.5, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
        {activity.label}
      </span>
    </span>
  )
}

function AccountBadge({ isActive }: { isActive: boolean }) {
  return (
    <span style={{
      fontSize: 12, padding: '4px 10px', borderRadius: 20, fontWeight: 700, whiteSpace: 'nowrap',
      background: isActive ? '#e8f5e9' : '#f3f4f6',
      color: isActive ? '#15803d' : '#6b7280',
    }}>
      {isActive ? 'Active' : 'Inactive'}
    </span>
  )
}

function RoleBadge({ role }: { role: StaffRole }) {
  const badge = ROLE_BADGE[role]
  return (
    <span style={{
      fontSize: 12, padding: '4px 11px', borderRadius: 20, fontWeight: 600,
      background: badge.bg, color: badge.color, whiteSpace: 'nowrap',
    }}>
      {roleLabel(role)}
    </span>
  )
}

/**
 * Neutral outline button used for the View / Edit actions.
 *
 * View and Edit are both "open something" actions, so they share one weight and
 * one colour — only the destructive Deactivate / Reactivate pair is tinted.
 */
function RowButton({
  id,
  label,
  onClick,
}: {
  id: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      style={{
        fontSize: 12, padding: '5px 10px', borderRadius: 6, fontWeight: 600,
        background: 'transparent', border: '1px solid var(--border)',
        color: 'var(--foreground)', cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

/** Outline action button used for Deactivate / Reactivate. */
function ActionButton({
  id,
  label,
  tone,
  onClick,
}: {
  id: string
  label: string
  tone: 'danger' | 'success'
  onClick: () => void
}) {
  const palette = tone === 'danger'
    ? { border: '#fca5a5', color: 'var(--danger)' }
    : { border: '#86efac', color: '#15803d' }

  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      style={{
        fontSize: 12, padding: '5px 10px', borderRadius: 6, fontWeight: 600,
        background: 'transparent', border: `1px solid ${palette.border}`,
        color: palette.color, cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

/**
 * Compact presentation of a single staff member for phone-width viewports,
 * mirroring every column the desktop grid exposes.
 */
function StaffCard({
  staff,
  onOpen,
  onEdit,
  onAction,
}: {
  staff: StaffProfile
  onOpen: () => void
  onEdit: () => void
  onAction: (kind: 'deactivate' | 'reactivate') => void
}) {
  const activity = describeActivity(staff)

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <Avatar name={staff.full_name} src={staff.avatar_url} size={40} ring={activity.online ? 'rgba(21,128,61,0.45)' : null} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <button
            type="button"
            onClick={onOpen}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontSize: 15, fontWeight: 600, color: 'var(--foreground)',
              textAlign: 'left', overflowWrap: 'anywhere',
            }}
          >
            {staff.full_name}
          </button>
          <p style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2, fontFamily: 'DM Mono' }}>
            ID: {staff.id.slice(0, 8)}
          </p>
          <p style={{ fontSize: 12, color: 'var(--muted-foreground)', fontFamily: 'DM Mono', marginTop: 6, overflowWrap: 'anywhere' }}>
            {staff.email}
          </p>
        </div>

        <AccountBadge isActive={staff.is_active} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        <RoleBadge role={staff.role} />
        <ActivityCell staff={staff} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          id={`btn-view-${staff.id}`}
          onClick={onOpen}
          style={{
            flex: 1, fontSize: 13, padding: '9px 14px', borderRadius: 8, fontWeight: 600,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--foreground)', cursor: 'pointer',
          }}
        >
          View
        </button>
        <button
          type="button"
          onClick={onEdit}
          style={{
            flex: 1, fontSize: 13, padding: '9px 14px', borderRadius: 8, fontWeight: 600,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--foreground)', cursor: 'pointer',
          }}
        >
          Edit
        </button>
        {staff.is_active ? (
          <button
            type="button"
            id={`btn-deactivate-${staff.id}`}
            onClick={() => onAction('deactivate')}
            style={{
              flex: 1, fontSize: 13, padding: '9px 14px', borderRadius: 8,
              background: 'transparent', border: '1px solid #fca5a5',
              color: 'var(--danger)', cursor: 'pointer', fontWeight: 600,
            }}
          >
            Deactivate
          </button>
        ) : (
          <button
            type="button"
            id={`btn-reactivate-${staff.id}`}
            onClick={() => onAction('reactivate')}
            style={{
              flex: 1, fontSize: 13, padding: '9px 14px', borderRadius: 8,
              background: 'transparent', border: '1px solid #86efac',
              color: '#15803d', cursor: 'pointer', fontWeight: 600,
            }}
          >
            Reactivate
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Page
// ============================================================

export default function StaffManager() {
  /** Phones get a card list; wider viewports keep the grid table. */
  const isCompact = useIsCompact()
  const { profile: self } = useAuth()

  const [staff, setStaff] = useState<StaffProfile[]>([])
  const [loading, setLoading] = useState(true)
  /** True while the realtime channel is connected — drives the LIVE badge. */
  const [live, setLive] = useState(false)

  // ── Add ───────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'cashier' as StaffRole })
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  // ── Inspect / edit ────────────────────────────────────────
  const [detail, setDetail] = useState<StaffProfile | null>(null)
  const [editing, setEditing] = useState<StaffProfile | null>(null)

  // ── Activate / deactivate ─────────────────────────────────
  const [pendingAction, setPendingAction] = useState<
    { kind: 'deactivate' | 'reactivate'; id: string; name: string } | null
  >(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  /** Bumped on a timer so "Last seen 9h ago" never goes stale on screen. */
  const [, setClock] = useState(0)

  useEffect(() => {
    if (showModal) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [showModal])

  /**
   * Loads the staff list through the API rather than reading `staff_profiles`
   * directly: the server merges in the sign-in time and avatar URL held on the
   * auth user, which the browser cannot read. Without that merge an
   * un-migrated database reports "Never signed in" for everybody.
   */
  const fetchStaff = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const rows = await apiGetStaff()
      setStaff(rows)
      // Keep an open detail panel in step, so a photo uploaded while the
      // panel is on screen appears there too.
      setDetail(prev => (prev ? rows.find(r => r.id === prev.id) ?? prev : prev))
    } catch (err: unknown) {
      // A failed background refresh is not worth an error banner: the list
      // already on screen is still valid. Only a first load reports.
      if (!options?.silent) {
        setActionError(err instanceof Error ? err.message : 'Could not load the staff list.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchStaff() }, [fetchStaff])

  /**
   * Safety-net refresh.
   *
   * Complements the realtime subscription below: it catches the auth-side
   * fields (photo, sign-in time) that produce no database event, and it
   * re-syncs after the tab has been in the background — where the browser may
   * have throttled or dropped the websocket.
   */
  useEffect(() => {
    const timer = window.setInterval(() => { void fetchStaff({ silent: true }) }, LIST_REFRESH_MS)
    const onFocus = () => { void fetchStaff({ silent: true }) }
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [fetchStaff])

  // Relative timestamps ("9h ago") drift as time passes. Re-render on a slow
  // tick rather than leaving a stale label on screen for the whole session.
  useEffect(() => {
    const timer = window.setInterval(() => setClock(c => c + 1), CLOCK_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  /**
   * Merges a freshly-arrived row over an existing one.
   *
   * Realtime payloads and mutation responses come straight from
   * `staff_profiles`, so they carry no auth-derived fields. Without this the
   * avatar and sign-in time would blank out every time a heartbeat wrote
   * `last_seen_at` — which is every 45 seconds.
   */
  const mergeRow = useCallback((incoming: StaffProfile, existing?: StaffProfile): StaffProfile => ({
    ...existing,
    ...incoming,
    last_sign_in_at: incoming.last_sign_in_at ?? existing?.last_sign_in_at ?? null,
    avatar_url: incoming.avatar_url ?? existing?.avatar_url ?? null,
  }), [])

  /**
   * Live updates.
   *
   * Subscribes to the staff_profiles table so a rename, role change, sign-in
   * stamp or deactivation appears here without a refresh — including the
   * heartbeat's `last_seen_at` writes, which is what makes the online count
   * move on its own.
   *
   * Realtime enforces RLS, so this only yields rows for an admin.
   */
  useEffect(() => {
    const channel = supabase
      .channel('staff-profiles-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff_profiles' },
        payload => {
          if (payload.eventType === 'DELETE') {
            const removedId = (payload.old as { id?: string } | null)?.id
            if (removedId) setStaff(prev => prev.filter(s => s.id !== removedId))
            return
          }

          const row = payload.new as StaffProfile
          setStaff(prev => {
            const existing = prev.find(s => s.id === row.id)
            return existing
              ? prev.map(s => (s.id === row.id ? mergeRow(row, existing) : s))
              : [mergeRow(row), ...prev]
          })
          setDetail(prev => (prev && prev.id === row.id ? mergeRow(row, prev) : prev))
        },
      )
      .subscribe(status => setLive(status === 'SUBSCRIBED'))

    return () => { void supabase.removeChannel(channel) }
  }, [mergeRow])

  // ── Derived ───────────────────────────────────────────────

  const counts = useMemo(() => {
    let online = 0
    let deactivated = 0
    for (const s of staff) {
      if (!s.is_active) { deactivated += 1; continue }
      if (isOnline(s.last_seen_at)) online += 1
    }
    return { online, deactivated, offline: staff.length - online - deactivated }
  }, [staff])

  /** Resolves `created_by` to a name so the detail panel can show it. */
  const nameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of staff) map.set(s.id, s.full_name)
    return map
  }, [staff])

  // ── Actions ───────────────────────────────────────────────

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

  /** Runs the confirmed activate / deactivate request. */
  async function runPendingAction() {
    if (!pendingAction) return
    setActionBusy(true)
    setActionError(null)
    try {
      const updated = pendingAction.kind === 'deactivate'
        ? await apiDeactivateStaff(pendingAction.id)
        : await apiReactivateStaff(pendingAction.id)

      // Patch in place so the change shows immediately even if the realtime
      // channel is slow to deliver it.
      if (updated?.id) {
        setStaff(prev => prev.map(s => (s.id === updated.id ? mergeRow(updated, s) : s)))
        setDetail(prev => (prev && prev.id === updated.id ? mergeRow(updated, prev) : prev))
      } else {
        await fetchStaff()
      }
      setPendingAction(null)
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'That action could not be completed.')
      setPendingAction(null)
    } finally {
      setActionBusy(false)
    }
  }

  /** Applies an edit made in the Edit dialog to the local list. */
  function applyEdit(updated: StaffProfile) {
    setStaff(prev => prev.map(s => (s.id === updated.id ? mergeRow(updated, s) : s)))
    // Keep an open detail panel in step with the edit.
    setDetail(prev => (prev && prev.id === updated.id ? mergeRow(updated, prev) : prev))
  }

  const pending = pendingAction

  return (
    <div className="page">
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'Fraunces', fontSize: 26, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>Staff Manager</h1>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Provision, manage and monitor Wingtrack staff accounts</p>
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

      {/* Live summary */}
      <div
        className="card"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap', padding: '12px 20px', marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: '#15803d',
              boxShadow: counts.online > 0 ? '0 0 0 3px rgba(21,128,61,0.16)' : undefined,
            }} />
            <strong style={{ color: 'var(--foreground)' }}>{counts.online}</strong>
            <span style={{ color: 'var(--muted-foreground)' }}>online now</span>
          </span>

          <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
            <strong style={{ color: 'var(--foreground)' }}>{counts.offline}</strong> offline
          </span>

          <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
            <strong style={{ color: 'var(--foreground)' }}>{counts.deactivated}</strong> deactivated
          </span>
        </div>

        <span
          title={live
            ? 'Connected — the list updates automatically'
            : 'Connecting to the live update stream…'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            fontSize: 10.5, fontFamily: 'DM Mono', letterSpacing: '0.1em',
            color: live ? '#15803d' : 'var(--muted-foreground)', fontWeight: 600,
          }}
        >
          <span
            className={live ? 'live-dot' : undefined}
            style={{
              width: 7, height: 7, borderRadius: '50%',
              background: live ? '#15803d' : '#9ca3af',
            }}
          />
          {live ? 'LIVE' : 'CONNECTING'}
        </span>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div
          role="alert"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '12px 16px', marginBottom: 16, background: '#fee2e2', color: '#991b1b',
            borderRadius: 8, fontSize: 13, fontWeight: 500,
          }}
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Dismiss error"
            style={{ background: 'transparent', border: 'none', color: '#991b1b', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 4 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Staff list — a card stack on phones (the grid needed sideways
          scrolling otherwise), the grid table from tablet up. */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        </div>
      ) : isCompact ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {staff.map(s => (
            <StaffCard
              key={s.id}
              staff={s}
              onOpen={() => setDetail(s)}
              onEdit={() => setEditing(s)}
              onAction={(kind) => {
                setActionError(null)
                setPendingAction({ kind, id: s.id, name: s.full_name })
              }}
            />
          ))}
          {staff.length === 0 && (
            <div className="card" style={{ padding: '40px 20px', textAlign: 'center', fontSize: 14, color: 'var(--muted-foreground)' }}>
              No staff accounts yet. Add your first staff member above.
            </div>
          )}
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="scroll-x">
            <div style={{ display: 'grid', gridTemplateColumns: GRID, padding: '12px 22px', borderBottom: '1px solid var(--border)', minWidth: GRID_MIN_WIDTH }}>
              {['Name', 'Email', 'Role', 'Account', 'Activity', 'Actions'].map(h => (
                <span key={h} style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
              ))}
            </div>

            {staff.map((s, i) => {
              const activity = describeActivity(s)
              return (
                <div
                  key={s.id}
                  style={{
                    display: 'grid', gridTemplateColumns: GRID,
                    padding: '14px 22px',
                    borderBottom: i < staff.length - 1 ? '1px solid var(--muted)' : 'none',
                    alignItems: 'center', transition: 'background 0.1s', minWidth: GRID_MIN_WIDTH,
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--muted)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0, paddingRight: 12 }}>
                    <Avatar
                      name={s.full_name}
                      src={s.avatar_url}
                      size={34}
                      ring={activity.online ? 'rgba(21,128,61,0.45)' : null}
                    />
                    <div style={{ minWidth: 0 }}>
                      <button
                        type="button"
                        id={`btn-detail-${s.id}`}
                        onClick={() => setDetail(s)}
                        title="View staff details"
                        style={{
                          display: 'block', background: 'none', border: 'none', padding: 0,
                          cursor: 'pointer', textAlign: 'left',
                          fontSize: 14, fontWeight: 600, color: 'var(--foreground)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%',
                        }}
                      >
                        {s.full_name}
                      </button>
                      <p style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2, fontFamily: 'DM Mono' }}>
                        ID: {s.id.slice(0, 8)}…
                      </p>
                    </div>
                  </div>

                  <span style={{ fontSize: 13, color: 'var(--muted-foreground)', fontFamily: 'DM Mono', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>
                    {s.email}
                  </span>

                  <div><RoleBadge role={s.role} /></div>
                  <div><AccountBadge isActive={s.is_active} /></div>
                  <div><ActivityCell staff={s} /></div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <RowButton
                      id={`btn-view-${s.id}`}
                      label="View"
                      onClick={() => setDetail(s)}
                    />
                    <RowButton
                      id={`btn-edit-${s.id}`}
                      label="Edit"
                      onClick={() => setEditing(s)}
                    />
                    {s.is_active ? (
                      <ActionButton
                        id={`btn-deactivate-${s.id}`}
                        label="Deactivate"
                        tone="danger"
                        onClick={() => { setActionError(null); setPendingAction({ kind: 'deactivate', id: s.id, name: s.full_name }) }}
                      />
                    ) : (
                      <ActionButton
                        id={`btn-reactivate-${s.id}`}
                        label="Reactivate"
                        tone="success"
                        onClick={() => { setActionError(null); setPendingAction({ kind: 'reactivate', id: s.id, name: s.full_name }) }}
                      />
                    )}
                  </div>
                </div>
              )
            })}

            {staff.length === 0 && (
              <p style={{ padding: '40px 24px', fontSize: 14, color: 'var(--muted-foreground)' }}>No staff accounts yet. Add your first staff member above.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Add Staff Member ─────────────────────────────────── */}
      {showModal && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 20,
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div className="card fade-in dialog-card" style={{ width: '100%', maxWidth: 460, padding: '32px 28px', boxShadow: '0 25px 60px rgba(0,0,0,0.35)' }}>
            <h2 style={{ fontFamily: 'Fraunces', fontSize: 20, fontWeight: 700, color: 'var(--foreground)', marginBottom: 22 }}>
              Add Staff Member
            </h2>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label htmlFor="staff-name" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>Full Name</label>
                <input
                  id="staff-name" autoFocus className="input" type="text" required
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
                  placeholder="maria@wingtrack.ph"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  style={{ padding: '11px 14px', fontSize: 14 }}
                />
                <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 6 }}>
                  This becomes the member's sign-in address.
                </p>
              </div>
              <div>
                <label htmlFor="staff-password" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>Temporary Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="staff-password"
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    placeholder="Min. 8 characters"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    style={{ width: '100%', padding: '11px 40px 11px 14px', fontSize: 14 }}
                  />
                  <button
                    type="button"
                    id="toggle-staff-password"
                    onClick={() => setShowPassword(prev => !prev)}
                    style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--muted-foreground)', borderRadius: 4,
                    }}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
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
                  {STAFF_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              {formError && (
                <div role="alert" style={{ background: 'var(--danger-bg)', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', fontWeight: 500 }}>
                  {formError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" className="btn-ghost" onClick={() => setShowModal(false)} style={{ flex: 1, padding: '12px' }}>Cancel</button>
                <button id="btn-create-staff" type="submit" className="btn-primary" disabled={formLoading} style={{ flex: 2, padding: '12px' }}>
                  {formLoading ? 'Creating…' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── Detail panel ─────────────────────────────────────── */}
      <StaffDetailModal
        staff={detail}
        provisionedBy={
          detail?.created_by
            ? nameById.get(detail.created_by) ?? 'Administrator'
            : null
        }
        isSelf={Boolean(detail && self && detail.id === self.id)}
        onClose={() => setDetail(null)}
        onEdit={() => { setEditing(detail); setDetail(null) }}
      />

      {/* ── Edit dialog ──────────────────────────────────────── */}
      <EditStaffModal
        staff={editing}
        self={self}
        onClose={() => setEditing(null)}
        onSaved={applyEdit}
      />

      {/* ── Activate / deactivate confirmation ───────────────── */}
      <ConfirmDialog
        open={pending !== null}
        busy={actionBusy}
        tone={pending?.kind === 'deactivate' ? 'danger' : 'default'}
        title={
          pending?.kind === 'deactivate'
            ? `Deactivate ${pending.name}?`
            : `Reactivate ${pending?.name ?? ''}?`
        }
        message={
          pending?.kind === 'deactivate'
            ? 'They will be signed out and blocked from signing in. Their past sales and audit records are kept, and you can reactivate the account at any time.'
            : 'They will regain access to their account and be able to sign in again with their existing password.'
        }
        confirmLabel={pending?.kind === 'deactivate' ? 'Deactivate' : 'Reactivate'}
        onConfirm={runPendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  )
}
