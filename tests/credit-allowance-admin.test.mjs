import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { transform } = require('esbuild');

async function fixture(name, response) {
  let handler;
  const calls = [];
  const query = new Proxy(
    {},
    {
      get: (_, key) =>
        key === 'then'
          ? (resolve) => resolve({ data: [], error: null, count: 0 })
          : (...args) => {
              calls.push({ method: key, args });
              return query;
            },
    }
  );
  const context = vm.createContext({
    Response,
    console,
    crypto: webcrypto,
    Deno: {
      env: { get: (key) => (key === 'ADMIN_PASSWORD' ? 'server-password' : 'test') },
      serve: (fn) => {
        handler = fn;
      },
    },
  });
  const create = new vm.SyntheticModule(
    ['createClient'],
    function () {
      this.setExport('createClient', () => ({
        from: (table) => {
          calls.push({ table });
          return query;
        },
        rpc: async (name, args) => {
          calls.push({ name, args });
          return response ? response(name,args) : { data: { ok: true, name, args }, error: null };
        },
      }));
    },
    { context }
  );
  const serve = new vm.SyntheticModule(
    ['serve'],
    function () {
      this.setExport('serve', (fn) => {
        handler = fn;
      });
    },
    { context }
  );
  const auth = new vm.SourceTextModule(
    (
      await transform(
        await readFile(new URL('../supabase/functions/_shared/adminAuth.ts', import.meta.url), 'utf8'),
        { loader: 'ts', format: 'esm' }
      )
    ).code,
    { context }
  );
  await auth.link(() => {
    throw Error('unexpected import');
  });
  const module = new vm.SourceTextModule(
    (
      await transform(
        await readFile(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8'),
        { loader: 'ts', format: 'esm' }
      )
    ).code,
    { context }
  );
  await module.link((spec) =>
    spec.includes('adminAuth') ? auth : spec.includes('supabase-js') ? create : serve
  );
  await module.evaluate();
  return {
    calls,
    run: async (body, password = 'server-password') =>
      handler(
        new Request('https://example.com', {
          method: 'POST',
          headers: password ? { 'x-admin-password': password } : {},
          body: JSON.stringify(body),
        })
      ),
  };
}

const id = '11111111-1111-4111-8111-111111111111';
const key = '22222222-2222-4222-8222-222222222222';
const change = { action:'set_allowance', wholesaler_id:id, daily_allowance:5000, reason:'VIP partner tier', expected_version:0, request_key:key };
test('admin mutations and reads require server-validated admin authorization',async()=>{
  for(const password of [null,'wrong-password']) {
    const f=await fixture('admin-credit-allowances'); assert.equal((await f.run(change,password)).status,401);assert.equal(f.calls.length,0);
  }
});
test('list forwards a dedicated wholesaler ID and bounded pagination',async()=>{
  const f=await fixture('admin-credit-allowances');const res=await f.run({action:'list',wholesaler_id:id,search:'Sona',page:1,pageSize:20});
  assert.equal(res.status,200);assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].args)),{p_search:'Sona',p_page:1,p_page_size:20,p_wholesaler_id:id});
  assert.equal((await f.run({action:'list',wholesaler_id:'bad-id'})).status,400);
});
test('set requires a valid target, amount, reason, version and stable request key',async()=>{
  for(const invalid of [{daily_allowance:-1},{daily_allowance:100001},{daily_allowance:1.5},{daily_allowance:'5000'},
    {reason:''},{reason:' '.repeat(3)},{reason:'a'.repeat(501)},{expected_version:null},{expected_version:-1},
    {request_key:null},{request_key:'bad'},{wholesaler_id:'bad'}]) {
    const f=await fixture('admin-credit-allowances');assert.equal((await f.run({...change,...invalid})).status,400);assert.equal(f.calls.length,0);
  }
  const f=await fixture('admin-credit-allowances');assert.equal((await f.run(change)).status,200);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].args)),{p_wholesaler_id:id,p_daily_allowance:5000,p_reason:'VIP partner tier',p_expected_version:0,p_request_key:key,p_reset:false});
});
test('reset uses the same versioned and idempotent mutation and cannot forge actor attribution',async()=>{
  const f=await fixture('admin-credit-allowances');assert.equal((await f.run({...change,action:'reset_default',actor:'forged'})).status,200);
  const call=f.calls[0];assert.equal(call.name,'admin_set_credit_allowance');assert.equal(call.args.p_reset,true);assert.equal(call.args.p_daily_allowance,null);
  assert.equal(call.args.p_expected_version,0);assert.equal(call.args.p_request_key,key);assert.equal(call.args.p_actor,undefined);
});
test('conflicts are surfaced and backend outages fail closed without SQL details',async()=>{
  for(const code of ['VERSION_CONFLICT','IDEMPOTENCY_CONFLICT']) {
    const f=await fixture('admin-credit-allowances',()=>({data:{ok:false,error:code},error:null}));assert.equal((await f.run(change)).status,409);
  }
  const f=await fixture('admin-credit-allowances',()=>({data:null,error:new Error('internal table/private query')}));
  const res=await f.run(change);assert.equal(res.status,503);assert(!JSON.stringify(await res.json()).includes('private query'));
});
test('missing program metadata cannot disable wishlist link management',async()=>{
  const f=await fixture('admin-wishlist-shares',name=>({data:null,error:name==='credits_program_status' ? new Error('Missing') : null}));
  const res=await f.run({action:'list'});assert.equal(res.status,200);
  const data=await res.json();assert.equal(data.program,null);assert.equal(data.program_unavailable,true);assert.deepEqual(data.shares,[]);
});
test('unknown action and malformed request bodies are rejected',async()=>{
  const f=await fixture('admin-credit-allowances');for(const body of [{action:'unsupported'},null,[],42]) assert.equal((await f.run(body)).status,400);
});

test('missing credit migration reports pending deployment without exposing database details',async()=>{
  const f=await fixture('admin-credit-allowances',()=>({data:null,error:{code:'PGRST202',message:'private SQL schema details'}}));
  const res=await f.run({action:'list'});assert.equal(res.status,503);
  const body=await res.json();assert.equal(body.error,'CREDIT_PROGRAM_UNAVAILABLE');assert(!JSON.stringify(body).includes('private SQL'));
});
