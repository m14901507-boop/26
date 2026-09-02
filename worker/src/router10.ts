import current from './router9';
import type { Env } from './index';

type Row=unknown[];

function cors(env:Env){return{
  'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'https://m14901507-boop.github.io',
  'Access-Control-Allow-Headers':'Content-Type,Authorization',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Access-Control-Allow-Credentials':'true','Vary':'Origin'
};}
function json(data:unknown,env:Env,status=200){return Response.json(data,{status,headers:cors(env)});}
function clean(v:unknown){return String(v??'').trim().toLowerCase().replace(/[\s_\-]+/g,'');}
function hidx(headers:Row,patterns:RegExp[]){for(let i=0;i<headers.length;i++){const x=clean(headers[i]);if(patterns.some(p=>p.test(x)))return i;}return-1;}
async function authorized(request:Request,env:Env){const u=new URL(request.url);u.pathname='/auth/status';const r=await current.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env);const d:any=await r.json().catch(()=>({}));return Boolean(d?.authenticated);}
async function token(env:Env){const body=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID.trim(),client_secret:env.GOOGLE_CLIENT_SECRET.trim(),refresh_token:env.GOOGLE_REFRESH_TOKEN.trim(),grant_type:'refresh_token'});const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});const d:any=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||`OAuth ${r.status}`);return String(d.access_token);}
async function gj(url:string,t:string){const r=await fetch(url,{headers:{Authorization:`Bearer ${t}`,Accept:'application/json'}});const d:any=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||`Google API ${r.status}`);return d;}
async function readOperations(env:Env){const t=await token(env);const rg=encodeURIComponent("'العمليات'!A:O");const d:any=await gj(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values/${rg}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,t);const v:Row[]=d.values||[];return{headers:v[0]||[],rows:v.slice(1)};}

function movementValue(headers:Row,row:Row){
  const indexes=[
    hidx(headers,[/نوعالعملية/,/^الحركة$/, /movement/, /^type$/]),
    hidx(headers,[/قناةالعملية/,/القناة/,/channel/]),
    hidx(headers,[/^التصنيف$/])
  ].filter(i=>i>=0);
  return indexes.map(i=>String(row[i]??'')).join(' ').trim();
}
function isExpense(headers:Row,row:Row){return /مصروف|expense|purchase|شراء|سحب\s*نقدي/i.test(movementValue(headers,row));}
function isInternal(headers:Row,row:Row){return /تحويل\s*داخلي|تحويلات\s*داخلية|internal\s*transfer/i.test(movementValue(headers,row));}

async function sheetExpenses(env:Env){const ops=await readOperations(env);const rows=ops.rows.filter(r=>isExpense(ops.headers,r)&&!isInternal(ops.headers,r));return{ok:true,sheet:'العمليات',source:'Google Sheets',headers:ops.headers,rows,sheetRowCount:ops.rows.length,rowCount:rows.length,liveCount:0};}
async function sheetInternal(env:Env){const ops=await readOperations(env);const rows=ops.rows.filter(r=>isInternal(ops.headers,r));return{ok:true,sheet:'العمليات',source:'Google Sheets',headers:ops.headers,rows,rowCount:rows.length};}

export default{async fetch(request:Request,env:Env):Promise<Response>{const u=new URL(request.url);if(request.method==='OPTIONS')return current.fetch(request,env);try{
  if(u.pathname==='/api/operations'&&request.method==='GET'){
    if(!(await authorized(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
    return json(await sheetExpenses(env),env);
  }
  if(u.pathname==='/api/accounts/internal-transfers'&&request.method==='GET'){
    if(!(await authorized(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
    return json(await sheetInternal(env),env);
  }
  return current.fetch(request,env);
}catch(e:any){return json({ok:false,error:e?.message||String(e)},env,500);}}};
