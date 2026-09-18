// Pure helpers for staff-accounts: usernames, addresses and passwords.
// No I/O here, so lib.test.ts pins every rule down.

/** Where staff usernames live. It is only a username: nothing is ever sent there. */
export const DEFAULT_USERNAME_DOMAIN = 'jewelindia.shop'

export const USERNAME_MIN = 3
export const USERNAME_MAX = 40
/** Lower-case letters and digits, with single dots between runs. */
export const USERNAME_PATTERN = /^[a-z0-9]+(\.[a-z0-9]+)*$/

export const PASSWORD_LENGTH = 14

/** Letters and digits only, lower-cased; everything else dropped. */
export function slug(text: string): string {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * `first.store` — the person's first name and the store's name, as the web
 * suggested them, minus the made-up domain. Falls back to `staff` when a
 * name has nothing usable in it.
 */
export function suggestUsername(fullName: string, businessName: string): string {
  const first = slug((fullName ?? '').trim().split(/\s+/)[0] ?? '') || 'staff'
  const store = slug(businessName ?? '')
  const base = store ? `${first}.${store}` : first
  return base.slice(0, USERNAME_MAX).replace(/\.$/, '')
}

/** The nth alternative when a username is taken: `priya.pine2`, `priya.pine3`, … */
export function withSuffix(username: string, n: number): string {
  if (n <= 1) return username
  const suffix = String(n)
  return username.slice(0, USERNAME_MAX - suffix.length) + suffix
}

export function validateUsername(raw: unknown): { ok: true; username: string } | { ok: false; message: string } {
  const username = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (username.length < USERNAME_MIN) {
    return { ok: false, message: `A username needs at least ${USERNAME_MIN} characters.` }
  }
  if (username.length > USERNAME_MAX) {
    return { ok: false, message: `A username can have at most ${USERNAME_MAX} characters.` }
  }
  if (!USERNAME_PATTERN.test(username)) {
    return { ok: false, message: 'Use lower-case letters, digits and dots only, like priya.pinejewels.' }
  }
  return { ok: true, username }
}

export function addressFor(username: string, domain: string): string {
  return `${username}@${domain}`
}

/** True when the address is a staff username rather than a real mailbox. */
export function isStaffAddress(email: string, domain: string): boolean {
  return email.toLowerCase().endsWith(`@${domain.toLowerCase()}`)
}

const LOWER = 'abcdefghjkmnpqrstuvwxyz'   // no i, l, o
const UPPER = 'ABCDEFGHJKMNPQRSTUVWXYZ'   // no I, L, O
const DIGITS = '23456789'                 // no 0, 1
const SYMBOLS = '!@#$%&*?'
const ALL = LOWER + UPPER + DIGITS + SYMBOLS

/**
 * A password nobody has to type twice: 14 characters with at least one of
 * each class (so it passes any strength rule the auth server enforces) and
 * no look-alike characters. `pick(n)` returns a uniform integer in [0, n).
 */
export function generatePassword(pick: (n: number) => number): string {
  const chars = [
    LOWER[pick(LOWER.length)],
    UPPER[pick(UPPER.length)],
    DIGITS[pick(DIGITS.length)],
    SYMBOLS[pick(SYMBOLS.length)],
  ]
  while (chars.length < PASSWORD_LENGTH) chars.push(ALL[pick(ALL.length)])
  // Fisher–Yates, so the guaranteed classes are not always at the front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = pick(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normaliseEmail(raw: unknown): string | null {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return EMAIL_PATTERN.test(email) ? email : null
}

export function cleanName(raw: unknown): string | null {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : ''
  return name.length >= 2 && name.length <= 80 ? name : null
}

export function cleanOptional(raw: unknown, max = 80): string | null {
  const text = typeof raw === 'string' ? raw.trim() : ''
  return text ? text.slice(0, max) : null
}
