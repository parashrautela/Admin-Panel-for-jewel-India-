// Razorpay → Treasure Chest: grants credits when a Payment Link is paid.
//
// Deployed WITHOUT Supabase JWT verification (Razorpay cannot send one), so
// the X-Razorpay-Signature check below is the only thing between the public
// internet and free credits. Deploy/config steps: README.md next to this file.
//
// Route A (TREASURE_CHEST_BUILD_PLAN.md §3.2): the Jewel India team creates the
// Payment Link by hand in the Razorpay Dashboard with a note
//   wholesaler_id = <uuid>            (and optionally credits = N for a deal)
// and this function reads it back when Razorpay reports the link paid. The
// credits granted are the amount paid, excluding GST, × CREDITS_PER_RUPEE.
//
// Every paid payment ends in exactly one of:
//   • credits granted                       → 200
//   • already granted (Razorpay retry)      → 200, nothing granted
//   • recorded in credit_purchase_issues    → 200, a human finishes it
//   • a transient failure                   → 500, Razorpay retries (deduped)
// A payment is never silently dropped.

// @ts-ignore: Deno import
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
// @ts-ignore: Deno import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  GST_RATE_PERCENT,
  decideCredits,
  decideWholesaler,
  eventNameOf,
  idsOf,
  maskPhone,
  normalizeEmail,
  normalizeIndianMobile,
  parseRate,
  purchaseFromPaymentLinkPaid,
  splitGstInclusive,
  verifyRazorpaySignature,
  type Candidate,
  type Pack,
  type PaidPurchase,
} from "./lib.ts"

// Razorpay payloads are a few KB. The endpoint is public, so refuse anything
// large before buffering it.
const MAX_BODY_BYTES = 1_000_000

function env(name: string): string {
  // @ts-ignore: Deno global
  return Deno.env.get(name) ?? ''
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function log(level: 'info' | 'warn' | 'error', message: string, extra: Record<string, unknown> = {}) {
  console[level](JSON.stringify({ fn: 'razorpay-webhook', level, message, ...extra }))
}

// deno-lint-ignore no-explicit-any
type SupabaseClient = any

interface Context {
  event: unknown
  eventName: string
  eventId: string | null
  supabase: SupabaseClient
  /** CREDITS_PER_RUPEE: credits per ₹1 of the amount paid, excluding GST. */
  creditsPerRupee: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Events. Each handler turns its event into a PaidPurchase and settles it.
// ─────────────────────────────────────────────────────────────────────────────
const HANDLERS: Record<string, (ctx: Context) => Promise<Response>> = {
  'payment_link.paid': (ctx) => settle(ctx, purchaseFromPaymentLinkPaid(ctx.event)),

  // Route B (web self-serve checkout), when the dashboard creates Razorpay
  // Orders with notes { wholesaler_id, pack }: add a purchaseFromPaymentCaptured
  // in lib.ts that reads payload.payment.entity (id, amount, currency, notes,
  // order_id → providerRef) and register it here:
  //   'payment.captured': (ctx) => settle(ctx, purchaseFromPaymentCaptured(ctx.event)),
  // It must skip payments that belong to a Payment Link (those are settled by
  // payment_link.paid); if it doesn't, the payment-id dedupe still stops a
  // second grant.
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const secret = env('RAZORPAY_WEBHOOK_SECRET')
  if (!secret) {
    // A deploy mistake, not a bad request: 500 so Razorpay keeps retrying
    // until the secret is set, instead of the payment being acknowledged.
    log('error', 'RAZORPAY_WEBHOOK_SECRET is not set — refusing to process webhooks')
    return json({ error: 'Webhook not configured' }, 500)
  }

  // Same reasoning: without the rate there is no right number of credits to
  // grant, and guessing is worse than Razorpay retrying until it is set.
  const creditsPerRupee = parseRate(env('CREDITS_PER_RUPEE'))
  if (!creditsPerRupee) {
    log('error', 'CREDITS_PER_RUPEE is not set to a positive number — refusing to process webhooks')
    return json({ error: 'Webhook not configured' }, 500)
  }

  if (Number(req.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) {
    return json({ error: 'Payload too large' }, 413)
  }
  const raw = await req.arrayBuffer()
  if (raw.byteLength > MAX_BODY_BYTES) return json({ error: 'Payload too large' }, 413)

  // ⭐ The security boundary. Nothing below — not even JSON.parse — runs for a
  // request Razorpay did not sign with our webhook secret.
  if (!(await verifyRazorpaySignature(raw, req.headers.get('x-razorpay-signature'), secret))) {
    log('warn', 'Rejected a webhook with a missing or invalid signature')
    return json({ error: 'Invalid signature' }, 401)
  }

  let event: unknown
  try {
    event = JSON.parse(new TextDecoder().decode(raw))
  } catch {
    return json({ error: 'Malformed JSON' }, 400)
  }

  const eventName = eventNameOf(event)
  const eventId = req.headers.get('x-razorpay-event-id')
  const handler = HANDLERS[eventName]
  if (!handler) {
    log('info', 'Ignoring event', { event: eventName, event_id: eventId })
    return json({ ok: true, ignored: eventName })
  }

  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    return await handler({ event, eventName, eventId, supabase, creditsPerRupee })
  } catch (err) {
    // Transient (database unreachable, etc.). Razorpay retries non-2xx
    // deliveries, and the payment-id dedupe makes a retry harmless.
    log('error', 'Webhook processing failed; Razorpay will retry', {
      event: eventName,
      event_id: eventId,
      error: err instanceof Error ? err.message : String(err),
    })
    return json({ error: 'Internal error' }, 500)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Settle one paid purchase
// ─────────────────────────────────────────────────────────────────────────────
async function settle(ctx: Context, parsed: PaidPurchase | { error: string }): Promise<Response> {
  if ('error' in parsed) {
    // Signed by Razorpay but not the shape we expect. Keep it for a human
    // (under a stand-in id if the payment id itself is missing) — retrying a
    // payload we can never read would only get the webhook disabled.
    const ids = idsOf(ctx.event)
    const key = ids.paymentId
      ?? (ids.linkId ? `unknown-payment:${ids.linkId}` : null)
      ?? (ctx.eventId ? `unknown-payment:event:${ctx.eventId}` : null)
    return manual(ctx, key, ids.linkId, `unreadable_payload: ${parsed.error}`)
  }
  const p = parsed
  const base = { event: ctx.eventName, event_id: ctx.eventId, payment_id: p.paymentId, link_id: p.providerRef }

  if (p.currency !== 'INR') return manual(ctx, p.paymentId, p.providerRef, `unsupported_currency: ${p.currency}`)
  if (!(p.amountPaidPaise > 0)) return manual(ctx, p.paymentId, p.providerRef, 'no_amount_paid')

  // Who paid.
  const { data: candidates, error: findError } = await ctx.supabase.rpc('razorpay_find_wholesaler', {
    p_wholesaler_ref: p.notes.wholesaler_id ?? null,
    p_phone: normalizeIndianMobile(p.customer.contact),
    p_email: normalizeEmail(p.customer.email),
  })
  if (findError) throw new Error(`razorpay_find_wholesaler: ${findError.message}`)

  const who = decideWholesaler((candidates ?? []) as Candidate[])
  if (!who.ok) {
    log('warn', 'Could not identify the wholesaler', {
      ...base,
      reason: who.reason,
      wholesaler_id_note: p.notes.wholesaler_id ?? null,
      contact: maskPhone(p.customer.contact),
      has_email: Boolean(p.customer.email),
    })
    return manual(ctx, p.paymentId, p.providerRef, who.reason)
  }

  // How many credits: from the amount paid (packs only label the purchase).
  const { data: packs, error: packsError } = await ctx.supabase
    .from('credit_packs')
    .select('key, label, credits, price_inr_ex_gst, active')
  if (packsError) throw new Error(`credit_packs: ${packsError.message}`)

  const credits = decideCredits(p.notes, p.amountPaidPaise, ctx.creditsPerRupee, (packs ?? []) as Pack[])
  if (!credits.ok) return manual(ctx, p.paymentId, p.providerRef, credits.reason)
  if (credits.credits !== credits.fromAmount) {
    // A special deal set by the team — leave a trail for accounting.
    log('info', 'Credits note overrides the amount-derived credits', {
      ...base, credits: credits.credits, from_amount: credits.fromAmount,
    })
  }

  const money = splitGstInclusive(p.amountPaidPaise)

  // Grant — the purchase row and the credits in one transaction, deduped on
  // the Razorpay payment id.
  const { data: result, error: grantError } = await ctx.supabase.rpc('record_razorpay_purchase', {
    p_user: who.userId,
    p_payment_id: p.paymentId,
    p_credits: credits.credits,
    p_pack_key: credits.packKey,
    p_amount_inr: money.amountInr,
    p_gst_inr: money.gstInr,
    p_provider_ref: p.providerRef,
    p_buyer_gstin: p.notes.gstin ?? null,
    p_buyer_state: p.notes.state ?? who.state ?? null,
    p_receipt_json: {
      source: 'razorpay_webhook',
      event: ctx.eventName,
      event_id: ctx.eventId,
      payment_id: p.paymentId,
      payment_link_id: p.providerRef,
      payment_method: p.paymentMethod,
      currency: p.currency,
      amount_paid_paise: p.amountPaidPaise,
      amount_paid_inr: money.paidInr,
      gst_inclusive_rate_percent: GST_RATE_PERCENT,
      credits_per_rupee: ctx.creditsPerRupee,
      credits_from_amount: credits.fromAmount,
      matched_on: who.matchedOn,
      notes: p.notes,
      customer: p.customer,
    },
  })

  if (grantError) {
    // Park it for a human in case this keeps failing, then 500 so Razorpay
    // retries; a later success resolves the issue automatically.
    try {
      await ctx.supabase.rpc('record_razorpay_issue', {
        p_payment_id: p.paymentId,
        p_link_id: p.providerRef,
        p_event: ctx.eventName,
        p_reason: `grant_failed: ${grantError.message}`,
        p_payload: ctx.event,
      })
    } catch {
      // Best effort only — the 500 below is what guarantees a retry.
    }
    throw new Error(`record_razorpay_purchase: ${grantError.message}`)
  }

  if (!result?.ok) {
    return manual(ctx, p.paymentId, p.providerRef, `grant_refused: ${result?.error ?? 'unknown'}`)
  }

  if (result.replayed) {
    log('info', 'Already granted — Razorpay retry, nothing to do', { ...base, purchase_id: result.purchase_id })
    return json({ ok: true, replayed: true })
  }

  log('info', 'Credits granted', {
    ...base,
    purchase_id: result.purchase_id,
    credits: credits.credits,
    pack: credits.packKey,
    matched_on: who.matchedOn,
    balance: result.balance,
  })
  return json({ ok: true, granted: credits.credits })
}

// Paid, but not something to grant automatically: record it for a human and
// acknowledge, so Razorpay stops retrying. If even recording fails, 500 — a
// retry is better than an acknowledged payment nobody knows about.
async function manual(ctx: Context, paymentId: string | null, linkId: string | null, reason: string): Promise<Response> {
  const where = { event: ctx.eventName, event_id: ctx.eventId, payment_id: paymentId, link_id: linkId, reason }
  if (!paymentId) {
    // Nothing to key a record on at all. Should be impossible for a signed
    // Razorpay event; the payment is still visible in the Razorpay Dashboard.
    log('error', 'Paid event with no payment, link or event id — check the Razorpay Dashboard', where)
    return json({ ok: true, manual: true, recorded: false })
  }

  const { data, error } = await ctx.supabase.rpc('record_razorpay_issue', {
    p_payment_id: paymentId,
    p_link_id: linkId,
    p_event: ctx.eventName,
    p_reason: reason,
    p_payload: ctx.event,
  })
  if (error) throw new Error(`record_razorpay_issue: ${error.message}`)

  if (data?.reason === 'ALREADY_GRANTED') {
    log('info', 'Already granted — Razorpay retry, nothing to do', where)
    return json({ ok: true, replayed: true })
  }
  log('warn', 'Payment needs manual handling — see credit_purchase_issues', { ...where, recorded: data?.recorded ?? null })
  return json({ ok: true, manual: true })
}
