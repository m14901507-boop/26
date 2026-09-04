import current from './router18';
import type { Env } from './index';

type Row=unknown[];
const BUDGETS=new Set(['عائلي شهري','عائلي سنوي','شخصي شهري','شخصي سنوي','تأمين المصروف','تأمين الدخل','الادخار والاستثمار']);
function cors(env:Env){return{'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'https://m14901507-boop.github.io','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Credentials':'true','Vary':'Origin'};}
function json(x:unknown,env:Env,s=200){return Response.json(x,{status:s,headers:cors(env)});}
function txt(v:unknown){return String(v??'').trim();}
function norm(v:unknown){return txt(v).toLowerCase().replace(/\s+/g,' ');}
async function auth(req:Request,env:Env){const u=new URL(req.url);u.pathname='/auth/status';const r=await current.fetch(new Request(u.toString(),{headers:req.headers}),env);const d:any=await r.json().catch(()=>({}));return !!d?.authenticated;}
async function token(env:Env){const b=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID.trim(),client_secret:env.GOOGLE_CLIENT_SECRET.trim(),refresh_token:env.GOOGLE_REFRESH_TOKEN.trim(),grant_type:'refresh_token'});const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:b});const d:any=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||`OAuth ${r.status}`);return String(d.access_token);}
async function gj(url:string,t:string,init:RequestInit={}){const r=await fetch(url,{...init,headers:{Authorization:`Bearer ${t}`,Accept:'application/json',...(init.headers||{})}});const d:any=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||`Google API ${r.status}`);return d;}
async function read(env:Env,t:string,name:string,range:string){const rg=encodeURIComponent(`'${name}'!${range}`);const d:any=await gj(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values/${rg}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,t);const v:Row[]=d.values||[];return{headers:v[0]||[],rows:v.slice(1)};}
async function batch(env:Env,t:string,data:Array<{range:string;values:unknown[][]}>){if(!data.length)return;await gj(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values:batchUpdate`,t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valueInputOption:'USER_ENTERED',data})});}
function isInternalText(s:string){return /تحويل\s*داخلي|تحويلات\s*داخلية|internal\s*transfer/i.test(s);}
function isExpenseText(s:string){return /مصروف|expense|purchase|شراء|سحب\s*نقدي|debit/i.test(s)&&!isInternalText(s);}
function guideExpense(g?:Row){if(!g)return false;return isExpenseText([g[1],g[2],g[3],g[4]].map(txt).join(' '));}
function guideInternal(g?:Row){if(!g)return false;return isInternalText([g[1],g[2],g[3],g[4]].map(txt).join(' '));}
async function backfill(env:Env){const t=await token(env),guide=await read(env,t,'دليل البنود','A:L'),ops=await read(env,t,'العمليات','A:T');const byItem=new Map<string,Row>();for(const g of guide.rows){const k=norm(g[0]);if(k)byItem.set(k,g);}const writes:Array<{range:string;values:unknown[][]}>=[];let matched=0,updated=0,sourceFilled=0;
 ops.rows.forEach((r,i)=>{const g=byItem.get(norm(r[2]));if(!g)return;matched++;const budget=BUDGETS.has(txt(g[1]))?txt(g[1]):'',category=txt(g[9]),period=txt(g[10]),scope=txt(g[11]),movement=txt(g[3]),system=txt(g[2]);const row=[...r];while(row.length<20)row.push('');let changed=false;
   const set=(idx:number,v:string)=>{if(txt(row[idx])!==v){row[idx]=v;changed=true;}};
   set(3,budget); // D نوع الموازنة/التصنيف
   if(movement)set(6,movement); // G نوع الحركة
   if(system)set(9,system); // J النظام
   set(12,category);set(13,period);set(14,scope); // M:N:O
   if(txt(row[16])!==budget){row[16]=budget;changed=true;if(budget)sourceFilled++;} // Q مصدر الموازنة
   if(changed){writes.push({range:`'العمليات'!A${i+2}:T${i+2}`,values:[row.slice(0,20)]});updated++;}
 });
 await batch(env,t,writes);return{matched,updated,sourceFilled};}
async function expenses(env:Env){const t=await token(env),guide=await read(env,t,'دليل البنود','A:L'),ops=await read(env,t,'العمليات','A:T');const byItem=new Map<string,Row>();for(const g of guide.rows){const k=norm(g[0]);if(k)byItem.set(k,g);}const rows=ops.rows.filter(r=>{const g=byItem.get(norm(r[2]));const text=[r[3],r[6],r[7],r[9]].map(txt).join(' ');if(isInternalText(text)||guideInternal(g))return false;return isExpenseText(text)||guideExpense(g);});return{ok:true,sheet:'العمليات',source:'Google Sheets A:T',headers:ops.headers,rows,sheetRowCount:ops.rows.length,rowCount:rows.length,liveCount:0};}
export default{async fetch(request:Request,env:Env):Promise<Response>{const u=new URL(request.url);if(request.method==='OPTIONS')return current.fetch(request,env);try{
 if(u.pathname==='/api/operations'&&request.method==='GET'){if(!(await auth(request,env)))return json({ok:false,error:'Unauthorized'},env,401);return json(await expenses(env),env);}
 if(u.pathname==='/api/sync/operations'&&request.method==='POST'){if(!(await auth(request,env)))return json({ok:false,error:'Unauthorized'},env,401);const baseResp=await current.fetch(request.clone(),env);const base:any=await baseResp.json().catch(()=>({}));if(!baseResp.ok)return json(base,env,baseResp.status);const fill=await backfill(env);return json({...base,backfillMatched:fill.matched,backfillUpdated:fill.updated,sourceBudgetFilled:fill.sourceFilled},env);}
 if(u.pathname==='/api/operations/backfill'&&request.method==='POST'){if(!(await auth(request,env)))return json({ok:false,error:'Unauthorized'},env,401);return json({ok:true,...await backfill(env)},env);}
 return current.fetch(request,env);
}catch(e:any){return json({ok:false,error:e?.message||String(e)},env,500);}}};