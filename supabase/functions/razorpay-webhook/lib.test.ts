// Unit tests for lib.ts. Not imported by index.ts, so not deployed.
//
//   deno test supabase/functions/razorpay-webhook/lib.test.ts
//   node --experimental-strip-types --test supabase/functions/razorpay-webhook/lib.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

import {
  decideCredits,
  decideWholesaler,
  eventNameOf,
  idsOf,
  normalizeEmail,
  normalizeIndianMobile,
  notesOf,
  parseCredits,
  parseRate,
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

// Packs under the live pricing (10 credits per ₹1): credits = price × 10.
// They only label a purchase now; the amount paid decides the credits.
const RATE = 10
const PACKS: Pack[] = [
  { key: 'starter', label: 'Starter', credits: 4990, price_inr_ex_gst: '499.00', active: true },
  { key: 'popular', label: 'Popular', credits: 19990, price_inr_ex_gst: '1999.00', active: true },
  { key: 'pro', label: 'Pro', credits: 49990, price_inr_ex_gst: '4999.00', active: true },
  { key: 'bulk', label: 'Bulk', credits: 99990, price_inr_ex_gst: '9999.00', active: true },
  { key: 'retired', label: 'Retired', credits: 999, price_inr_ex_gst: '1.00', active: false },
]
const paise = (inclGstRupees: number) => Math.round(inclGstRupees * 100)

test('credits = amount paid excluding GST × the rate', () => {
  // ₹590 incl. GST = ₹500 + ₹90 GST → 5,000 credits.
  const r = decideCredits({}, paise(590), RATE, PACKS)
  assert.ok(r.ok && r.credits === 5000 && r.fromAmount === 5000 && r.packKey === 'amount')
})

test('a fraction of a credit is never granted — it rounds down', () => {
  // ₹589 → ₹499.15 taxable → 4,991.5 → 4,991.
  const r = decideCredits({}, paise(589), RATE, PACKS)
  assert.ok(r.ok && r.credits === 4991)
})

test("paying a pack's exact price labels the purchase with that pack", () => {
  const r = decideCredits({}, paise(588.82), RATE, PACKS)
  assert.ok(r.ok && r.credits === 4990 && r.packKey === 'starter')
})

test('an inactive pack never labels a purchase', () => {
  // ₹1.18 incl. GST = ₹1 taxable, the retired pack's price.
  const r = decideCredits({}, paise(1.18), RATE, PACKS)
  assert.ok(r.ok && r.credits === 10 && r.packKey === 'amount')
})

test('a pack note is only a label: the amount decides the credits', () => {
  // "bulk" typed on a Starter-priced link used to grant a Bulk pack.
  const r = decideCredits({ pack: 'bulk' }, paise(588.82), RATE, PACKS)
  assert.ok(r.ok && r.credits === 4990 && r.packKey === 'starter')
})

test('the rate is applied as configured', () => {
  const r = decideCredits({}, paise(590), 2.5, PACKS)
  assert.ok(r.ok && r.credits === 1250)
})

test('a credits note inside the band overrides the amount (a special deal)', () => {
  const r = decideCredits({ credits: '6,000' }, paise(590), RATE, PACKS)
  assert.ok(r.ok && r.credits === 6000 && r.fromAmount === 5000 && r.packKey === 'custom')
})

test('the band edges — half and double what the amount buys — are allowed', () => {
  assert.equal(decideCredits({ credits: '2500' }, paise(590), RATE, PACKS).ok, true)
  assert.equal(decideCredits({ credits: '10000' }, paise(590), RATE, PACKS).ok, true)
})

test('a credits note far from the amount goes to a human (an extra or a missing zero)', () => {
  const tooMany = decideCredits({ credits: '50000' }, paise(590), RATE, PACKS)
  assert.ok(!tooMany.ok && tooMany.reason.startsWith('credits_note_far_from_amount'))
  const tooFew = decideCredits({ credits: '500' }, paise(590), RATE, PACKS)
  assert.ok(!tooFew.ok && tooFew.reason.startsWith('credits_note_far_from_amount'))
})

for (const bad of ['0', '-5', '12.5', 'abc', '']) {
  test(`credits note ${JSON.stringify(bad)} is not a positive integer`, () => {
    assert.equal(parseCredits(bad), null)
    assert.equal(decideCredits({ credits: bad }, paise(590), RATE, PACKS).ok, false)
  })
}

test('an amount too small to buy one credit goes to a human', () => {
  const r = decideCredits({}, 5, RATE, PACKS)
  assert.ok(!r.ok && r.reason.startsWith('amount_too_small'))
})

test('CREDITS_PER_RUPEE must be a positive number', () => {
  assert.equal(parseRate('10'), 10)
  assert.equal(parseRate(' 2.5 '), 2.5)
  for (const bad of [undefined, null, '', '0', '-1', 'ten', 'NaN', 'Infinity']) {
    assert.equal(parseRate(bad as string | null | undefined), null, String(bad))
  }
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
