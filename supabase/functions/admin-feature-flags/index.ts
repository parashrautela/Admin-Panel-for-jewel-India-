import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkAdminAuth } from '../_shared/adminAuth.ts'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type,x-admin-password',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
}

const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers })

const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

// Simple in-memory IP rate limiter: max 120 requests / minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(req: Request): boolean {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 })
    return false
  }
  entry.count++
  return entry.count > 120
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405)

  if (isRateLimited(req)) {
    return reply({ error: 'RATE_LIMITED', message: 'Too many requests. Please retry in a moment.' }, 429)
  }

  // Admin auth check
  const denied = checkAdminAuth(req, headers)
  if (denied) return denied

  let body: any
  try {
    body = await req.json()
  } catch {
    return reply({ error: 'INVALID_REQUEST' }, 400)
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return reply({ error: 'INVALID_REQUEST' }, 400)
  }

  try {
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    // Helper: resolve wholesaler row id or user id to user_id
    async function resolveWholesalerUserId(idOrUserId: string): Promise<string | null> {
      if (!uuid(idOrUserId)) return null
      const { data, error } = await db
        .from('wholesalers')
        .select('user_id')
        .or('id.eq.' + idOrUserId + ',user_id.eq.' + idOrUserId)
        .limit(1)
        .maybeSingle()
      if (error || !data) return null
      return data.user_id
    }

    // ACTION: list
    if (body.action === 'list') {
      if (!body.wholesaler_id || !uuid(body.wholesaler_id)) {
        return reply({ error: 'INVALID_WHOLESALER_ID', message: 'Valid wholesaler ID is required.' }, 400)
      }
      const userId = await resolveWholesalerUserId(body.wholesaler_id)
      if (!userId) {
        return reply({ error: 'NOT_A_WHOLESALER', message: 'Wholesaler not found.' }, 404)
      }

      const { data, error } = await db.rpc('admin_list_features', {
        p_wholesaler_user_id: userId,
      })
      if (error) throw error
      return reply(data, data?.ok ? 200 : 400)
    }

    // ACTION: set
    if (body.action === 'set') {
      if (!body.wholesaler_id || !uuid(body.wholesaler_id)) {
        return reply({ error: 'INVALID_WHOLESALER_ID', message: 'Valid wholesaler ID is required.' }, 400)
      }
      if (typeof body.feature_key !== 'string' || !body.feature_key.trim()) {
        return reply({ error: 'INVALID_FEATURE_KEY', message: 'Feature key is required.' }, 400)
      }
      if (typeof body.enabled !== 'boolean') {
        return reply({ error: 'INVALID_ENABLED_VALUE', message: 'Enabled boolean is required.' }, 400)
      }
      const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
      if (!reason || reason.length > 500) {
        return reply({ error: 'INVALID_REASON', message: 'Reason of 1–500 characters is required.' }, 400)
      }
      if (body.expected_version !== undefined && (!Number.isInteger(body.expected_version) || body.expected_version < 0)) {
        return reply({ error: 'INVALID_VERSION', message: 'Valid expected_version is required.' }, 400)
      }

      const userId = await resolveWholesalerUserId(body.wholesaler_id)
      if (!userId) {
        return reply({ error: 'NOT_A_WHOLESALER', message: 'Wholesaler not found.' }, 404)
      }

      const { data, error } = await db.rpc('admin_set_feature', {
        p_wholesaler_user_id: userId,
        p_key: body.feature_key.trim(),
        p_enabled: body.enabled,
        p_reason: reason,
        p_actor: 'admin-password',
        p_expected_version: body.expected_version ?? null,
      })
      if (error) throw error
      return reply(data, data?.ok ? 200 : data?.error === 'VERSION_CONFLICT' ? 409 : 400)
    }

    // ACTION: reset
    if (body.action === 'reset') {
      if (!body.wholesaler_id || !uuid(body.wholesaler_id)) {
        return reply({ error: 'INVALID_WHOLESALER_ID', message: 'Valid wholesaler ID is required.' }, 400)
      }
      if (typeof body.feature_key !== 'string' || !body.feature_key.trim()) {
        return reply({ error: 'INVALID_FEATURE_KEY', message: 'Feature key is required.' }, 400)
      }
      const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
      if (!reason || reason.length > 500) {
        return reply({ error: 'INVALID_REASON', message: 'Reason of 1–500 characters is required.' }, 400)
      }
      if (body.expected_version !== undefined && (!Number.isInteger(body.expected_version) || body.expected_version < 0)) {
        return reply({ error: 'INVALID_VERSION', message: 'Valid expected_version is required.' }, 400)
      }

      const userId = await resolveWholesalerUserId(body.wholesaler_id)
      if (!userId) {
        return reply({ error: 'NOT_A_WHOLESALER', message: 'Wholesaler not found.' }, 404)
      }

      const { data, error } = await db.rpc('admin_reset_feature', {
        p_wholesaler_user_id: userId,
        p_key: body.feature_key.trim(),
        p_reason: reason,
        p_actor: 'admin-password',
        p_expected_version: body.expected_version ?? null,
      })
      if (error) throw error
      return reply(data, data?.ok ? 200 : data?.error === 'VERSION_CONFLICT' ? 409 : 400)
    }

    // ACTION: bulk_set
    if (body.action === 'bulk_set') {
      if (!body.wholesaler_id || !uuid(body.wholesaler_id)) {
        return reply({ error: 'INVALID_WHOLESALER_ID', message: 'Valid wholesaler ID is required.' }, 400)
      }
      if (!Array.isArray(body.changes) || body.changes.length === 0) {
        return reply({ error: 'INVALID_CHANGES', message: 'Changes array is required.' }, 400)
      }
      const reason = (typeof body.reason === 'string' && body.reason.trim()) || (typeof body.changes[0]?.reason === 'string' && body.changes[0].reason.trim()) || ''
      if (!reason || reason.length > 500) {
        return reply({ error: 'INVALID_REASON', message: 'Reason of 1–500 characters is required.' }, 400)
      }
      const userId = await resolveWholesalerUserId(body.wholesaler_id)
      if (!userId) {
        return reply({ error: 'NOT_A_WHOLESALER', message: 'Wholesaler not found.' }, 404)
      }

      const { data, error } = await db.rpc('admin_bulk_set_features', {
        p_wholesaler_user_id: userId,
        p_changes: body.changes,
        p_reason: reason,
        p_actor: 'admin-password',
      })
      if (error) throw error
      return reply(data, data?.ok ? 200 : data?.error === 'VERSION_CONFLICT' ? 409 : 400)
    }

    // ACTION: audit
    if (body.action === 'audit') {
      const page = Number.isInteger(body.page) ? Math.max(0, body.page) : 0
      const pageSize = Number.isInteger(body.pageSize) ? Math.max(1, Math.min(body.pageSize, 100)) : 25
      const start = page * pageSize
      const end = start + pageSize - 1

      let userId: string | null = null
      if (body.wholesaler_id) {
        userId = await resolveWholesalerUserId(body.wholesaler_id)
        if (!userId) return reply({ error: 'NOT_A_WHOLESALER', message: 'Wholesaler not found.' }, 404)
      }

      let q = db.from('feature_flag_audit').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(start, end)
      if (userId) {
        q = q.eq('wholesaler_user_id', userId)
      }
      const { data, error, count } = await q
      if (error) throw error
      return reply({ ok: true, rows: data ?? [], count: count ?? 0, page, pageSize }, 200)
    }

    // ACTION: catalog_list
    if (body.action === 'catalog_list') {
      const { data, error } = await db.from('feature_catalog').select('*').order('key')
      if (error) throw error
      return reply({ ok: true, catalog: data ?? [] }, 200)
    }

    // ACTION: catalog_set
    if (body.action === 'catalog_set') {
      if (typeof body.feature_key !== 'string' || !body.feature_key.trim()) {
        return reply({ error: 'INVALID_FEATURE_KEY', message: 'Feature key is required.' }, 400)
      }
      const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
      if (!reason || reason.length > 500) {
        return reply({ error: 'INVALID_REASON', message: 'Reason of 1–500 characters is required.' }, 400)
      }
      if (body.enforcement_mode && !['off', 'log', 'enforce'].includes(body.enforcement_mode)) {
        return reply({ error: 'INVALID_MODE', message: 'Mode must be off, log, or enforce.' }, 400)
      }

      const { data, error } = await db.rpc('admin_set_catalog', {
        p_key: body.feature_key.trim(),
        p_default_enabled: body.default_enabled !== undefined ? Boolean(body.default_enabled) : null,
        p_mode: body.enforcement_mode ?? null,
        p_reason: reason,
        p_actor: 'admin-password',
      })
      if (error) throw error
      return reply(data, data?.ok ? 200 : 400)
    }

    return reply({ error: 'INVALID_ACTION', message: 'Unknown action: ' + body.action }, 400)
  } catch (error) {
    console.error('Feature controls admin error:', error)
    return reply({ error: 'FEATURE_ADMIN_UNAVAILABLE', message: 'Feature controls service encountered an error.' }, 503)
  }
})
