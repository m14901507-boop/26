import current from './router10';
import type { Env } from './index';

type Row=unknown[];
type GmailHeader={name?:string;value?:string};
type GmailPart={mimeType?:string;body?:{data?:string};parts?:GmailPart[]};
type GmailMessage={id?:string;snippet?:string;internalDate?:string;payload?:GmailPart&{headers?:GmailHeader[]}};

function cors(env:Env){return{
  'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'https://m14901507-boop.github.io',
  'Access-Control-Allow-Headers':'Content-Type,Authorization',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Access-Control-Allow-Credentials':'true','Vary':'Origin'
};}
function json(data:unknown,env:Env,status=200){return Response.json(data,{status,headers:cors(env)});}
function hv(m:GmailMessage,name:string){return(m.payload?.headers||[]).find(x=>(x.name||'').toLowerCase()===name.toLowerCase())?.value||'';}
async function authorized(request:Request,env:Env){const u=new URL(request.url);u.pathname='/auth/status';const r=await current.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env);const d:any=await r.json().catch(()=>({}));return Boolean(d?.authenticated);}
async function token(env:Env){const body=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID.trim(),client_secret:env.GOOGLE_CLIENT_SECRET.trim(),refresh_token:env.GOOGLE_REFRESH_TOKEN.trim(),grant_type:'refresh_token'});const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});const d:any=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||`OAuth ${r.status}`);return String(d.access_token);}
async function gj(url:string,t:string,init:RequestInit={}){const r=await fetch(url,{...init,headers:{Authorization:`Bearer ${t}`,Accept:'application/json',...(init.headers||{})}});const d:any=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||`Google API ${r.status}`);return d;}
async function readOps(env:Env,t:string){const rg=encodeURIComponent("'العمليات'!A:T");const d:any=await gj(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values/${rg}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,t);const v:Row[]=d.values||[];return{headers:v[0]||[],rows:v.slice(1)};}
async function gmailMessage(t:string,id:string){return gj(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,t) as Promise<GmailMessage>;}
function decode64url(data:string){try{let s=data.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return decodeURIComponent(Array.from(atob(s)).map(c=>'%' + c.charCodeAt(0).toString(16).padStart(2,'0')).join(''));}catch{return'';}}
function bodyText(part?:GmailPart):string{if(!part)return'';let out='';if(part.body?.data&&(part.mimeType==='text/plain'||!part.parts?.length))out+=decode64url(part.body.data);for(const p of part.parts||[])out+='\n'+bodyText(p);return out;}
function bankFamily(v:unknown){const s=String(v??'').toLowerCase();if(/الأهلي|الاهلي|ahli/.test(s))return'AHLI';if(/ميثاق|meethaq/.test(s))return'MEETHAQ';if(/صحار|sohar/.test(s))return'SOHAR';if(/ظفار|dhofar/.test(s))return'DHOFAR';return'';}
function detectAccount(text:string,bankCol:unknown){const compact=text.toUpperCase().replace(/\s+/g,'');const fam=bankFamily(bankCol);
  if(fam==='AHLI'){
    if(/0108[0-9#X*]{3,}001/.test(compact))return{key:'AHLI_001',budget:'عائلي شهري'};
    if(/0108[0-9#X*]{3,}002/.test(compact))return{key:'AHLI_002',budget:'عائلي سنوي'};
  }
  if(fam==='MEETHAQ'){
    if(/0611[0-9#X*]{3,}0021/.test(compact)||/(?:ACCOUNTNUMBER|ACCOUNT|A\/C)[^0-9#X*]{0,20}[0-9#X*]{3,}0021/.test(compact))return{key:'MEETHAQ_21',budget:'تأمين المصروف'};
    if(/0611[0-9#X*]{3,}0022/.test(compact)||/(?:ACCOUNTNUMBER|ACCOUNT|A\/C)[^0-9#X*]{0,20}[0-9#X*]{3,}0022/.test(compact))return{key:'MEETHAQ_22',budget:'تأمين الدخل'};
  }
  if(fam==='SOHAR'){
    if(/70102[0-9#X*]{3,}01/.test(compact))return{key:'SOHAR_7010',budget:'شخصي شهري'};
    if(/72407[0-9#X*]{3,}01/.test(compact))return{key:'SOHAR_7240',budget:'شخصي سنوي'};
  }
  return{key:'',budget:''};
}
function extractBalance(text:string){for(const p of[
  /New\s+Available\s+Balance\s*(?:is|:)?\s*OMR\s*([0-9,]+(?:\.[0-9]{1,3})?)/i,
  /Your\s+available\s+balance\s*(?:is|:)?\s*OMR\s*([0-9,]+(?:\.[0-9]{1,3})?)/i,
  /Available\s+Bal(?:ance)?\s*(?:is|:)?\s*OMR\s*([0-9,]+(?:\.[0-9]{1,3})?)/i,
  /Avl\s+Bal(?:ance)?\s*(?:is|:)?\s*OMR\s*([0-9,]+(?:\.[0-9]{1,3})?)/i
]){const m=text.match(p);if(m?.[1]){const n=Number(m[1].replace(/,/g,''));if(Number.isFinite(n))return n;}}return null;}
function movement(text:string){if(/\bhas\s+been\s+utilised\s+as\s+follows\b/i.test(text)||/\bfrom\s+your\s+a\/c\b/i.test(text)||/\bdebited\b/i.test(text)||/\bused\s+for\s+OMR\b/i.test(text))return'debit';if(/\bcredited\b/i.test(text))return'credit';return'';}
function msgDate(m:GmailMessage){const raw=hv(m,'Date')||(m.internalDate?new Date(Number(m.internalDate)).toISOString():'');const d=new Date(raw);return Number.isFinite(d.getTime())?d.toISOString():'';}
function validNum(v:unknown){if(v===''||v===null||v===undefined)return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function isSuspicious(row:Row){const bank=bankFamily(row[8]),key=String(row[15]??'');if(bank==='AHLI'&&key&&!key.startsWith('AHLI_'))return true;if(bank==='MEETHAQ'&&key&&!key.startsWith('MEETHAQ_'))return true;if(bank==='SOHAR'&&key&&!key.startsWith('SOHAR_'))return true;return false;}
async function reconcile(env:Env,t:string,ops:{headers:Row;rows:Row[]},limit=6){const candidates=ops.rows.map((r,i)=>({r,row:i+2})).filter(x=>{const r=x.r,id=String(r[0]??'').trim();if(!id)return false;const p=String(r[15]??'').trim(),rbal=validNum(r[17]),s=String(r[18]??'').trim(),td=String(r[19]??'').trim();return !p||!s||rbal===null||!td||isSuspicious(r);}).slice(-90).reverse().slice(0,limit);
  const data:Array<{range:string;values:unknown[][]}>=[];let checked=0,updated=0,balancesFound=0,accountsFixed=0;
  for(const c of candidates){checked++;try{const m=await gmailMessage(t,String(c.r[0]));const text=`${hv(m,'From')}\n${hv(m,'Subject')}\n${m.snippet||''}\n${bodyText(m.payload)}`;const det=detectAccount(text,c.r[8]),bal=extractBalance(text),mv=movement(text),bd=bal!==null?msgDate(m):'';let changed=false;let p=String(c.r[15]??''),q=String(c.r[16]??''),rv=c.r[17],sv=String(c.r[18]??''),tv=c.r[19];
      if(det.key&&det.key!==p){p=det.key;q=det.budget;changed=true;accountsFixed++;}
      else if(det.key&&!q){q=det.budget;changed=true;}
      if(bal!==null&&(validNum(rv)!==bal||!tv)){rv=bal;tv=bd;changed=true;balancesFound++;}
      if(mv&&mv!==sv){sv=mv;changed=true;}
      if(changed){data.push({range:`'العمليات'!P${c.row}:T${c.row}`,values:[[p,q,rv,sv,tv]]});updated++;}
    }catch{}}
  if(data.length)await gj(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values:batchUpdate`,t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valueInputOption:'USER_ENTERED',data})});
  return{checked,updated,balancesFound,accountsFixed};
}
function accountMeta(key:string){if(key==='AHLI_001')return{bankName:'بنك الأهلي',accountNumber:'001'};if(key==='AHLI_002')return{bankName:'بنك الأهلي',accountNumber:'002'};if(key==='MEETHAQ_21')return{bankName:'ميثاق',accountNumber:'0021'};if(key==='MEETHAQ_22')return{bankName:'ميثاق',accountNumber:'22'};if(key==='SOHAR_7010')return{bankName:'بنك صحار',accountNumber:'7010'};if(key==='SOHAR_7240')return{bankName:'بنك صحار',accountNumber:'7240'};if(key==='DHOFAR')return{bankName:'بنك ظفار',accountNumber:'—'};return{bankName:'',accountNumber:''};}
function dateTs(v:unknown){const d=new Date(String(v??''));return Number.isFinite(d.getTime())?d.getTime():0;}
async function latestBalances(env:Env){const t=await token(env);let ops=await readOps(env,t);const repair=await reconcile(env,t,ops,6);if(repair.updated)ops=await readOps(env,t);const map=new Map<string,{bankName:string;accountNumber:string;balance:number;date:string;messageId:string;ts:number;accountKey:string}>();
  for(const r of ops.rows){const key=String(r[15]??'').trim(),bal=validNum(r[17]),date=String(r[19]??'').trim();if(!key||bal===null||!date)continue;const meta=accountMeta(key);if(!meta.bankName)continue;const ts=dateTs(date),old=map.get(key);if(!old||ts>old.ts)map.set(key,{...meta,balance:bal,date,messageId:String(r[0]??''),ts,accountKey:key});}
  return{ok:true,source:'Google Sheets — العمليات P:T',balances:[...map.values()].map(({ts,...x})=>x),count:map.size,reconcile:repair};
}

export default{async fetch(request:Request,env:Env):Promise<Response>{const u=new URL(request.url);if(request.method==='OPTIONS')return current.fetch(request,env);try{
  if(u.pathname==='/api/gmail/latest-balances'&&request.method==='GET'){
    if(!(await authorized(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
    return json(await latestBalances(env),env);
  }
  if(u.pathname==='/api/gmail/recent-bank-messages'&&request.method==='GET'){
    if(!(await authorized(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
    return json({ok:true,source:'Google Sheets only',messages:[],count:0},env);
  }
  return current.fetch(request,env);
}catch(e:any){return json({ok:false,error:e?.message||String(e)},env,500);}}};
