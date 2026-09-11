import current from './router29';
import { validSession, type Env } from './index';

type Row=unknown[];
const SHEET_EXT='إعدادات الجمعيات الموسعة';
const EXT_HEADERS=['associationId','عدد الأعضاء المخطط','تاريخ الانتهاء'];

function cors(env:Env){return{'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'https://m14901507-boop.github.io','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Credentials':'true','Vary':'Origin'};}
function json(x:unknown,env:Env,s=200){return Response.json(x,{status:s,headers:cors(env)});}
function txt(v:unknown){return String(v??'').trim();}
function num(v:unknown){const n=Number(v);return Number.isFinite(n)?n:0;}
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
function base(env:Env){return`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}`;}
async function ensureExtSheet(env:Env,t:string){
  const meta:any=await gj(`${base(env)}?fields=sheets.properties.title`,t);
  const exists=(meta.sheets||[]).some((s:any)=>txt(s?.properties?.title)===SHEET_EXT);
  if(!exists)await gj(`${base(env)}:batchUpdate`,t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests:[{addSheet:{properties:{title:SHEET_EXT}}}]})});
  const rg=encodeURIComponent(`'${SHEET_EXT}'!A1:C1`);
  await gj(`${base(env)}/values/${rg}?valueInputOption=RAW`,t,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:[EXT_HEADERS]})});
}
async function readExt(env:Env,t:string){
  await ensureExtSheet(env,t);
  const rg=encodeURIComponent(`'${SHEET_EXT}'!A:C`);
  const d:any=await gj(`${base(env)}/values/${rg}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,t);
  const rows:Row[]=(d.values||[]).slice(1);
  return new Map(rows.filter(r=>txt(r?.[0])).map(r=>[txt(r[0]),{plannedMembers:num(r[1]),endDate:txt(r[2])}]));
}
async function upsertExt(env:Env,t:string,associationId:string,plannedMembers:number,endDate:string){
  await ensureExtSheet(env,t);
  const rg=encodeURIComponent(`'${SHEET_EXT}'!A:C`);
  const d:any=await gj(`${base(env)}/values/${rg}?valueRenderOption=UNFORMATTED_VALUE`,t);
  const rows:Row[]=d.values||[];let row=0;
  for(let i=1;i<rows.length;i++)if(txt(rows[i]?.[0])===associationId){row=i+1;break;}
  if(row){
    const cell=encodeURIComponent(`'${SHEET_EXT}'!A${row}:C${row}`);
    await gj(`${base(env)}/values/${cell}?valueInputOption=USER_ENTERED`,t,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:[[associationId,plannedMembers,endDate]]})});
  }else{
    await gj(`${base(env)}/values/${rg}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:[[associationId,plannedMembers,endDate]]})});
  }
}

export default{async fetch(request:Request,env:Env):Promise<Response>{
  const u=new URL(request.url);
  if(u.pathname==='/api/preview/associations'&&request.method==='GET'){
    try{
      if(!(await validSession(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
      const upstream=await current.fetch(request,env),data:any=await upstream.json().catch(()=>({}));
      if(!upstream.ok)return json(data,env,upstream.status);
      const t=await token(env),ext=await readExt(env,t);
      data.associations=(data.associations||[]).map((a:any)=>({...a,...(ext.get(txt(a.associationId))||{plannedMembers:0,endDate:''})}));
      return json(data,env);
    }catch(e:any){return json({ok:false,error:e?.message||String(e)},env,500);}
  }
  if(u.pathname==='/api/preview/associations/upsert'&&request.method==='POST'){
    try{
      if(!(await validSession(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
      const p:any=await request.json().catch(()=>({}));
      const upstream=await current.fetch(new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(p)}),env);
      const data:any=await upstream.json().catch(()=>({}));
      if(!upstream.ok)return json(data,env,upstream.status);
      const associationId=txt(data.associationId||p.associationId);
      if(associationId){const t=await token(env);await upsertExt(env,t,associationId,Math.max(0,Math.round(num(p.plannedMembers))),txt(p.endDate));}
      return json(data,env);
    }catch(e:any){return json({ok:false,error:e?.message||String(e)},env,500);}
  }
  return current.fetch(request,env);
}};
