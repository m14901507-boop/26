import current from './router34';
import { validSession, type Env } from './index';

type Row=unknown[];
const SHEET_ASSOC='الجمعيات';
const SHEET_MEMBERS='أعضاء الجمعيات';
const SHEET_PAYMENTS='دفعات الجمعيات';
const SHEET_TEMPLATE='قوالب رسائل الجمعيات';
const TEMPLATE_HEADERS=['associationId','عنوان الرسالة','نص الرسالة الكامل','updatedAt'];

function cors(env:Env){return{'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'https://m14901507-boop.github.io','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Credentials':'true','Vary':'Origin'};}
function json(x:unknown,env:Env,s=200){return Response.json(x,{status:s,headers:{...cors(env),'Cache-Control':'no-store'}});}
function txt(v:unknown){return String(v??'').trim();}
function num(v:unknown){const n=Number(v);return Number.isFinite(n)?n:0;}
function bool(v:unknown){return !/^(?:0|false|لا|غير نشط)$/i.test(txt(v));}
function id(prefix:string){return`${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g,'').slice(0,10)}`;}
function publicUrl(token:string){return`https://m14901507-boop.github.io/26/preview/association-member.html?t=${encodeURIComponent(token)}`;}

const DEFAULT_SUBJECT='إشعار استلام دفعة — {{association_name}}';
const DEFAULT_BODY=`الفاضل/ {{member_name}}
السلام عليكم ورحمة الله وبركاته،

تم بحمد الله استلام دفعتكم الخاصة بالجمعية بنجاح.

تفاصيل الدفعة:
- اسم الجمعية: {{association_name}}
- مبلغ الدفعة: {{amount}} ر.ع
- تاريخ الدفعة: {{payment_date}}
- الفترة: {{payment_period}}
- عدد الدفعات المسجلة: {{paid_count}}
- إجمالي الدفعات المسجلة: {{paid_total}} ر.ع

تفاصيل دوركم:
- رقم الدور: {{turn_no}}
- فترة الاستلام: {{receipt_period}}
- الاستلام الشهري المتوقع: {{monthly_receipt}} ر.ع
- إجمالي استلام الدور المتوقع: {{role_total}} ر.ع

للاطلاع على تفاصيل العضوية ومواعيد الاستلام وسجل الدفعات:
{{member_public_link}}

شاكرين لكم التزامكم وتعاونكم.

FLOOSY`;

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
async function batchRead(env:Env,t:string,ranges:string[]){
  const qs=ranges.map(r=>`ranges=${encodeURIComponent(r)}`).join('&');
  const d:any=await gj(`${base(env)}/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,t);
  return (d.valueRanges||[]).map((x:any)=>(x.values||[]) as Row[]);
}
async function appendRow(env:Env,t:string,name:string,values:Row,endCol:string){
  const rg=encodeURIComponent(`'${name}'!A:${endCol}`);
  return gj(`${base(env)}/values/${rg}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:[values]})});
}
async function putRow(env:Env,t:string,name:string,row:number,values:Row,endCol:string){
  const rg=encodeURIComponent(`'${name}'!A${row}:${endCol}${row}`);
  await gj(`${base(env)}/values/${rg}?valueInputOption=USER_ENTERED`,t,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:[values]})});
}
async function putCell(env:Env,t:string,name:string,cell:string,value:unknown){
  const rg=encodeURIComponent(`'${name}'!${cell}`);
  await gj(`${base(env)}/values/${rg}?valueInputOption=USER_ENTERED`,t,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:[[value]]})});
}
function rowFromUpdatedRange(v:unknown){const m=String(v||'').match(/![A-Z]+(\d+):/);return m?Number(m[1]):0;}
function assocObj(r:Row,row:number){return{row,associationId:txt(r[0]),name:txt(r[1]),contributionAmount:num(r[2]),durationMonths:num(r[3]),paymentEveryMonths:Math.max(1,num(r[4])||1),payoutEveryMonths:Math.max(1,num(r[5])||1),startMonth:txt(r[6]),firstPayoutMonth:txt(r[7]),active:bool(r[8]),receiptMessage:txt(r[9]),notes:txt(r[10])};}
function memberObj(r:Row,row:number){return{row,memberId:txt(r[0]),associationId:txt(r[1]),name:txt(r[2]),email:txt(r[3]),turnNo:num(r[4]),publicToken:txt(r[5]),active:bool(r[6]),notes:txt(r[7]),createdAt:txt(r[8])};}
function paymentObj(r:Row,row:number){return{row,paymentId:txt(r[0]),associationId:txt(r[1]),memberId:txt(r[2]),date:txt(r[3]),amount:num(r[4]),period:txt(r[5]),notes:txt(r[6]),emailStatus:txt(r[7]),createdAt:txt(r[8])};}

async function ensureTemplateSheet(env:Env,t:string){
  const meta:any=await gj(`${base(env)}?fields=sheets.properties.title`,t);
  const exists=(meta.sheets||[]).some((s:any)=>txt(s?.properties?.title)===SHEET_TEMPLATE);
  if(!exists){
    await gj(`${base(env)}:batchUpdate`,t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests:[{addSheet:{properties:{title:SHEET_TEMPLATE}}}]})});
    const rg=encodeURIComponent(`'${SHEET_TEMPLATE}'!A1:D1`);
    await gj(`${base(env)}/values/${rg}?valueInputOption=RAW`,t,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:[TEMPLATE_HEADERS]})});
  }
}
async function readTemplateRows(env:Env,t:string){
  try{const [rows=[]]=await batchRead(env,t,[`'${SHEET_TEMPLATE}'!A:D`]);return rows;}
  catch(e:any){if(!/Unable to parse range|not found|requested entity|Invalid value/i.test(String(e?.message||e)))throw e;return[];}
}
async function getTemplate(env:Env,t:string,associationId:string){
  const rows=await readTemplateRows(env,t),match=rows.slice(1).map((r,i)=>({row:i+2,associationId:txt(r[0]),subjectTemplate:txt(r[1]),bodyTemplate:String(r[2]??''),updatedAt:txt(r[3])})).find(x=>x.associationId===associationId);
  return match||{associationId,subjectTemplate:DEFAULT_SUBJECT,bodyTemplate:DEFAULT_BODY,updatedAt:'',isDefault:true};
}
async function saveTemplate(env:Env,t:string,p:any){
  const associationId=txt(p.associationId);if(!associationId)throw new Error('اختر الجمعية أولاً');
  await ensureTemplateSheet(env,t);
  const rows=await readTemplateRows(env,t),found=rows.slice(1).map((r,i)=>({row:i+2,id:txt(r[0])})).find(x=>x.id===associationId),values=[associationId,txt(p.subjectTemplate)||DEFAULT_SUBJECT,String(p.bodyTemplate||DEFAULT_BODY),new Date().toISOString()];
  if(found)await putRow(env,t,SHEET_TEMPLATE,found.row,values,'D');else await appendRow(env,t,SHEET_TEMPLATE,values,'D');
  return{ok:true,associationId,subjectTemplate:values[1],bodyTemplate:values[2]};
}

function b64(bytes:Uint8Array){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);}
function b64urlText(s:string){return b64(new TextEncoder().encode(s)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');}
function encHeader(s:string){return`=?UTF-8?B?${b64(new TextEncoder().encode(s))}?=`;}
async function sendReceipt(t:string,to:string,subject:string,body:string){
  const mime=`To: ${to}\r\nSubject: ${encHeader(subject)}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${body}`;
  return gj('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw:b64urlText(mime)})});
}
function paymentSummary(a:any,m:any,payments:any[]){
  const mine=payments.filter(x=>x.memberId===m.memberId).sort((x,y)=>String(y.date).localeCompare(String(x.date)));
  const paidTotal=mine.reduce((s,x)=>s+num(x.amount),0),expectedCount=a?.durationMonths?Math.ceil(a.durationMonths/Math.max(1,a.paymentEveryMonths||1)):0,expectedTotal=expectedCount*num(a?.contributionAmount);
  return{paidTotal,paidCount:mine.length,expectedCount,expectedTotal,remaining:Math.max(0,expectedTotal-paidTotal)};
}

async function addPayment(env:Env,t:string,p:any){
  const [aRows=[],mRows=[],pRows=[]]=await batchRead(env,t,[`'${SHEET_ASSOC}'!A:K`,`'${SHEET_MEMBERS}'!A:I`,`'${SHEET_PAYMENTS}'!A:I`]);
  const associations=aRows.slice(1).map((r,i)=>assocObj(r,i+2)).filter(a=>a.associationId),members=mRows.slice(1).map((r,i)=>memberObj(r,i+2)).filter(m=>m.memberId),payments=pRows.slice(1).map((r,i)=>paymentObj(r,i+2)).filter(x=>x.paymentId);
  const associationId=txt(p.associationId),memberId=txt(p.memberId),a=associations.find(x=>x.associationId===associationId),m=members.find(x=>x.memberId===memberId&&x.associationId===associationId);
  if(!a||!m)throw new Error('تعذر العثور على الجمعية أو العضو');
  const paymentId=id('pay'),date=txt(p.date)||new Date().toISOString().slice(0,10),amount=num(p.amount);if(!(amount>0))throw new Error('المبلغ غير صالح');
  let emailStatus=p.sendEmail?'بانتظار الإرسال':'غير مطلوب';
  const append:any=await appendRow(env,t,SHEET_PAYMENTS,[paymentId,associationId,memberId,date,amount,txt(p.period),txt(p.notes),emailStatus,new Date().toISOString()],'I');
  const row=rowFromUpdatedRange(append?.updates?.updatedRange);let emailError='';
  if(p.sendEmail&&m.email){
    const updated=[...payments,{paymentId,associationId,memberId,date,amount,period:txt(p.period),notes:txt(p.notes),emailStatus,createdAt:new Date().toISOString()}],sum=paymentSummary(a,m,updated);
    const subject=txt(p.subject)||`إشعار استلام دفعة — ${a.name}`;
    const body=String(p.fullMessage||'').trim()||`الفاضل/ ${m.name||'عضو الجمعية'}\nالسلام عليكم ورحمة الله وبركاته،\n\nتم بحمد الله استلام دفعتكم بنجاح.\n\nالجمعية: ${a.name}\nالمبلغ المستلم: ${amount.toFixed(3)} ر.ع\nتاريخ الدفعة: ${date}\nإجمالي دفعاتكم المسجلة: ${sum.paidTotal.toFixed(3)} ر.ع\nعدد الدفعات المسجلة: ${sum.paidCount}${sum.expectedCount?` من ${sum.expectedCount}`:''}\n\nللتفاصيل:\n${publicUrl(m.publicToken)}\n\nFLOOSY`;
    try{await sendReceipt(t,m.email,subject,body);emailStatus='تم الإرسال';}
    catch(e:any){emailError=e?.message||String(e);emailStatus=/insufficient|permission|scope|403/i.test(emailError)?'يحتاج صلاحية Gmail Send':'تعذر الإرسال';}
    if(row)await putCell(env,t,SHEET_PAYMENTS,`H${row}`,emailStatus);
  }else if(p.sendEmail&&!m.email){emailStatus='لا يوجد بريد';if(row)await putCell(env,t,SHEET_PAYMENTS,`H${row}`,emailStatus);}
  return{ok:true,paymentId,emailStatus,emailError};
}

export default{async fetch(request:Request,env:Env):Promise<Response>{
  const u=new URL(request.url);
  if((u.pathname==='/api/preview/association/template'||u.pathname==='/api/preview/associations/payment')&&request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(env)});
  try{
    if(u.pathname==='/api/preview/association/template'&&request.method==='GET'){
      if(!(await validSession(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
      const associationId=txt(u.searchParams.get('associationId'));if(!associationId)return json({ok:false,error:'اختر الجمعية أولاً'},env,400);
      const t=await token(env);return json({ok:true,...await getTemplate(env,t,associationId)},env);
    }
    if(u.pathname==='/api/preview/association/template'&&request.method==='POST'){
      if(!(await validSession(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
      const p:any=await request.json().catch(()=>({})),t=await token(env);return json(await saveTemplate(env,t,p),env);
    }
    if(u.pathname==='/api/preview/associations/payment'&&request.method==='POST'){
      if(!(await validSession(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
      const p:any=await request.json().catch(()=>({})),t=await token(env);return json(await addPayment(env,t,p),env);
    }
    return current.fetch(request,env);
  }catch(e:any){return json({ok:false,error:e?.message||String(e)},env,500);}
}};
