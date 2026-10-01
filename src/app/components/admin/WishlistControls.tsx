import { useState } from 'react';
import { Link } from 'react-router';
import { supabase } from '../../../lib/supabase';

type Share = {id:string; retailer_id:string; created_at:string; expires_at:string; max_viewers:number; views_used:number; revoked_at:string|null};
export function WishlistControls() {
  // This password is checked only by the Edge Function, never by a bundled VITE secret.
  const [password,setPassword] = useState('');
  const [store,setStore] = useState('');
  const [shares,setShares] = useState<Share[]>([]);
  const [program,setProgram] = useState<{daily_enabled:boolean;payments_enabled:boolean}|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  async function load(action = 'list', id?:string) {
    setBusy(true);setError('');
    try {
      const result = await supabase.functions.invoke('admin-wishlist-shares',{
        headers:{'x-admin-password':password},body:{action,id,store_id:store || undefined},
      });
      if (result.error || result.data?.error) throw new Error('Could not access wishlist controls. Check your admin password and try again.');
      if (action === 'revoke') {
        setShares(items => items.map(item => item.id === id ? {...item,revoked_at:new Date().toISOString()} : item));
      } else {setShares(result.data.shares);setProgram(result.data.program);}
    } catch (err) {setError(err instanceof Error ? err.message : 'Could not load wishlists.');}
    finally {setBusy(false);}
  }
  return <main className="mx-auto max-w-6xl p-6 space-y-6">
    <Link to="/" className="underline">Back to admin</Link>
    <h1 className="text-3xl">Wishlist links & daily credits</h1>
    <form className="flex flex-wrap items-end gap-4" onSubmit={event => {event.preventDefault();void load();}}>
      <label>Admin password<input required type="password" autoComplete="current-password" className="block border p-2" value={password} onChange={e => setPassword(e.target.value)} /></label>
      <label>Store ID (optional)<input className="block border p-2" value={store} onChange={e => setStore(e.target.value.trim())} /></label>
      <button disabled={busy} className="bg-black text-white px-4 py-2 disabled:opacity-50">{busy ? 'Loading…' : 'Load latest links'}</button>
    </form>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {program && <p>Daily allowance: {program.daily_enabled ? 'Active · 2,000 at midnight India time' : 'Awaiting activation'} · Purchases: {program.payments_enabled ? 'Enabled' : 'Paused'}</p>}
    <p className="text-sm text-gray-600">Latest 100 links. Counts represent anonymous browser sessions. Revoking a link stops further page and API access.</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-3">Store</th><th>Used / limit</th><th>Expires (India)</th><th>Status</th><th>Action</th></tr></thead><tbody>{shares.map(share => <tr className="border-t" key={share.id}>
      <td className="p-3 font-mono">{share.retailer_id}</td><td>{share.views_used} / {share.max_viewers}</td><td>{new Date(share.expires_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</td>
      <td>{share.revoked_at ? 'Revoked' : Date.parse(share.expires_at) <= Date.now() ? 'Expired' : share.views_used >= share.max_viewers ? 'Full' : 'Active'}</td>
      <td><button disabled={busy || !!share.revoked_at} onClick={() => void load('revoke',share.id)} className="underline disabled:opacity-40">Revoke</button></td>
    </tr>)}</tbody></table></div>
  </main>;
}
