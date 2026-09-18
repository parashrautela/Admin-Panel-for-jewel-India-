// The whole staff-accounts request flow, with every outside call (Supabase
// auth admin, the tables, randomness) passed in — so handler.test.ts runs it
// end to end under Node, and index.ts only wires the real services in.

import {
  DEFAULT_USERNAME_DOMAIN,
  addressFor,
  cleanName,
  cleanOptional,
  generatePassword,
  isStaffAddress,
  normaliseEmail,
  suggestUsername,
  validateUsername,
  withSuffix,
} from './lib.ts'

export interface AuthUser {
  id: string
  email?: string | null
}

export interface RetailerRow {
  id: string
  business_name?: string | null
  verification_status?: string | null
}

export interface EmployeeRow {
  id: string
  retailer_id: string
  auth_user_id: string | null
  full_name: string
  email: string
  invite_email: string | null
  designation: string | null
  phone: string | null
  status: string
  join_method: string
  is_system_generated: boolean
  created_at?: string | null
  activated_at?: string | null
}

export type CreateAuthResult = { ok: true; id: string } | { ok: false; exists: boolean; message: string }

export interface Deps {
  env: (name: string) => string
  /** The signed-in user behind the request's JWT, or null. */
  userFromJwt: (jwt: string) => Promise<AuthUser | null>
  /** The caller's retailers row, or null. Throws when unreachable. */
  retailerOf: (userId: string) => Promise<RetailerRow | null>
  employeeById: (id: string) => Promise<EmployeeRow | null>
  /** Any account or invitation already using this address. */
  addressTaken: (email: string) => Promise<boolean>
  /** The role of the account signed up with this email, if any. */
  roleOfAccount: (email: string) => Promise<string | null>
  createAuthUser: (email: string, password: string, fullName: string) => Promise<CreateAuthResult>
  deleteAuthUser: (id: string) => Promise<void>
  setAuthPassword: (id: string, password: string) => Promise<void>
  /** Banned accounts cannot sign in or refresh a session. */
  setAuthBanned: (id: string, banned: boolean) => Promise<void>
  setProfileRole: (userId: string, email: string, role: 'employee') => Promise<void>
  insertEmployee: (row: Omit<EmployeeRow, 'id'>) => Promise<EmployeeRow>
  updateEmployee: (id: string, patch: Partial<EmployeeRow>) => Promise<void>
  deleteEmployee: (id: string) => Promise<void>
  /** A uniform integer in [0, n). */
  pick: (n: number) => number
  now: () => Date
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

const UNAVAILABLE = 'Something went wrong. Please try again.'

/** What the app shows in its list; never the password, never the auth id. */
function publicEmployee(row: EmployeeRow, domain: string) {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    username: isStaffAddress(row.email, domain) ? row.email.slice(0, row.email.lastIndexOf('@')) : null,
    invite_email: row.invite_email,
    designation: row.designation,
    phone: row.phone,
    status: row.status,
    join_method: row.join_method,
    is_system_generated: row.is_system_generated,
  }
}

export async function handleStaffAccounts(
  method: string,
  authorization: string | null,
  rawBody: string,
  deps: Deps,
): Promise<Reply> {
  if (method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.')

  const domain = deps.env('STAFF_USERNAME_DOMAIN').trim().toLowerCase() || DEFAULT_USERNAME_DOMAIN

  // Who is asking comes from their session, never from the request body.
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

  let retailer: RetailerRow | null
  try {
    retailer = await deps.retailerOf(user.id)
  } catch (err) {
    deps.log('error', 'Could not load the retailer', { user_id: user.id, error: String(err) })
    return fail(500, 'unavailable', UNAVAILABLE)
  }
  if (!retailer) return fail(403, 'not_a_retailer', 'Only a store owner can manage staff.')
  if (retailer.verification_status !== 'verified') {
    return fail(403, 'not_verified', 'Your store needs to be verified before you can add staff.')
  }

  /** The employee named in the body, if it belongs to this store. */
  async function ownEmployee(): Promise<EmployeeRow | Reply> {
    const id = typeof body.employee_id === 'string' ? body.employee_id.trim() : ''
    if (!id) return fail(400, 'bad_request', 'Which staff member?')
    let row: EmployeeRow | null
    try {
      row = await deps.employeeById(id)
    } catch (err) {
      deps.log('error', 'Could not load the employee', { employee_id: id, error: String(err) })
      return fail(500, 'unavailable', UNAVAILABLE)
    }
    if (!row || row.retailer_id !== retailer!.id) return fail(404, 'not_found', 'That staff member is not on your list.')
    return row
  }

  try {
    switch (body.action) {
      case 'suggest': {
        const name = cleanName(body.full_name)
        if (!name) return fail(400, 'invalid_name', 'Enter the person’s name first.')
        const base = suggestUsername(name, retailer.business_name ?? '')
        let username = base
        for (let n = 1; n <= 30; n++) {
          username = withSuffix(base, n)
          if (!(await deps.addressTaken(addressFor(username, domain)))) break
        }
        return { status: 200, body: { ok: true, username, email: addressFor(username, domain), domain } }
      }

      case 'create': {
        const name = cleanName(body.full_name)
        if (!name) return fail(400, 'invalid_name', 'Enter the person’s full name (2 to 80 characters).')
        const checked = validateUsername(body.username ?? suggestUsername(name, retailer.business_name ?? ''))
        if (!checked.ok) return fail(400, 'invalid_username', checked.message)
        const email = addressFor(checked.username, domain)
        if (await deps.addressTaken(email)) {
          return fail(409, 'username_taken', `${checked.username} is already taken. Try another.`)
        }

        const password = generatePassword(deps.pick)
        const created = await deps.createAuthUser(email, password, name)
        if (!created.ok) {
          if (created.exists) return fail(409, 'username_taken', `${checked.username} is already taken. Try another.`)
          deps.log('error', 'Auth user creation failed', { email, error: created.message })
          return fail(500, 'unavailable', UNAVAILABLE)
        }

        let row: EmployeeRow
        try {
          await deps.setProfileRole(created.id, email, 'employee')
          row = await deps.insertEmployee({
            retailer_id: retailer.id,
            auth_user_id: created.id,
            full_name: name,
            email,
            invite_email: null,
            designation: cleanOptional(body.designation) ?? 'Sales Associate',
            phone: cleanOptional(body.phone, 20),
            status: 'active',
            join_method: 'password',
            is_system_generated: false,
            activated_at: deps.now().toISOString(),
          })
        } catch (err) {
          // Never leave a login that no store owns.
          deps.log('error', 'Employee row failed after auth user was made; rolling back', { email, error: String(err) })
          await deps.deleteAuthUser(created.id).catch((e) =>
            deps.log('error', 'Rollback failed — orphan auth user', { auth_user_id: created.id, error: String(e) }))
          return fail(500, 'unavailable', UNAVAILABLE)
        }

        deps.log('info', 'Staff login created', { retailer_id: retailer.id, employee_id: row.id })
        // The password is shown to the store once and kept nowhere.
        return { status: 200, body: { ok: true, employee: publicEmployee(row, domain), password } }
      }

      case 'invite_google': {
        const name = cleanName(body.full_name)
        if (!name) return fail(400, 'invalid_name', 'Enter the person’s full name (2 to 80 characters).')
        const email = normaliseEmail(body.email)
        if (!email) return fail(400, 'invalid_email', 'Enter the Google address they sign in with.')
        if (isStaffAddress(email, domain)) {
          return fail(400, 'invalid_email', 'That looks like a staff username. Use “Create a login” for those.')
        }
        const existingRole = await deps.roleOfAccount(email)
        if (existingRole === 'wholesaler' || existingRole === 'retailer') {
          return fail(409, 'address_has_account', `${email} already has a ${existingRole} account. Staff need their own Google address.`)
        }
        if (await deps.addressTaken(email)) {
          return fail(409, 'already_invited', `${email} is already on a store’s staff list.`)
        }
        const row = await deps.insertEmployee({
          retailer_id: retailer.id,
          auth_user_id: null,
          full_name: name,
          email,
          invite_email: email,
          designation: cleanOptional(body.designation) ?? 'Sales Associate',
          phone: cleanOptional(body.phone, 20),
          status: 'invited',
          join_method: 'google',
          is_system_generated: false,
        })
        deps.log('info', 'Staff invited by Google address', { retailer_id: retailer.id, employee_id: row.id })
        return { status: 200, body: { ok: true, employee: publicEmployee(row, domain) } }
      }

      case 'reset_password': {
        const row = await ownEmployee()
        if ('status' in row && 'body' in row) return row
        const employee = row as EmployeeRow
        if (employee.is_system_generated) return fail(400, 'not_allowed', 'That is your own account.')
        if (employee.join_method !== 'password' || !employee.auth_user_id) {
          return fail(400, 'not_a_password_login', 'This person signs in with Google; there is no password to reset.')
        }
        const password = generatePassword(deps.pick)
        await deps.setAuthPassword(employee.auth_user_id, password)
        deps.log('info', 'Staff password reset', { employee_id: employee.id })
        return { status: 200, body: { ok: true, employee: publicEmployee(employee, domain), password } }
      }

      case 'set_status': {
        const row = await ownEmployee()
        if ('status' in row && 'body' in row) return row
        const employee = row as EmployeeRow
        const status = body.status === 'active' ? 'active' : body.status === 'inactive' ? 'inactive' : null
        if (!status) return fail(400, 'bad_request', 'Status must be active or inactive.')
        if (employee.is_system_generated) return fail(400, 'not_allowed', 'That is your own account.')
        if (employee.status === 'invited') return fail(400, 'not_yet_joined', 'They have not signed in yet. Cancel the invitation instead.')
        if (employee.status !== status) {
          await deps.updateEmployee(employee.id, { status })
          if (employee.auth_user_id) await deps.setAuthBanned(employee.auth_user_id, status === 'inactive')
        }
        deps.log('info', 'Staff status changed', { employee_id: employee.id, status })
        return { status: 200, body: { ok: true, employee: publicEmployee({ ...employee, status }, domain) } }
      }

      case 'cancel_invite':
      case 'remove': {
        const row = await ownEmployee()
        if ('status' in row && 'body' in row) return row
        const employee = row as EmployeeRow
        if (employee.is_system_generated) return fail(400, 'not_allowed', 'That is your own account.')
        if (body.action === 'cancel_invite' && employee.status !== 'invited') {
          return fail(400, 'not_an_invite', 'They have already joined. Use remove instead.')
        }
        await deps.deleteEmployee(employee.id)
        if (employee.auth_user_id) {
          await deps.deleteAuthUser(employee.auth_user_id).catch((e) =>
            deps.log('error', 'Employee row removed but the login remains', { auth_user_id: employee.auth_user_id, error: String(e) }))
        }
        deps.log('info', body.action === 'remove' ? 'Staff removed' : 'Staff invitation cancelled', { employee_id: employee.id })
        return { status: 200, body: { ok: true, removed: employee.id } }
      }

      default:
        return fail(400, 'unknown_action', 'Unknown action.')
    }
  } catch (err) {
    deps.log('error', 'Action failed', { action: String(body.action), error: err instanceof Error ? err.message : String(err) })
    return fail(500, 'unavailable', UNAVAILABLE)
  }
}
