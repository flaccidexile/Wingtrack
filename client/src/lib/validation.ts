/**
 * Shared client-side validation rules.
 *
 * Keep these in sync with the server so a value accepted by the UI is never
 * rejected by the API (and vice versa).
 */

/** Minimum password length — matches `MIN_PASSWORD_LENGTH` in the server routes. */
export const MIN_PASSWORD_LENGTH = 8

/** Maximum password length accepted by the auth provider. */
export const MAX_PASSWORD_LENGTH = 72

/** Upper bound for a menu price. Mirrors `MAX_PRICE` in server/src/routes/products.ts. */
export const MAX_PRICE = 1_000_000

/** Maximum quantity for a single cart line. Mirrors `MAX_QUANTITY` in server/src/routes/checkout.ts. */
export const MAX_CART_QUANTITY = 999

export interface PasswordRule {
  key: 'length' | 'uppercase' | 'number' | 'special'
  label: string
  met: boolean
}

/** Evaluate a password against the full policy, returning each rule and its state. */
export function checkPasswordStrength(p: string): PasswordRule[] {
  return [
    { key: 'length', label: `At least ${MIN_PASSWORD_LENGTH} characters`, met: p.length >= MIN_PASSWORD_LENGTH },
    { key: 'uppercase', label: 'One uppercase letter', met: /[A-Z]/.test(p) },
    { key: 'number', label: 'One number', met: /[0-9]/.test(p) },
    { key: 'special', label: 'One special character', met: /[^A-Za-z0-9]/.test(p) },
  ]
}

/** True when every password rule is satisfied. */
export function isPasswordValid(p: string): boolean {
  return checkPasswordStrength(p).every(r => r.met)
}
