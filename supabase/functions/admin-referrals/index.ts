import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkAdminAuth } from '../_shared/adminAuth.ts'
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type,x-admin-password','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'}
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers})
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const statuses=['unclaimed','pending','rewarded','expired','cancelled','rejected','legacy','inactive']
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers})
 if(req.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405)
 const denied=checkAdminAuth(req,headers);if(denied)return denied
 try {
  const body=await req.json()
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})
  if(body.action==='settle') {
   if(!uuid.test(body.retailer_id??''))return reply({error:'INVALID_RETAILER'},400)
   const {data,error}=await db.rpc('referral_settle',{p_retailer:body.retailer_id,p_actor:`admin-password:repair:${crypto.randomUUID()}`})
   if(error)throw error;return reply(data,data?.ok?200:409)
  }
  if(body.action==='events') {
   if(!uuid.test(body.id??''))return reply({error:'INVALID_INVITATION'},400)
   const {data,error}=await db.from('referral_events').select('id,event,actor,metadata,created_at').eq('invitation_id',body.id).order('created_at',{ascending:true}).limit(100)
   if(error)throw error;return reply({events:data})
  }
  if(body.action!=='list')return reply({error:'INVALID_ACTION'},400)
  for(const field of ['wholesaler_id','retailer_id'])if(body[field]&&!uuid.test(body[field]))return reply({error:'INVALID_FILTER'},400)
  if(body.status&&!statuses.includes(body.status))return reply({error:'INVALID_STATUS'},400)
  const page=Number.isInteger(body.page)?Math.max(0,Math.min(body.page,10000)):0
  const expiry=await db.rpc('referral_expire_due',{p_limit:100});if(expiry.error)throw expiry.error
  let query=db.from('referral_report').select('*',{count:'exact'}).order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*25,page*25+24)
  if(body.wholesaler_id)query=query.eq('wholesaler_id',body.wholesaler_id)
  if(body.retailer_id)query=query.eq('retailer_id',body.retailer_id)
  if(body.status)query=query.eq('status',body.status)
  const search=typeof body.search==='string'?body.search.slice(0,80).replace(/[^\p{L}\p{N}\s-]/gu,'').trim():''
  if(search)query=query.or(`code.ilike.%${search}%,inviter_name.ilike.%${search}%,retailer_name.ilike.%${search}%`)
  const {data,error,count}=await query;if(error)throw error
  return reply({links:data,count,page})
 }catch{return reply({error:'REFERRAL_ADMIN_UNAVAILABLE'},503)}
})
