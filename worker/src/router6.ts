import current from './router5';
import type { Env } from './index';

const DEFAULT_SHEET='موازنات الحسابات';

type BudgetEntry={budget?:string;amount?:number;accountKey?:string;accountName?:string;notes?:string};

function cors(env:Env){return{
  'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'https://m14901507-boop.github.io',
  'Access-Control-Allow-Headers':'Content-Type,Authorization',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Access-Control-Allow-Credentials':'true','Vary':'Origin'
};}
function json(data:unknown,env:Env,status=200){return Response.json(data,{status,headers:cors(env)});}
async function authorized(request:Request,env:Env){const u=new URL(request.url);u.pathname='/auth/status';const r=await current.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env);const d:any=await r.json().catch(()=>({}));return Boolean(d?.authenticated);}
async function accessToken(env:Env){const body=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID.trim(),client_secret:env.GOOGLE_CLIENT_SECRET.trim(),refresh_token:env.GOOGLE_REFRESH_TOKEN.trim(),grant_type:'refresh_token'});const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});const d:any=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||`OAuth ${r.status}`);return String(d.access_token);}
async function gjson(url:string,token:string,opt:RequestInit={}){const r=await fetch(url,{...opt,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json',...(opt.headers||{})}});const d:any=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||`Google API ${r.status}`);return d;}
function rg(sheet:string,part:string){return encodeURIComponent(`'${sheet}'!${part}`);}
async function readRows(env:Env,token:string){const sheet=env.BUDGET_SHEET_NAME||DEFAULT_SHEET;const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values/${rg(sheet,'A:H')}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;const d:any=await gjson(url,token);const v=d.values||[];return{sheet,headers:v[0]||[],rows:v.slice(1)};}
function monthKey(v:any){if(typeof v==='number'&&v>20000){const d=new Date(Date.UTC(1899,11,30)+v*86400000);return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;}const s=String(v??'').trim();const m=s.match(/(20\d{2})[-\/]([01]?\d)/);return m?`${m[1]}-${String(Number(m[2])).padStart(2,'0')}`:'';}
function validMonth(v:any){const s=String(v||'');return /^20\d{2}-(0[1-9]|1[0-2])$/.test(s)?s:'';}
function previousMonth(m:string){const[y,mo]=m.split('-').map(Number),d=new Date(y,mo-2,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
async function updateRow(env:Env,token:string,sheet:string,row:number,values:any[]){const range=`'${sheet}'!A${row}:H${row}`;const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;return gjson(url,token,{method:'PUT',body:JSON.stringify({range,majorDimension:'ROWS',values:[values]})});}
async function appendRows(env:Env,token:string,sheet:string,rows:any[][]){if(!rows.length)return;const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values/${rg(sheet,'A:H')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;return gjson(url,token,{method:'POST',body:JSON.stringify({majorDimension:'ROWS',values:rows})});}

function resolveAccount(rows:any[][],budget:string,requestedKey='',requestedName=''){
  if(requestedKey)return{key:requestedKey,name:requestedName};
  const matches=rows.filter(r=>String(r[2]||'').trim()===budget&&String(r[1]||'').trim());
  const uniq=new Map<string,string>();for(const r of matches)uniq.set(String(r[1]||'').trim(),String(r[3]||'').trim());
  if(uniq.size===1){const [key,name]=[...uniq.entries()][0];return{key,name};}
  if(uniq.size===0)throw new Error(`لا يوجد حساب مرجعي محفوظ للموازنة: ${budget}`);
  throw new Error(`الموازنة ${budget} مرتبطة بأكثر من حساب؛ اختر الحساب أولًا`);
}

async function saveBudgets(env:Env,p:any){const month=validMonth(p?.month);if(!month)throw new Error('الشهر غير صالح');const entries=(Array.isArray(p?.budgets)?p.budgets:[]) as BudgetEntry[];if(!entries.length)throw new Error('لا توجد موازنات للحفظ');const token=await accessToken(env);const {sheet,rows}=await readRows(env,token);const now=new Date().toISOString();let updated=0,inserted=0;const appends:any[][]=[];
  for(const e of entries){const budget=String(e.budget||'').trim();if(!budget)continue;const amount=Number(e.amount);if(!Number.isFinite(amount)||amount<0)throw new Error(`قيمة الموازنة غير صحيحة: ${budget}`);const account=resolveAccount(rows,budget,String(e.accountKey||''),String(e.accountName||''));const idx=rows.findIndex(r=>monthKey(r[0])===month&&String(r[1]||'').trim()===account.key&&String(r[2]||'').trim()===budget);const values=[`${month}-01`,account.key,budget,account.name,amount,'TRUE',String(e.notes||''),now];if(idx>=0){await updateRow(env,token,sheet,idx+2,values);rows[idx]=values;updated++;}else{appends.push(values);rows.push(values);inserted++;}}
  await appendRows(env,token,sheet,appends);return{ok:true,month,updated,inserted,total:updated+inserted};
}

async function copyPrevious(env:Env,p:any){const month=validMonth(p?.month);if(!month)throw new Error('الشهر غير صالح');const prev=previousMonth(month);const token=await accessToken(env);const {sheet,rows}=await readRows(env,token);const source=rows.filter(r=>monthKey(r[0])===prev&&String(r[2]||'').trim());if(!source.length)throw new Error(`لا توجد موازنات محفوظة للشهر السابق ${prev}`);const now=new Date().toISOString();let updated=0,inserted=0;const appends:any[][]=[];
  for(const r of source){const key=String(r[1]||'').trim(),budget=String(r[2]||'').trim(),name=String(r[3]||'').trim(),amount=Number(r[4])||0,active=String(r[5]??'TRUE')||'TRUE',notes=String(r[6]||'');const values=[`${month}-01`,key,budget,name,amount,active,notes,now];const idx=rows.findIndex(x=>monthKey(x[0])===month&&String(x[1]||'').trim()===key&&String(x[2]||'').trim()===budget);if(idx>=0){await updateRow(env,token,sheet,idx+2,values);rows[idx]=values;updated++;}else{appends.push(values);rows.push(values);inserted++;}}
  await appendRows(env,token,sheet,appends);return{ok:true,from:prev,to:month,updated,inserted,total:updated+inserted};
}

export default{async fetch(request:Request,env:Env):Promise<Response>{const url=new URL(request.url);if(request.method==='OPTIONS')return current.fetch(request,env);try{
  if((url.pathname==='/api/budgets/save'||url.pathname==='/api/budgets/copy-previous')&&request.method==='POST'){
    if(!(await authorized(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
    const p=await request.json().catch(()=>({}));
    return json(url.pathname.endsWith('copy-previous')?await copyPrevious(env,p):await saveBudgets(env,p),env);
  }
  return current.fetch(request,env);
}catch(e:any){return json({ok:false,error:e?.message||String(e)},env,500);}}};
