import { supabase } from './supabase';
// Password stays in memory and is validated by the server; no bundled password or service key.
export const adminSession: {password: string | null} = {password:null};
export async function adminInvoke(name:string,body:unknown) {
 if(!adminSession.password)throw new Error('Please sign in to admin again.');
 const {data,error}=await supabase.functions.invoke(name,{headers:{'x-admin-password':adminSession.password},body});
 if(error || data?.error) {
   let payload = data;
   if (!payload && error?.context instanceof Response) {
     try { payload = await error.context.clone().json(); } catch { /* No readable response. */ }
   }
   const messages: Record<string,string> = {
     VERSION_CONFLICT:'Another admin changed this allowance. Close the editor and refresh before trying again.',
     IDEMPOTENCY_CONFLICT:'This request was already used for a different change. Reopen the editor.',
     NOT_VERIFIED:'Only an approved wholesaler can receive an allowance policy.',
     CREDIT_PROGRAM_UNAVAILABLE:'Credit controls await the shared credit database release. No allowance has been changed.',
   };
   throw new Error(messages[payload?.error] || payload?.message || 'Admin request failed. Retry or sign in again.');
 }
 return data;
}
