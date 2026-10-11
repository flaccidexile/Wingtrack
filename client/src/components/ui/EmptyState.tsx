import type { ReactNode } from 'react'

interface EmptyStateProps {
  /** Short headline, e.g. "No sales yet". */
  title: string
  /** Optional supporting line explaining what would put something here. */
  hint?: string
  /** A 24x24 stroke icon path, rendered inside the tinted well. */
  icon?: ReactNode
  /** Optional call to action, e.g. a "Add item" button. */
  action?: ReactNode
  /** Use the compact variant inside a narrow panel. */
  compact?: boolean
}

/**
 * The standard "nothing here yet" panel.
 *
 * WHY THIS EXISTS
 * ---------------
 * Empty states were previously a single grey sentence ("No sales data yet."),
 * which is indistinguishable from a failed request. An icon well plus a title
 * and a hint reads as a deliberate, finished state — and when there is an
 * obvious next step, `action` gives the user somewhere to go.
 */
export default function EmptyState({ title, hint, icon, action, compact = false }: EmptyStateProps) {
  return (
    <div className="empty-state" style={compact ? { padding: '30px 18px' } : undefined}>
      {icon && (
        <div className="empty-state-icon" style={compact ? { width: 40, height: 40 } : undefined}>
          <svg
            width={compact ? 18 : 22}
            height={compact ? 18 : 22}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {icon}
          </svg>
        </div>
      )}
      <p className="empty-state-title">{title}</p>
      {hint && <p className="empty-state-hint">{hint}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  )
}

/** Shared icon paths, so empty states stay visually consistent across pages. */
export const EMPTY_ICONS = {
  chart:   <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
  receipt: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
  box:     <><path d="M3 6l9-3 9 3v12l-9 3-9-3V6z" /><path d="M12 3v18M3 6l9 3 9-3" /></>,
  users:   <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></>,
  search:  <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  food:    <><path d="M3 2v7a3 3 0 0 0 3 3 3 3 0 0 0 3-3V2" /><path d="M6 12v10" /><path d="M17 2c-1.7 1.2-2.5 3-2.5 5.5S15.3 12 17 13v9" /></>,
}
