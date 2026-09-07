import current from './router23';
import type { Env } from './index';

type Row=unknown[];
function cors(env:Env){return{'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'https://m14901507-boop.github.io','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Credentials':'true','Vary':'Origin'};}
function json(x:unknown,env:Env,s=200){return Response.json(x,{status:s,headers:cors(env)});}
function txt(v:unknown){return String(v??'').trim();}
async function auth(req:Request,env:Env){const u=new URL(req.url);u.pathname='/auth/status';const r=await current.fetch(new Request(u.toString(),{method:'GET',headers:req.headers}),env);const d:any=await r.json().catch(()=>({}));return !!d?.authenticated;}
async function token(env:Env){const b=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID.trim(),client_secret:env.GOOGLE_CLIENT_SECRET.trim(),refresh_token:env.GOOGLE_REFRESH_TOKEN.trim(),grant_type:'refresh_token'});const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:b});const d:any=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||`OAuth ${r.status}`);return String(d.access_token);}
async function readOps(env:Env){const t=await token(env);const rg=encodeURIComponent("'العمليات'!A:T");const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values/${rg}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,{headers:{Authorization:`Bearer ${t}`,Accept:'application/json'}});const d:any=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||`Google API ${r.status}`);const values:Row[]=d.values||[];return{headers:values[0]||[],rows:values.slice(1)};}
function isVisibleOperation(r:Row){
  // The dashboard must mirror every nonblank row from the Operations sheet.
  // Classification, item and movement may be completed later; they must not hide the row.
  return r.some(value=>txt(value)!=='');
}
export default{async fetch(request:Request,env:Env):Promise<Response>{const u=new URL(request.url);if(request.method==='OPTIONS')return current.fetch(request,env);try{
 if(u.pathname==='/api/operations'&&request.method==='GET'){
   if(!(await auth(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
   const ops=await readOps(env);const rows=ops.rows.filter(isVisibleOperation);
   return json({ok:true,sheet:'العمليات',source:'Google Sheets A:T direct',headers:ops.headers,rows,sheetRowCount:ops.rows.length,rowCount:rows.length,liveCount:0},env);
 }
 return current.fetch(request,env);
}catch(e:any){return json({ok:false,error:e?.message||String(e)},env,500);}}};
