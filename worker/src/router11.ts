import current from './router10';
import type { Env } from './index';

type Row=unknown[];

function cors(env:Env){return{
  'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'https://m14901507-boop.github.io',
  'Access-Control-Allow-Headers':'Content-Type,Authorization',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Access-Control-Allow-Credentials':'true','Vary':'Origin'
};}
function json(data:unknown,env:Env,status=200){return Response.json(data,{status,headers:cors(env)});}
async function authorized(request:Request,env:Env){const u=new URL(request.url);u.pathname='/auth/status';const r=await current.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env);const d:any=await r.json().catch(()=>({}));return Boolean(d?.authenticated);}
async function token(env:Env){const body=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID.trim(),client_secret:env.GOOGLE_CLIENT_SECRET.trim(),refresh_token:env.GOOGLE_REFRESH_TOKEN.trim(),grant_type:'refresh_token'});const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});const d:any=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||`OAuth ${r.status}`);return String(d.access_token);}
async function gj(url:string,t:string){const r=await fetch(url,{headers:{Authorization:`Bearer ${t}`,Accept:'application/json'}});const d:any=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||`Google API ${r.status}`);return d;}
async function readOps(env:Env,t:string){const rg=encodeURIComponent("'العمليات'!A:U");const d:any=await gj(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values/${rg}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,t);const v:Row[]=d.values||[];return{headers:v[0]||[],rows:v.slice(1)};}
function parseDate(v:unknown){const d=new Date(String(v??''));const t=d.getTime();return Number.isFinite(t)?t:0;}
function parseAccountKey(v:unknown){const s=String(v??'').trim().toUpperCase();if(!s)return{bankName:'',accountNumber:''};
  let m=s.match(/^AHLI[_-]?(\d{1,4})$/);if(m){let n=m[1];if(['1','01','001'].includes(n))n='001';else if(['2','02','002'].includes(n))n='002';return{bankName:'بنك الأهلي',accountNumber:n};}
  m=s.match(/^MEETHAQ[_-]?(\d{1,4})$/);if(m){let n=m[1];if(['21','021','0021'].includes(n))n='0021';return{bankName:'ميثاق',accountNumber:n};}
  m=s.match(/^DHOFAR[_-]?(\d{1,6})$/);if(m)return{bankName:'بنك ظفار',accountNumber:m[1]};
  m=s.match(/^SOHAR[_-]?(\d{1,6})$/);if(m)return{bankName:'بنك صحار',accountNumber:m[1]};
  m=s.match(/^NIZWA[_-]?(\d{1,6})$/);if(m)return{bankName:'بنك نزوى',accountNumber:m[1]};
  m=s.match(/^(?:BANKMUSCAT|MUSCAT)[_-]?(\d{1,6})$/);if(m)return{bankName:'بنك مسقط',accountNumber:m[1]};
  m=s.match(/^(?:OAB|OMANARAB)[_-]?(\d{1,6})$/);if(m)return{bankName:'بنك عمان العربي',accountNumber:m[1]};
  m=s.match(/^NBO[_-]?(\d{1,6})$/);if(m)return{bankName:'البنك الوطني العماني',accountNumber:m[1]};
  m=s.match(/^ALIZZ[_-]?(\d{1,6})$/);if(m)return{bankName:'بنك العز الإسلامي',accountNumber:m[1]};
  return{bankName:'',accountNumber:''};
}
async function latestBalancesFromSheet(env:Env){const t=await token(env),ops=await readOps(env,t);
  // Existing sheet schema from columns P:R:S:T:
  // P = account key (e.g. AHLI_001), R = actual balance, S = account direction, T = balance timestamp.
  const KEY_IX=15, BALANCE_IX=17, DIRECTION_IX=18, BALANCE_DATE_IX=19;
  const map=new Map<string,{bankName:string;accountNumber:string;balance:number;date:string;direction:string;messageId:string;ts:number}>();
  for(const r of ops.rows){const key=String(r[KEY_IX]??'').trim();if(!key)continue;const ai=parseAccountKey(key);if(!ai.bankName||!ai.accountNumber)continue;const rawBal=r[BALANCE_IX];if(rawBal===''||rawBal==null)continue;const bal=Number(rawBal);if(!Number.isFinite(bal))continue;const rawDate=String(r[BALANCE_DATE_IX]??'');const ts=parseDate(rawDate);if(!ts)continue;const k=`${ai.bankName}|${ai.accountNumber}`,old=map.get(k);if(!old||ts>=old.ts)map.set(k,{bankName:ai.bankName,accountNumber:ai.accountNumber,balance:bal,date:rawDate,direction:String(r[DIRECTION_IX]??''),messageId:String(r[0]??''),ts});}
  return{ok:true,source:'Google Sheets',balances:[...map.values()].map(({ts,...x})=>x),count:map.size};
}
export default{async fetch(request:Request,env:Env):Promise<Response>{const u=new URL(request.url);if(request.method==='OPTIONS')return current.fetch(request,env);try{
  if(u.pathname==='/api/gmail/latest-balances'&&request.method==='GET'){
    if(!(await authorized(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
    return json(await latestBalancesFromSheet(env),env);
  }
  return current.fetch(request,env);
}catch(e:any){return json({ok:false,error:e?.message||String(e)},env,500);}}};
