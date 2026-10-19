import 'server-only';
export function databaseReady(){return Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY)}
export async function rest(path:string,method='GET',body?:unknown,prefer?:string):Promise<any>{
 if(!databaseReady())throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel, then redeploy.');
 const url=process.env.SUPABASE_URL!.replace(/\/$/,'');const key=process.env.SUPABASE_SERVICE_ROLE_KEY!;
 const res=await fetch(url+'/rest/v1/'+path,{method,cache:'no-store',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(25000)});
 if(!res.ok){let msg='';try{const d:any=await res.json();if(d.code==='42P01'||d.code==='PGRST205'||d.code==='PGRST202')msg='Run supabase/schema.sql in the Supabase SQL Editor first.'}catch{}throw new Error(msg||'Database request failed. Check the Supabase URL, server key, and SQL setup.');}
 const text=await res.text();return text?JSON.parse(text):null;
}
export const query=(table:string,filters:Record<string,string>)=>table+'?'+new URLSearchParams(filters).toString();
export async function rows(table:string,filters:Record<string,string>={}){return await rest(query(table,filters)) as any[]}
export async function first(table:string,filters:Record<string,string>){return (await rows(table,{...filters,limit:'1'}))[0]||null}
export async function insert(table:string,body:unknown,prefer='return=minimal'){return rest(table,'POST',body,prefer)}
export async function patch(table:string,filters:Record<string,string>,body:unknown){return rest(query(table,filters),'PATCH',body,'return=minimal')}
export async function remove(table:string,filters:Record<string,string>){return rest(query(table,filters),'DELETE',undefined,'return=minimal')}
