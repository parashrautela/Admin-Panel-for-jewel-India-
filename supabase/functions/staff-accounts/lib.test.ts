// node --experimental-strip-types --test supabase/functions/staff-accounts/lib.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  PASSWORD_LENGTH,
  USERNAME_MAX,
  addressFor,
  generatePassword,
  isStaffAddress,
  normaliseEmail,
  slug,
  suggestUsername,
  validateUsername,
  withSuffix,
} from './lib.ts'

test('slug keeps letters and digits only', () => {
  assert.equal(slug('Pine Jewels & Sons'), 'pinejewelssons')
  assert.equal(slug('  Priya  '), 'priya')
  assert.equal(slug('Rādhā'), 'radha')
  assert.equal(slug('!!!'), '')
})

test('suggestUsername is first name dot store', () => {
  assert.equal(suggestUsername('Priya Sharma', 'Pine Jewels'), 'priya.pinejewels')
  assert.equal(suggestUsername('  ravi kumar ', 'R.K. Ornaments Pvt Ltd'), 'ravi.rkornamentspvtltd')
  assert.equal(suggestUsername('Priya', ''), 'priya')
  assert.equal(suggestUsername('', 'Pine Jewels'), 'staff.pinejewels')
  assert.equal(suggestUsername('✨', '✨'), 'staff')
})

test('suggestUsername never exceeds the limit', () => {
  const long = suggestUsername('Abcdefghijklmnopqrstuvwxyz', 'Zyxwvutsrqponmlkjihgfedcba Zyxwvutsrqponmlkjihgfedcba')
  assert.ok(long.length <= USERNAME_MAX)
  assert.ok(validateUsername(long).ok)
})

test('withSuffix numbers alternatives and keeps the limit', () => {
  assert.equal(withSuffix('priya.pine', 1), 'priya.pine')
  assert.equal(withSuffix('priya.pine', 2), 'priya.pine2')
  assert.equal(withSuffix('a'.repeat(USERNAME_MAX), 12).length, USERNAME_MAX)
  assert.ok(withSuffix('a'.repeat(USERNAME_MAX), 12).endsWith('12'))
})

test('validateUsername accepts the shape and rejects the rest', () => {
  assert.deepEqual(validateUsername(' Priya.PineJewels '), { ok: true, username: 'priya.pinejewels' })
  assert.deepEqual(validateUsername('ab'), { ok: false, message: 'A username needs at least 3 characters.' })
  assert.equal(validateUsername('a'.repeat(USERNAME_MAX + 1)).ok, false)
  for (const bad of ['priya..pine', '.priya', 'priya.', 'priya pine', 'priya@pine', 'priya_pine', 42, null]) {
    assert.equal(validateUsername(bad).ok, false, String(bad))
  }
})

test('addresses and staff detection', () => {
  assert.equal(addressFor('priya.pinejewels', 'jewelindia.shop'), 'priya.pinejewels@jewelindia.shop')
  assert.equal(isStaffAddress('Priya.PineJewels@JewelIndia.shop', 'jewelindia.shop'), true)
  assert.equal(isStaffAddress('priya@gmail.com', 'jewelindia.shop'), false)
})

test('generatePassword has every class and the right length', () => {
  let seed = 7
  const pick = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed % n
  }
  for (let i = 0; i < 50; i++) {
    const p = generatePassword(pick)
    assert.equal(p.length, PASSWORD_LENGTH)
    assert.match(p, /[a-z]/)
    assert.match(p, /[A-Z]/)
    assert.match(p, /[0-9]/)
    assert.match(p, /[!@#$%&*?]/)
    assert.doesNotMatch(p, /[01IlOo]/, 'no look-alikes')
  }
})

test('generatePassword shuffles: the classes are not always in front', () => {
  let seed = 99
  const pick = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed % n
  }
  const firsts = new Set(Array.from({ length: 40 }, () => /[a-z]/.test(generatePassword(pick)[0])))
  assert.equal(firsts.size, 2)
})

test('normaliseEmail', () => {
  assert.equal(normaliseEmail('  Ravi.Kumar@Gmail.com '), 'ravi.kumar@gmail.com')
  assert.equal(normaliseEmail('not an email'), null)
  assert.equal(normaliseEmail(''), null)
  assert.equal(normaliseEmail(undefined), null)
})
