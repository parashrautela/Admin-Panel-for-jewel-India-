import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { fetchCreditAllowances, saveCreditAllowance } from '../../../lib/adminApi';
import type { AllowanceChange, CreditAllowanceItem, CreditAllowanceResult, ReviewEntity } from '../../../lib/adminApi';
const indiaTime = (value: string) => new Date(value).toLocaleString('en-IN', {timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}) + ' IST';

export function CreditAllowancesPanel({wholesalerId,businessType='wholesaler'}: {wholesalerId?: string;businessType?:ReviewEntity}) {
  const [result,setResult]=useState<CreditAllowanceResult|null>(null),[page,setPage]=useState(0),[search,setSearch]=useState('');
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const [editor,setEditor]=useState<{item:CreditAllowanceItem;reset:boolean}|null>(null);
  const [amount,setAmount]=useState(''),[reason,setReason]=useState(''),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState(''),[success,setSuccess]=useState('');
  const request=useRef<AllowanceChange|null>(null),inFlight=useRef(false);
  useEffect(()=>{setResult(null);setEditor(null);setSuccess('');request.current=null;},[wholesalerId,businessType]);
  useEffect(()=>{
    let active=true;setBusy(true);
    const timer=setTimeout(()=>{
      setError('');fetchCreditAllowances(wholesalerId?'':search,wholesalerId?0:page,25,wholesalerId,businessType)
        .then(data=>{if(active)setResult(data);})
        .catch(err=>{if(active){setResult(null);setError(err instanceof Error?err.message:'Could not load credits.');}})
        .finally(()=>{if(active)setBusy(false);});
    },200);
    return ()=>{active=false;clearTimeout(timer);};
  },[search,page,revision,wholesalerId,businessType]);
  function open(item:CreditAllowanceItem,reset=false,pause=false){
    request.current=null;setEditor({item,reset});setAmount(pause?'0':String(item.daily_allowance));setReason('');setSaveError('');setSuccess('');
  }
  async function save(){
    if(!editor||inFlight.current)return;
    const value=Number(amount);
    if(!editor.reset&&(!amount.trim()||!Number.isInteger(value)||value<0||value>100000)){setSaveError('Enter a whole number from 0 to 100,000.');return;}
    if(!reason.trim()||reason.trim().length>500){setSaveError('Add a short reason for this change.');return;}
    const draft={business_type:businessType,action:editor.reset?'reset_default' as const:'set_allowance' as const,wholesaler_id:editor.item.wholesaler_id,daily_allowance:editor.reset?undefined:value,reason:reason.trim(),expected_version:editor.item.policy_version};
    if(!request.current||JSON.stringify({...request.current,request_key:undefined})!==JSON.stringify(draft))request.current={...draft,request_key:crypto.randomUUID()};
    inFlight.current=true;setSaving(true);setSaveError('');
    try{
      const data=await saveCreditAllowance(request.current!);
      setSuccess(data.next_allowance===0?'Saved. Credits will pause after the current allowance ends.':`Saved. ${data.next_allowance.toLocaleString('en-IN')} credits will be available at the next refill.`);
      setEditor(null);setRevision(n=>n+1);request.current=null;
    }catch(err){setSaveError(err instanceof Error?err.message:'Could not save. Please retry.');}
    finally{inFlight.current=false;setSaving(false);}
  }
  const editForm=editor&&<form onSubmit={e=>{e.preventDefault();void save();}} className="rounded-lg bg-gray-50 border border-gray-200 p-4 space-y-3" aria-label="Change credit allowance">
    <h3 className="font-semibold">{editor.reset?'Use default credits':'Change credits'}</h3>
    {!wholesalerId&&<p>{editor.item.business_name}</p>}
    {editor.reset?<p>{result?.default_allowance.toLocaleString()} credits every 24 hours.</p>:<label className="block text-sm font-medium">Credits per 24 hours<input required type="number" min="0" max="100000" step="1" value={amount} disabled={saving} onChange={e=>setAmount(e.target.value)} className="block mt-1 border border-gray-300 p-2 rounded w-full max-w-xs bg-white"/></label>}
    <label className="block text-sm font-medium">Reason<input required placeholder="Why are you changing this?" maxLength={500} value={reason} disabled={saving} onChange={e=>setReason(e.target.value)} className="block mt-1 border border-gray-300 p-2 rounded w-full bg-white"/></label>
    <p className="text-sm text-gray-600">Starts {editor.item.next_refill_at?`at the next refill: ${indiaTime(editor.item.next_refill_at)}`:'on the next wallet visit'}. Set 0 to pause. Current credits stay available until their expiry.</p>
    {saveError&&<p role="alert" className="text-red-700 text-sm">{saveError}</p>}
    <div className="flex gap-3"><button disabled={saving} className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium">{saving?'Saving…':'Save credits'}</button><button type="button" disabled={saving} onClick={()=>setEditor(null)} className="border rounded-lg px-4 py-2 text-sm">Cancel</button></div>
  </form>;
  function actions(item:CreditAllowanceItem){
    const disabled=saving||item.verification_status!=='verified'||!item.user_id;
    return <div className="flex flex-wrap items-center gap-3"><button onClick={()=>open(item)} disabled={disabled} className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40">Change credits</button>
      {item.daily_allowance>0&&<button onClick={()=>open(item,false,true)} disabled={disabled} className="border rounded-lg px-3 py-2 text-sm disabled:opacity-40">Pause credits</button>}
      {item.is_custom&&<button onClick={()=>open(item,true)} disabled={disabled} className="text-sm underline disabled:opacity-40">Use default ({result?.default_allowance.toLocaleString()})</button>}
      {item.verification_status!=='verified'&&<p className="text-sm text-gray-500">Verify this business to change its credits.</p>}
    </div>;
  }
  const item=result?.items[0];
  return <section id={wholesalerId?'credits':undefined} className="space-y-4 border border-gray-200 rounded-xl p-5 bg-white" aria-label="Business credits">
    <div className="flex justify-between items-center gap-3"><h2 className="text-lg font-semibold">{wholesalerId?'Credits':'Credit allowances'}</h2><button disabled={busy||saving} onClick={()=>setRevision(n=>n+1)} className="text-sm underline disabled:opacity-40">Refresh</button></div>
    {result&&!result.program_active&&<p role="status" className="bg-amber-50 p-3 rounded text-sm">Recurring credits are not active yet.</p>}
    {error&&<p role="alert" className="text-red-700 text-sm">{error}</p>}{success&&<p role="status" className="text-emerald-800 bg-emerald-50 p-3 rounded text-sm">{success}</p>}
    {busy&&<p role="status" className="text-sm text-gray-500">Loading credits…</p>}
    {!busy&&!error&&result&&!result.items.length&&<p className="text-sm">No business found.</p>}
    {wholesalerId&&item&&!busy?<>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div><p className="text-sm text-gray-500">Available now</p><p className="text-2xl font-semibold mt-1">{item.available.toLocaleString('en-IN')}</p></div>
        <div><p className="text-sm text-gray-500">Credits per 24 hours</p><p className="text-2xl font-semibold mt-1">{item.daily_allowance===0?'Paused':item.daily_allowance.toLocaleString('en-IN')}</p></div>
        <div><p className="text-sm text-gray-500">Next refill</p><p className="text-sm font-medium mt-2">{item.next_refill_at?indiaTime(item.next_refill_at):item.daily_allowance===0?'Paused':'Next wallet visit'}</p></div>
      </div>
      {item.current_allowance!=null&&item.current_allowance!==item.daily_allowance&&<p className="text-sm text-gray-600">The current allowance is {item.current_allowance.toLocaleString()}. Your change starts at the next refill.</p>}
      {!editor&&actions(item)}
      <details className="text-sm text-gray-500"><summary className="cursor-pointer">Balance details</summary><p className="mt-2">Recurring: {item.recurring_available.toLocaleString()} · Gifts: {item.gift_available.toLocaleString()} · Purchased: {item.paid_available.toLocaleString()}</p>{businessType==='retailer'&&<p className="mt-1">Staff share this store’s credits.</p>}</details>
    </>:null}
    {!wholesalerId&&<>
      <input aria-label="Search wholesalers" placeholder="Search business name" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} className="border rounded-lg p-2 w-full max-w-md"/>
      <div className="space-y-3">{result?.items.map(row=><div key={row.wholesaler_id} className="border rounded-lg p-4 space-y-3"><Link className="font-semibold underline" to={`/review/${businessType}/${row.wholesaler_id}`}>{row.business_name||'Unnamed business'}</Link><p className="text-sm text-gray-600">Available: {row.available.toLocaleString()} · Every 24 hours: {row.daily_allowance===0?'Paused':row.daily_allowance.toLocaleString()}</p>{actions(row)}</div>)}</div>
      <div className="flex justify-between text-sm"><button disabled={busy||page===0} onClick={()=>setPage(n=>n-1)}>Previous</button><span>{result?.total_count??0} businesses</span><button disabled={busy||!result||(page+1)*25>=result.total_count} onClick={()=>setPage(n=>n+1)}>Next</button></div>
    </>}
    {editForm}
  </section>;
}
export function CreditAllowances(){const [params]=useSearchParams();return <main className="max-w-4xl mx-auto p-6 space-y-6"><Link to="/" className="underline">Back to businesses</Link><CreditAllowancesPanel wholesalerId={params.get('wholesaler')||undefined}/></main>;}
