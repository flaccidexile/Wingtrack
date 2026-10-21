import { supabase } from './supabase'

export type NotifCategory = 'order' | 'inventory' | 'staff' | 'system'

export interface AppNotification {
  id: string
  category: NotifCategory
  title: string
  body: string
  ts: string // ISO string
  read: boolean
}

const STORAGE_KEY = 'wingtrack_notifications_store'
const EVENT_KEY = 'wingtrack_notification_event'
const BROADCAST_CHANNEL_NAME = 'wingtrack_notifications'

let bc: BroadcastChannel | null = null
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
  }
} catch {
  // BroadcastChannel not supported in this environment
}

/**
 * Get all stored notifications from localStorage.
 */
export function getStoredNotifications(): AppNotification[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed
    }
  } catch {
    // ignore parse error
  }
  return []
}

/**
 * Save notifications list to localStorage (capped at 50).
 */
export function saveNotifications(notifs: AppNotification[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs.slice(0, 50)))
  } catch {
    // quota exceeded or private mode
  }
}

/**
 * Dispatches a notification across all open windows, tabs, and devices.
 */
export function dispatchNotification(item: {
  category: NotifCategory
  title: string
  body: string
}): AppNotification {
  const notif: AppNotification = {
    id: crypto.randomUUID(),
    category: item.category,
    title: item.title,
    body: item.body,
    ts: new Date().toISOString(),
    read: false,
  }

  // 1. Save locally
  const current = getStoredNotifications()
  saveNotifications([notif, ...current])

  // 2. Broadcast via BroadcastChannel (same browser, other tabs/windows)
  try {
    if (bc) {
      bc.postMessage(notif)
    }
  } catch {
    // ignore
  }

  // 3. Fallback broadcast via localStorage storage event
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(EVENT_KEY, JSON.stringify({ notif, rand: Math.random() }))
    }
  } catch {
    // ignore
  }

  // 4. Broadcast via Supabase Realtime broadcast channel (cross-device)
  try {
    supabase.channel('wingtrack-live-feed').send({
      type: 'broadcast',
      event: 'app_notification',
      payload: notif,
    })
  } catch {
    // ignore
  }

  return notif
}

/**
 * Subscribes to notifications arriving from other windows or Supabase.
 */
export function subscribeNotifications(
  onNotification: (notif: AppNotification) => void
): () => void {
  // 1. Listen on BroadcastChannel
  const handleBcMessage = (event: MessageEvent) => {
    if (event.data && typeof event.data === 'object' && event.data.id) {
      onNotification(event.data as AppNotification)
    }
  }

  if (bc) {
    bc.addEventListener('message', handleBcMessage)
  }

  // 2. Listen on window storage event (fallback for cross-window)
  const handleStorage = (event: StorageEvent) => {
    if (event.key === EVENT_KEY && event.newValue) {
      try {
        const data = JSON.parse(event.newValue)
        if (data?.notif?.id) {
          onNotification(data.notif as AppNotification)
        }
      } catch {
        // ignore
      }
    }
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorage)
  }

  // 3. Listen on Supabase Realtime broadcast
  const liveChannel = supabase
    .channel('wingtrack-live-feed')
    .on('broadcast', { event: 'app_notification' }, payload => {
      if (payload.payload?.id) {
        onNotification(payload.payload as AppNotification)
      }
    })
    .subscribe()

  return () => {
    if (bc) {
      bc.removeEventListener('message', handleBcMessage)
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorage)
    }
    supabase.removeChannel(liveChannel)
  }
}
