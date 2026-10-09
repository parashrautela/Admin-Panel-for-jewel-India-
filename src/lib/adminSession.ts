import { supabase } from './supabase';
// Password stays in memory and is validated by the server; no bundled password or service key.
export const adminSession: {password: string | null} = {password:null};
export async function adminInvoke(name:string,body:unknown) {
 if(!adminSession.password)throw new Error('Please sign in to admin again.');
 const {data,error}=await supabase.functions.invoke(name,{headers:{'x-admin-password':adminSession.password},body});
 if(error || data?.error)throw new Error(data?.error || 'Admin request failed. Check your connection and sign in again.');
 return data;
}
