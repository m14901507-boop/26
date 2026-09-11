import current from './router30';
import { validSession, type Env } from './index';

type Row=unknown[];
const SHEET_ASSOC='الجمعيات';
const SHEET_MEMBERS='أعضاء الجمعيات';

function cors(env:Env){return{'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'https://m14901507-boop.github.io','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Credentials':'true','Vary':'Origin'};}
function json(x:unknown,env:Env,s=200){return Response.json(x,{status:s,headers:cors(env)});}
function txt(v:unknown){return String(v??'').trim();}
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
async function readRange(env:Env,t:string,range:string){
  const rg=encodeURIComponent(range);
  const d:any=await gj(`${base(env)}/values/${rg}?valueRenderOption=UNFORMATTED_VALUE`,t);
  return (d.values||[]) as Row[];
}
async function writeCell(env:Env,t:string,range:string,value:unknown){
  const rg=encodeURIComponent(range);
  await gj(`${base(env)}/values/${rg}?valueInputOption=USER_ENTERED`,t,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:[[value]]})});
}
async function batchWrite(env:Env,t:string,data:any[]){
  if(!data.length)return;
  await gj(`${base(env)}/values:batchUpdate`,t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valueInputOption:'USER_ENTERED',data})});
}
async function archiveAssociation(env:Env,t:string,associationId:string){
  const [aRows,mRows]=await Promise.all([readRange(env,t,`'${SHEET_ASSOC}'!A:K`),readRange(env,t,`'${SHEET_MEMBERS}'!A:I`)]);
  let associationRow=0;
  for(let i=1;i<aRows.length;i++)if(txt(aRows[i]?.[0])===associationId){associationRow=i+1;break;}
  if(!associationRow)throw new Error('تعذر العثور على الجمعية');
  const data:any[]=[{range:`'${SHEET_ASSOC}'!I${associationRow}`,values:[['لا']]}];
  for(let i=1;i<mRows.length;i++)if(txt(mRows[i]?.[1])===associationId)data.push({range:`'${SHEET_MEMBERS}'!G${i+1}`,values:[['لا']]});
  await batchWrite(env,t,data);
}
async function archiveMember(env:Env,t:string,memberId:string){
  const rows=await readRange(env,t,`'${SHEET_MEMBERS}'!A:I`);let row=0;
  for(let i=1;i<rows.length;i++)if(txt(rows[i]?.[0])===memberId){row=i+1;break;}
  if(!row)throw new Error('تعذر العثور على العضو');
  await writeCell(env,t,`'${SHEET_MEMBERS}'!G${row}`,'لا');
}

export default{async fetch(request:Request,env:Env):Promise<Response>{
  const u=new URL(request.url);
  if(u.pathname.startsWith('/api/preview/associations')&&request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(env)});
  try{
    if(u.pathname==='/api/preview/associations'&&request.method==='GET'){
      if(!(await validSession(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
      const upstream=await current.fetch(request,env),data:any=await upstream.json().catch(()=>({}));
      if(!upstream.ok)return json(data,env,upstream.status);
      const activeAssociations=(data.associations||[]).filter((a:any)=>a.active!==false);
      const activeIds=new Set(activeAssociations.map((a:any)=>txt(a.associationId)));
      const activeMembers=(data.members||[]).filter((m:any)=>m.active!==false&&activeIds.has(txt(m.associationId)));
      const memberIds=new Set(activeMembers.map((m:any)=>txt(m.memberId)));
      const payments=(data.payments||[]).filter((p:any)=>activeIds.has(txt(p.associationId))&&memberIds.has(txt(p.memberId)));
      return json({...data,associations:activeAssociations,members:activeMembers,payments},env);
    }
    if(u.pathname==='/api/preview/associations/delete'&&request.method==='POST'){
      if(!(await validSession(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
      const p:any=await request.json().catch(()=>({})),associationId=txt(p.associationId);if(!associationId)return json({ok:false,error:'associationId مطلوب'},env,400);
      const t=await token(env);await archiveAssociation(env,t,associationId);return json({ok:true,associationId,archived:true},env);
    }
    if(u.pathname==='/api/preview/associations/member/delete'&&request.method==='POST'){
      if(!(await validSession(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
      const p:any=await request.json().catch(()=>({})),memberId=txt(p.memberId);if(!memberId)return json({ok:false,error:'memberId مطلوب'},env,400);
      const t=await token(env);await archiveMember(env,t,memberId);return json({ok:true,memberId,archived:true},env);
    }
  }catch(e:any){return json({ok:false,error:e?.message||String(e)},env,500);}
  return current.fetch(request,env);
}};
