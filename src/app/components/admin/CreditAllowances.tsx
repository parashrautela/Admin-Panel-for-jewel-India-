import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { fetchCreditAllowances, saveCreditAllowance } from '../../../lib/adminApi';
import type { AllowanceChange, CreditAllowanceItem, CreditAllowanceResult } from '../../../lib/adminApi';
const indiaTime = (value: string) => new Date(value).toLocaleString('en-IN', {timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}) + ' IST';

export function CreditAllowancesPanel({wholesalerId}: {wholesalerId?: string}) {
  const [result,setResult] = useState<CreditAllowanceResult | null>(null);
  const [page,setPage] = useState(0);
  const [search,setSearch] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [revision,setRevision] = useState(0);
  const [editor,setEditor] = useState<{item:CreditAllowanceItem; reset:boolean} | null>(null);
  const [amount,setAmount] = useState('');
  const [reason,setReason] = useState('');
  const [saving,setSaving] = useState(false);
  const [saveError,setSaveError] = useState('');
  const [success,setSuccess] = useState('');
  const request = useRef<AllowanceChange | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    let active=true;
    const timer=setTimeout(() => {
      setBusy(true);setError('');
      fetchCreditAllowances(wholesalerId ? '' : search,wholesalerId ? 0 : page,25,wholesalerId)
        .then(data => {if(active) setResult(data);})
        .catch(err => {if(active) {setResult(null);setError(err instanceof Error ? err.message : 'Could not load allowances.');}})
        .finally(() => {if(active) setBusy(false);});
    },200);
    return () => {active=false;clearTimeout(timer);};
  },[search,page,revision,wholesalerId]);
  function open(item:CreditAllowanceItem,reset=false) {
    request.current=null;setEditor({item,reset});setAmount(String(item.daily_allowance));
    setReason('');setSaveError('');setSuccess('');
  }
  async function save() {
    if(!editor || inFlight.current) return;
    const value=Number(amount);
    if(!editor.reset && (!amount.trim() || !Number.isInteger(value) || value<0 || value>100000)) {
      setSaveError('Enter a whole number between 0 and 100,000.');return;
    }
    if(!reason.trim() || reason.trim().length>500) {setSaveError('Enter a reason of 1–500 characters.');return;}
    const draft={action:editor.reset ? 'reset_default' as const : 'set_allowance' as const,
      wholesaler_id:editor.item.wholesaler_id,daily_allowance:editor.reset ? undefined : value,
      reason:reason.trim(),expected_version:editor.item.policy_version};
    const previous=request.current;
    if(!previous || JSON.stringify({...previous,request_key:undefined})!==JSON.stringify(draft)) {
      request.current={...draft,request_key:crypto.randomUUID()};
    }
    inFlight.current=true;setSaving(true);setSaveError('');
    try {
      const data=await saveCreditAllowance(request.current!);
      setSuccess(`Saved: ${data.next_allowance.toLocaleString('en-IN')} credits at the next eligible refill, from ${indiaTime(data.effective_at)}.${data.program_active ? '' : ' The daily program still awaits activation.'}`);
      setEditor(null);setRevision(n=>n+1);request.current=null;
    } catch(err) {setSaveError(err instanceof Error ? err.message : 'Could not save. Retry to check the same request.');}
    finally {inFlight.current=false;setSaving(false);}
  }
  return <section className="space-y-5 border border-gray-200 rounded-xl p-6 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h2 className="text-xl font-bold">Wholesaler credit allowances</h2>
        <p className="text-sm text-gray-600 mt-1">Each issued allowance lasts 24 hours. Changes apply at the next refill; current credits stay available until their deadline.</p>
      </div>
      <button disabled={busy || saving} onClick={()=>setRevision(n=>n+1)} className="border rounded px-3 py-2 disabled:opacity-50">Refresh</button>
    </div>
    {result && !result.program_active && <p role="status" className="bg-amber-50 p-3 rounded">The credit program awaits activation. Settings can be saved, but recurring grants are not active.</p>}
    {!wholesalerId && <input aria-label="Search wholesalers" placeholder="Business name, contact or phone" value={search}
      onChange={e=>{setSearch(e.target.value);setPage(0);}} className="border rounded p-2 w-full max-w-md" />}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {success && <p role="status" className="bg-emerald-50 text-emerald-800 p-3 rounded">{success}</p>}
    {busy && <p role="status">Loading allowances…</p>}
    {!busy && result && !result.items.length && <p>No matching wholesaler found.</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead><tr className="border-b"><th className="p-3">Business</th><th>Current window</th><th>Next allowance</th><th>Available credits</th><th>Actions</th></tr></thead>
      <tbody>{result?.items.map(item=><tr key={item.wholesaler_id} className="border-b">
        <td className="p-3 align-top"><Link className="text-amber-700 underline" to={`/review/wholesaler/${item.wholesaler_id}`}>{item.business_name || 'Unnamed business'}</Link>
          <p>{item.full_name} · {item.phone}</p><p className="text-xs text-gray-500">{item.verification_status}</p></td>
        <td className="py-3 align-top">{item.current_allowance == null ? 'No active allowance' : `${item.current_allowance.toLocaleString()} issued`}
          <p className="text-xs">{item.next_refill_at ? `Next refill: ${indiaTime(item.next_refill_at)}` : 'On the next eligible wallet visit'}</p></td>
        <td className="py-3 align-top"><strong>{item.daily_allowance===0 ? 'Paused (0)' : item.daily_allowance.toLocaleString()}</strong>
          <p>{item.is_custom ? 'Custom' : `Default (${result.default_allowance.toLocaleString()})`}</p>
          {item.last_reason && <p className="text-xs text-gray-500">{item.last_reason}</p>}</td>
        <td className="py-3 align-top"><strong>{item.available.toLocaleString()}</strong>
          <p className="text-xs">Recurring: {item.recurring_available.toLocaleString()} · Gifts: {item.gift_available.toLocaleString()} · Paid: {item.paid_available.toLocaleString()}</p></td>
        <td className="py-3 align-top space-x-2"><button onClick={()=>open(item)} disabled={saving || item.verification_status!=='verified' || !item.user_id}
          className="bg-amber-700 text-white rounded px-3 py-1 disabled:opacity-40">Edit</button>
          {item.is_custom && <button onClick={()=>open(item,true)} disabled={saving || item.verification_status!=='verified'} className="border rounded px-3 py-1 disabled:opacity-40">Use default</button>}</td>
      </tr>)}</tbody>
    </table></div>
    {!wholesalerId && <div className="flex justify-between text-sm">
      <button disabled={busy || page===0} onClick={()=>setPage(n=>n-1)}>Previous</button>
      <span>Page {page+1} · {result?.total_count ?? 0} businesses</span>
      <button disabled={busy || !result || (page+1)*25>=result.total_count} onClick={()=>setPage(n=>n+1)}>Next</button>
    </div>}
    {editor && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <form role="dialog" aria-modal="true" aria-labelledby="allowance-title" onSubmit={e=>{e.preventDefault();void save();}} className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
        <h3 id="allowance-title" className="text-xl font-bold">{editor.reset ? 'Restore default allowance' : 'Edit allowance'}</h3>
        <p>{editor.item.business_name}</p>
        {!editor.reset && <label className="block">Credits per 24-hour window
          <input required type="number" min="0" max="100000" step="1" value={amount} disabled={saving} onChange={e=>setAmount(e.target.value)} className="block border p-2 rounded w-full" />
        </label>}
        {editor.reset && <p>The business will inherit the system default of {result?.default_allowance.toLocaleString()} credits.</p>}
        <label className="block">Reason<input required maxLength={500} value={reason} disabled={saving} onChange={e=>setReason(e.target.value)} className="block border p-2 rounded w-full" /></label>
        <p className="bg-amber-50 text-sm p-3 rounded">Applies {editor.item.next_refill_at ? `at the next refill, ${indiaTime(editor.item.next_refill_at)}` : 'on the next eligible wallet visit'}. Zero pauses future recurring grants. Existing paid and gift credits retain their rules.</p>
        {saveError && <p role="alert" className="text-red-700">{saveError}</p>}
        <div className="flex justify-end gap-3"><button type="button" disabled={saving} onClick={()=>setEditor(null)}>Cancel</button>
          <button disabled={saving} className="bg-amber-700 text-white rounded px-4 py-2">{saving ? 'Saving…' : 'Save for next refill'}</button></div>
      </form>
    </div>}
  </section>;
}
export function CreditAllowances() {
  const [params]=useSearchParams();
  return <main className="max-w-7xl mx-auto p-6 space-y-6"><Link to="/" className="underline">Back to dashboard</Link>
    <CreditAllowancesPanel wholesalerId={params.get('wholesaler') || undefined} /></main>;
}
