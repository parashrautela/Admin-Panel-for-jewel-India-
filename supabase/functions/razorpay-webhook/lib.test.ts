// Unit tests for lib.ts. Not imported by index.ts, so not deployed.
//
//   deno test supabase/functions/razorpay-webhook/lib.test.ts
//   node --experimental-strip-types --test supabase/functions/razorpay-webhook/lib.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

import {
  MAX_CUSTOM_CREDITS,
  checkPaidAgainstList,
  decideCredits,
  decideWholesaler,
  eventNameOf,
  idsOf,
  normalizeEmail,
  normalizeIndianMobile,
  notesOf,
  parseCredits,
  purchaseFromPaymentLinkPaid,
  splitGstInclusive,
  verifyRazorpaySignature,
  type Candidate,
  type Pack,
} from './lib.ts'

const SECRET = 'whsec_test_only_not_a_real_secret'

function bytes(s: string): ArrayBuffer {
  const u = new TextEncoder().encode(s)
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
}

function signed(body: string, secret = SECRET): string {
  // Independent implementation (Node's crypto) of what Razorpay sends.
  return createHmac('sha256', secret).update(body).digest('hex')
}

// ── signature ────────────────────────────────────────────────────────────────

const BODY = '{"event":"payment_link.paid","payload":{}}'

test('a correctly signed body verifies', async () => {
  assert.equal(await verifyRazorpaySignature(bytes(BODY), signed(BODY), SECRET), true)
})

test('upper-case hex and surrounding whitespace are tolerated', async () => {
  assert.equal(await verifyRazorpaySignature(bytes(BODY), `  ${signed(BODY).toUpperCase()} `, SECRET), true)
})

test('a body changed by one character is rejected', async () => {
  const tampered = BODY.replace('paid', 'pain')
  assert.equal(await verifyRazorpaySignature(bytes(tampered), signed(BODY), SECRET), false)
})

test('a signature made with another secret is rejected', async () => {
  assert.equal(await verifyRazorpaySignature(bytes(BODY), signed(BODY, 'someone-elses-secret'), SECRET), false)
})

test('re-serialised JSON does not verify — the RAW body is what is signed', async () => {
  const spaced = '{ "event": "payment_link.paid", "payload": {} }'
  assert.equal(await verifyRazorpaySignature(bytes(spaced), signed(BODY), SECRET), false)
})

for (const [label, header] of [
  ['missing', null],
  ['empty', ''],
  ['not hex', 'z'.repeat(64)],
  ['too short', signed(BODY).slice(0, 62)],
  ['too long', signed(BODY) + '00'],
] as const) {
  test(`a ${label} signature header is rejected`, async () => {
    assert.equal(await verifyRazorpaySignature(bytes(BODY), header, SECRET), false)
  })
}

test('with no secret configured nothing verifies', async () => {
  assert.equal(await verifyRazorpaySignature(bytes(BODY), signed(BODY, ''), ''), false)
})

// ── reading the event ────────────────────────────────────────────────────────

// Shape per Razorpay's payment_link.paid webhook sample.
function paymentLinkPaid(overrides: { notes?: unknown; paymentId?: string | null; amountPaid?: unknown } = {}) {
  return {
    entity: 'event',
    event: 'payment_link.paid',
    contains: ['payment_link', 'order', 'payment'],
    payload: {
      payment_link: {
        entity: {
          id: 'plink_TEST123',
          amount: 589000,
          amount_paid: overrides.amountPaid ?? 589000,
          currency: 'INR',
          status: 'paid',
          customer: { contact: '+91 98765 43210', email: 'Owner@Example.com', name: 'Shop Owner' },
          notes: overrides.notes ?? { wholesaler_id: '1b4e28ba-2fa1-4d2b-a9e4-8f1d1c7a0f11', pack: 'pro' },
        },
      },
      order: { entity: { id: 'order_TEST123' } },
      payment: {
        entity: {
          id: overrides.paymentId === undefined ? 'pay_TEST123' : overrides.paymentId,
          amount: 589000,
          currency: 'INR',
          status: 'captured',
          method: 'upi',
          contact: '+919876543210',
          email: 'owner@example.com',
          notes: [],
        },
      },
    },
    created_at: 1757570000,
  }
}

test('payment_link.paid is read into a purchase', () => {
  const event = paymentLinkPaid()
  assert.equal(eventNameOf(event), 'payment_link.paid')
  const p = purchaseFromPaymentLinkPaid(event)
  assert.ok(!('error' in p))
  assert.equal(p.paymentId, 'pay_TEST123')
  assert.equal(p.providerRef, 'plink_TEST123')
  assert.equal(p.amountPaidPaise, 589000)
  assert.equal(p.currency, 'INR')
  assert.equal(p.paymentMethod, 'upi')
  assert.deepEqual(p.notes, { wholesaler_id: '1b4e28ba-2fa1-4d2b-a9e4-8f1d1c7a0f11', pack: 'pro' })
  assert.equal(p.customer.contact, '+91 98765 43210')
})

test('an amount sent as a string is still read', () => {
  const p = purchaseFromPaymentLinkPaid(paymentLinkPaid({ amountPaid: '58900' }))
  assert.ok(!('error' in p))
  assert.equal(p.amountPaidPaise, 58900)
})

test('a payload without a payment id cannot be read, but its ids are still recoverable', () => {
  const event = paymentLinkPaid({ paymentId: null })
  assert.ok('error' in purchaseFromPaymentLinkPaid(event))
  assert.deepEqual(idsOf(event), { paymentId: null, linkId: 'plink_TEST123' })
})

test('hand-typed note keys are normalised; Razorpay\'s empty-notes [] is handled', () => {
  assert.deepEqual(notesOf({ 'Wholesaler ID': ' abc ', 'PACK': 'Pro', 'gst-in': 'x', empty: '  ', n: 650 }),
    { wholesaler_id: 'abc', pack: 'Pro', gst_in: 'x', n: '650' })
  assert.deepEqual(notesOf([]), {})
  assert.deepEqual(notesOf(null), {})
})

// ── who paid ─────────────────────────────────────────────────────────────────

for (const [raw, want] of [
  ['9876543210', '9876543210'],
  ['+91 98765 43210', '9876543210'],
  ['+91-98765-43210', '9876543210'],
  ['(+91) 98765 43210', '9876543210'],
  ['919876543210', '9876543210'],
  ['09876543210', '9876543210'],
  ['0091 98765 43210', '9876543210'],
  ['9198765432', '9198765432'],   // a 10-digit number that happens to start 91
  ['5876543210', null],           // not a mobile series
  ['12345', null],
  ['', null],
  [null, null],
] as const) {
  test(`phone ${JSON.stringify(raw)} normalises to ${JSON.stringify(want)}`, () => {
    assert.equal(normalizeIndianMobile(raw), want)
  })
}

test('emails are trimmed and lower-cased; non-emails are dropped', () => {
  assert.equal(normalizeEmail('  Owner@Example.COM '), 'owner@example.com')
  assert.equal(normalizeEmail('not-an-email'), null)
  assert.equal(normalizeEmail(null), null)
})

const W1 = '11111111-1111-4111-8111-111111111111'
const W2 = '22222222-2222-4222-8222-222222222222'
const c = (id: string, on: string, state: string | null = 'Gujarat'): Candidate =>
  ({ wholesaler_user_id: id, matched_on: on, wholesaler_state: state })

test('the id in the notes identifies the wholesaler', () => {
  assert.deepEqual(decideWholesaler([c(W1, 'wholesaler_id')]),
    { ok: true, userId: W1, matchedOn: 'wholesaler_id', state: 'Gujarat' })
})

test('the id wins when the contact agrees, or partly agrees', () => {
  assert.equal(decideWholesaler([c(W1, 'wholesaler_id'), c(W1, 'phone')]).ok, true)
  const r = decideWholesaler([c(W1, 'wholesaler_id'), c(W1, 'phone'), c(W2, 'email')])
  assert.ok(r.ok && r.userId === W1)
})

test('an id that disagrees with the customer\'s contact goes to a human', () => {
  const r = decideWholesaler([c(W1, 'wholesaler_id'), c(W2, 'phone')])
  assert.deepEqual(r, { ok: false, reason: 'wholesaler_id_disagrees_with_customer_contact' })
})

test('without an id, one wholesaler by phone and/or email is enough', () => {
  const r = decideWholesaler([c(W1, 'phone'), c(W1, 'email')])
  assert.deepEqual(r, { ok: true, userId: W1, matchedOn: 'email+phone', state: 'Gujarat' })
})

test('phone and email pointing at different wholesalers go to a human', () => {
  assert.deepEqual(decideWholesaler([c(W1, 'phone'), c(W2, 'email')]),
    { ok: false, reason: 'customer_contact_matches_several_wholesalers' })
})

test('nobody matching goes to a human', () => {
  assert.deepEqual(decideWholesaler([]), { ok: false, reason: 'no_matching_wholesaler' })
})

// ── how many credits ─────────────────────────────────────────────────────────

const PACKS: Pack[] = [
  { key: 'starter', label: 'Starter', credits: 50, price_inr_ex_gst: '499.00', active: true },
  { key: 'popular', label: 'Popular', credits: 220, price_inr_ex_gst: '1999.00', active: true },
  { key: 'pro', label: 'Pro', credits: 600, price_inr_ex_gst: '4999.00', active: true },
  { key: 'bulk', label: 'Bulk', credits: 1300, price_inr_ex_gst: '9999.00', active: true },
  { key: 'retired', label: 'Retired', credits: 999, price_inr_ex_gst: '1.00', active: false },
]

test('a pack key grants that pack', () => {
  const r = decideCredits({ pack: 'pro' }, PACKS)
  assert.ok(r.ok && r.credits === 600 && r.packKey === 'pro')
})

test('a pack can be named by its label, in any case', () => {
  const r = decideCredits({ pack: ' POPULAR ' }, PACKS)
  assert.ok(r.ok && r.credits === 220 && r.packKey === 'popular')
})

test('an unknown or inactive pack goes to a human', () => {
  assert.equal(decideCredits({ pack: 'mega' }, PACKS).ok, false)
  assert.equal(decideCredits({ pack: 'retired' }, PACKS).ok, false)
})

test('custom credits are granted as a custom deal', () => {
  const r = decideCredits({ credits: '1,300' }, PACKS)
  assert.ok(r.ok && r.credits === 1300 && r.packKey === 'custom')
})

test('custom credits are capped; the cap itself is allowed', () => {
  assert.equal(decideCredits({ credits: String(MAX_CUSTOM_CREDITS) }, PACKS).ok, true)
  const over = decideCredits({ credits: String(MAX_CUSTOM_CREDITS + 1) }, PACKS)
  assert.ok(!over.ok && over.reason.startsWith('custom_credits_over_cap'))
})

for (const bad of ['0', '-5', '12.5', 'abc', '']) {
  test(`credits note ${JSON.stringify(bad)} is not a positive integer`, () => {
    assert.equal(parseCredits(bad), null)
    assert.equal(decideCredits({ credits: bad }, PACKS).ok, false)
  })
}

test('a pack and credits that agree grant the pack', () => {
  const r = decideCredits({ pack: 'pro', credits: '600' }, PACKS)
  assert.ok(r.ok && r.packKey === 'pro' && r.credits === 600)
})

test('a pack and credits that disagree go to a human', () => {
  const r = decideCredits({ pack: 'pro', credits: '650' }, PACKS)
  assert.ok(!r.ok && r.reason.startsWith('pack_and_credits_disagree'))
})

test('an unrecognised pack name next to credits is just a label for a custom deal', () => {
  const r = decideCredits({ pack: 'diwali offer', credits: '700' }, PACKS)
  assert.ok(r.ok && r.credits === 700 && r.packKey === 'custom')
})

test('neither a pack nor credits goes to a human', () => {
  assert.deepEqual(decideCredits({ wholesaler_id: W1 }, PACKS), { ok: false, reason: 'no_pack_or_credits_in_notes' })
})

// ── money ────────────────────────────────────────────────────────────────────

test('a pack paid at list price splits back to its ex-GST price', () => {
  assert.deepEqual(splitGstInclusive(58882), { amountInr: 499, gstInr: 89.82, paidInr: 588.82 })
})

test('gst = amount − amount/1.18, rounded to 2dp', () => {
  assert.deepEqual(splitGstInclusive(58900), { amountInr: 499.15, gstInr: 89.85, paidInr: 589 })
  assert.deepEqual(splitGstInclusive(1000000), { amountInr: 8474.58, gstInr: 1525.42, paidInr: 10000 })
})

test('taxable + gst is always exactly what was paid, and matches exact integer rounding', () => {
  for (let paise = 1; paise <= 300000; paise += 7) {
    const { amountInr, gstInr } = splitGstInclusive(paise)
    const taxablePaise = Math.round(amountInr * 100)
    const gstPaise = Math.round(gstInr * 100)
    assert.equal(taxablePaise + gstPaise, paise)
    // Exact reference: round(paise / 1.18) half-up, in BigInt.
    const exact = (BigInt(paise) * 200n + 118n) / 236n
    assert.equal(BigInt(taxablePaise), exact, `paise=${paise}`)
  }
})

// ── Price floor: hand-typed notes on the wrong link ─────────────────────────
// Bulk list: ₹9,999 + 18% = ₹11,798.82 → floor half of that, ₹5,899.41.

const bulk = PACKS.find((p) => p.key === 'bulk')!
const pro = PACKS.find((p) => p.key === 'pro')!

test('a pack paid at list price passes the floor', () => {
  assert.deepEqual(checkPaidAgainstList({ credits: 1300, pack: bulk }, PACKS, 1_179_882), { ok: true })
})

test('a discounted pack above half of list still passes', () => {
  // Pro at 40% off: ₹4,999 × 0.6 × 1.18 ≈ ₹3,539.29.
  assert.deepEqual(checkPaidAgainstList({ credits: 600, pack: pro }, PACKS, 353_929), { ok: true })
})

test('"bulk" noted on a Starter-priced link goes to a human', () => {
  const result = checkPaidAgainstList({ credits: 1300, pack: bulk }, PACKS, 58_882)
  assert.equal(result.ok, false)
  assert.match((result as { reason: string }).reason, /^paid_far_below_list/)
})

test('a custom deal is judged at the best active pack rate', () => {
  // 650 credits at the bulk rate (₹7.69/credit) ≈ ₹4,999.5 + GST ≈ ₹5,899.4.
  assert.deepEqual(checkPaidAgainstList({ credits: 650, pack: null }, PACKS, 589_941), { ok: true })
  const tooCheap = checkPaidAgainstList({ credits: 1300, pack: null }, PACKS, 58_882)
  assert.equal(tooCheap.ok, false)
})

test('an inactive pack never sets the rate a custom deal is judged by', () => {
  // The retired pack is 999 credits for ₹1. If it counted, anything would pass.
  const result = checkPaidAgainstList({ credits: 1300, pack: null }, PACKS, 1_000)
  assert.equal(result.ok, false)
})

test('with no priced packs a custom deal cannot be judged, so it passes', () => {
  assert.deepEqual(checkPaidAgainstList({ credits: 100, pack: null }, [], 100), { ok: true })
})
