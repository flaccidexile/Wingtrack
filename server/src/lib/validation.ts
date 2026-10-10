/**
 * Shared server-side validation rules.
 *
 * Keep these in sync with the client (`client/src/lib/validation.ts`) so the
 * UI and the API agree on what is acceptable.
 */

/** Minimum password length accepted anywhere in the app. */
export const MIN_PASSWORD_LENGTH = 8

/** Maximum password length accepted by the auth provider. */
export const MAX_PASSWORD_LENGTH = 72

/** Upper bound for a menu price — keeps values inside the numeric(10,2) column. */
export const MAX_PRICE = 1_000_000

/** Maximum quantity for a single order line. */
export const MAX_QUANTITY = 999

/** Maximum absolute stock adjustment in one movement. */
export const MAX_ADJUSTMENT = 1_000_000

/** VAT rate applied to a sale subtotal. */
export const VAT_RATE = 0.12

/**
 * Validate a password against the shared policy.
 * Returns `null` when the password is acceptable, otherwise a user-facing message.
 */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Password is required.'
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters long.`
  }
  return null
}
