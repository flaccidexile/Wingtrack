import type { StaffProfile } from '@/types'

/**
 * How recently a member must have been seen to count as "online now".
 *
 * The heartbeat runs every ~45 seconds, so this tolerates one or two missed
 * beats (a backgrounded tab, a brief network drop) without flapping the
 * indicator, while still clearing a genuinely closed tab within two minutes.
 */
export const ONLINE_WINDOW_MS = 2 * 60 * 1000

/** How often the client stamps presence while the app is open. */
export const HEARTBEAT_INTERVAL_MS = 45 * 1000

/** Presence tone — drives the dot colour next to the activity label. */
export type ActivityTone = 'online' | 'recent' | 'stale' | 'never' | 'disabled'

export interface ActivityState {
  /** Short label for the ACTIVITY column: "Active now", "Last seen 9h ago". */
  label: string
  tone: ActivityTone
  /** True only when the member is within the online window. */
  online: boolean
}

const TONE_COLOR: Record<ActivityTone, string> = {
  online:   '#15803d',
  recent:   '#b45309',
  stale:    '#9ca3af',
  never:    '#9ca3af',
  disabled: '#9ca3af',
}

/** The dot colour for an activity tone. */
export function activityColor(tone: ActivityTone): string {
  return TONE_COLOR[tone]
}

/** Parses a timestamp, tolerating null/undefined/garbage without throwing. */
function toTime(value?: string | null): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

/** True when the member has been seen inside the online window. */
export function isOnline(lastSeenAt?: string | null): boolean {
  const ms = toTime(lastSeenAt)
  if (ms === null) return false
  return Date.now() - ms < ONLINE_WINDOW_MS
}

/**
 * Renders a past timestamp as a compact age: "just now", "22 min ago",
 * "9h ago", "6 d ago", "3 mo ago".
 *
 * Deliberately coarse — the Staff Manager answers "is this person around and
 * when were they last on?" rather than reporting an exact instant.
 */
export function formatRelativeTime(value?: string | null): string | null {
  const ms = toTime(value)
  if (ms === null) return null

  const seconds = Math.floor((Date.now() - ms) / 1000)
  // A clock skew between client and database can make a fresh stamp look
  // slightly future-dated; clamp rather than render "-3 sec ago".
  if (seconds < 45) return 'just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} d ago`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months} mo ago`

  return `${Math.floor(months / 12)} y ago`
}

/**
 * The most recent evidence that this person was around.
 *
 * Two sources feed the ACTIVITY column:
 *
 * - `last_seen_at` — our own heartbeat. Precise, and the only thing that can
 *   distinguish "active now" from "closed the tab". Requires the presence
 *   migration.
 * - `last_sign_in_at` — the auth record of the sign-in moment. Always
 *   available, because the server merges it in from `auth.users`.
 *
 * Taking the later of the two keeps the screen useful on a database where the
 * migration has not been applied: instead of "Never signed in" against
 * everyone, the list still shows when each person was last around.
 */
export function latestActivity(staff: StaffProfile): string | null {
  const times = [staff.last_seen_at, staff.last_sign_in_at]
    .map(toTime)
    .filter((t): t is number => t !== null)

  if (times.length === 0) return null
  return new Date(Math.max(...times)).toISOString()
}

/**
 * The ACTIVITY cell for one staff member.
 *
 * A deactivated account reports its access state rather than freshness —
 * "Active now" on an account that cannot sign in would be misleading.
 */
export function describeActivity(staff: StaffProfile): ActivityState {
  if (!staff.is_active) {
    return { label: 'Deactivated', tone: 'disabled', online: false }
  }

  if (isOnline(staff.last_seen_at)) {
    return { label: 'Active now', tone: 'online', online: true }
  }

  const lastActive = latestActivity(staff)
  const relative = formatRelativeTime(lastActive)

  if (!relative) {
    return { label: 'Never signed in', tone: 'never', online: false }
  }

  const hoursAgo = (() => {
    const ms = toTime(lastActive)
    return ms === null ? Infinity : (Date.now() - ms) / 3_600_000
  })()

  return {
    label: `Last seen ${relative}`,
    // Anything inside a day is "recent"; beyond that the member is treated as
    // dormant so the eye is drawn to the people actually around today.
    tone: hoursAgo < 24 ? 'recent' : 'stale',
    online: false,
  }
}

/**
 * Formats a full timestamp for the detail panel: "Oct 11, 2026, 2:02 AM".
 * Returns an em dash for missing values so the grid never collapses.
 */
export function formatAbsolute(value?: string | null): string {
  const ms = toTime(value)
  if (ms === null) return '—'
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Up to two initials for an avatar fallback. */
export function initialsOf(name?: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts.map(p => p[0]).slice(0, 2).join('').toUpperCase()
}
