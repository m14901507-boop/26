import current from './router10';
import type { Env } from './index';

type Row=unknown[];
type GmailHeader={name?:string;value?:string};
type GmailMessage={id?:string;snippet?:string;internalDate?:string;payload?:{headers?:GmailHeader[]}};

function cors(env:Env){return{
  'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'https://m14901507-boop.github.io',
  'Access-Control-Allow-Headers':'Content-Type,Authorization',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Access-Control-Allow-Credentials':'true','Vary':'Origin'
};}
function json(data:unknown,env:Env,status=200){return Response.json(data,{status,headers:cors(env)});}
function clean(v:unknown){return String(v??'').trim().toLowerCase().replace(/[\s_\-]+/g,'');}
function hidx(headers:Row,patterns:RegExp[]){for(let i=0;i<headers.length;i++){const x=clean(headers[i]);if(patterns.some(p=>p.test(x)))return i;}return-1;}
function hv(m:GmailMessage,name:string){return(m.payload?.headers||[]).find(x=>(x.name||'').toLowerCase()===name.toLowerCase())?.value||'';}
async function authorized(request:Request,env:Env){const u=new URL(request.url);u.pathname='/auth/status';const r=await current.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env);const d:any=await r.json().catch(()=>({}));return Boolean(d?.authenticated);}
async function token(env:Env){const body=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID.trim(),client_secret:env.GOOGLE_CLIENT_SECRET.trim(),refresh_token:env.GOOGLE_REFRESH_TOKEN.trim(),grant_type:'refresh_token'});const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});const d:any=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||`OAuth ${r.status}`);return String(d.access_token);}
async function gj(url:string,t:string,init:RequestInit={}){const r=await fetch(url,{...init,headers:{Authorization:`Bearer ${t}`,Accept:'application/json',...(init.headers||{})}});const d:any=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||`Google API ${r.status}`);return d;}
async function readOps(env:Env,t:string){const rg=encodeURIComponent("'العمليات'!A:P");const d:any=await gj(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values/${rg}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,t);const v:Row[]=d.values||[];return{headers:v[0]||[],rows:v.slice(1)};}
async function ensureBalanceHeader(env:Env,t:string,headers:Row){const existing=hidx(headers,[/الرصيدالمتبقي/,/الرصيدبعدالعملية/,/remainingbalance/,/balanceafter/]);if(existing>=0)return existing;const range=`'العمليات'!P1`;await gj(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,t,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({range,majorDimension:'ROWS',values:[['الرصيد المتبقي']]})});headers[15]='الرصيد المتبقي';return 15;}
async function gmailMessage(t:string,id:string){return gj(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,t) as Promise<GmailMessage>;}
function extractBalance(text:string){for(const p of[
  /available\s*(?:balance|bal(?:ance)?)\s*(?:is|:|-)?\s*(?:OMR|RO|O\.?R\.?)?\s*([0-9][0-9,]*(?:\.[0-9]{1,3})?)/i,
  /(?:remaining|current)\s*balance\s*(?:is|:|-)?\s*(?:OMR|RO|O\.?R\.?)?\s*([0-9][0-9,]*(?:\.[0-9]{1,3})?)/i,
  /(?:balance|bal(?:ance)?)\s*(?:is|:|-)\s*(?:OMR|RO|O\.?R\.?)?\s*([0-9][0-9,]*(?:\.[0-9]{1,3})?)/i
]){const m=text.match(p);if(m?.[1])return Number(m[1].replace(/,/g,''));}return null;}
function parseDate(v:unknown){const d=new Date(String(v??''));const t=d.getTime();return Number.isFinite(t)?t:0;}
function parseAccount(value:unknown){const s=String(value??'').trim();let bank='';if(/الأهلي|الاهلي|ahli/i.test(s))bank='بنك الأهلي';else if(/ميثاق|meethaq/i.test(s))bank='ميثاق';else if(/ظفار|dhofar/i.test(s))bank='بنك ظفار';else if(/صحار|sohar/i.test(s))bank='بنك صحار';else if(/نزوى|nizwa/i.test(s))bank='بنك نزوى';else if(/مسقط|bank\s*muscat/i.test(s))bank='بنك مسقط';else if(/عمان\s*العربي|\boab\b/i.test(s))bank='بنك عمان العربي';else if(/الوطني\s*العماني|\bnbo\b/i.test(s))bank='البنك الوطني العماني';else if(/العز|alizz/i.test(s))bank='بنك العز الإسلامي';
  const nums=s.match(/(\d{1,4})\s*$/);let account=nums?.[1]||'';
  if(bank==='بنك الأهلي'){if(['1','01','001'].includes(account))account='001';else if(['2','02','002'].includes(account))account='002';}
  if(bank==='ميثاق'&&['21','021','0021'].includes(account))account='0021';
  return{bank,account};
}
async function backfillMissingBalances(env:Env,t:string,ops:{headers:Row;rows:Row[]},balanceIx:number,limit=4){const idIx=hidx(ops.headers,[/معرف.*الرسالة/,/message.*id/,/^id$/]);if(idIx<0)return{checked:0,updated:0};const candidates=ops.rows.map((r,i)=>({r,row:i+2,id:String(r[idIx]??'').trim(),bal:r[balanceIx]})).filter(x=>x.id&&(x.bal===''||x.bal==null)).slice(-40).reverse().slice(0,limit);const updates:Array<{range:string;values:unknown[][]}>=[];let checked=0;for(const c of candidates){checked++;try{const m=await gmailMessage(t,c.id);const text=`${hv(m,'From')}\n${hv(m,'Subject')}\n${(m.snippet||'').replace(/\s+/g,' ')}`;const bal=extractBalance(text);if(bal==null)continue;updates.push({range:`'العمليات'!P${c.row}`,values:[[bal]]});c.r[balanceIx]=bal;}catch{}}
  if(updates.length)await gj(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values:batchUpdate`,t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valueInputOption:'USER_ENTERED',data:updates})});
  return{checked,updated:updates.length};
}
async function latestBalancesFromSheet(env:Env){const t=await token(env);const ops=await readOps(env,t);const balanceIx=await ensureBalanceHeader(env,t,ops.headers);const backfill=await backfillMissingBalances(env,t,ops,balanceIx,4);const dateIx=hidx(ops.headers,[/التاريخوالوقت/,/^التاريخ$/, /date/]);const accountIx=hidx(ops.headers,[/^البنك$/, /الحساب/,/bank/,/account/]);const idIx=hidx(ops.headers,[/معرف.*الرسالة/,/message.*id/,/^id$/]);const map=new Map<string,{bankName:string;accountNumber:string;balance:number;date:string;messageId:string;ts:number}>();
  for(const r of ops.rows){const bal=Number(r[balanceIx]);if(!Number.isFinite(bal))continue;const ai=parseAccount(r[accountIx>=0?accountIx:8]);if(!ai.bank||!ai.account)continue;const raw=String(r[dateIx>=0?dateIx:1]??'');const ts=parseDate(raw);const key=`${ai.bank}|${ai.account}`;const old=map.get(key);if(!old||ts>=old.ts)map.set(key,{bankName:ai.bank,accountNumber:ai.account,balance:bal,date:raw,messageId:String(r[idIx>=0?idIx:0]??''),ts});}
  return{ok:true,source:'Google Sheets',balances:[...map.values()].map(({ts,...x})=>x),count:map.size,backfill};
}

export default{async fetch(request:Request,env:Env):Promise<Response>{const u=new URL(request.url);if(request.method==='OPTIONS')return current.fetch(request,env);try{
  if(u.pathname==='/api/gmail/latest-balances'&&request.method==='GET'){
    if(!(await authorized(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
    return json(await latestBalancesFromSheet(env),env);
  }
  return current.fetch(request,env);
}catch(e:any){return json({ok:false,error:e?.message||String(e)},env,500);}}};
