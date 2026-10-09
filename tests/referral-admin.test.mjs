import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const {transform}=require('esbuild');
async function fixture(name) {
 let handler;const calls=[];
 const query=new Proxy({}, {get:(_,key)=>key==='then'?(resolve=>resolve({data:[],error:null,count:0})):(...args)=>{calls.push({method:key,args});return query;}});
 const context=vm.createContext({Response,console,crypto:webcrypto,Deno:{env:{get:key=>key==='ADMIN_PASSWORD'?'server-password':'test'},serve:fn=>{handler=fn;}}});
 const create=new vm.SyntheticModule(['createClient'],function(){this.setExport('createClient',()=>({from:table=>{calls.push({table});return query;},rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true},error:null};}}));},{context});
 const serve=new vm.SyntheticModule(['serve'],function(){this.setExport('serve',fn=>{handler=fn;});},{context});
 const auth= new vm.SourceTextModule((await transform(await readFile(new URL('../supabase/functions/_shared/adminAuth.ts',import.meta.url),'utf8'),{loader:'ts',format:'esm'})).code,{context});await auth.link(()=>{throw Error('unexpected import');});
 const module=new vm.SourceTextModule((await transform(await readFile(new URL(`../supabase/functions/${name}/index.ts`,import.meta.url),'utf8'),{loader:'ts',format:'esm'})).code,{context});
 await module.link(spec=>spec.includes('adminAuth')?auth:spec.includes('supabase-js')?create:serve);await module.evaluate();
 return {calls,run:async(body,password='server-password')=>handler(new Request('https://example.com',{method:'POST',headers:password?{'x-admin-password':password}:{},body:JSON.stringify(body)}))};
}
test('referral report refuses missing or invalid admin password before touching data',async()=>{for(const password of [null,'wrong']){const f=await fixture('admin-referrals');assert.equal((await f.run({action:'list'},password)).status,401);assert.equal(f.calls.length,0);}});
test('report queries are bounded and sanitize search expressions',async()=>{const f=await fixture('admin-referrals');assert.equal((await f.run({action:'list',page:2,search:'name),status.eq.rewarded'})).status,200);assert.deepEqual(f.calls.find(c=>c.method==='range').args,[50,74]);assert(!f.calls.find(c=>c.method==='or').args[0].includes(')'));});
test('report rejects unknown status and invalid owner identifiers',async()=>{for(const body of [{action:'list',status:'invented'},{action:'list',wholesaler_id:'forged'}]){const f=await fixture('admin-referrals');assert.equal((await f.run(body)).status,400);assert.equal(f.calls.length,0);}});
test('both approval and final rejection use the atomic review RPC',async()=>{for(const [name,status] of [['admin-verify-submission','verified'],['admin-reject-submission','rejected']]){const f=await fixture(name);assert.equal((await f.run({table:'retailers',id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',reason:'Final'})).status,200);assert.equal(f.calls[0].name,'referral_admin_review');assert.equal(f.calls[0].args.p_status,status);assert.match(f.calls[0].args.p_request,/^[0-9a-f-]{36}$/);assert.equal(f.calls.some(c=>c.table),false);}});
