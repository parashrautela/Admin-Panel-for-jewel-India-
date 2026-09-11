// Pure logic for credits-topup: no network, no Deno APIs, so it is unit-tested
// on its own (lib.test.ts). Money rules come from razorpay-webhook/lib.ts, so
// what this function PROMISES is computed exactly the way the webhook GRANTS.

import {
  GST_RATE_PERCENT,
  normalizeIndianMobile,
  splitGstInclusive,
  type Pack,
} from '../razorpay-webhook/lib.ts'

/** A Payment Link stays payable this long, then Razorpay expires it. */
export const LINK_LIFETIME_SECONDS = 60 * 60

/** One pack as the app shows it: what it costs and what it buys. */
export interface TopUpOption {
  key: string
  label: string
  price_inr: number   // excluding GST
  gst_inr: number
  total_inr: number   // what the wholesaler pays
  total_paise: number
  credits: number
}

/** A pack's GST-inclusive total, in paise. */
export function totalPaiseFor(priceExGstInr: number): number {
  return Math.round((priceExGstInr * 100 * (100 + GST_RATE_PERCENT)) / 100)
}

/**
 * The credits razorpay-webhook will grant when `totalPaise` is paid — the
 * same split and rounding, so the app never promises one number and the
 * wallet receives another.
 */
export function creditsForTotal(totalPaise: number, creditsPerRupee: number): number {
  const taxablePaise = Math.round(splitGstInclusive(totalPaise).amountInr * 100)
  return Math.floor((taxablePaise * creditsPerRupee) / 100)
}

/** Active, priced packs → what the app offers, in the order given. */
export function buildOptions(packs: Pack[], creditsPerRupee: number): TopUpOption[] {
  return packs
    .filter((p) => p.active && Number(p.price_inr_ex_gst) > 0)
    .map((p) => {
      const totalPaise = totalPaiseFor(Number(p.price_inr_ex_gst))
      const split = splitGstInclusive(totalPaise)
      return {
        key: p.key,
        label: (p.label ?? '').trim() || p.key,
        price_inr: split.amountInr,
        gst_inr: split.gstInr,
        total_inr: split.paidInr,
        total_paise: totalPaise,
        credits: creditsForTotal(totalPaise, creditsPerRupee),
      }
    })
    .filter((o) => o.credits > 0)
}

export interface Buyer {
  /** auth.users.id — becomes notes.wholesaler_id, which the webhook reads. */
  userId: string
  name?: string | null
  email?: string | null
  phone?: string | null
}

/**
 * The body for Razorpay's POST /v1/payment_links.
 *
 * notes.wholesaler_id is the buyer's own auth id, taken from their session by
 * the caller — never from anything the app sends — so nobody can buy credits
 * into someone else's wallet. There is no `credits` note: the webhook works
 * the credits out from the amount paid, exactly as `creditsForTotal` does.
 */
export function paymentLinkBody(option: TopUpOption, buyer: Buyer, nowSeconds: number) {
  const customer: Record<string, string> = {}
  const name = (buyer.name ?? '').trim()
  if (name) customer.name = name.slice(0, 120)
  const email = (buyer.email ?? '').trim().toLowerCase()
  if (email.includes('@')) customer.email = email
  const mobile = normalizeIndianMobile(buyer.phone)
  if (mobile) customer.contact = `+91${mobile}`

  return {
    amount: option.total_paise,
    currency: 'INR',
    accept_partial: false,
    description: `Jewel India credits: ${option.credits.toLocaleString('en-IN')} coins`,
    ...(Object.keys(customer).length > 0 ? { customer } : {}),
    notify: { sms: false, email: false },
    reminder_enable: false,
    expire_by: nowSeconds + LINK_LIFETIME_SECONDS,
    notes: {
      wholesaler_id: buyer.userId,
      pack: option.key,
      source: 'app',
    },
  }
}
