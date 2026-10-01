import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkAdminAuth } from '../_shared/adminAuth.ts'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-password',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
}
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers})
Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', {headers})
  if (request.method !== 'POST') return reply({error: 'METHOD_NOT_ALLOWED'},405)
  const authError = checkAdminAuth(request,headers)
  if (authError) return authError
  try {
    const body = await request.json()
    const db = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: {persistSession: false,autoRefreshToken: false},
    })
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (body.action === 'revoke') {
      if (!uuid.test(body.id ?? '')) return reply({error: 'INVALID_ID'},400)
      const {data,error} = await db.rpc('wishlist_share_admin_revoke',{p_share:body.id})
      if (error) throw error
      return reply(data,data?.ok ? 200 : 404)
    }
    if (body.action !== 'list' || (body.store_id && !uuid.test(body.store_id))) return reply({error: 'INVALID_REQUEST'},400)
    let query = db.from('wishlist_shares').select('id,retailer_id,created_at,expires_at,max_viewers,views_used,revoked_at')
      .order('created_at',{ascending:false}).limit(100)
    if (body.store_id) query = query.eq('retailer_id',body.store_id)
    const [{data,error},program] = await Promise.all([query,db.rpc('credits_program_status')])
    if (error || program.error) throw error ?? program.error
    return reply({shares:data,program:program.data})
  } catch {
    return reply({error:'ADMIN_WISHLISTS_UNAVAILABLE'},503)
  }
})
