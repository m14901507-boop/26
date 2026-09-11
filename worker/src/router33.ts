import current from './router32';
import { validSession, type Env } from './index';

type Row=unknown[];
const SHEET_ASSOC='الجمعيات';
const SHEET_MEMBERS='أعضاء الجمعيات';
const SHEET_PAYMENTS='دفعات الجمعيات';
const SHEET_PHONES='هواتف أعضاء الجمعيات';
const SHEET_EXT='إعدادات الجمعيات الموسعة';

function cors(env:Env){return{'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'https://m14901507-boop.github.io','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Credentials':'true','Vary':'Origin'};}
function json(x:unknown,env:Env,s=200){return Response.json(x,{status:s,headers:{...cors(env),'Cache-Control':'no-store'}});}
function txt(v:unknown){return String(v??'').trim();}
function num(v:unknown){const n=Number(v);return Number.isFinite(n)?n:0;}
function bool(v:unknown){return !/^(?:0|false|لا|غير نشط)$/i.test(txt(v));}
function publicUrl(token:string){return`https://m14901507-boop.github.io/26/preview/association-member.html?t=${encodeURIComponent(token)}`;}

async function token(env:Env){
  const body=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID.trim(),client_secret:env.GOOGLE_CLIENT_SECRET.trim(),refresh_token:env.GOOGLE_REFRESH_TOKEN.trim(),grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const d:any=await r.json().catch(()=>({}));
  if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||`OAuth ${r.status}`);
  return String(d.access_token);
}
async function gj(url:string,t:string){
  const r=await fetch(url,{headers:{Authorization:`Bearer ${t}`,Accept:'application/json'}});
  const d:any=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d?.error?.message||`Google API ${r.status}`);
  return d;
}
function base(env:Env){return`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}`;}
async function batchRead(env:Env,t:string,ranges:string[]){
  const qs=ranges.map(r=>`ranges=${encodeURIComponent(r)}`).join('&');
  const d:any=await gj(`${base(env)}/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,t);
  return (d.valueRanges||[]).map((x:any)=>(x.values||[]) as Row[]);
}
function assocObj(r:Row,row:number){return{row,associationId:txt(r[0]),name:txt(r[1]),contributionAmount:num(r[2]),durationMonths:num(r[3]),paymentEveryMonths:Math.max(1,num(r[4])||1),payoutEveryMonths:Math.max(1,num(r[5])||1),startMonth:txt(r[6]),firstPayoutMonth:txt(r[7]),active:bool(r[8]),receiptMessage:txt(r[9]),notes:txt(r[10])};}
function memberObj(r:Row,row:number){const publicToken=txt(r[5]);return{row,memberId:txt(r[0]),associationId:txt(r[1]),name:txt(r[2]),email:txt(r[3]),turnNo:num(r[4]),publicToken,publicUrl:publicToken?publicUrl(publicToken):'',active:bool(r[6]),notes:txt(r[7]),createdAt:txt(r[8])};}
function paymentObj(r:Row,row:number){return{row,paymentId:txt(r[0]),associationId:txt(r[1]),memberId:txt(r[2]),date:txt(r[3]),amount:num(r[4]),period:txt(r[5]),notes:txt(r[6]),emailStatus:txt(r[7]),createdAt:txt(r[8])};}

async function loadResilient(env:Env,t:string){
  const core=[`'${SHEET_ASSOC}'!A:K`,`'${SHEET_MEMBERS}'!A:I`,`'${SHEET_PAYMENTS}'!A:I`];
  const optional=[`'${SHEET_PHONES}'!A:B`,`'${SHEET_EXT}'!A:C`];
  let aRows:Row[]=[],mRows:Row[]=[],pRows:Row[]=[],phoneRows:Row[]=[],extRows:Row[]=[],optionalMissing=false;
  try{
    [aRows=[],mRows=[],pRows=[],phoneRows=[],extRows=[]]=await batchRead(env,t,[...core,...optional]);
  }catch(e:any){
    const msg=String(e?.message||e);
    if(!/Unable to parse range|not found|requested entity|Invalid value/i.test(msg))throw e;
    optionalMissing=true;
    [aRows=[],mRows=[],pRows=[]]=await batchRead(env,t,core);
  }

  const phones=new Map(phoneRows.slice(1).filter(r=>txt(r?.[0])).map(r=>[txt(r[0]),txt(r[1])]));
  const ext=new Map(extRows.slice(1).filter(r=>txt(r?.[0])).map(r=>[txt(r[0]),{plannedMembers:num(r[1]),endDate:txt(r[2])}]));
  const rawAssociations=Math.max(0,aRows.length-1),rawMembers=Math.max(0,mRows.length-1),rawPayments=Math.max(0,pRows.length-1);
  const associations=aRows.slice(1).map((r,i)=>assocObj(r,i+2)).filter(a=>a.associationId&&a.active!==false).map(a=>({...a,...(ext.get(a.associationId)||{plannedMembers:0,endDate:''})}));
  const activeIds=new Set(associations.map(a=>a.associationId));
  const members=mRows.slice(1).map((r,i)=>memberObj(r,i+2)).filter(m=>m.memberId&&m.active!==false&&activeIds.has(m.associationId)).map(m=>({...m,phone:phones.get(m.memberId)||''}));
  const memberIds=new Set(members.map(m=>m.memberId));
  const payments=pRows.slice(1).map((r,i)=>paymentObj(r,i+2)).filter(p=>p.paymentId&&activeIds.has(p.associationId)&&memberIds.has(p.memberId));
  return{ok:true,associations,members,payments,diagnostics:{rawAssociations,rawMembers,rawPayments,visibleAssociations:associations.length,visibleMembers:members.length,visiblePayments:payments.length,ignoredAssociations:Math.max(0,rawAssociations-associations.length),ignoredMembers:Math.max(0,rawMembers-members.length),ignoredPayments:Math.max(0,rawPayments-payments.length),optionalMissing}};
}

export default{async fetch(request:Request,env:Env):Promise<Response>{
  const u=new URL(request.url);
  if(u.pathname==='/api/preview/associations'&&request.method==='GET'){
    try{
      if(!(await validSession(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
      const t=await token(env);
      return json(await loadResilient(env,t),env);
    }catch(e:any){return json({ok:false,error:e?.message||String(e)},env,500);}
  }
  return current.fetch(request,env);
}};
