import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkAdminAuth } from '../_shared/adminAuth.ts'
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type,x-admin-password',
  'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
}
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {status, headers})
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers})
  if (req.method !== 'POST') return reply({error:'METHOD_NOT_ALLOWED'},405)
  const denied = checkAdminAuth(req,headers)
  if (denied) return denied
  let body
  try { body = await req.json() } catch { return reply({error:'INVALID_REQUEST'},400) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({error:'INVALID_REQUEST'},400)
  try {
    const businessType=body.business_type ?? 'wholesaler'
    if (!['wholesaler','retailer'].includes(businessType)) return reply({error:'INVALID_BUSINESS_TYPE'},400)
    const db = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{
      auth:{persistSession:false,autoRefreshToken:false},
    })
    if (body.action === 'list') {
      if (body.wholesaler_id != null && !uuid(body.wholesaler_id)) return reply({error:'INVALID_WHOLESALER_ID'},400)
      const {data,error} = await db.rpc('admin_list_business_credit_allowances',{
        p_business_type:businessType,
        p_search:typeof body.search === 'string' ? body.search.slice(0,100).trim() : null,
        p_page:Number.isInteger(body.page) ? Math.max(0,Math.min(body.page,10000)) : 0,
        p_page_size:Number.isInteger(body.pageSize) ? Math.max(1,Math.min(body.pageSize,100)) : 25,
        p_wholesaler_id:body.wholesaler_id ?? null,
      })
      if (error) throw error
      return reply(data,data?.ok ? 200 : 503)
    }
    if (body.action !== 'set_allowance' && body.action !== 'reset_default') return reply({error:'INVALID_ACTION'},400)
    if (!uuid(body.wholesaler_id)) return reply({error:'INVALID_WHOLESALER_ID'},400)
    if (!uuid(body.request_key)) return reply({error:'INVALID_REQUEST_KEY'},400)
    if (!Number.isInteger(body.expected_version) || body.expected_version<0) return reply({error:'INVALID_VERSION'},400)
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (!reason || reason.length>500) return reply({error:'REASON_REQUIRED',message:'Enter a reason of 1–500 characters.'},400)
    const reset = body.action === 'reset_default'
    if (!reset && (!Number.isInteger(body.daily_allowance) || body.daily_allowance<0 || body.daily_allowance>100000)) {
      return reply({error:'INVALID_ALLOWANCE',message:'Enter an integer between 0 and 100,000.'},400)
    }
    const {data,error} = await db.rpc('admin_set_business_credit_allowance',{
      p_business_type:businessType,
      p_wholesaler_id:body.wholesaler_id,p_daily_allowance:reset ? null : body.daily_allowance,
      p_reason:reason,p_expected_version:body.expected_version,p_request_key:body.request_key,p_reset:reset,
    })
    if (error) throw error
    return reply(data,data?.ok ? 200 : ['VERSION_CONFLICT','IDEMPOTENCY_CONFLICT'].includes(data?.error) ? 409 : 400)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && ['PGRST202','PGRST205','42883','42P01'].includes(String(error.code))) {
      return reply({error:'CREDIT_PROGRAM_UNAVAILABLE',message:'Credit controls await the shared credit database release. No allowance has been changed.'},503)
    }
    return reply({error:'CREDIT_ADMIN_UNAVAILABLE',message:'Credit controls are unavailable. Retry with the same request, or contact support.'},503)
  }
})
