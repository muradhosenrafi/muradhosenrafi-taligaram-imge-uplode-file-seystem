import {hasSession,sameOrigin,encryptionKey} from '../../../lib/auth';
import {rows,first,insert,patch,rest} from '../../../lib/store';
import {randomUUID,randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
const CHUNK=3*1024*1024;
const E='rafi_vault_entries',P='rafi_vault_parts',S='rafi_vault_settings';
const json=(x:unknown,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
class VaultError extends Error{constructor(message:string,public status=400,public retryAfter=0){super(message)}}
const fail=(m:string):never=>{throw new VaultError(m)};
function encrypted(text:string,decode=false){const key=encryptionKey();if(decode){const data=Buffer.from(text,'base64');const d=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));d.setAuthTag(data.subarray(12,28));return Buffer.concat([d.update(data.subarray(28)),d.final()]).toString()}const iv=randomBytes(12);const c=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([c.update(text),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]).toString('base64')}
async function tg(token:string,method:string,body:FormData|object){let r:Response;try{r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',...(body instanceof FormData?{body}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),cache:'no-store',signal:AbortSignal.timeout(90000)})}catch{throw new VaultError('Telegram is unreachable. Retry in a moment.',502)}let d:any;try{d=await r.json()}catch{throw new VaultError('Invalid response from Telegram.',502)}if(!d.ok){if(d.error_code===429)throw new VaultError('Telegram is busy. Waiting to retry.',429,Math.min(120,Math.max(1,d.parameters?.retry_after||10)));throw new VaultError('Telegram: '+String(d.description||'Request failed').replaceAll(token,'[hidden]'))}return d.result}
async function connection(){const s=await first(S,{owner:'eq.owner'});if(!s)fail('Connect Telegram first.');return {...s,token:encrypted(s.secret,true)}}
function clean(value:unknown){if(typeof value!=='string'||!value.trim()||value.length>180||/[\x00-\x1f/\\]/.test(value))fail('Use a name of 1–180 characters without slashes.');return (value as string).trim()}
function validId(id:unknown){if(typeof id!=='string'||!/^[-a-f0-9]{36}$/.test(id))fail('Invalid file or folder ID.');return id as string}
async function parentCheck(parent:string){if(parent&&!await first(E,{id:'eq.'+validId(parent),owner:'eq.owner',kind:'eq.folder',ready:'eq.true'}))fail('Folder not found.')}
async function readChunk(req:Request){if(Number(req.headers.get('content-length')||0)>CHUNK)throw new VaultError('Chunk exceeds 3 MiB.',413);const reader=req.body?.getReader();const chunks:Uint8Array[]=[];let size=0;if(reader){while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>CHUNK){await reader.cancel();throw new VaultError('Chunk exceeds 3 MiB.',413)}chunks.push(value)}}const data=Buffer.concat(chunks,size);return data}
function error(e:unknown){return e instanceof VaultError?json({error:e.message,retryAfter:e.retryAfter},e.status):json({error:e instanceof Error?e.message:'Request failed.'},400)}
export async function GET(req:Request){if(!await hasSession())return json({error:'Please sign in again.'},401);try{
 const u=new URL(req.url),id=u.searchParams.get('download');
 if(id){const entry=await first(E,{id:'eq.'+validId(id),owner:'eq.owner',kind:'eq.file',ready:'eq.true'});if(!entry)return json({error:'File not found.'},404);const parts=await rows(P,{entry:'eq.'+id,order:'idx.asc',select:'idx,size,hash'});const raw=u.searchParams.get('part');if(raw===null)return json({name:entry.name,size:entry.size,mime:entry.mime,parts});
 const idx=Number(raw);if(!Number.isInteger(idx)||idx<0)fail('Invalid part.');const part=await first(P,{entry:'eq.'+id,idx:'eq.'+idx});if(!part)return json({error:'Part not found.'},404);const s=await connection();const file=await tg(s.token,'getFile',{file_id:part.file});if(!/^[a-zA-Z0-9_./-]+$/.test(file.file_path))fail('Invalid Telegram file path.');const r=await fetch(`https://api.telegram.org/file/bot${s.token}/${file.file_path}`,{cache:'no-store',signal:AbortSignal.timeout(60000)});if(!r.ok)fail('Telegram download failed.');const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length!==part.size||createHash('sha256').update(bytes).digest('hex')!==part.hash)fail('File integrity check failed.');return new Response(bytes,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(bytes.length),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 // PostgREST defaults to 1000 rows. Page through all visible entries.
 const entries:any[]=[];let offset=0;while(true){const page=await rows(E,{owner:'eq.owner',ready:'eq.true',order:'created.desc,id.asc',select:'id,parent,name,kind,mime,size,created',limit:'1000',offset:String(offset)});entries.push(...page.map((x:any)=>({...x,parent:x.parent||'',size:Number(x.size),created:Number(x.created)})));if(page.length<1000)break;offset+=1000;}
 const s=await first(S,{owner:'eq.owner',select:'title,chat,bot'});return json({entries,connection:s});
 }catch(e){return error(e)}}
export async function POST(req:Request){if(!sameOrigin(req))return json({error:'Invalid request origin.'},403);if(!await hasSession())return json({error:'Please sign in again.'},401);try{
 const u=new URL(req.url),action=u.searchParams.get('action');
 if(action==='chunk'){
 const id=validId(u.searchParams.get('id')),idx=Number(u.searchParams.get('idx'));const e=await first(E,{id:'eq.'+id,owner:'eq.owner',kind:'eq.file',ready:'eq.false'});if(!e)fail('Upload not found.');const count=Math.ceil(Number(e.size)/CHUNK);if(!Number.isInteger(idx)||idx<0||idx>=count)fail('Invalid chunk index.');if(await first(P,{entry:'eq.'+id,idx:'eq.'+idx}))return json({ok:true});const bytes=await readChunk(req);const expected=idx===count-1?Number(e.size)-idx*CHUNK:CHUNK;if(bytes.length!==expected)fail('Chunk size mismatch.');const s=await connection();const body=new FormData();body.set('chat_id',s.chat);body.set('document',new Blob([new Uint8Array(bytes)]),count===1?e.name:`${e.name}.part${String(idx+1).padStart(4,'0')}`);body.set('disable_content_type_detection','true');body.set('caption',`Rafi Vault · ${e.name}\n${id} · part ${idx+1}/${count}`);const sent=await tg(s.token,'sendDocument',body);if(!sent.document)fail('Telegram returned no document.');await insert(P,{id:`${id}:${idx}`,entry:id,idx,file:sent.document.file_id,message:sent.message_id,size:bytes.length,hash:createHash('sha256').update(bytes).digest('hex')},'resolution=ignore-duplicates,return=minimal');return json({ok:true});
 }
 if(Number(req.headers.get('content-length')||0)>8192)throw new VaultError('Request too large.',413);const b:any=await req.json();
 if(action==='connect'){
 const token=String(b.token||'').trim(),chat=String(b.chat||'').trim();if(!/^\d+:[\w-]{20,}$/.test(token)||!/^-100\d+$/.test(chat))fail('Enter a valid bot token and private channel ID.');
 const me=await tg(token,'getMe',{}),channel=await tg(token,'getChat',{chat_id:chat});if(channel.type!=='channel'||channel.username)fail('Use a private Telegram channel.');const member=await tg(token,'getChatMember',{chat_id:channel.id,user_id:me.id});if(member.status!=='administrator'||!member.can_post_messages)fail('Make the bot a channel admin with Post Messages permission.');const old=await first(S,{owner:'eq.owner'});if(old&&(old.chat!==String(channel.id)||old.bot!==String(me.id)))fail('Keep the existing bot and channel to preserve downloads.');await insert(S,{owner:'owner',secret:encrypted(token),chat:String(channel.id),bot:String(me.id),title:channel.title||'Private channel'},'resolution=merge-duplicates,return=minimal');return json({ok:true});
 }
 if(action==='create'){
 const name=clean(b.name),parent=String(b.parent||'');await parentCheck(parent);const kind=b.kind==='folder'?'folder':'file',size=Number(b.size||0);if(!Number.isSafeInteger(size)||size<0||size>2*1024**3)fail('Maximum file size is 2 GiB.');if(kind==='file'){if(!size)fail('Telegram cannot store an empty file. Add content first.');await connection();}const id=randomUUID();await insert(E,{id,owner:'owner',parent:parent||null,name,kind,mime:String(b.mime||'').slice(0,120),size,created:Date.now(),ready:kind==='folder'});return json({id});
 }
 if(action==='complete'){if(!await rest('rpc/vault_complete_file','POST',{file_id:validId(b.id)}))fail('Upload is incomplete.');return json({ok:true});}
 if(action==='rename'){await patch(E,{id:'eq.'+validId(b.id),owner:'eq.owner'},{name:clean(b.name)});return json({ok:true});}
 if(action==='remove'){if(!await rest('rpc/vault_remove_entry','POST',{entry_id:validId(b.id)}))fail('Empty the folder first, or refresh if it no longer exists.');return json({ok:true});}
 return json({error:'Unknown action.'},400);
 }catch(e){return error(e)}}
