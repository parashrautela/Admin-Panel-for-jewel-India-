// node --experimental-strip-types --test supabase/functions/staff-accounts/handler.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handleStaffAccounts, type AuthUser, type Deps, type EmployeeRow, type RetailerRow } from './handler.ts'

const OWNER: AuthUser = { id: 'owner-uid', email: 'owner@pinejewels.com' }
const STORE: RetailerRow = { id: 'store-1', business_name: 'Pine Jewels', verification_status: 'verified' }

interface Fake {
  deps: Deps
  employees: EmployeeRow[]
  authUsers: { id: string; email: string; password: string; banned: boolean }[]
  profiles: { id: string; email: string; role: string }[]
  logs: { level: string; message: string; extra?: Record<string, unknown> }[]
}

function fake(over: Partial<Deps> & { envs?: Record<string, string>; employees?: EmployeeRow[]; takenEmails?: string[] } = {}): Fake {
  const envs: Record<string, string> = { ...over.envs }
  const employees: EmployeeRow[] = over.employees ?? []
  const authUsers: Fake['authUsers'] = []
  const profiles: Fake['profiles'] = []
  const logs: Fake['logs'] = []
  const taken = new Set((over.takenEmails ?? []).map((e) => e.toLowerCase()))
  let seed = 3
  let nextId = 1
  const deps: Deps = {
    env: (name) => envs[name] ?? '',
    userFromJwt: async (jwt) => (jwt === 'owner-jwt' ? OWNER : null),
    retailerOf: async (uid) => (uid === OWNER.id ? STORE : null),
    employeeById: async (id) => employees.find((e) => e.id === id) ?? null,
    addressTaken: async (email) =>
      taken.has(email.toLowerCase()) ||
      authUsers.some((u) => u.email === email.toLowerCase()) ||
      employees.some((e) => e.email === email.toLowerCase() || e.invite_email === email.toLowerCase()),
    roleOfAccount: async (email) => profiles.find((p) => p.email === email)?.role ?? null,
    createAuthUser: async (email, password) => {
      if (authUsers.some((u) => u.email === email)) return { ok: false, exists: true, message: 'A user with this email address has already been registered' }
      const id = `auth-${nextId++}`
      authUsers.push({ id, email, password, banned: false })
      return { ok: true, id }
    },
    deleteAuthUser: async (id) => {
      const i = authUsers.findIndex((u) => u.id === id)
      if (i >= 0) authUsers.splice(i, 1)
    },
    setAuthPassword: async (id, password) => {
      authUsers.find((u) => u.id === id)!.password = password
    },
    setAuthBanned: async (id, banned) => {
      authUsers.find((u) => u.id === id)!.banned = banned
    },
    setProfileRole: async (id, email, role) => {
      profiles.push({ id, email, role })
    },
    insertEmployee: async (row) => {
      const full = { id: `emp-${nextId++}`, ...row }
      employees.push(full)
      return full
    },
    updateEmployee: async (id, patch) => {
      Object.assign(employees.find((e) => e.id === id)!, patch)
    },
    deleteEmployee: async (id) => {
      const i = employees.findIndex((e) => e.id === id)
      if (i >= 0) employees.splice(i, 1)
    },
    pick: (n) => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % n
    },
    now: () => new Date('2026-09-18T10:00:00Z'),
    log: (level, message, extra) => logs.push({ level, message, extra }),
    ...over,
  }
  return { deps, employees, authUsers, profiles, logs }
}

const call = (f: Fake, body: unknown, auth: string | null = 'Bearer owner-jwt', method = 'POST') =>
  handleStaffAccounts(method, auth, typeof body === 'string' ? body : JSON.stringify(body), f.deps)

const staff = (over: Partial<EmployeeRow> = {}): EmployeeRow => ({
  id: 'emp-priya',
  retailer_id: STORE.id,
  auth_user_id: 'auth-priya',
  full_name: 'Priya Sharma',
  email: 'priya.pinejewels@jewelindia.shop',
  invite_email: null,
  designation: 'Sales Associate',
  phone: null,
  status: 'active',
  join_method: 'password',
  is_system_generated: false,
  ...over,
})

test('needs a session', async () => {
  assert.equal((await call(fake(), { action: 'suggest', full_name: 'Priya' }, null)).status, 401)
  assert.equal((await call(fake(), { action: 'suggest', full_name: 'Priya' }, 'Bearer nope')).status, 401)
})

test('only a verified store owner', async () => {
  const notStore = fake({ retailerOf: async () => null })
  assert.equal((await call(notStore, { action: 'suggest', full_name: 'Priya' })).body.error, 'not_a_retailer')
  const pending = fake({ retailerOf: async () => ({ ...STORE, verification_status: 'pending' }) })
  assert.equal((await call(pending, { action: 'suggest', full_name: 'Priya' })).body.error, 'not_verified')
})

test('rejects GET, bad JSON and unknown actions', async () => {
  assert.equal((await call(fake(), {}, 'Bearer owner-jwt', 'GET')).status, 405)
  assert.equal((await call(fake(), '{oops')).body.error, 'bad_request')
  assert.equal((await call(fake(), { action: 'dance' })).body.error, 'unknown_action')
})

test('suggest: first name dot store, skipping taken ones', async () => {
  const f = fake({ takenEmails: ['priya.pinejewels@jewelindia.shop', 'priya.pinejewels2@jewelindia.shop'] })
  const reply = await call(f, { action: 'suggest', full_name: 'Priya Sharma' })
  assert.deepEqual(reply.body, { ok: true, username: 'priya.pinejewels3', email: 'priya.pinejewels3@jewelindia.shop', domain: 'jewelindia.shop' })
})

test('suggest: the domain comes from the environment', async () => {
  const f = fake({ envs: { STAFF_USERNAME_DOMAIN: 'Staff.Example.IN' } })
  const reply = await call(f, { action: 'suggest', full_name: 'Priya Sharma' })
  assert.equal(reply.body.email, 'priya.pinejewels@staff.example.in')
})

test('create: a login with a one-time password, the row, the role', async () => {
  const f = fake()
  const reply = await call(f, { action: 'create', full_name: 'Priya Sharma', designation: 'Manager', phone: '9876543210' })
  assert.equal(reply.status, 200, JSON.stringify(reply.body))
  const body = reply.body as any
  assert.equal(body.employee.email, 'priya.pinejewels@jewelindia.shop')
  assert.equal(body.employee.username, 'priya.pinejewels')
  assert.equal(body.employee.status, 'active')
  assert.equal(body.employee.join_method, 'password')
  assert.equal(typeof body.password, 'string')
  assert.equal(body.password.length, 14)
  assert.equal(f.authUsers[0].password, body.password)
  assert.deepEqual(f.profiles, [{ id: 'auth-1', email: 'priya.pinejewels@jewelindia.shop', role: 'employee' }])
  assert.equal(f.employees[0].auth_user_id, 'auth-1')
  assert.equal(f.employees[0].designation, 'Manager')
  assert.equal(f.employees[0].activated_at, '2026-09-18T10:00:00.000Z')
  assert.ok(!('auth_user_id' in body.employee), 'the auth id stays server-side')
})

test('create: an edited username is honoured, a bad one refused', async () => {
  const f = fake()
  const ok = await call(f, { action: 'create', full_name: 'Priya Sharma', username: 'Priya.Front' })
  assert.equal((ok.body as any).employee.email, 'priya.front@jewelindia.shop')
  const bad = await call(f, { action: 'create', full_name: 'Priya Sharma', username: 'priya front' })
  assert.equal(bad.body.error, 'invalid_username')
})

test('create: a taken username is refused before anything is made', async () => {
  const f = fake({ takenEmails: ['priya.pinejewels@jewelindia.shop'] })
  const reply = await call(f, { action: 'create', full_name: 'Priya Sharma' })
  assert.equal(reply.status, 409)
  assert.equal(reply.body.error, 'username_taken')
  assert.equal(f.authUsers.length, 0)
})

test('create: a race on the auth side reads as taken too', async () => {
  const f = fake({ createAuthUser: async () => ({ ok: false, exists: true, message: 'already registered' }) })
  assert.equal((await call(f, { action: 'create', full_name: 'Priya Sharma' })).body.error, 'username_taken')
})

test('create: the login is removed again when the row cannot be written', async () => {
  const f = fake({ insertEmployee: async () => { throw new Error('boom') } })
  const reply = await call(f, { action: 'create', full_name: 'Priya Sharma' })
  assert.equal(reply.status, 500)
  assert.equal(f.authUsers.length, 0, 'no orphan login')
  assert.ok(f.logs.some((l) => l.message.includes('rolling back')))
})

test('create: needs a name', async () => {
  assert.equal((await call(fake(), { action: 'create', full_name: 'P' })).body.error, 'invalid_name')
})

test('invite_google: an invited row, no login yet', async () => {
  const f = fake()
  const reply = await call(f, { action: 'invite_google', full_name: 'Ravi Kumar', email: ' Ravi.Kumar@Gmail.com ' })
  assert.equal(reply.status, 200, JSON.stringify(reply.body))
  const emp = (reply.body as any).employee
  assert.equal(emp.status, 'invited')
  assert.equal(emp.join_method, 'google')
  assert.equal(emp.invite_email, 'ravi.kumar@gmail.com')
  assert.equal(emp.username, null)
  assert.equal(f.authUsers.length, 0)
  assert.equal(f.employees[0].auth_user_id, null)
})

test('invite_google: refuses bad, staff-shaped, taken and already-wholesaler addresses', async () => {
  const f = fake({ takenEmails: ['taken@gmail.com'] })
  f.profiles.push({ id: 'x', email: 'boss@gmail.com', role: 'wholesaler' })
  assert.equal((await call(f, { action: 'invite_google', full_name: 'Ravi Kumar', email: 'nope' })).body.error, 'invalid_email')
  assert.equal((await call(f, { action: 'invite_google', full_name: 'Ravi Kumar', email: 'ravi.pine@jewelindia.shop' })).body.error, 'invalid_email')
  assert.equal((await call(f, { action: 'invite_google', full_name: 'Ravi Kumar', email: 'taken@gmail.com' })).body.error, 'already_invited')
  assert.equal((await call(f, { action: 'invite_google', full_name: 'Ravi Kumar', email: 'boss@gmail.com' })).body.error, 'address_has_account')
})

test('reset_password: a new one-time password for a password login', async () => {
  const f = fake({ employees: [staff()] })
  f.authUsers.push({ id: 'auth-priya', email: staff().email, password: 'old', banned: false })
  const reply = await call(f, { action: 'reset_password', employee_id: 'emp-priya' })
  assert.equal(reply.status, 200)
  assert.equal(f.authUsers[0].password, (reply.body as any).password)
  assert.notEqual(f.authUsers[0].password, 'old')
})

test('reset_password: not for Google staff, not for the owner, not for other stores', async () => {
  const google = fake({ employees: [staff({ join_method: 'google', invite_email: 'r@gmail.com' })] })
  assert.equal((await call(google, { action: 'reset_password', employee_id: 'emp-priya' })).body.error, 'not_a_password_login')
  const owner = fake({ employees: [staff({ is_system_generated: true })] })
  assert.equal((await call(owner, { action: 'reset_password', employee_id: 'emp-priya' })).body.error, 'not_allowed')
  const other = fake({ employees: [staff({ retailer_id: 'store-2' })] })
  assert.equal((await call(other, { action: 'reset_password', employee_id: 'emp-priya' })).status, 404)
  assert.equal((await call(fake(), { action: 'reset_password' })).body.error, 'bad_request')
})

test('set_status: inactive bans the login, active lifts it', async () => {
  const f = fake({ employees: [staff()] })
  f.authUsers.push({ id: 'auth-priya', email: staff().email, password: 'p', banned: false })
  const off = await call(f, { action: 'set_status', employee_id: 'emp-priya', status: 'inactive' })
  assert.equal((off.body as any).employee.status, 'inactive')
  assert.equal(f.employees[0].status, 'inactive')
  assert.equal(f.authUsers[0].banned, true)
  const on = await call(f, { action: 'set_status', employee_id: 'emp-priya', status: 'active' })
  assert.equal((on.body as any).employee.status, 'active')
  assert.equal(f.authUsers[0].banned, false)
})

test('set_status: refuses invitations, the owner, and nonsense', async () => {
  const invited = fake({ employees: [staff({ status: 'invited', auth_user_id: null, join_method: 'google' })] })
  assert.equal((await call(invited, { action: 'set_status', employee_id: 'emp-priya', status: 'active' })).body.error, 'not_yet_joined')
  const owner = fake({ employees: [staff({ is_system_generated: true })] })
  assert.equal((await call(owner, { action: 'set_status', employee_id: 'emp-priya', status: 'inactive' })).body.error, 'not_allowed')
  assert.equal((await call(fake({ employees: [staff()] }), { action: 'set_status', employee_id: 'emp-priya', status: 'fired' })).body.error, 'bad_request')
})

test('remove: the row and the login go together', async () => {
  const f = fake({ employees: [staff()] })
  f.authUsers.push({ id: 'auth-priya', email: staff().email, password: 'p', banned: false })
  const reply = await call(f, { action: 'remove', employee_id: 'emp-priya' })
  assert.deepEqual(reply.body, { ok: true, removed: 'emp-priya' })
  assert.equal(f.employees.length, 0)
  assert.equal(f.authUsers.length, 0)
})

test('remove: never the owner’s own row', async () => {
  const f = fake({ employees: [staff({ is_system_generated: true })] })
  assert.equal((await call(f, { action: 'remove', employee_id: 'emp-priya' })).body.error, 'not_allowed')
  assert.equal(f.employees.length, 1)
})

test('cancel_invite: only for invitations', async () => {
  const f = fake({ employees: [staff({ status: 'invited', auth_user_id: null, join_method: 'google', invite_email: 'r@gmail.com' })] })
  assert.equal((await call(f, { action: 'cancel_invite', employee_id: 'emp-priya' })).status, 200)
  assert.equal(f.employees.length, 0)
  const joined = fake({ employees: [staff()] })
  assert.equal((await call(joined, { action: 'cancel_invite', employee_id: 'emp-priya' })).body.error, 'not_an_invite')
})

test('a failing table call is a 500 with a safe message', async () => {
  const f = fake({ employeeById: async () => { throw new Error('db down') } })
  const reply = await call(f, { action: 'remove', employee_id: 'emp-priya' })
  assert.equal(reply.status, 500)
  assert.equal(reply.body.message, 'Something went wrong. Please try again.')
})
