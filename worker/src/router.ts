import base, { type Env } from './index';

type Row = unknown[];
type GmailHeader={name?:string;value?:string};
type GmailMessage={id?:string;snippet?:string;internalDate?:string;payload?:{headers?:GmailHeader[]}};

function clean(v:unknown){return String(v??'').trim().toLowerCase().replace(/[\s_\-]+/g,'');}
function headerIndex(headers:unknown[],patterns:RegExp[]){for(let i=0;i<headers.length;i++){const x=clean(headers[i]);if(patterns.some(p=>p.test(x)))return i;}return-1;}
function colName(index:number){let n=index+1,s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
function headerValue(m:GmailMessage,name:string){return(m.payload?.headers||[]).find(x=>(x.name||'').toLowerCase()===name.toLowerCase())?.value||'';}

function detectBankName(text:string){
  const low=text.toLowerCase();
  if(/ahli|الأهلي|الاهلي/.test(low))return'بنك الأهلي';
  if(/meethaq|ميثاق/.test(low))return'ميثاق';
  if(/dhofar|ظفار/.test(low))return'بنك ظفار';
  if(/sohar|صحار/.test(low))return'بنك صحار';
  if(/nizwa|نزوى/.test(low))return'بنك نزوى';
  if(/bank muscat|bankmuscat|بنك مسقط/.test(low))return'بنك مسقط';
  if(/oman arab bank|\boab\b|عمان العربي/.test(low))return'بنك عمان العربي';
  if(/national bank of oman|\bnbo\b|الوطني العماني/.test(low))return'البنك الوطني العماني';
  if(/alizz|العز/.test(low))return'بنك العز الإسلامي';
  return'';
}
function normalizeAccount(bank:string,no:string){
  let n=String(no||'').replace(/\D/g,'');
  if(bank==='بنك الأهلي'){
    if(['1','01','001'].includes(n))return'001';
    if(['2','02','002'].includes(n))return'002';
    return'';
  }
  if(bank==='ميثاق'&&['21','021','0021'].includes(n))return'0021';
  return n;
}
function extractAccountNumber(text:string,bank=''){
  if(/0108\s*[#*xX]{4,}\s*001\b/i.test(text))return'001';
  if(/0108\s*[#*xX]{4,}\s*002\b/i.test(text))return'002';
  const candidates:string[]=[];
  const patterns=[
    /(?:account|acct|a\/?c)(?:\s*(?:no|number|ending|ending\s+in))?[^0-9#*xX]{0,24}[#*xX-]*(\d{1,4})\b/ig,
    /[#*xX]{2,}(\d{1,4})\b/g,
    /\b\d{2,8}[#*xX-]{2,}(\d{1,4})\b/g
  ];
  for(const p of patterns){let m:RegExpExecArray|null;while((m=p.exec(text))!==null)if(m[1])candidates.push(m[1]);}
  return normalizeAccount(bank,candidates[0]||'');
}
function currentAccountIsComplete(text:string){
  const bank=detectBankName(text);
  if(!bank)return false;
  let m=text.match(/(?:حساب|account|acct|_|-|\s)(\d{1,4})\s*$/i);
  const no=normalizeAccount(bank,m?.[1]||'');
  return Boolean(no);
}
async function accessToken(env:Env){
  const body=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID.trim(),client_secret:env.GOOGLE_CLIENT_SECRET.trim(),refresh_token:env.GOOGLE_REFRESH_TOKEN.trim(),grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const d:any=await r.json().catch(()=>({}));
  if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||`OAuth ${r.status}`);
  return String(d.access_token);
}
async function googleJson(url:string,token:string,init:RequestInit={}){
  const r=await fetch(url,{...init,headers:{Authorization:`Bearer ${token}`,Accept:'application/json',...(init.headers||{})}});
  const d:any=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d?.error?.message||`Google API ${r.status}`);
  return d;
}
async function readOperations(env:Env,token:string){
  const range=encodeURIComponent("'العمليات'!A:O");
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const d=await googleJson(url,token);
  const v:Row[]=d.values||[];
  return{headers:v[0]||[],rows:v.slice(1)};
}
async function reconcileAccounts(env:Env,limit=12){
  const token=await accessToken(env);
  const {headers,rows}=await readOperations(env,token);
  const idIx=headerIndex(headers,[/معرف.*الرسالة/,/message.*id/,/^id$/]);
  const accountIx=headerIndex(headers,[/^البنك$/,/الحساب/,/bank/,/account/]);
  if(idIx<0||accountIx<0)return{ok:false,processed:0,updated:0,remaining:0,error:'تعذر تحديد عمود معرف الرسالة أو الحساب'};

  const candidates=rows.map((row,index)=>({row,index,id:String(row[idIx]||'').trim(),current:String(row[accountIx]||'').trim()}))
    .filter(x=>x.id&&!currentAccountIsComplete(x.current));
  const batch=candidates.slice(0,Math.max(1,Math.min(limit,16)));
  const updates:Array<{range:string;values:string[][]}>=[];
  let processed=0,updated=0,unresolved=0;

  for(const x of batch){
    processed++;
    try{
      const m:GmailMessage=await googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(x.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,token);
      const from=headerValue(m,'From'),subject=headerValue(m,'Subject'),snippet=(m.snippet||'').replace(/\s+/g,' ').trim();
      const combined=`${from}\n${subject}\n${snippet}`;
      const bank=detectBankName(combined),account=extractAccountNumber(combined,bank);
      if(!bank||!account){unresolved++;continue;}
      const value=`${bank} ${account}`;
      if(value===x.current)continue;
      const sheetRow=x.index+2;
      updates.push({range:`'العمليات'!${colName(accountIx)}${sheetRow}`,values:[[value]]});
      updated++;
    }catch{unresolved++;}
  }

  if(updates.length){
    await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values:batchUpdate`,token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valueInputOption:'USER_ENTERED',data:updates})});
  }
  return{ok:true,processed,updated,unresolved,remaining:Math.max(candidates.length-batch.length,0),complete:candidates.length<=batch.length};
}

export default{
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(url.pathname==='/api/operations'&&request.method==='GET'){
      const checkUrl=new URL(request.url);checkUrl.pathname='/api/__authcheck';
      const check=await base.fetch(new Request(checkUrl.toString(),{method:'GET',headers:request.headers}),env);
      if(check.status===401)return check;
      try{await reconcileAccounts(env,12);}catch{/* keep normal operations loading even if reconciliation fails */}
      return base.fetch(request,env);
    }
    if(url.pathname==='/api/operations/reconcile-accounts'&&request.method==='POST'){
      const checkUrl=new URL(request.url);checkUrl.pathname='/api/__authcheck';
      const check=await base.fetch(new Request(checkUrl.toString(),{method:'GET',headers:request.headers}),env);
      if(check.status===401)return check;
      try{
        const body:any=await request.json().catch(()=>({}));
        const result=await reconcileAccounts(env,Number(body?.limit)||12);
        return Response.json(result,{status:200,headers:{'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'https://m14901507-boop.github.io','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin'}});
      }catch(e:any){return Response.json({ok:false,error:e?.message||String(e)},{status:500,headers:{'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'https://m14901507-boop.github.io','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin'}});}
    }
    return base.fetch(request,env);
  }
};
