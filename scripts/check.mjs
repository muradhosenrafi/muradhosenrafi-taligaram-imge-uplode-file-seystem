import ts from 'typescript';
import {readFileSync,existsSync} from 'node:fs';
import {scryptSync,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
async function load(path,replacements=[]){let s=readFileSync(path,'utf8').replaceAll("import 'server-only';",'');for(const [a,b]of replacements)s=s.replace(a,b);return import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'))}
process.env.AUTH_SECRET='12'.repeat(32);const password='a-test-password-123';const salt=Buffer.from('ab'.repeat(16),'hex');process.env.VAULT_PASSWORD_HASH='scrypt:'+salt.toString('hex')+':'+scryptSync(password,salt,64).toString('hex');process.env.SUPABASE_URL='https://database.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-server-key';
const cookieMap=new Map();globalThis.testCookies=async()=>({get:name=>cookieMap.has(name)?{value:cookieMap.get(name)}:undefined,set(name,value){cookieMap.set(name,value)}});
const auth=await load('lib/auth.ts',[["import {cookies} from 'next/headers';","const cookies=globalThis.testCookies;"]]);globalThis.testAuth=auth;
assert(auth.verifyPassword(password));assert(!auth.verifyPassword('wrong'));assert(!auth.verifyPassword(null));const session=auth.makeSession();assert(auth.verifySession(session));assert(!auth.verifySession(session.slice(0,-4)+'abcd'));assert(!auth.verifySession('broken'));
const tables={rafi_vault_settings:[],rafi_vault_entries:[],rafi_vault_parts:[]};const originals=new Map();let sent=0,attempts=0,rateLimit=false;
const okay=result=>Response.json({ok:true,result});
function filter(items,params){let out=items.filter(item=>{for(const[key,v]of params){if(['select','limit','offset','order'].includes(key))continue;if(v.startsWith('eq.')&&String(item[key])!==v.slice(3))return false;}return true});if(params.get('order')==='idx.asc')out.sort((a,b)=>a.idx-b.idx);if(params.has('offset'))out=out.slice(Number(params.get('offset')));if(params.has('limit'))out=out.slice(0,Number(params.get('limit')));return out}
globalThis.fetch=async(input,options={})=>{const u=new URL(String(input));
 if(u.hostname==='database.test'){
  assert.equal(options.headers.apikey,'test-server-key');const path=u.pathname.replace('/rest/v1/',''),method=options.method||'GET';const body=options.body?JSON.parse(options.body):null;
  if(path==='rpc/vault_take_login_attempt')return Response.json(++attempts<=20);
  if(path==='rpc/vault_complete_file'){const e=tables.rafi_vault_entries.find(e=>e.id===body.file_id),parts=tables.rafi_vault_parts.filter(p=>p.entry===body.file_id);const success=Boolean(e&&parts.length===Math.ceil(e.size/(3*1024**2))&&parts.reduce((n,p)=>n+p.size,0)===e.size);if(success)e.ready=true;return Response.json(success)}
  if(path==='rpc/vault_remove_entry'){if(tables.rafi_vault_entries.some(e=>e.parent===body.entry_id&&e.ready))return Response.json(false);const ids=tables.rafi_vault_entries.filter(e=>e.id===body.entry_id||(e.parent===body.entry_id&&!e.ready)).map(e=>e.id);tables.rafi_vault_entries=tables.rafi_vault_entries.filter(e=>!ids.includes(e.id));tables.rafi_vault_parts=tables.rafi_vault_parts.filter(p=>!ids.includes(p.entry));return Response.json(true)}
  const list=tables[path];assert(list,`Unknown table ${path}`);
  if(method==='GET')return Response.json(filter(list,u.searchParams));
  if(method==='POST'){const id=path==='rafi_vault_settings'?'owner':'id';const old=list.find(x=>x[id]===body[id]);if(old){if(options.headers.Prefer?.includes('merge-duplicates'))Object.assign(old,body);}else list.push(body);return new Response(null,{status:201})}
  if(method==='PATCH'){for(const row of filter(list,u.searchParams))Object.assign(row,body);return new Response(null,{status:204})}
 }
 if(u.hostname==='api.telegram.org'){
  if(u.pathname.startsWith('/file/bot'))return new Response(originals.get(u.pathname.split('/').at(-1)));
  const method=u.pathname.split('/').at(-1);
  if(method==='getMe')return okay({id:123,username:'testvaultbot'});
  if(method==='getChat')return okay({id:-1004478313043,type:'channel',title:'Test vault'});
  if(method==='getChatMember')return okay({status:'administrator',can_post_messages:true});
  if(method==='sendDocument'){if(rateLimit){rateLimit=false;return Response.json({ok:false,error_code:429,parameters:{retry_after:7}})}const id=String(++sent);originals.set(id,await options.body.get('document').arrayBuffer());return okay({document:{file_id:id},message_id:sent})}
  if(method==='getFile')return okay({file_path:'documents/'+JSON.parse(options.body).file_id});
 }
 throw new Error('Unexpected fetch '+u.origin+u.pathname);
};
const store=await load('lib/store.ts');globalThis.testStore=store;
const authRoute=await load('app/api/auth/route.ts',[["import {authReady,hasSession,setSession,clearSession,verifyPassword,sameOrigin} from '../../../lib/auth';","const {authReady,hasSession,setSession,clearSession,verifyPassword,sameOrigin}=globalThis.testAuth;"],["import {databaseReady,rest} from '../../../lib/store';","const {databaseReady,rest}=globalThis.testStore;"]]);
const origin='https://vault.test';const req=(url,body,headers={})=>new Request(origin+url,{method:'POST',headers:{origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
let r=await authRoute.POST(req('/api/auth',{password:'bad'}));assert.equal(r.status,401);r=await authRoute.POST(req('/api/auth',{password}));assert.equal(r.status,200);assert(await auth.hasSession());
const api=await load('app/api/vault/route.ts',[["import {hasSession,sameOrigin,encryptionKey} from '../../../lib/auth';","const {hasSession,sameOrigin,encryptionKey}=globalThis.testAuth;"],["import {rows,first,insert,patch,rest} from '../../../lib/store';","const {rows,first,insert,patch,rest}=globalThis.testStore;"]]);
assert.equal((await api.POST(req('/api/vault?action=create',{kind:'folder',name:'bad'},{origin:'https://evil.test'}))).status,403);
const held=new Map(cookieMap);cookieMap.clear();assert.equal((await api.GET(new Request(origin+'/api/vault'))).status,401);for(const [k,v]of held)cookieMap.set(k,v);
async function post(action,body){const r=await api.POST(req('/api/vault?action='+action,body));const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));return d}
await post('connect',{token:'123:'+'x'.repeat(30),chat:'-1004478313043'});assert(!tables.rafi_vault_settings[0].secret.includes('xxx'));
const folder=await post('create',{kind:'folder',name:'Memories'});const original=Buffer.alloc(3*1024**2+117,123);const file=await post('create',{kind:'file',name:'original.bin',mime:'application/octet-stream',parent:folder.id,size:original.length});
assert.equal((await api.POST(req('/api/vault?action=complete',{id:file.id}))).status,400);
assert.equal((await api.GET(new Request(origin+'/api/vault?download='+file.id))).status,404);
async function upload(index,data){return api.POST(new Request(origin+`/api/vault?action=chunk&id=${file.id}&idx=${index}`,{method:'POST',headers:{origin},body:data}))}
assert.equal((await upload(0,Buffer.alloc(4*1024**2))).status,413);
rateLimit=true;r=await upload(0,original.subarray(0,3*1024**2));assert.equal(r.status,429);assert.equal((await r.json()).retryAfter,7);
for(let i=0;i<2;i++){r=await upload(i,original.subarray(i*3*1024**2,(i+1)*3*1024**2));assert.equal(r.status,200,await r.text());}
await upload(0,original.subarray(0,3*1024**2));assert.equal(sent,2,'Recorded chunks must not be sent twice');await post('complete',{id:file.id});
const manifest=await (await api.GET(new Request(origin+'/api/vault?download='+file.id))).json();assert.equal(manifest.parts.length,2);const downloaded=[];for(const part of manifest.parts){const r=await api.GET(new Request(origin+`/api/vault?download=${file.id}&part=${part.idx}`));assert.equal(r.status,200);downloaded.push(Buffer.from(await r.arrayBuffer()));}assert.deepEqual(Buffer.concat(downloaded),original);
originals.set('1',Buffer.from('corrupt'));assert.equal((await api.GET(new Request(origin+`/api/vault?download=${file.id}&part=0`))).status,400);
assert.equal((await api.POST(req('/api/vault?action=remove',{id:folder.id}))).status,400);await post('remove',{id:file.id});await post('remove',{id:folder.id});assert.equal(tables.rafi_vault_entries.length,0);
attempts=20;r=await authRoute.POST(req('/api/auth',{password}));assert.equal(r.status,429);
await authRoute.POST(req('/api/auth?logout=1',{}));assert(!await auth.hasSession());
if(existsSync('.next/routes-manifest.json')){const manifest=JSON.parse(readFileSync('.next/routes-manifest.json','utf8'));assert(manifest.version);console.log('Verified: .next/routes-manifest.json exists and parses.');}
console.log('Passed: password/session/logout, same-origin writes, anonymous denial, encrypted token, 3 MiB multipart round-trip, retry-after, idempotence, incomplete-file hiding, oversized rejection, integrity checks and nonempty-folder protection.');
