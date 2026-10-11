import type { StaffRole } from '@/types'

/**
 * Role vocabulary shared by the Staff Manager, the Edit dialog and Settings.
 *
 * Kept in one place so the picker, the table badge and the detail panel can
 * never disagree about what a role is called.
 */
export const STAFF_ROLES: { value: StaffRole; label: string }[] = [
  { value: 'cashier',             label: 'Cashier' },
  { value: 'inventory_personnel', label: 'Inventory Personnel' },
  { value: 'admin',               label: 'Admin / Manager' },
]

export const ROLE_LABEL: Record<StaffRole, string> = {
  admin:               'Admin / Manager',
  cashier:             'Cashier',
  inventory_personnel: 'Inventory Personnel',
}

/** Tint pairs for the role pill, matching the rest of the app's palette. */
export const ROLE_BADGE: Record<StaffRole, { bg: string; color: string }> = {
  admin:               { bg: 'rgba(155,94,40,0.12)', color: '#9b5e28' },
  cashier:             { bg: 'rgba(21,128,61,0.1)',  color: '#15803d' },
  inventory_personnel: { bg: 'rgba(30,64,175,0.1)',  color: '#1d4ed8' },
}

export function roleLabel(role: StaffRole | null | undefined): string {
  return role ? ROLE_LABEL[role] ?? role : '—'
}
