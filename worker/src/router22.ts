import current from './router21';
import type { Env } from './index';

type Row=unknown[];
type H={name?:string;value?:string};
type Msg={id?:string;labelIds?:string[];snippet?:string;internalDate?:string;payload?:{headers?:H[]}};

function cors(env:Env){return{'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'https://m14901507-boop.github.io','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Credentials':'true','Vary':'Origin'};}
function json(x:unknown,env:Env,s=200){return Response.json(x,{status:s,headers:cors(env)});}
function txt(v:unknown){return String(v??'').trim();}
function hv(m:Msg,n:string){return(m.payload?.headers||[]).find(x=>(x.name||'').toLowerCase()===n.toLowerCase())?.value||'';}
async function auth(req:Request,env:Env){const u=new URL(req.url);u.pathname='/auth/status';const r=await current.fetch(new Request(u.toString(),{headers:req.headers}),env);const d:any=await r.json().catch(()=>({}));return !!d?.authenticated;}
async function token(env:Env){const b=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID.trim(),client_secret:env.GOOGLE_CLIENT_SECRET.trim(),refresh_token:env.GOOGLE_REFRESH_TOKEN.trim(),grant_type:'refresh_token'});const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:b});const d:any=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||`OAuth ${r.status}`);return String(d.access_token);}
async function gj(url:string,t:string,init:RequestInit={}){const r=await fetch(url,{...init,headers:{Authorization:`Bearer ${t}`,Accept:'application/json',...(init.headers||{})}});const d:any=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||`Google API ${r.status}`);return d;}
async function read(env:Env,t:string,name:string,range:string){const rg=encodeURIComponent(`'${name}'!${range}`);const d:any=await gj(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values/${rg}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,t);const v:Row[]=d.values||[];return{headers:v[0]||[],rows:v.slice(1)};}
async function writeExactOps(env:Env,t:string,headers:Row,rows:Row[]){const base=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values`;
  const clearRange=encodeURIComponent("'العمليات'!A2:T");
  await gj(`${base}/${clearRange}:clear`,t,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  if(!rows.length)return;
  const range=encodeURIComponent(`'العمليات'!A2:T${rows.length+1}`);
  await gj(`${base}/${range}?valueInputOption=USER_ENTERED`,t,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:rows.map(r=>{const x=[...r];while(x.length<20)x.push('');return x.slice(0,20);})})});
}
function activeGuide(g:Row){const name=txt(g[0]),label=txt(g[6]),active=txt(g[5]).toLowerCase(),all=[g[1],g[2],g[3],g[4]].map(txt).join(' ');if(!name||!label)return false;if(/^(لا|no|false|0|غير نشط)$/.test(active))return false;if(/غير\s*مالي|أمان|الامان|تسجيل\s*الدخول/i.test(all))return false;return true;}
function bank(text:string){const s=text.toLowerCase();if(/ahli|الأهلي|الاهلي/.test(s))return'بنك الأهلي';if(/meethaq|ميثاق/.test(s))return'ميثاق';if(/dhofar|ظفار/.test(s))return'بنك ظفار';if(/sohar|صحار/.test(s))return'بنك صحار';return'';}
function account(text:string,b:string){if(/0108\s*[#*xX]{4,}\s*001\b/i.test(text))return'001';if(/0108\s*[#*xX]{4,}\s*002\b/i.test(text))return'002';const m=text.match(/[#*xX]{2,}(\d{1,4})\b/);let n=m?.[1]||'';if(b==='ميثاق'&&['21','021','0021'].includes(n))n='0021';if(b==='ميثاق'&&['22','022','0022'].includes(n))n='0022';return n;}
function accountKey(b:string,a:string){if(b==='بنك الأهلي'&&a==='001')return'AHLI_001';if(b==='بنك الأهلي'&&a==='002')return'AHLI_002';if(b==='ميثاق'&&a==='0021')return'MEETHAQ_21';if(b==='ميثاق'&&a==='0022')return'MEETHAQ_22';if(b==='بنك صحار'&&a==='7010')return'SOHAR_7010';if(b==='بنك صحار'&&a==='7240')return'SOHAR_7240';if(b==='بنك ظفار'&&a)return`DHOFAR_${a}`;return'';}
function amount(text:string){for(const p of[/(?:OMR|RO|O\.?R\.?)\s*([0-9][0-9,]*(?:\.[0-9]{1,3})?)/i,/([0-9][0-9,]*(?:\.[0-9]{1,3})?)\s*(?:OMR|RO|O\.?R\.?)/i]){const m=text.match(p);if(m?.[1]){const n=Number(m[1].replace(/,/g,''));if(Number.isFinite(n))return n;}}return null;}
function balance(text:string){for(const p of[/New\s+Available\s+Balance\s*(?:is|:)?\s*OMR\s*([0-9,]+(?:\.[0-9]{1,3})?)/i,/available\s+balance\s*(?:is|:)?\s*OMR\s*([0-9,]+(?:\.[0-9]{1,3})?)/i,/Avl\s+Bal(?:ance)?\s*(?:is|:)?\s*OMR\s*([0-9,]+(?:\.[0-9]{1,3})?)/i]){const m=text.match(p);if(m?.[1]){const n=Number(m[1].replace(/,/g,''));if(Number.isFinite(n))return n;}}return null;}
function opType(text:string){if(/credited/i.test(text))return'دخل';if(/POS Purchase|purchase|debited|withdrawal|ATM/i.test(text))return'مصروف';return'';}
async function getMsg(t:string,id:string){return gj(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,t) as Promise<Msg>;}
async function listIdsForLabel(t:string,labelId:string){const out:string[]=[];let page='';do{const q=new URLSearchParams({labelIds:labelId,maxResults:'500'});if(page)q.set('pageToken',page);const d:any=await gj(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${q.toString()}`,t);for(const x of d.messages||[])if(x.id)out.push(txt(x.id));page=txt(d.nextPageToken);}while(page&&out.length<2000);return out;}
function applyGuide(existing:Row,g:Row){const r=[...existing];while(r.length<20)r.push('');r[2]=txt(g[0]);r[3]=txt(g[1]);if(txt(g[3]))r[6]=txt(g[3]);r[9]=txt(g[2]);r[10]='متزامن';r[12]=txt(g[9]);r[13]=txt(g[10]);r[14]=txt(g[11]);r[16]=txt(g[1]);return r;}
function buildNew(g:Row,m:Msg){const from=hv(m,'From'),subject=hv(m,'Subject'),snippet=txt(m.snippet),text=`${from}\n${subject}\n${snippet}`,b=bank(text),a=account(text,b),amt=amount(text),bal=balance(text),raw=hv(m,'Date')||(m.internalDate?new Date(Number(m.internalDate)).toISOString():new Date().toISOString()),d=new Date(raw),date=Number.isFinite(d.getTime())?d.toISOString():raw,move=txt(g[3])||opType(text),key=accountKey(b,a);return[m.id||'',date,txt(g[0]),txt(g[1]),amt??'',subject||snippet.slice(0,240),move,opType(text),[b,a].filter(Boolean).join(' '),txt(g[2]),'متزامن',new Date().toISOString(),txt(g[9]),txt(g[10]),txt(g[11]),key,txt(g[1]),bal??'',/دخل|وارد/i.test(move)?'credit':'debit',bal!=null?date:''];}
async function mirror(env:Env){const t=await token(env),guide=await read(env,t,'دليل البنود','A:L'),ops=await read(env,t,'العمليات','A:T');const valid=guide.rows.filter(activeGuide),existing=new Map<string,Row>();for(const r of ops.rows){const id=txt(r[0]);if(id)existing.set(id,r);}
  const ownership=new Map<string,Row[]>();
  for(const g of valid){const ids=await listIdsForLabel(t,txt(g[6]));for(const id of ids){const a=ownership.get(id)||[];a.push(g);ownership.set(id,a);}}
  const desired=[...ownership.entries()].filter(([,gs])=>gs.length===1);
  const rows:Row[]=[];let added=0,updated=0,kept=0,ambiguous=[...ownership.values()].filter(gs=>gs.length>1).length;
  for(const [id,gs] of desired){const g=gs[0],old=existing.get(id);if(old){const next=applyGuide(old,g);if(JSON.stringify(next)!==JSON.stringify(old.slice(0,20)))updated++;else kept++;rows.push(next);}else{rows.push(buildNew(g,await getMsg(t,id)));added++;}}
  rows.sort((a,b)=>{const da=new Date(String(a[1]||0)).getTime()||0,db=new Date(String(b[1]||0)).getTime()||0;return da-db;});
  const removed=Math.max(0,existing.size-desired.filter(([id])=>existing.has(id)).length);
  await writeExactOps(env,t,ops.headers,rows);
  const profile:any=await gj('https://gmail.googleapis.com/gmail/v1/users/me/profile',t);
  return{ok:true,mode:'exact-mirror',historyId:txt(profile.historyId),classified:desired.length,rows:rows.length,added,updated,kept,removed,ambiguous};
}

export default{async fetch(request:Request,env:Env):Promise<Response>{const u=new URL(request.url);if(request.method==='OPTIONS')return current.fetch(request,env);try{
  if((u.pathname==='/api/sync/operations'||u.pathname==='/api/sync/items'||u.pathname==='/api/sync/all')&&request.method==='POST'){
    if(!(await auth(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
    return json(await mirror(env),env);
  }
  return current.fetch(request,env);
}catch(e:any){return json({ok:false,error:e?.message||String(e)},env,500);}}};