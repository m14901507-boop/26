import current from './router2';
import type { Env } from './index';

type Row=unknown[];

type GmailRef={id?:string};

function clean(v:unknown){return String(v??'').trim().toLowerCase().replace(/[\s_\-]+/g,'');}
function headerIndex(headers:unknown[],patterns:RegExp[]){for(let i=0;i<headers.length;i++){const x=clean(headers[i]);if(patterns.some(p=>p.test(x)))return i;}return-1;}
function colName(index:number){let n=index+1,s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
function cors(env:Env){return{'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'https://m14901507-boop.github.io','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin'};}

async function token(env:Env){const body=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID.trim(),client_secret:env.GOOGLE_CLIENT_SECRET.trim(),refresh_token:env.GOOGLE_REFRESH_TOKEN.trim(),grant_type:'refresh_token'});const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});const d:any=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||`OAuth ${r.status}`);return String(d.access_token);}
async function gj(url:string,t:string,init:RequestInit={}){const r=await fetch(url,{...init,headers:{Authorization:`Bearer ${t}`,Accept:'application/json',...(init.headers||{})}});const d:any=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||`Google API ${r.status}`);return d;}
async function sheet(env:Env,t:string,name:string,rangePart:string){const range=encodeURIComponent(`'${name}'!${rangePart}`),url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,d=await gj(url,t),v:Row[]=d.values||[];return{headers:v[0]||[],rows:v.slice(1)};}
async function authorized(request:Request,env:Env){const u=new URL(request.url);u.pathname='/auth/status';const r=await current.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env),d:any=await r.json().catch(()=>({}));return Boolean(d?.authenticated);}

async function repairAhli002(env:Env){
  const t=await token(env);
  const ops=await sheet(env,t,'العمليات','A:O');
  const idIx=headerIndex(ops.headers,[/معرف.*الرسالة/,/message.*id/,/^id$/]);
  const accountIx=headerIndex(ops.headers,[/^البنك$/,/الحساب/,/bank/,/account/]);
  if(idIx<0||accountIx<0)return{ok:false,matched:0,updated:0,error:'تعذر تحديد عمود معرف الرسالة أو البنك'};

  // نفس البحث الذي أثبت المستخدم أنه يعرض رسائل الأهلي 002 في Gmail.
  const q='0108######002';
  const list:any=await gj(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=100`,t);
  const ids=new Set<string>((list.messages||[]).map((x:GmailRef)=>String(x.id||'')).filter(Boolean));
  if(!ids.size)return{ok:true,matched:0,updated:0,query:q};

  const updates:Array<{range:string;values:string[][]}>=[];
  let matched=0;
  for(let i=0;i<ops.rows.length;i++){
    const id=String(ops.rows[i][idIx]||'').trim();
    if(!id||!ids.has(id))continue;
    matched++;
    const current=String(ops.rows[i][accountIx]||'').trim();
    if(current==='بنك الأهلي 002')continue;
    updates.push({range:`'العمليات'!${colName(accountIx)}${i+2}`,values:[['بنك الأهلي 002']]});
  }
  if(updates.length){
    await gj(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values:batchUpdate`,t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valueInputOption:'USER_ENTERED',data:updates})});
  }
  return{ok:true,query:q,gmail002:ids.size,matched,updated:updates.length};
}

export default{
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(request.method==='OPTIONS')return current.fetch(request,env);

    if(url.pathname==='/api/operations/repair-ahli-002'&&request.method==='POST'){
      if(!(await authorized(request,env)))return Response.json({ok:false,error:'Unauthorized'},{status:401,headers:cors(env)});
      try{return Response.json(await repairAhli002(env),{headers:cors(env)});}catch(e:any){return Response.json({ok:false,error:e?.message||String(e)},{status:500,headers:cors(env)});}
    }

    if(url.pathname==='/api/operations'&&request.method==='GET'){
      if(!(await authorized(request,env)))return Response.json({ok:false,error:'Unauthorized'},{status:401,headers:cors(env)});
      let repair:any={ok:false,skipped:true};
      try{repair=await repairAhli002(env);}catch(e:any){repair={ok:false,error:e?.message||String(e)};}
      const r=await current.fetch(request,env);
      const d:any=await r.json().catch(()=>({}));
      return Response.json({...d,repairAhli002:repair},{status:r.status,headers:cors(env)});
    }

    return current.fetch(request,env);
  }
};
