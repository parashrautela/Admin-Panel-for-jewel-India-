// The whole credits-topup request flow, with every outside call (Supabase,
// Razorpay, the clock) passed in — so handler.test.ts runs it end to end under
// Node, and index.ts only wires the real services in.

import { GST_RATE_PERCENT, parseRate, type Pack } from '../razorpay-webhook/lib.ts'
import { buildOptions, paymentLinkBody } from './lib.ts'

export interface AuthUser {
  id: string
  email?: string | null
  phone?: string | null
}

export interface WholesalerRow {
  business_name?: string | null
  full_name?: string | null
  verification_status?: string | null
}

export type RazorpayResult =
  | { ok: true; id: string; shortUrl: string }
  | { ok: false; status: number; description: string }

export interface Deps {
  env: (name: string) => string
  /** The signed-in user behind the request's JWT, or null. */
  userFromJwt: (jwt: string) => Promise<AuthUser | null>
  /** Active packs, in display order. Throws when the database is unreachable. */
  activePacks: () => Promise<Pack[]>
  /** The caller's wholesalers row, or null. Throws when unreachable. */
  wholesalerOf: (userId: string) => Promise<WholesalerRow | null>
  createPaymentLink: (body: unknown, keyId: string, keySecret: string) => Promise<RazorpayResult>
  nowSeconds: () => number
  log: (level: 'info' | 'warn' | 'error', message: string, extra?: Record<string, unknown>) => void
}

export interface Reply {
  status: number
  body: Record<string, unknown>
}

const fail = (status: number, error: string, message: string): Reply => ({
  status,
  body: { ok: false, error, message },
})

const UNAVAILABLE = 'Buying credits is not available right now. Please try again later.'

export async function handleTopUp(
  method: string,
  authorization: string | null,
  rawBody: string,
  deps: Deps,
): Promise<Reply> {
  if (method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.')

  const rate = parseRate(deps.env('CREDITS_PER_RUPEE'))
  if (!rate) {
    deps.log('error', 'CREDITS_PER_RUPEE is not set to a positive number')
    return fail(503, 'not_configured', UNAVAILABLE)
  }

  // Who is buying comes from their session, never from the request body.
  const jwt = (authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  const user = jwt ? await deps.userFromJwt(jwt) : null
  if (!user) return fail(401, 'not_signed_in', 'Please sign in again.')

  let body: Record<string, unknown>
  try {
    const parsed = JSON.parse(rawBody || '{}')
    body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return fail(400, 'bad_request', 'The request was not valid JSON.')
  }

  let options
  try {
    options = buildOptions(await deps.activePacks(), rate)
  } catch (err) {
    deps.log('error', 'Could not load credit_packs', { error: String(err) })
    return fail(500, 'unavailable', UNAVAILABLE)
  }

  if (body.action === 'options') {
    return {
      status: 200,
      body: { ok: true, credits_per_rupee: rate, gst_percent: GST_RATE_PERCENT, packs: options },
    }
  }
  if (body.action !== 'create') return fail(400, 'unknown_action', 'Unknown action.')

  // Price and credits come from the server's pack list; the app only names a pack.
  const option = options.find((o) => o.key === body.pack_key)
  if (!option) return fail(400, 'unknown_pack', 'That pack is no longer available. Please reopen Top Up.')

  const keyId = deps.env('RAZORPAY_KEY_ID').trim()
  const keySecret = deps.env('RAZORPAY_KEY_SECRET').trim()
  if (!keyId || !keySecret) {
    deps.log('error', 'RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set')
    return fail(503, 'not_configured', UNAVAILABLE)
  }

  let wholesaler: WholesalerRow | null
  try {
    wholesaler = await deps.wholesalerOf(user.id)
  } catch (err) {
    deps.log('error', 'Could not load the wholesaler', { user_id: user.id, error: String(err) })
    return fail(500, 'unavailable', UNAVAILABLE)
  }
  // Only a verified wholesaler has a wallet for the webhook to credit.
  if (wholesaler?.verification_status !== 'verified') {
    return fail(403, 'not_verified', 'Your account needs to be verified before you can buy credits.')
  }

  const linkBody = paymentLinkBody(
    option,
    {
      userId: user.id,
      name: wholesaler.business_name || wholesaler.full_name,
      // From the sign-in itself, not the editable profile row, so the webhook's
      // contact check always lands on this same wholesaler.
      email: user.email,
      phone: user.phone,
    },
    deps.nowSeconds(),
  )

  const link = await deps.createPaymentLink(linkBody, keyId, keySecret)
  if (!link.ok) {
    deps.log('error', 'Razorpay refused to create a payment link', {
      user_id: user.id, pack: option.key, status: link.status, description: link.description,
    })
    return fail(502, 'payment_provider_error', 'Could not start the payment. Please try again in a minute.')
  }

  deps.log('info', 'Payment link created', {
    user_id: user.id, link_id: link.id, pack: option.key, amount_paise: option.total_paise, credits: option.credits,
  })
  return {
    status: 200,
    body: {
      ok: true,
      link_id: link.id,
      url: link.shortUrl,
      pack_key: option.key,
      total_inr: option.total_inr,
      credits: option.credits,
      expires_at: linkBody.expire_by,
    },
  }
}
