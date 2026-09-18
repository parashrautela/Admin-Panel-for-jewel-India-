// staff-accounts: a store owner's staff logins.
//
// Deployed WITH Supabase JWT verification (the default — never pass
// --no-verify-jwt), so only signed-in users reach this code, and handler.ts
// takes which store from that session. Creating a login needs the service
// role, which is why this lives here and not in the app.
//
//   POST { "action": "suggest",        "full_name": "…" }                 → a free username
//   POST { "action": "create",         "full_name", "username"?, … }      → login + one-time password
//   POST { "action": "invite_google",  "full_name", "email", … }          → invitation by Google address
//   POST { "action": "reset_password", "employee_id" }                    → new one-time password
//   POST { "action": "set_status",     "employee_id", "status" }          → active / inactive
//   POST { "action": "cancel_invite",  "employee_id" }
//   POST { "action": "remove",         "employee_id" }
//
// Deploy/config steps: README.md next to this file.

// @ts-ignore: Deno import
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
// @ts-ignore: Deno import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { handleStaffAccounts, type EmployeeRow } from "./handler.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Long enough to mean "until the store turns them back on". */
const BAN_FOREVER = '876000h'

function env(name: string): string {
  // @ts-ignore: Deno global
  return Deno.env.get(name) ?? ''
}

function log(level: 'info' | 'warn' | 'error', message: string, extra: Record<string, unknown> = {}) {
  console[level](JSON.stringify({ fn: 'staff-accounts', level, message, ...extra }))
}

const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

const EMPLOYEE_COLUMNS =
  'id, retailer_id, auth_user_id, full_name, email, invite_email, designation, phone, status, join_method, is_system_generated, created_at, activated_at'

function pick(n: number): number {
  // Rejection sampling keeps the choice uniform.
  const limit = Math.floor(0x1_0000_0000 / n) * n
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % n
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let reply
  try {
    reply = await handleStaffAccounts(req.method, req.headers.get('Authorization'), await req.text(), {
      env,
      userFromJwt: async (jwt) => {
        const { data, error } = await admin.auth.getUser(jwt)
        return error || !data?.user ? null : data.user
      },
      retailerOf: async (userId) => {
        const { data, error } = await admin
          .from('retailers')
          .select('id, business_name, verification_status')
          .eq('user_id', userId)
          .maybeSingle()
        if (error) throw new Error(error.message)
        return data
      },
      employeeById: async (id) => {
        const { data, error } = await admin.from('employees').select(EMPLOYEE_COLUMNS).eq('id', id).maybeSingle()
        if (error) throw new Error(error.message)
        return data as EmployeeRow | null
      },
      addressTaken: async (email) => {
        const lower = email.toLowerCase()
        const [profile, staff] = await Promise.all([
          admin.from('profiles').select('id').ilike('email', lower).limit(1),
          admin.from('employees').select('id').or(`email.ilike.${lower},invite_email.ilike.${lower}`).limit(1),
        ])
        if (profile.error) throw new Error(profile.error.message)
        if (staff.error) throw new Error(staff.error.message)
        return (profile.data?.length ?? 0) > 0 || (staff.data?.length ?? 0) > 0
      },
      roleOfAccount: async (email) => {
        const { data, error } = await admin.from('profiles').select('role').ilike('email', email).limit(1)
        if (error) throw new Error(error.message)
        return data?.[0]?.role ?? null
      },
      createAuthUser: async (email, password, fullName) => {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { role: 'employee', full_name: fullName },
        })
        if (error || !data?.user) {
          const message = error?.message ?? 'no user returned'
          return { ok: false, exists: /already|exists|registered/i.test(message), message }
        }
        return { ok: true, id: data.user.id }
      },
      deleteAuthUser: async (id) => {
        const { error } = await admin.auth.admin.deleteUser(id)
        if (error) throw new Error(error.message)
      },
      setAuthPassword: async (id, password) => {
        const { error } = await admin.auth.admin.updateUserById(id, { password })
        if (error) throw new Error(error.message)
      },
      setAuthBanned: async (id, banned) => {
        const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: banned ? BAN_FOREVER : 'none' })
        if (error) throw new Error(error.message)
      },
      setProfileRole: async (userId, email, role) => {
        const { error } = await admin.from('profiles').upsert({ id: userId, email, role }, { onConflict: 'id' })
        if (error) throw new Error(error.message)
      },
      insertEmployee: async (row) => {
        const { data, error } = await admin.from('employees').insert(row).select(EMPLOYEE_COLUMNS).single()
        if (error) throw new Error(error.message)
        return data as EmployeeRow
      },
      updateEmployee: async (id, patch) => {
        const { error } = await admin.from('employees').update(patch).eq('id', id)
        if (error) throw new Error(error.message)
      },
      deleteEmployee: async (id) => {
        const { error } = await admin.from('employees').delete().eq('id', id)
        if (error) throw new Error(error.message)
      },
      pick,
      now: () => new Date(),
      log,
    })
  } catch (err) {
    log('error', 'Unhandled error', { error: err instanceof Error ? err.message : String(err) })
    reply = { status: 500, body: { ok: false, error: 'unavailable', message: 'Something went wrong. Please try again.' } }
  }

  return new Response(JSON.stringify(reply.body), {
    status: reply.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
