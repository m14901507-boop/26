import current from './router27';
import { validSession, type Env } from './index';

type Row=unknown[];

const SHEET_ASSOC='الجمعيات';
const SHEET_MEMBERS='أعضاء الجمعيات';
const SHEET_PAYMENTS='دفعات الجمعيات';
const ASSOC_HEADERS=['associationId','الاسم','قيمة الدفعة','مدة الجمعية بالأشهر','تكرار الدفعة بالأشهر','تكرار الاستلام بالأشهر','بداية الجمعية','أول استلام','نشط','عبارة إشعار الاستلام','ملاحظات'];
const MEMBER_HEADERS=['memberId','associationId','الاسم','البريد الإلكتروني','رقم الدور','publicToken','نشط','ملاحظات','createdAt'];
const PAYMENT_HEADERS=['paymentId','associationId','memberId','تاريخ الدفعة','المبلغ','عن فترة','ملاحظات','حالة البريد','createdAt'];

function cors(env:Env){return{'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'https://m14901507-boop.github.io','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Credentials':'true','Vary':'Origin'};}
function json(x:unknown,env:Env,s=200){return Response.json(x,{status:s,headers:cors(env)});}
function txt(v:unknown){return String(v??'').trim();}
function num(v:unknown){const n=Number(v);return Number.isFinite(n)?n:0;}
function bool(v:unknown){return !/^(?:0|false|لا|غير نشط)$/i.test(txt(v));}
function id(prefix:string){return`${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g,'').slice(0,10)}`;}
function publicUrl(token:string){return`https://m14901507-boop.github.io/26/preview/association-member.html?t=${encodeURIComponent(token)}`;}

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
async function ensureSheets(env:Env,t:string){
  const meta:any=await gj(`${base(env)}?fields=sheets.properties.title`,t);
  const existing=new Set((meta.sheets||[]).map((s:any)=>txt(s?.properties?.title)));
  const defs=[{name:SHEET_ASSOC,headers:ASSOC_HEADERS},{name:SHEET_MEMBERS,headers:MEMBER_HEADERS},{name:SHEET_PAYMENTS,headers:PAYMENT_HEADERS}];
  const missing=defs.filter(x=>!existing.has(x.name));
  if(missing.length){
    await gj(`${base(env)}:batchUpdate`,t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests:missing.map(x=>({addSheet:{properties:{title:x.name}}}))})});
  }
  for(const d of defs){
    const rg=encodeURIComponent(`'${d.name}'!A1:${String.fromCharCode(64+d.headers.length)}1`);
    const cur:any=await gj(`${base(env)}/values/${rg}?valueRenderOption=UNFORMATTED_VALUE`,t);
    if(!(cur.values?.[0]?.length)){
      await gj(`${base(env)}/values/${rg}?valueInputOption=RAW`,t,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:[d.headers]})});
    }
  }
}
async function readSheet(env:Env,t:string,name:string,cols:string){
  const rg=encodeURIComponent(`'${name}'!${cols}`);
  const d:any=await gj(`${base(env)}/values/${rg}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,t);
  const v:Row[]=d.values||[];return{headers:v[0]||[],rows:v.slice(1)};
}
async function putRow(env:Env,t:string,name:string,row:number,values:Row,endCol:string){
  const rg=encodeURIComponent(`'${name}'!A${row}:${endCol}${row}`);
  await gj(`${base(env)}/values/${rg}?valueInputOption=USER_ENTERED`,t,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:[values]})});
}
async function appendRow(env:Env,t:string,name:string,values:Row,endCol:string){
  const rg=encodeURIComponent(`'${name}'!A:${endCol}`);
  return gj(`${base(env)}/values/${rg}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:[values]})});
}
function assocObj(r:Row,row:number){return{row,associationId:txt(r[0]),name:txt(r[1]),contributionAmount:num(r[2]),durationMonths:num(r[3]),paymentEveryMonths:Math.max(1,num(r[4])||1),payoutEveryMonths:Math.max(1,num(r[5])||1),startMonth:txt(r[6]),firstPayoutMonth:txt(r[7]),active:bool(r[8]),receiptMessage:txt(r[9]),notes:txt(r[10])};}
function memberObj(r:Row,row:number){return{row,memberId:txt(r[0]),associationId:txt(r[1]),name:txt(r[2]),email:txt(r[3]),turnNo:num(r[4]),publicToken:txt(r[5]),active:bool(r[6]),notes:txt(r[7]),createdAt:txt(r[8])};}
function paymentObj(r:Row,row:number){return{row,paymentId:txt(r[0]),associationId:txt(r[1]),memberId:txt(r[2]),date:txt(r[3]),amount:num(r[4]),period:txt(r[5]),notes:txt(r[6]),emailStatus:txt(r[7]),createdAt:txt(r[8])};}
async function loadAll(env:Env,t:string){
  await ensureSheets(env,t);
  const [a,m,p]=await Promise.all([readSheet(env,t,SHEET_ASSOC,'A:K'),readSheet(env,t,SHEET_MEMBERS,'A:I'),readSheet(env,t,SHEET_PAYMENTS,'A:I')]);
  return{associations:a.rows.map((r,i)=>assocObj(r,i+2)).filter(x=>x.associationId),members:m.rows.map((r,i)=>memberObj(r,i+2)).filter(x=>x.memberId),payments:p.rows.map((r,i)=>paymentObj(r,i+2)).filter(x=>x.paymentId)};
}
function addMonths(v:string,months:number){const m=/^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(v);if(!m)return'';const d=new Date(Date.UTC(+m[1],+m[2]-1,+(m[3]||1)));d.setUTCMonth(d.getUTCMonth()+months);return d.toISOString().slice(0,10);}
function payoutDate(a:any,m:any){return a?.firstPayoutMonth&&m?.turnNo?addMonths(a.firstPayoutMonth,(Math.max(1,m.turnNo)-1)*Math.max(1,a.payoutEveryMonths||1)):'';}
function paymentSummary(a:any,m:any,payments:any[]){
  const mine=payments.filter(x=>x.memberId===m.memberId).sort((x,y)=>String(y.date).localeCompare(String(x.date)));
  const paidTotal=mine.reduce((s,x)=>s+num(x.amount),0),expectedCount=a?.durationMonths?Math.ceil(a.durationMonths/Math.max(1,a.paymentEveryMonths||1)):0,expectedTotal=expectedCount*num(a?.contributionAmount);
  return{payments:mine,paidTotal,paidCount:mine.length,expectedCount,expectedTotal,remaining:Math.max(0,expectedTotal-paidTotal),payoutDate:payoutDate(a,m)};
}
function b64(bytes:Uint8Array){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);}
function b64urlText(s:string){return b64(new TextEncoder().encode(s)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');}
function encHeader(s:string){return`=?UTF-8?B?${b64(new TextEncoder().encode(s))}?=`;}
async function sendReceipt(t:string,to:string,subject:string,body:string){
  const mime=`To: ${to}\r\nSubject: ${encHeader(subject)}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${body}`;
  return gj('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw:b64urlText(mime)})});
}
function rowFromUpdatedRange(v:unknown){const m=String(v||'').match(/![A-Z]+(\d+):/);return m?Number(m[1]):0;}

async function upsertAssociation(env:Env,t:string,p:any){
  const all=await loadAll(env,t),associationId=txt(p.associationId)||id('assoc'),existing=all.associations.find(x=>x.associationId===associationId);
  const row=[associationId,txt(p.name)||'جمعية',num(p.contributionAmount),Math.max(1,num(p.durationMonths)||1),Math.max(1,num(p.paymentEveryMonths)||1),Math.max(1,num(p.payoutEveryMonths)||1),txt(p.startMonth),txt(p.firstPayoutMonth),p.active===false?'لا':'نعم',txt(p.receiptMessage)||'تم بحمد الله استلام دفعتك، شكرًا لالتزامك وتعاونك.',txt(p.notes)];
  if(existing)await putRow(env,t,SHEET_ASSOC,existing.row,row,'K');else await appendRow(env,t,SHEET_ASSOC,row,'K');
  return{ok:true,associationId};
}
async function upsertMember(env:Env,t:string,p:any){
  const all=await loadAll(env,t),associationId=txt(p.associationId);if(!all.associations.some(x=>x.associationId===associationId))throw new Error('الجمعية غير موجودة');
  const memberId=txt(p.memberId)||id('member'),existing=all.members.find(x=>x.memberId===memberId),publicToken=existing?.publicToken||crypto.randomUUID().replace(/-/g,'')+crypto.randomUUID().replace(/-/g,'').slice(0,16);
  const row=[memberId,associationId,txt(p.name),txt(p.email),Math.max(1,num(p.turnNo)||1),publicToken,p.active===false?'لا':'نعم',txt(p.notes),existing?.createdAt||new Date().toISOString()];
  if(existing)await putRow(env,t,SHEET_MEMBERS,existing.row,row,'I');else await appendRow(env,t,SHEET_MEMBERS,row,'I');
  return{ok:true,memberId,publicToken,publicUrl:publicUrl(publicToken)};
}
async function addPayment(env:Env,t:string,p:any){
  const all=await loadAll(env,t),associationId=txt(p.associationId),memberId=txt(p.memberId),a=all.associations.find(x=>x.associationId===associationId),m=all.members.find(x=>x.memberId===memberId&&x.associationId===associationId);
  if(!a||!m)throw new Error('تعذر العثور على الجمعية أو العضو');
  const paymentId=id('pay'),date=txt(p.date)||new Date().toISOString().slice(0,10),amount=num(p.amount);if(!(amount>0))throw new Error('المبلغ غير صالح');
  let emailStatus=p.sendEmail?'بانتظار الإرسال':'غير مطلوب';
  const append:any=await appendRow(env,t,SHEET_PAYMENTS,[paymentId,associationId,memberId,date,amount,txt(p.period),txt(p.notes),emailStatus,new Date().toISOString()],'I');
  const row=rowFromUpdatedRange(append?.updates?.updatedRange);
  let emailError='';
  if(p.sendEmail&&m.email){
    const updatedPayments=[...all.payments,{paymentId,associationId,memberId,date,amount,period:txt(p.period),notes:txt(p.notes),emailStatus,createdAt:new Date().toISOString()}],sum=paymentSummary(a,m,updatedPayments),phrase=txt(p.message)||a.receiptMessage||'تم بحمد الله استلام دفعتك، شكرًا لالتزامك وتعاونك.';
    const body=`السلام عليكم ${m.name||''},\n\n${phrase}\n\nالجمعية: ${a.name}\nالمبلغ المستلم: ${amount.toFixed(3)} ر.ع\nتاريخ الاستلام: ${date}\n${txt(p.period)?`عن فترة: ${txt(p.period)}\n`:''}إجمالي المدفوع المسجل: ${sum.paidTotal.toFixed(3)} ر.ع\nعدد الدفعات المسجلة: ${sum.paidCount}${sum.expectedCount?` من ${sum.expectedCount}`:''}\n${sum.payoutDate?`موعد دورك المتوقع: ${sum.payoutDate}\n`:''}\nتابع تفاصيل دورك ودفعاتك من رابطك الخاص:\n${publicUrl(m.publicToken)}\n\nFLOOSY`;
    try{await sendReceipt(t,m.email,`تأكيد استلام دفعة — ${a.name}`,body);emailStatus='تم الإرسال';}
    catch(e:any){emailError=e?.message||String(e);emailStatus=/insufficient|permission|scope|403/i.test(emailError)?'يحتاج صلاحية Gmail Send':'تعذر الإرسال';}
    if(row)await putCell(env,t,SHEET_PAYMENTS,`H${row}`,emailStatus);
  }else if(p.sendEmail&&!m.email){emailStatus='لا يوجد بريد';if(row)await putCell(env,t,SHEET_PAYMENTS,`H${row}`,emailStatus);}
  return{ok:true,paymentId,emailStatus,emailError};
}
async function putCell(env:Env,t:string,name:string,cell:string,value:unknown){const rg=encodeURIComponent(`'${name}'!${cell}`);await gj(`${base(env)}/values/${rg}?valueInputOption=USER_ENTERED`,t,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:[[value]]})});}

export default{async fetch(request:Request,env:Env):Promise<Response>{
  const u=new URL(request.url),isAssoc=u.pathname.startsWith('/api/preview/association');
  if(isAssoc&&request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(env)});
  try{
    if(u.pathname==='/api/preview/association/public'&&request.method==='GET'){
      const publicToken=txt(u.searchParams.get('t'));if(!publicToken)return json({ok:false,error:'الرابط غير صالح'},env,400);
      const t=await token(env),all=await loadAll(env,t),m=all.members.find(x=>x.publicToken===publicToken&&x.active),a=m&&all.associations.find(x=>x.associationId===m.associationId&&x.active);
      if(!m||!a)return json({ok:false,error:'الرابط غير موجود أو غير نشط'},env,404);
      const sum=paymentSummary(a,m,all.payments);
      return json({ok:true,association:{associationId:a.associationId,name:a.name,contributionAmount:a.contributionAmount,durationMonths:a.durationMonths,paymentEveryMonths:a.paymentEveryMonths,payoutEveryMonths:a.payoutEveryMonths,startMonth:a.startMonth,firstPayoutMonth:a.firstPayoutMonth},member:{name:m.name,turnNo:m.turnNo},summary:{paidTotal:sum.paidTotal,paidCount:sum.paidCount,expectedCount:sum.expectedCount,expectedTotal:sum.expectedTotal,remaining:sum.remaining,payoutDate:sum.payoutDate},payments:sum.payments.map(x=>({date:x.date,amount:x.amount,period:x.period,notes:x.notes}))},env);
    }
    if(u.pathname==='/api/preview/associations'&&request.method==='GET'){
      if(!(await validSession(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
      const t=await token(env),all=await loadAll(env,t);
      return json({ok:true,...all,members:all.members.map(m=>({...m,publicUrl:publicUrl(m.publicToken)}))},env);
    }
    if(u.pathname==='/api/preview/associations/upsert'&&request.method==='POST'){
      if(!(await validSession(request,env)))return json({ok:false,error:'Unauthorized'},env,401);const t=await token(env),p=await request.json().catch(()=>({}));return json(await upsertAssociation(env,t,p),env);
    }
    if(u.pathname==='/api/preview/associations/member/upsert'&&request.method==='POST'){
      if(!(await validSession(request,env)))return json({ok:false,error:'Unauthorized'},env,401);const t=await token(env),p=await request.json().catch(()=>({}));return json(await upsertMember(env,t,p),env);
    }
    if(u.pathname==='/api/preview/associations/payment'&&request.method==='POST'){
      if(!(await validSession(request,env)))return json({ok:false,error:'Unauthorized'},env,401);const t=await token(env),p=await request.json().catch(()=>({}));return json(await addPayment(env,t,p),env);
    }
  }catch(e:any){return json({ok:false,error:e?.message||String(e)},env,500);}
  return current.fetch(request,env);
}};
