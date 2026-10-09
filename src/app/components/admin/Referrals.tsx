import { useEffect,useState } from 'react';
import { Link,useSearchParams } from 'react-router';
import { adminInvoke } from '../../../lib/adminSession';
export type Referral={id:string;code:string;wholesaler_id:string;retailer_id:string|null;inviter_name:string;retailer_name:string|null;retailer_status:string|null;status:string;policy_version:number;gift_credits:number;extra_credits:number;created_at:string;accepted_at:string|null;settled_at:string|null;reward_ledger_id:string|null;gift_ledger_id:string|null;funding_state:string;refunded_credits:number};
const date=(s:string|null)=>s?new Date(s).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'—';
export function ReferralPanel({wholesalerId,retailerId}:{wholesalerId?:string;retailerId?:string}) {
 const [links,setLinks]=useState<Referral[]>([]),[count,setCount]=useState(0),[page,setPage]=useState(0),[status,setStatus]=useState(''),[search,setSearch]=useState(''),[wholesaler,setWholesaler]=useState(wholesalerId||''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const [events,setEvents]=useState<{id:string;event:string;actor:string;created_at:string}[]>([]),[selected,setSelected]=useState('');
 useEffect(()=>{
  let active=true;const timer=setTimeout(()=>{setBusy(true);setError('');adminInvoke('admin-referrals',{action:'list',page,status:status||undefined,search,wholesaler_id:wholesaler||undefined,retailer_id:retailerId}).then(data=>{if(active){setLinks(data.links);setCount(data.count);}}).catch(err=>{if(active){setLinks([]);setError(err.message);}}).finally(()=>{if(active)setBusy(false);});},250);
  return()=>{active=false;clearTimeout(timer);};
 },[page,status,search,wholesaler,retailerId,revision]);
 async function details(id:string){setError('');try{const data=await adminInvoke('admin-referrals',{action:'events',id});setEvents(data.events);setSelected(id);}catch(err){setError(err instanceof Error?err.message:'Could not load audit.');}}
 async function repair(id:string){setBusy(true);try{await adminInvoke('admin-referrals',{action:'settle',retailer_id:id});setRevision(n=>n+1);}catch(err){setError(err instanceof Error?err.message:'Could not settle referral.');}finally{setBusy(false);}}
 return <section className="space-y-4 border border-gray-200 rounded-xl p-5">
  <h2 className="text-xl font-semibold">Invitations & referrals</h2>
  <div className="flex flex-wrap gap-3"><input aria-label="Search referrals" placeholder="Business name or code" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} className="border rounded p-2"/>
   <select aria-label="Referral status" value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}} className="border rounded p-2"><option value="">All statuses</option>{['unclaimed','pending','rewarded','expired','cancelled','rejected','legacy','inactive'].map(x=><option key={x} value={x}>{x}</option>)}</select>
   {!wholesalerId&&<input aria-label="Wholesaler ID" placeholder="Wholesaler ID (optional)" value={wholesaler} onChange={e=>{setWholesaler(e.target.value);setPage(0);}} className="border rounded p-2"/>}
   <button onClick={()=>setRevision(n=>n+1)} disabled={busy} className="underline">Refresh</button>
  </div>
  {error&&<p role="alert" className="text-red-700">{error}</p>}{busy&&<p role="status">Loading…</p>}
  {!busy&&!error&&!links.length&&<p>No matching invitations.</p>}
  <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Wholesaler → Retailer','Code / dates (India)','Gift / funded extra','Review / settlement','Audit'].map(x=><th className="p-3" key={x}>{x}</th>)}</tr></thead><tbody>{links.map(l=><tr key={l.id} className="border-t align-top">
   <td className="p-3"><Link className="underline" to={`/review/wholesaler/${l.wholesaler_id}`}>{l.inviter_name||'Wholesaler'}</Link><p>↓</p>{l.retailer_id?<Link className="underline" to={`/review/retailer/${l.retailer_id}`}>{l.retailer_name||'Retailer'}</Link>:'Not accepted'}</td>
   <td className="p-3"><strong className="font-mono break-all">{l.code}</strong><p>Created: {date(l.created_at)}</p><p>Accepted: {date(l.accepted_at)}</p><p>Verified / settled: {date(l.settled_at)}</p></td>
   <td className="p-3">{l.policy_version===1?<><p>Gift: {l.gift_credits.toLocaleString()}</p><p>Extra reserved: {l.extra_credits.toLocaleString()}</p><p>Returned: {l.refunded_credits}</p><p>Reward: {l.reward_ledger_id?'1,000 issued':'Pending'}</p></>:<p>Original invitation terms</p>}</td>
   <td className="p-3"><p>{l.status}</p><p>Retailer: {l.retailer_status||'—'}</p><p>Funding: {l.funding_state}</p>{l.policy_version===1&&l.retailer_status==='verified'&&l.funding_state==='reserved'&&l.retailer_id&&<button disabled={busy} className="underline" onClick={()=>repair(l.retailer_id!)}>Retry settlement</button>}</td>
   <td className="p-3"><button className="underline" onClick={()=>details(l.id)}>View events</button></td>
  </tr>)}</tbody></table></div>
  <div className="flex gap-4"><button disabled={busy||page===0} onClick={()=>setPage(n=>n-1)}>Previous</button><span>Page {page+1} · {count} invitations</span><button disabled={busy||(page+1)*25>=count} onClick={()=>setPage(n=>n+1)}>Next</button></div>
  {selected&&<div className="bg-gray-50 p-3"><h3 className="font-semibold">Invitation audit</h3>{!events.length&&<p>No recorded events for this original invitation.</p>}{events.map(e=><p className="break-all text-xs mt-2" key={e.id}>{date(e.created_at)} · {e.event} · {e.actor}</p>)}</div>}
 </section>;
}
export function Referrals(){const [params]=useSearchParams();return <main className="max-w-7xl mx-auto p-6 space-y-6"><Link to="/" className="underline">Back to admin</Link><ReferralPanel wholesalerId={params.get('wholesaler')||undefined} retailerId={params.get('retailer')||undefined}/></main>;}
