import current from './router35';
import { validSession, type Env } from './index';

type Row=unknown[];
const SHEET_RECEIPTS='استلامات أدوار الجمعيات';
const SHEET_MEMBERS='أعضاء الجمعيات';
const RECEIPT_HEADERS=['receiptId','associationId','memberId','installmentNo','تاريخ الاستلام','المبلغ','الحالة','ملاحظات','updatedAt'];

function txt(v:unknown){return String(v??'').trim();}
function num(v:unknown){const n=Number(v);return Number.isFinite(n)?n:0;}
function cors(env:Env){return{'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'https://m14901507-boop.github.io','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Credentials':'true','Vary':'Origin'};}
function json(x:unknown,env:Env,s=200){return Response.json(x,{status:s,headers:{...cors(env),'Cache-Control':'no-store'}});}
function base(env:Env){return`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}`;}
async function token(env:Env){
  const body=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID.trim(),client_secret:env.GOOGLE_CLIENT_SECRET.trim(),refresh_token:env.GOOGLE_REFRESH_TOKEN.trim(),grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const d:any=await r.json().catch(()=>({}));
  if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||`OAuth ${r.status}`);
  return String(d.access_token);
}
async function gj(url:string,t:string,init:RequestInit={}){
  const r=await fetch(url,{...init,headers:{Authorization:`Bearer ${t}`,Accept:'application/json',...(init.headers||{})}});
  const d:any=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d?.error?.message||`Google API ${r.status}`);
  return d;
}
async function ensureReceiptSheet(env:Env,t:string){
  const meta:any=await gj(`${base(env)}?fields=sheets.properties.title`,t);
  const exists=(meta.sheets||[]).some((s:any)=>txt(s?.properties?.title)===SHEET_RECEIPTS);
  if(!exists){
    await gj(`${base(env)}:batchUpdate`,t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests:[{addSheet:{properties:{title:SHEET_RECEIPTS}}}]})});
  }
  const rg=encodeURIComponent(`'${SHEET_RECEIPTS}'!A1:I1`);
  const cur:any=await gj(`${base(env)}/values/${rg}?valueRenderOption=UNFORMATTED_VALUE`,t);
  if(!(cur.values?.[0]?.length)){
    await gj(`${base(env)}/values/${rg}?valueInputOption=RAW`,t,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:[RECEIPT_HEADERS]})});
  }
}
async function readReceipts(env:Env,t:string){
  try{
    const rg=encodeURIComponent(`'${SHEET_RECEIPTS}'!A:I`);
    const d:any=await gj(`${base(env)}/values/${rg}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,t);
    const rows:Row[]=d.values||[];
    return rows.slice(1).map((r,i)=>({row:i+2,receiptId:txt(r[0]),associationId:txt(r[1]),memberId:txt(r[2]),installmentNo:Math.max(1,num(r[3])||1),date:txt(r[4]),amount:num(r[5]),status:txt(r[6])||'مستلم',notes:txt(r[7]),updatedAt:txt(r[8])})).filter(x=>x.receiptId&&x.status!=='ملغي');
  }catch(e:any){
    if(/Unable to parse range|not found|requested entity|Invalid value/i.test(String(e?.message||e)))return[];
    throw e;
  }
}
async function readActiveMemberCount(env:Env,t:string,associationId:string){
  try{
    const rg=encodeURIComponent(`'${SHEET_MEMBERS}'!A:I`);
    const d:any=await gj(`${base(env)}/values/${rg}?valueRenderOption=UNFORMATTED_VALUE`,t);
    const rows:Row[]=d.values||[];
    return rows.slice(1).filter(r=>txt(r[1])===associationId&&!/^(?:0|false|لا|غير نشط)$/i.test(txt(r[6]))).length;
  }catch{return 0;}
}
async function appendRow(env:Env,t:string,values:Row){
  const rg=encodeURIComponent(`'${SHEET_RECEIPTS}'!A:I`);
  return gj(`${base(env)}/values/${rg}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:[values]})});
}
async function putRow(env:Env,t:string,row:number,values:Row){
  const rg=encodeURIComponent(`'${SHEET_RECEIPTS}'!A${row}:I${row}`);
  return gj(`${base(env)}/values/${rg}?valueInputOption=USER_ENTERED`,t,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:[values]})});
}
async function upsertReceipt(env:Env,t:string,p:any){
  const associationId=txt(p.associationId),memberId=txt(p.memberId),installmentNo=Math.max(1,num(p.installmentNo)||1);
  if(!associationId||!memberId)throw new Error('اختر الجمعية والعضو أولاً');
  await ensureReceiptSheet(env,t);
  const rows=await readReceipts(env,t),found=rows.find(x=>x.associationId===associationId&&x.memberId===memberId&&x.installmentNo===installmentNo);
  const received=p.received!==false,status=received?'مستلم':'ملغي',receiptId=found?.receiptId||`rcv_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g,'').slice(0,8)}`;
  const values=[receiptId,associationId,memberId,installmentNo,txt(p.date)||new Date().toISOString().slice(0,10),num(p.amount),status,txt(p.notes),new Date().toISOString()];
  if(found)await putRow(env,t,found.row,values);else await appendRow(env,t,values);
  return{ok:true,receipt:{receiptId,associationId,memberId,installmentNo,date:values[4],amount:values[5],status,notes:values[7],updatedAt:values[8]}};
}
async function augmentPublic(request:Request,env:Env){
  const resp=await current.fetch(request,env);if(!resp.ok)return resp;
  const data:any=await resp.clone().json().catch(()=>null);if(!data?.ok||!data?.member||!data?.association)return resp;
  const t=await token(env),associationId=txt(data.association.associationId),memberId=txt(data.member.memberId);
  const [receipts,activeMemberCount]=await Promise.all([readReceipts(env,t),readActiveMemberCount(env,t,associationId)]);
  data.receipts=receipts.filter(x=>x.associationId===associationId&&x.memberId===memberId);
  data.activeMemberCount=activeMemberCount;
  return Response.json(data,{status:resp.status,headers:{...cors(env),'Cache-Control':'no-store'}});
}
async function augmentAdmin(request:Request,env:Env){
  const resp=await current.fetch(request,env);if(!resp.ok)return resp;
  const data:any=await resp.clone().json().catch(()=>null);if(!data?.ok)return resp;
  const t=await token(env);data.receipts=await readReceipts(env,t);
  return Response.json(data,{status:resp.status,headers:{...cors(env),'Cache-Control':'no-store'}});
}

export default{async fetch(request:Request,env:Env):Promise<Response>{
  const u=new URL(request.url);
  if((u.pathname==='/api/preview/association/receipt'||u.pathname==='/api/preview/association/public'||u.pathname==='/api/preview/associations')&&request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(env)});
  try{
    if(u.pathname==='/api/preview/association/public'&&request.method==='GET')return augmentPublic(request,env);
    if(u.pathname==='/api/preview/associations'&&request.method==='GET'){
      if(!(await validSession(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
      return augmentAdmin(request,env);
    }
    if(u.pathname==='/api/preview/association/receipt'&&request.method==='POST'){
      if(!(await validSession(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
      const p:any=await request.json().catch(()=>({})),t=await token(env);return json(await upsertReceipt(env,t,p),env);
    }
    return current.fetch(request,env);
  }catch(e:any){return json({ok:false,error:e?.message||String(e)},env,500);}
}};
