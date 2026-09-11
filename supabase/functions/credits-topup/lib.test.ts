// node --experimental-strip-types --test supabase/functions/credits-topup/lib.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CUSTOM_AMOUNT,
  LINK_LIFETIME_SECONDS,
  buildOptions,
  creditsForTotal,
  customOption,
  paymentLinkBody,
  totalPaiseFor,
} from './lib.ts'
import { decideCredits, type Pack } from '../razorpay-webhook/lib.ts'

const pack = (key: string, price: number | string, extra: Partial<Pack> = {}): Pack => ({
  key,
  label: key[0].toUpperCase() + key.slice(1),
  credits: 1,
  price_inr_ex_gst: price,
  active: true,
  ...extra,
})

test('totalPaiseFor adds 18% GST, in paise', () => {
  assert.equal(totalPaiseFor(500), 59_000)
  assert.equal(totalPaiseFor(1), 118)
  assert.equal(totalPaiseFor(2500), 295_000)
  assert.equal(totalPaiseFor(0.5), 59)
})

test('creditsForTotal: ₹590 → 5,000 at 10 per ₹1', () => {
  assert.equal(creditsForTotal(59_000, 10), 5_000)
  assert.equal(creditsForTotal(118_000, 10), 10_000)
  assert.equal(creditsForTotal(118, 10), 10)
  // The live ₹1.00 test payment: ₹0.85 taxable → 8 (rounded down).
  assert.equal(creditsForTotal(100, 10), 8)
})

test('the app promises exactly what the webhook grants, for every pack and rate', () => {
  const prices = [1, 49, 99, 199, 499, 500, 999, 1000, 2500, 4999.5, 5000, 99_999]
  for (const rate of [1, 2.5, 10, 12, 100]) {
    for (const price of prices) {
      const [option] = buildOptions([pack('p', price)], rate)
      const granted = decideCredits({}, option.total_paise, rate, [pack('p', price)])
      assert.ok(granted.ok, `webhook refused ₹${price} at ${rate}`)
      assert.equal(option.credits, granted.credits, `₹${price} at ${rate}/₹`)
      assert.equal(granted.packKey, 'p', 'webhook labels the purchase with the pack')
    }
  }
})

test('buildOptions: keeps order, skips inactive and zero packs, splits the money', () => {
  const options = buildOptions(
    [
      pack('starter', '500.00'),
      pack('hidden', 1000, { active: false }),
      pack('popular', 1000),
      pack('broken', 0),
    ],
    10,
  )
  assert.deepEqual(options, [
    { key: 'starter', label: 'Starter', price_inr: 500, gst_inr: 90, total_inr: 590, total_paise: 59_000, credits: 5_000 },
    { key: 'popular', label: 'Popular', price_inr: 1000, gst_inr: 180, total_inr: 1180, total_paise: 118_000, credits: 10_000 },
  ])
})

test('buildOptions: a blank label falls back to the key', () => {
  const [option] = buildOptions([pack('bulk', 5000, { label: '  ' })], 10)
  assert.equal(option.label, 'bulk')
})

test('buildOptions: a pack too small to buy a credit is not offered', () => {
  assert.deepEqual(buildOptions([pack('tiny', 0.01)], 10), [])
})

test('customOption: a typed amount is priced like a pack', () => {
  assert.deepEqual(customOption(500, 10), {
    key: 'custom', label: 'Custom',
    price_inr: 500, gst_inr: 90, total_inr: 590, total_paise: 59_000, credits: 5_000,
  })
  // ₹1 is allowed on purpose: a real ₹1.18 payment can be used as a test.
  assert.deepEqual(customOption(1, 10), {
    key: 'custom', label: 'Custom',
    price_inr: 1, gst_inr: 0.18, total_inr: 1.18, total_paise: 118, credits: 10,
  })
  assert.equal(customOption(CUSTOM_AMOUNT.maxInr, 10)?.credits, CUSTOM_AMOUNT.maxInr * 10)
})

test('customOption: refuses anything that is not whole rupees in range', () => {
  for (const bad of [0, -5, 0.5, 1.01, 100_001, NaN, Infinity, null, undefined, '', 'abc', {}, [], '12abc']) {
    assert.equal(customOption(bad as never, 10), null, String(bad))
  }
  // A numeric string is still a number the user could have typed.
  assert.equal(customOption('250', 10)?.total_inr, 295)
})

test('a typed amount also gets exactly what the webhook grants', () => {
  for (const rate of [1, 2.5, 10, 12]) {
    for (const amount of [1, 3, 7, 99, 500, 1234, 99_999]) {
      const option = customOption(amount, rate)!
      const granted = decideCredits({}, option.total_paise, rate, [])
      assert.ok(granted.ok, `₹${amount} at ${rate}`)
      assert.equal(option.credits, granted.credits, `₹${amount} at ${rate}`)
    }
  }
})

test('paymentLinkBody: amount, lifetime, and the notes the webhook reads', () => {
  const [option] = buildOptions([pack('starter', 500)], 10)
  const body = paymentLinkBody(option, { userId: 'u-1', name: ' Parash Jewellers ', email: 'A@B.com', phone: '919876543210' }, 1_000)
  assert.deepEqual(body, {
    amount: 59_000,
    currency: 'INR',
    accept_partial: false,
    description: 'Jewel India: 5,000 credits',
    customer: { name: 'Parash Jewellers', email: 'a@b.com', contact: '+919876543210' },
    notify: { sms: false, email: false },
    reminder_enable: false,
    expire_by: 1_000 + LINK_LIFETIME_SECONDS,
    notes: { wholesaler_id: 'u-1', pack: 'starter', source: 'app' },
  })
})

test('paymentLinkBody: never carries a credits note (the amount decides)', () => {
  const [option] = buildOptions([pack('starter', 500)], 10)
  const body = paymentLinkBody(option, { userId: 'u-1' }, 0)
  assert.equal('credits' in body.notes, false)
  assert.equal('customer' in body, false, 'no customer block when nothing is known')
})

test('paymentLinkBody: drops contact details it cannot use', () => {
  const [option] = buildOptions([pack('starter', 500)], 10)
  const body = paymentLinkBody(option, { userId: 'u-1', name: '', email: 'not-an-email', phone: '12345' }, 0)
  assert.equal('customer' in body, false)
})

test('paymentLinkBody: an Indian mobile in any format becomes +91XXXXXXXXXX', () => {
  const [option] = buildOptions([pack('starter', 500)], 10)
  for (const phone of ['9876543210', '+91 98765 43210', '09876543210', '919876543210']) {
    const body = paymentLinkBody(option, { userId: 'u', phone }, 0)
    assert.equal(body.customer?.contact, '+919876543210', phone)
  }
})
