import { useEffect,useState } from 'react';
import { Link,useSearchParams } from 'react-router';
import { adminInvoke } from '../../../lib/adminSession';
export type Referral={id:string;code:string;wholesaler_id:string;retailer_id:string|null;inviter_name:string;retailer_name:string|null;retailer_status:string|null;status:string;policy_version:number;gift_credits:number;extra_credits:number;created_at:string;accepted_at:string|null;settled_at:string|null;reward_ledger_id:string|null;gift_ledger_id:string|null;funding_state:string;refunded_credits:number};
const date=(value:string|null)=>value?new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})+' IST':'—';
const statusLabel=(link:Referral)=>link.status==='rewarded'?'Reward paid':link.status==='pending'?'Waiting for verification':link.status==='unclaimed'?'Not joined yet':link.status==='legacy'?'Original referral':({expired:'Expired',cancelled:'Cancelled',rejected:'Rejected',inactive:'Inactive'}[link.status]||link.status);
export function ReferralPanel({wholesalerId,retailerId,inviterName}:{wholesalerId?:string;retailerId?:string;inviterName?:string}) {
  const [links,setLinks]=useState<Referral[]>([]),[count,setCount]=useState(0),[page,setPage]=useState(0),[search,setSearch]=useState(''),[busy,setBusy]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const [events,setEvents]=useState<{id:string;event:string;created_at:string}[]>([]),[selected,setSelected]=useState('');
  const scoped=!!(wholesalerId||retailerId);
  useEffect(()=>{setPage(0);setLinks([]);setSelected('');},[wholesalerId,retailerId]);
  useEffect(()=>{
    let active=true;setBusy(true);const timer=setTimeout(()=>{
      setError('');adminInvoke('admin-referrals',{action:'list',page,search:scoped?'':search,wholesaler_id:wholesalerId,retailer_id:retailerId})
        .then(data=>{if(active){setLinks(data.links);setCount(data.count);}})
        .catch(err=>{if(active){setLinks([]);setError(err.message);}}).finally(()=>{if(active)setBusy(false);});
    },200);return()=>{active=false;clearTimeout(timer);};
  },[page,search,wholesalerId,retailerId,scoped,revision]);
  async function history(id:string){setError('');try{const data=await adminInvoke('admin-referrals',{action:'events',id});setEvents(data.events);setSelected(id);}catch(err){setError(err instanceof Error?err.message:'Could not load history.');}}
  async function repair(id:string){setBusy(true);setError('');try{await adminInvoke('admin-referrals',{action:'settle',retailer_id:id});setRevision(n=>n+1);}catch(err){setError(err instanceof Error?err.message:'Could not complete the reward.');}finally{setBusy(false);}}
  return <section className="space-y-4 border border-gray-200 rounded-xl p-5 bg-white" aria-label="Business referrals">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{retailerId?'Referral':'Referrals'}</h2><button onClick={()=>setRevision(n=>n+1)} disabled={busy} className="text-sm underline disabled:opacity-40">Refresh</button></div>
    {retailerId&&inviterName&&<p className="text-sm">Invited by <strong>{inviterName}</strong></p>}
    {!scoped&&<input aria-label="Search referrals" placeholder="Search business or referral code" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} className="border rounded-lg p-2 w-full"/>}
    {error&&<p role="alert" className="text-red-700 text-sm">{error}</p>}{busy&&<p role="status" className="text-sm text-gray-500">Loading referrals…</p>}
    {!busy&&!error&&!links.length&&<p className="text-sm text-gray-500">{retailerId?(inviterName?'No linked invitation record.':'No inviting wholesaler yet.'):'No referrals yet.'}</p>}
    <div className="space-y-3">{links.map(link=><div key={link.id} className="border border-gray-100 rounded-lg p-4 space-y-2">
      <div className="flex flex-wrap justify-between items-start gap-2">
        <div>{!retailerId&&<>{link.retailer_id?<Link className="font-medium underline" to={`/review/retailer/${link.retailer_id}`}>{link.retailer_name||'Retailer'}</Link>:<span className="font-medium">Invitation not accepted</span>}</>}
          {!wholesalerId&&!retailerId&&<p className="text-sm text-gray-500">From <Link className="underline" to={`/review/wholesaler/${link.wholesaler_id}`}>{link.inviter_name||'Wholesaler'}</Link></p>}
          {retailerId&&!inviterName&&<p className="font-medium">Invited by {link.inviter_name||'Wholesaler'}</p>}
        </div><span className="rounded-full px-3 py-1 text-xs bg-gray-100 text-gray-700">{statusLabel(link)}</span>
      </div>
      {link.policy_version===1?<div className="text-sm text-gray-600"><p>Retailer gift: <strong>{link.gift_credits.toLocaleString()} credits</strong> · {link.gift_ledger_id?'Paid':'After verification'}</p><p>Wholesaler reward: <strong>1,000 credits</strong> · {link.reward_ledger_id?'Paid':'After verification'}</p></div>:<p className="text-sm text-gray-500">This referral keeps its original terms.</p>}
      {link.policy_version===1&&link.retailer_status==='verified'&&link.funding_state==='reserved'&&link.retailer_id&&<button disabled={busy} className="rounded-lg border px-3 py-2 text-sm" onClick={()=>repair(link.retailer_id!)}>Complete pending reward</button>}
      <details className="text-sm text-gray-500"><summary className="cursor-pointer">Referral details</summary><div className="mt-2 space-y-1"><p>Code: <span className="font-mono">{link.code}</span></p><p>Created: {date(link.created_at)}</p><p>Joined: {date(link.accepted_at)}</p>{link.settled_at&&<p>Reward paid: {date(link.settled_at)}</p>}<button className="underline" onClick={()=>history(link.id)}>View history</button>
        {selected===link.id&&<div className="pt-2">{!events.length?<p>No recorded changes.</p>:events.map(event=><p key={event.id}>{date(event.created_at)} · {event.event.replaceAll('_',' ')}</p>)}</div>}
      </div></details>
    </div>)}</div>
    {count>25&&<div className="flex justify-between text-sm"><button disabled={busy||page===0} onClick={()=>setPage(n=>n-1)}>Previous</button><span>Page {page+1}</span><button disabled={busy||(page+1)*25>=count} onClick={()=>setPage(n=>n+1)}>Next</button></div>}
  </section>;
}
export function Referrals(){const [params]=useSearchParams();return <main className="max-w-4xl mx-auto p-6 space-y-6"><Link to="/" className="underline">Back to businesses</Link><ReferralPanel wholesalerId={params.get('wholesaler')||undefined} retailerId={params.get('retailer')||undefined}/></main>;}
