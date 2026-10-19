import {authReady,hasSession,setSession,clearSession,verifyPassword,sameOrigin} from '../../../lib/auth';
import {databaseReady,rest} from '../../../lib/store';
export const runtime='nodejs';
export async function GET(){return Response.json({authenticated:await hasSession(),configured:authReady()&&databaseReady()},{headers:{'Cache-Control':'no-store'}})}
export async function POST(req:Request){
 if(!sameOrigin(req))return Response.json({error:'Invalid request origin.'},{status:403});
 if(new URL(req.url).searchParams.get('logout')){await clearSession();return Response.json({ok:true})}
 if(!authReady()||!databaseReady())return Response.json({error:'Complete the four environment variables in Vercel and run supabase/schema.sql. See START_HERE_BN.md.'},{status:503});
 try{
  if(Number(req.headers.get('content-length')||0)>2048)return Response.json({error:'Request too large.'},{status:413});
  const allowed=await rest('rpc/vault_take_login_attempt','POST',{});if(!allowed)return Response.json({error:'Too many login attempts. Wait 15 minutes and try again.'},{status:429});
  const {password}=await req.json();if(!verifyPassword(password))return Response.json({error:'Incorrect password.'},{status:401});
  await setSession();return Response.json({ok:true});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Login failed.'},{status:503})}
}
