// node --experimental-strip-types --test supabase/functions/credits-topup/handler.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handleTopUp, type AuthUser, type Deps, type WholesalerRow } from './handler.ts'
import type { Pack } from '../razorpay-webhook/lib.ts'

const PACKS: Pack[] = [
  { key: 'starter', label: 'Starter', credits: 5000, price_inr_ex_gst: '500.00', active: true },
  { key: 'popular', label: 'Popular', credits: 10000, price_inr_ex_gst: '1000.00', active: true },
]

const ALICE: AuthUser = { id: 'alice-uid', email: 'alice@shop.in', phone: '919876543210' }
const VERIFIED: WholesalerRow = { business_name: 'Alice Gems', full_name: 'Alice', verification_status: 'verified' }

interface Fake {
  deps: Deps
  links: { body: any; keyId: string; keySecret: string }[]
  logs: { level: string; message: string; extra?: Record<string, unknown> }[]
}

function fake(over: Partial<Deps> & { envs?: Record<string, string> } = {}): Fake {
  const envs: Record<string, string> = {
    CREDITS_PER_RUPEE: '10',
    RAZORPAY_KEY_ID: 'rzp_live_x',
    RAZORPAY_KEY_SECRET: 'shh',
    ...over.envs,
  }
  const links: Fake['links'] = []
  const logs: Fake['logs'] = []
  const deps: Deps = {
    env: (name) => envs[name] ?? '',
    userFromJwt: async (jwt) => (jwt === 'alice-jwt' ? ALICE : null),
    activePacks: async () => PACKS,
    wholesalerOf: async (uid) => (uid === ALICE.id ? VERIFIED : null),
    createPaymentLink: async (body, keyId, keySecret) => {
      links.push({ body, keyId, keySecret })
      return { ok: true, id: 'plink_123', shortUrl: 'https://rzp.io/rzp/abc' }
    },
    nowSeconds: () => 1_000_000,
    log: (level, message, extra) => logs.push({ level, message, extra }),
    ...over,
  }
  return { deps, links, logs }
}

const call = (f: Fake, body: unknown, auth: string | null = 'Bearer alice-jwt', method = 'POST') =>
  handleTopUp(method, auth, typeof body === 'string' ? body : JSON.stringify(body), f.deps)

test('options: packs priced with GST and the credits they buy', async () => {
  const reply = await call(fake(), { action: 'options' })
  assert.equal(reply.status, 200)
  assert.deepEqual(reply.body, {
    ok: true,
    credits_per_rupee: 10,
    gst_percent: 18,
    packs: [
      { key: 'starter', label: 'Starter', price_inr: 500, gst_inr: 90, total_inr: 590, total_paise: 59_000, credits: 5_000 },
      { key: 'popular', label: 'Popular', price_inr: 1000, gst_inr: 180, total_inr: 1180, total_paise: 118_000, credits: 10_000 },
    ],
  })
})

test('options follow CREDITS_PER_RUPEE: change the secret, the app shows new numbers', async () => {
  const reply = await call(fake({ envs: { CREDITS_PER_RUPEE: '12' } }), { action: 'options' })
  assert.equal((reply.body.packs as any[])[0].credits, 6_000)
})

test('create: a Payment Link for the signed-in wholesaler, priced by the server', async () => {
  const f = fake()
  const reply = await call(f, { action: 'create', pack_key: 'starter' })
  assert.equal(reply.status, 200)
  assert.deepEqual(reply.body, {
    ok: true,
    link_id: 'plink_123',
    url: 'https://rzp.io/rzp/abc',
    pack_key: 'starter',
    total_inr: 590,
    credits: 5_000,
    expires_at: 1_000_000 + 3600,
  })
  assert.equal(f.links.length, 1)
  const { body, keyId, keySecret } = f.links[0]
  assert.equal(keyId, 'rzp_live_x')
  assert.equal(keySecret, 'shh')
  assert.equal(body.amount, 59_000)
  assert.deepEqual(body.notes, { wholesaler_id: 'alice-uid', pack: 'starter', source: 'app' })
  assert.deepEqual(body.customer, { name: 'Alice Gems', email: 'alice@shop.in', contact: '+919876543210' })
})

test('create: the body cannot pick the wallet, the amount or the credits', async () => {
  const f = fake()
  await call(f, {
    action: 'create',
    pack_key: 'starter',
    wholesaler_id: 'mallory-uid',
    user_id: 'mallory-uid',
    amount: 1,
    total_paise: 1,
    credits: 999_999,
    notes: { wholesaler_id: 'mallory-uid', credits: '999999' },
  })
  const { body } = f.links[0]
  assert.equal(body.amount, 59_000)
  assert.deepEqual(body.notes, { wholesaler_id: 'alice-uid', pack: 'starter', source: 'app' })
})

test('create: an unknown or inactive pack is refused before Razorpay is called', async () => {
  for (const pack_key of ['enterprise', '', null, 42, { key: 'starter' }]) {
    const f = fake()
    const reply = await call(f, { action: 'create', pack_key })
    assert.equal(reply.status, 400, String(pack_key))
    assert.equal(reply.body.error, 'unknown_pack')
    assert.equal(f.links.length, 0)
  }
})

test('not signed in: 401 and nothing else happens', async () => {
  for (const auth of [null, '', 'Bearer ', 'Bearer someone-elses-expired-jwt']) {
    const f = fake()
    const reply = await call(f, { action: 'create', pack_key: 'starter' }, auth)
    assert.equal(reply.status, 401, String(auth))
    assert.equal(f.links.length, 0)
  }
})

test('a wholesaler who is not verified cannot start a payment', async () => {
  for (const row of [null, { ...VERIFIED, verification_status: 'pending' }, { ...VERIFIED, verification_status: 'rejected' }]) {
    const f = fake({ wholesalerOf: async () => row })
    const reply = await call(f, { action: 'create', pack_key: 'starter' })
    assert.equal(reply.status, 403)
    assert.equal(reply.body.error, 'not_verified')
    assert.equal(f.links.length, 0)
  }
})

test('missing CREDITS_PER_RUPEE: 503 for everything, even options', async () => {
  for (const rate of ['', '0', '-5', 'ten']) {
    const reply = await call(fake({ envs: { CREDITS_PER_RUPEE: rate } }), { action: 'options' })
    assert.equal(reply.status, 503, rate)
    assert.equal(reply.body.error, 'not_configured')
  }
})

test('missing Razorpay keys: options still work, create is 503', async () => {
  const f = fake({ envs: { RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '' } })
  assert.equal((await call(f, { action: 'options' })).status, 200)
  const reply = await call(f, { action: 'create', pack_key: 'starter' })
  assert.equal(reply.status, 503)
  assert.equal(f.links.length, 0)
})

test('Razorpay refusing: 502, logged without the key secret', async () => {
  const f = fake({
    createPaymentLink: async () => ({ ok: false, status: 401, description: 'Authentication failed' }),
  })
  const reply = await call(f, { action: 'create', pack_key: 'starter' })
  assert.equal(reply.status, 502)
  assert.equal(reply.body.error, 'payment_provider_error')
  const logged = JSON.stringify(f.logs)
  assert.ok(logged.includes('Authentication failed'))
  assert.ok(!logged.includes('shh'), 'the key secret never reaches the logs')
})

test('database down: 500, no link', async () => {
  const f = fake({ activePacks: async () => { throw new Error('connection refused') } })
  assert.equal((await call(f, { action: 'options' })).status, 500)
  const g = fake({ wholesalerOf: async () => { throw new Error('connection refused') } })
  assert.equal((await call(g, { action: 'create', pack_key: 'starter' })).status, 500)
  assert.equal(g.links.length, 0)
})

test('bad requests', async () => {
  assert.equal((await call(fake(), { action: 'options' }, 'Bearer alice-jwt', 'GET')).status, 405)
  assert.equal((await call(fake(), '{not json')).status, 400)
  assert.equal((await call(fake(), { action: 'refund' })).status, 400)
  assert.equal((await call(fake(), [])).status, 400)
})

test('a phone-only sign-up still gets a prefilled checkout', async () => {
  const f = fake({ userFromJwt: async () => ({ id: ALICE.id, email: null, phone: '919876543210' }) })
  await call(f, { action: 'create', pack_key: 'popular' })
  assert.deepEqual(f.links[0].body.customer, { name: 'Alice Gems', contact: '+919876543210' })
  assert.equal(f.links[0].body.amount, 118_000)
})
