import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import Avatar from '@/components/ui/Avatar'
import { ROLE_BADGE, roleLabel } from '@/lib/staff'
import { activityColor, describeActivity, formatAbsolute } from '@/lib/presence'
import type { StaffProfile } from '@/types'

interface StaffDetailModalProps {
  /** The member being inspected, or null to keep the panel closed. */
  staff: StaffProfile | null
  /** Name of the admin who provisioned this account, when it can be resolved. */
  provisionedBy?: string | null
  /** The signed-in admin, so "you" can be labelled honestly. */
  isSelf?: boolean
  onClose: () => void
  onEdit: () => void
}

/** One label/value cell in the detail grid. */
function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{
        fontSize: 10.5, fontFamily: 'DM Mono', letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 5,
      }}>
        {label}
      </p>
      <p style={{
        fontSize: 13, color: 'var(--foreground)', lineHeight: 1.45,
        fontFamily: mono ? 'DM Mono' : 'DM Sans',
        overflowWrap: 'anywhere',
      }}>
        {value}
      </p>
    </div>
  )
}

/**
 * Read-only profile panel for one staff member.
 *
 * Answers "who is this, when were they last around, and what can they do?"
 * without making an admin open the edit dialog — and, unlike the table, it can
 * show the full UUIDs and the exact account state.
 */
export default function StaffDetailModal({
  staff,
  provisionedBy,
  isSelf = false,
  onClose,
  onEdit,
}: StaffDetailModalProps) {
  // Close on Escape and lock background scrolling while open.
  useEffect(() => {
    if (!staff) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [staff, onClose])

  if (!staff || typeof document === 'undefined') return null

  const activity = describeActivity(staff)
  const badge = ROLE_BADGE[staff.role]

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: 20,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="card fade-in dialog-card"
        style={{ width: '100%', maxWidth: 520, padding: '28px 26px', boxShadow: '0 25px 60px rgba(0,0,0,0.35)' }}
      >
        {/* Identity */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0, width: 78 }}>
            <Avatar
              name={staff.full_name}
              src={staff.avatar_url}
              size={72}
              ring={activity.online ? 'rgba(21,128,61,0.45)' : null}
            />
            {isSelf ? (
              <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                That's you
              </span>
            ) : !staff.avatar_url ? (
              <span style={{ fontSize: 10.5, color: 'var(--muted-foreground)', textAlign: 'center', lineHeight: 1.35 }}>
                No photo yet
              </span>
            ) : null}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ fontFamily: 'Fraunces', fontSize: 21, fontWeight: 700, color: 'var(--foreground)', overflowWrap: 'anywhere' }}>
              {staff.full_name}
            </h2>
            <p style={{ fontSize: 12.5, color: 'var(--muted-foreground)', fontFamily: 'DM Mono', marginTop: 3, overflowWrap: 'anywhere' }}>
              {staff.email}
            </p>

            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, padding: '4px 11px', borderRadius: 20, fontWeight: 600, background: badge.bg, color: badge.color }}>
                {roleLabel(staff.role)}
              </span>
              <span style={{
                fontSize: 12, padding: '4px 11px', borderRadius: 20, fontWeight: 700,
                background: staff.is_active ? '#e8f5e9' : '#f3f4f6',
                color: staff.is_active ? '#15803d' : '#6b7280',
              }}>
                {staff.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>

        {/* Presence strip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderRadius: 8, background: 'var(--muted)', marginBottom: 20,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: activityColor(activity.tone), flexShrink: 0,
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>{activity.label}</span>
        </div>

        {/* Facts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '18px 20px', marginBottom: 24 }}>
          <Detail label="Last signed in"  value={formatAbsolute(staff.last_sign_in_at)} />
          <Detail label="Last seen active" value={formatAbsolute(staff.last_seen_at)} />
          <Detail label="Account created"  value={formatAbsolute(staff.created_at)} />
          <Detail label="Last updated"     value={formatAbsolute(staff.updated_at)} />
          <Detail label="Provisioned by"   value={provisionedBy ?? '—'} />
          <Detail
            label="Account status"
            value={staff.is_active ? 'Can sign in' : 'Access revoked'}
          />
          <Detail label="Staff ID"    value={staff.id} mono />
          <Detail label="Auth user ID" value={staff.user_id} mono />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn-ghost" onClick={onClose} style={{ flex: 1, padding: '11px' }}>
            Close
          </button>
          <button
            id="btn-edit-profile"
            type="button"
            className="btn-primary"
            onClick={onEdit}
            style={{ flex: 1.4, padding: '11px' }}
          >
            Edit Profile
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
