// Pure logic for the razorpay-webhook function: no network, no Deno APIs, no
// imports — so it can be unit-tested on its own (lib.test.ts) and index.ts
// stays a thin shell around it.

/** Custom (non-pack) grants above this go to manual handling, not the wallet. */
export const MAX_CUSTOM_CREDITS = 5000

/** Payment Link amounts are GST-inclusive at this rate. */
export const GST_RATE_PERCENT = 18

// ─────────────────────────────────────────────────────────────────────────────
// Signature — the security boundary
// ─────────────────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array | null {
  // HMAC-SHA256 → exactly 32 bytes → exactly 64 hex characters.
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null
  const out = new Uint8Array(32)
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/** Compares every byte regardless of where the first difference is. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/**
 * Razorpay signs the RAW request body: X-Razorpay-Signature is the hex
 * HMAC-SHA256 of those exact bytes, keyed with the webhook secret. Verify
 * before parsing anything — re-serialised JSON would not match.
 */
export async function verifyRazorpaySignature(
  rawBody: ArrayBuffer,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!secret || !signatureHeader) return false
  const provided = hexToBytes(signatureHeader.trim())
  if (!provided) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, rawBody))
  return timingSafeEqual(expected, provided)
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading Razorpay events
// ─────────────────────────────────────────────────────────────────────────────

export type Notes = Record<string, string>

/** One paid purchase, whichever Razorpay event reported it. */
export interface PaidPurchase {
  source: 'payment_link'            // later: 'order' (Route B, payment.captured)
  paymentId: string                 // pay_… — the dedupe key (provider_txn_id)
  providerRef: string | null        // plink_… (or order_… for Route B)
  amountPaidPaise: number
  currency: string
  notes: Notes
  customer: { contact: string | null; email: string | null; name: string | null }
  paymentMethod: string | null
}

function field(obj: unknown, ...path: string[]): unknown {
  let cur: unknown = obj
  for (const key of path) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

export function eventNameOf(event: unknown): string {
  return text(field(event, 'event')) ?? ''
}

/**
 * Notes are typed by hand in the Razorpay Dashboard, so keys are normalised:
 * "Wholesaler ID", "wholesaler-id" and "WHOLESALER_ID" all become
 * `wholesaler_id`. Razorpay sends `[]` rather than `{}` when there are none.
 */
export function notesOf(raw: unknown): Notes {
  const out: Notes = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.trim().toLowerCase().replace(/[\s-]+/g, '_')
    const val = text(value)
    if (name && val !== null) out[name] = val
  }
  return out
}

/** payment_link.paid → the purchase it represents, or why it can't be read. */
export function purchaseFromPaymentLinkPaid(event: unknown): PaidPurchase | { error: string } {
  const link = field(event, 'payload', 'payment_link', 'entity')
  const payment = field(event, 'payload', 'payment', 'entity')
  const paymentId = text(field(payment, 'id'))
  if (!link) return { error: 'payload.payment_link.entity is missing' }
  if (!paymentId) return { error: 'payload.payment.entity.id is missing' }

  // amount_paid is the link's total across payments; fall back to this payment.
  const amountPaid = field(link, 'amount_paid') ?? field(payment, 'amount')
  const amountPaidPaise = typeof amountPaid === 'number' ? amountPaid : Number(text(amountPaid))

  return {
    source: 'payment_link',
    paymentId,
    providerRef: text(field(link, 'id')),
    amountPaidPaise: Number.isSafeInteger(amountPaidPaise) ? amountPaidPaise : NaN,
    currency: (text(field(link, 'currency')) ?? text(field(payment, 'currency')) ?? '').toUpperCase(),
    notes: notesOf(field(link, 'notes')),
    customer: {
      contact: text(field(link, 'customer', 'contact')) ?? text(field(payment, 'contact')),
      email: text(field(link, 'customer', 'email')) ?? text(field(payment, 'email')),
      name: text(field(link, 'customer', 'name')),
    },
    paymentMethod: text(field(payment, 'method')),
  }
}

/** Best-effort ids for the issue log when a payload can't be fully read. */
export function idsOf(event: unknown): { paymentId: string | null; linkId: string | null } {
  return {
    paymentId: text(field(event, 'payload', 'payment', 'entity', 'id')),
    linkId: text(field(event, 'payload', 'payment_link', 'entity', 'id')),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Who paid
// ─────────────────────────────────────────────────────────────────────────────

/** Indian mobile → its 10 digits, or null. Mirrors credits_normalize_in_phone. */
export function normalizeIndianMobile(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  const match = digits.match(/^(?:0091|091|91|0)?([6-9]\d{9})$/)
  return match ? match[1] : null
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const email = (raw ?? '').trim().toLowerCase()
  return email.includes('@') ? email : null
}

/** One row of razorpay_find_wholesaler(). */
export interface Candidate {
  wholesaler_user_id: string
  matched_on: 'wholesaler_id' | 'phone' | 'email' | string
  wholesaler_state: string | null
}

export type WholesalerDecision =
  | { ok: true; userId: string; matchedOn: string; state: string | null }
  | { ok: false; reason: string }

/**
 * Exactly one wholesaler, or manual handling.
 *
 * notes.wholesaler_id wins when it names a real wholesaler — unless the
 * link's phone/email clearly belong to a DIFFERENT one, which is what pasting
 * the wrong id looks like; that goes to a human rather than the wrong wallet.
 * Without a usable id, phone and email must agree on a single wholesaler.
 */
export function decideWholesaler(candidates: Candidate[]): WholesalerDecision {
  const unique = (rows: Candidate[]) => [...new Set(rows.map((c) => c.wholesaler_user_id))]
  const byId = unique(candidates.filter((c) => c.matched_on === 'wholesaler_id'))
  const byContact = unique(candidates.filter((c) => c.matched_on !== 'wholesaler_id'))
  const stateOf = (userId: string) =>
    candidates.find((c) => c.wholesaler_user_id === userId && c.wholesaler_state)?.wholesaler_state ?? null

  if (byId.length > 1) return { ok: false, reason: 'wholesaler_id_matches_several_wholesalers' }

  if (byId.length === 1) {
    const [userId] = byId
    if (byContact.length > 0 && !byContact.includes(userId)) {
      return { ok: false, reason: 'wholesaler_id_disagrees_with_customer_contact' }
    }
    return { ok: true, userId, matchedOn: 'wholesaler_id', state: stateOf(userId) }
  }

  if (byContact.length === 1) {
    const [userId] = byContact
    const how = [...new Set(candidates.filter((c) => c.wholesaler_user_id === userId).map((c) => c.matched_on))]
    return { ok: true, userId, matchedOn: how.sort().join('+'), state: stateOf(userId) }
  }

  if (byContact.length > 1) return { ok: false, reason: 'customer_contact_matches_several_wholesalers' }
  return { ok: false, reason: 'no_matching_wholesaler' }
}

// ─────────────────────────────────────────────────────────────────────────────
// How many credits
// ─────────────────────────────────────────────────────────────────────────────

/** One row of credit_packs. */
export interface Pack {
  key: string
  label?: string | null
  credits: number
  price_inr_ex_gst: number | string
  active: boolean
}

export type CreditDecision =
  | { ok: true; credits: number; packKey: string; pack: Pack | null }
  | { ok: false; reason: string }

/** "1,300" / "1 300" / "600" → a positive integer, or null. */
export function parseCredits(raw: string): number | null {
  const cleaned = raw.replace(/[\s,_]/g, '')
  if (!/^\d+$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

function findPack(name: string, packs: Pack[]): Pack | null {
  const wanted = name.trim().toLowerCase()
  return packs.find((p) => p.active && (p.key === wanted || (p.label ?? '').trim().toLowerCase() === wanted)) ?? null
}

/**
 * notes.pack (a credit_packs key or label) or notes.credits (a custom deal).
 * Notes are set by the Jewel India team, not the payer, so once the signature
 * checks out they are trusted — but anything unclear goes to a human.
 */
export function decideCredits(notes: Notes, packs: Pack[]): CreditDecision {
  const packName = notes.pack ?? null
  const creditsRaw = notes.credits ?? null
  const pack = packName ? findPack(packName, packs) : null

  if (creditsRaw !== null) {
    const credits = parseCredits(creditsRaw)
    if (credits === null) return { ok: false, reason: `invalid_credits_note: ${creditsRaw}` }
    if (pack) {
      if (pack.credits !== credits) {
        return { ok: false, reason: `pack_and_credits_disagree: ${pack.key}=${pack.credits}, credits=${credits}` }
      }
      return { ok: true, credits, packKey: pack.key, pack }
    }
    // A custom deal. An unrecognised pack name alongside it (e.g. "diwali
    // offer") is just a label — it stays in the receipt's notes.
    if (credits > MAX_CUSTOM_CREDITS) {
      return { ok: false, reason: `custom_credits_over_cap: ${credits} > ${MAX_CUSTOM_CREDITS}` }
    }
    return { ok: true, credits, packKey: 'custom', pack: null }
  }

  if (packName !== null) {
    if (!pack) return { ok: false, reason: `unknown_or_inactive_pack: ${packName}` }
    return { ok: true, credits: pack.credits, packKey: pack.key, pack }
  }

  return { ok: false, reason: 'no_pack_or_credits_in_notes' }
}

/**
 * Below this share of the credits' list value, a payment goes to a human.
 * Discounts are normal for a sales-assisted deal; half price is not a
 * discount, it's a typo.
 */
export const MIN_PAID_SHARE_OF_LIST = 0.5

/**
 * Notes are trusted, but they're typed by hand — and a pack name or credit
 * count on the wrong link grants the wrong amount with nothing to stop it:
 * "bulk" on a ₹589 link is 1,300 credits for the price of 50. This catches
 * payments far below list: less than half of what those credits cost at the
 * pack's price (or, for a custom deal, at the best active pack's rate).
 */
export function checkPaidAgainstList(
  decision: { credits: number; pack: Pack | null },
  packs: Pack[],
  paidPaise: number,
): { ok: true } | { ok: false; reason: string } {
  let listExGstPaise: number
  if (decision.pack) {
    listExGstPaise = Math.round(Number(decision.pack.price_inr_ex_gst) * 100)
  } else {
    const rates = packs
      .filter((p) => p.active && p.credits > 0 && Number(p.price_inr_ex_gst) > 0)
      .map((p) => (Number(p.price_inr_ex_gst) * 100) / p.credits)
    // No priced packs to judge a custom deal against — nothing to compare.
    if (rates.length === 0) return { ok: true }
    listExGstPaise = Math.round(Math.min(...rates) * decision.credits)
  }

  const listPaise = Math.round((listExGstPaise * (100 + GST_RATE_PERCENT)) / 100)
  if (paidPaise < listPaise * MIN_PAID_SHARE_OF_LIST) {
    return {
      ok: false,
      reason: `paid_far_below_list: paid ₹${paidPaise / 100} for ${decision.credits} credits, list ₹${listPaise / 100}`,
    }
  }
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Money
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Split a GST-inclusive amount: gst = paid − paid/1.18, rounded to 2dp.
 * Done in integer paise so it is exact; amountInr (taxable) + gstInr is
 * always exactly what was paid.
 */
export function splitGstInclusive(paidPaise: number): { amountInr: number; gstInr: number; paidInr: number } {
  const taxablePaise = Math.round((paidPaise * 100) / (100 + GST_RATE_PERCENT))
  return {
    amountInr: taxablePaise / 100,
    gstInr: (paidPaise - taxablePaise) / 100,
    paidInr: paidPaise / 100,
  }
}

/** Mask a phone for logs: keep the last 4 digits. */
export function maskPhone(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  return digits.length > 4 ? `…${digits.slice(-4)}` : '…'
}
