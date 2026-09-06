import current from './router23';
import type { Env } from './index';

type Row=unknown[];
function cors(env:Env){return{'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'https://m14901507-boop.github.io','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Credentials':'true','Vary':'Origin'};}
function json(x:unknown,env:Env,s=200){return Response.json(x,{status:s,headers:cors(env)});}
function txt(v:unknown){return String(v??'').trim();}
async function auth(req:Request,env:Env){const u=new URL(req.url);u.pathname='/auth/status';const r=await current.fetch(new Request(u.toString(),{headers:req.headers}),env);const d:any=await r.json().catch(()=>({}));return !!d?.authenticated;}
async function token(env:Env){const b=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID.trim(),client_secret:env.GOOGLE_CLIENT_SECRET.trim(),refresh_token:env.GOOGLE_REFRESH_TOKEN.trim(),grant_type:'refresh_token'});const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:b});const d:any=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||`OAuth ${r.status}`);return String(d.access_token);}
async function gj(url:string,t:string,init:RequestInit={}){const r=await fetch(url,{...init,headers:{Authorization:`Bearer ${t}`,Accept:'application/json',...(init.headers||{})}});const d:any=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||`Google API ${r.status}`);return d;}
async function readOps(env:Env,t:string){const rg=encodeURIComponent("'العمليات'!A:T");const d:any=await gj(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values/${rg}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,t);const v:Row[]=d.values||[];return{headers:v[0]||[],rows:v.slice(1)};}
async function batch(env:Env,t:string,data:Array<{range:string;values:unknown[][]}>){if(!data.length)return;await gj(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values:batchUpdate`,t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valueInputOption:'USER_ENTERED',data})});}
const pad=(n:number)=>String(n).padStart(2,'0');
function validParts(y:number,m:number,d:number,h=0,mi=0,s=0){const x=new Date(y,m-1,d,h,mi,s);return x.getFullYear()===y&&x.getMonth()===m-1&&x.getDate()===d&&x.getHours()===h&&x.getMinutes()===mi&&x.getSeconds()===s;}
function canonicalFromParts(y:number,m:number,d:number,h=0,mi=0,s=0){if(!validParts(y,m,d,h,mi,s))return'';return`${pad(d)}/${pad(m)}/${y} ${pad(h)}:${pad(mi)}:${pad(s)}`;}
function serialCanonical(n:number){if(!Number.isFinite(n)||n<20000)return'';const ms=Math.round(n*86400000);const dt=new Date(Date.UTC(1899,11,30)+ms);return canonicalFromParts(dt.getUTCFullYear(),dt.getUTCMonth()+1,dt.getUTCDate(),dt.getUTCHours(),dt.getUTCMinutes(),dt.getUTCSeconds());}
function canonicalDate(v:unknown){
  if(typeof v==='number')return serialCanonical(v);
  const s=txt(v).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
  if(!s)return'';
  let m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(m)return canonicalFromParts(+m[3],+m[2],+m[1],+(m[4]||0),+(m[5]||0),+(m[6]||0));
  m=s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if(m)return canonicalFromParts(+m[6],+m[5],+m[4],+m[1],+m[2],+(m[3]||0));
  m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/);
  if(m){
    const iso=new Date(s);
    if(Number.isFinite(iso.getTime())){
      // Gmail dates are absolute instants. Convert to Oman local time (UTC+4) for the sheet's canonical display.
      const oman=new Date(iso.getTime()+4*3600000);
      return canonicalFromParts(oman.getUTCFullYear(),oman.getUTCMonth()+1,oman.getUTCDate(),oman.getUTCHours(),oman.getUTCMinutes(),oman.getUTCSeconds());
    }
  }
  const d=new Date(s);
  if(Number.isFinite(d.getTime())){const oman=new Date(d.getTime()+4*3600000);return canonicalFromParts(oman.getUTCFullYear(),oman.getUTCMonth()+1,oman.getUTCDate(),oman.getUTCHours(),oman.getUTCMinutes(),oman.getUTCSeconds());}
  return'';
}
async function normalizeDates(env:Env){const t=await token(env),ops=await readOps(env,t),writes:Array<{range:string;values:unknown[][]}>=[];let normalizedB=0,normalizedT=0,invalidB=0,invalidT=0;const samples:any[]=[];
  ops.rows.forEach((r,i)=>{const row=i+2,rawB=r[1],rawT=r[19],b=canonicalDate(rawB),tt=canonicalDate(rawT);
    if(txt(rawB)){if(b){if(txt(rawB)!==b){writes.push({range:`'العمليات'!B${row}`,values:[[b]]});normalizedB++;if(samples.length<8)samples.push({row,column:'B',before:rawB,after:b});}}else invalidB++;}
    if(txt(rawT)){if(tt){if(txt(rawT)!==tt){writes.push({range:`'العمليات'!T${row}`,values:[[tt]]});normalizedT++;}}else invalidT++;}
  });
  await batch(env,t,writes);return{ok:true,rows:ops.rows.length,normalizedOperationDates:normalizedB,normalizedBalanceDates:normalizedT,invalidOperationDates:invalidB,invalidBalanceDates:invalidT,format:'dd/MM/yyyy HH:mm:ss',samples};}

export default{async fetch(request:Request,env:Env):Promise<Response>{const u=new URL(request.url);if(request.method==='OPTIONS')return current.fetch(request,env);try{
  if(u.pathname==='/api/operations/normalize-dates'&&request.method==='POST'){
    if(!(await auth(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
    return json(await normalizeDates(env),env);
  }
  if(u.pathname==='/api/sync/operations'&&request.method==='POST'){
    const r=await current.fetch(request,env);if(!r.ok)return r;const d:any=await r.json().catch(()=>({}));if(!(await auth(request,env)))return json(d,env,r.status);const n=await normalizeDates(env);return json({...d,dateNormalization:n},env);
  }
  if(u.pathname==='/api/sync/all'&&request.method==='POST'){
    const r=await current.fetch(request,env);if(!r.ok)return r;const d:any=await r.json().catch(()=>({}));if(!(await auth(request,env)))return json(d,env,r.status);const n=await normalizeDates(env);return json({...d,dateNormalization:n},env);
  }
  return current.fetch(request,env);
}catch(e:any){return json({ok:false,error:e?.message||String(e)},env,500);}}};
