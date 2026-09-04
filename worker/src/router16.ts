import current from './router15';
import type { Env } from './index';

type Row=unknown[];
type Msg={id?:string;labelIds?:string[];snippet?:string;payload?:{headers?:Array<{name?:string;value?:string}>}};

function cors(env:Env){return{'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'https://m14901507-boop.github.io','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Credentials':'true','Vary':'Origin'};}
function json(x:unknown,env:Env,s=200){return Response.json(x,{status:s,headers:cors(env)});}
async function auth(req:Request,env:Env){const u=new URL(req.url);u.pathname='/auth/status';const r=await current.fetch(new Request(u.toString(),{headers:req.headers}),env);const d:any=await r.json().catch(()=>({}));return !!d?.authenticated;}
async function token(env:Env){const b=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID.trim(),client_secret:env.GOOGLE_CLIENT_SECRET.trim(),refresh_token:env.GOOGLE_REFRESH_TOKEN.trim(),grant_type:'refresh_token'});const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:b});const d:any=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||`OAuth ${r.status}`);return String(d.access_token);}
async function gj(url:string,t:string,init:RequestInit={}){const r=await fetch(url,{...init,headers:{Authorization:`Bearer ${t}`,Accept:'application/json',...(init.headers||{})}});const d:any=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||`Google API ${r.status}`);return d;}
async function read(env:Env,t:string,name:string,range:string){const rg=encodeURIComponent(`'${name}'!${range}`);const d:any=await gj(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values/${rg}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,t);const v:Row[]=d.values||[];return{headers:v[0]||[],rows:v.slice(1)};}
async function batch(env:Env,t:string,data:Array<{range:string;values:unknown[][]}>){if(!data.length)return;await gj(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values:batchUpdate`,t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valueInputOption:'USER_ENTERED',data})});}
function txt(v:unknown){return String(v??'').trim();}
function isClassified(g:Row){const movement=txt(g[3]),system=txt(g[2]);if(/غير\s*مالي|أمان|الامان|تسجيل\s*الدخول/i.test(system+' '+movement))return false;return /مصروف|دخل|تحويل\s*داخلي|وارد|صادر|شراء|سحب/i.test(movement+' '+txt(g[1]));}
function applyGuide(op:Row,g:Row,status='متزامن مع دليل البنود'){const r=[...op];while(r.length<15)r.push('');r[2]=txt(g[0]);r[3]=txt(g[1]);r[6]=txt(g[3])||r[6];r[9]=txt(g[2]);r[10]=status;r[12]=txt(g[9]);r[13]=txt(g[10]);r[14]=txt(g[11]);return r;}
function clearGuide(op:Row,status='بدون تصنيف بند'){const r=[...op];while(r.length<15)r.push('');r[2]='';r[3]='';r[9]='';r[10]=status;r[12]='';r[13]='';r[14]='';return r;}
async function msg(t:string,id:string){return gj(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,t) as Promise<Msg>;}

async function propagateItem(env:Env,t:string,oldGuide:Row,newGuide:Row){const ops=await read(env,t,'العمليات','A:O'),oldName=txt(oldGuide[0]),newName=txt(newGuide[0]);const data:Array<{range:string;values:unknown[][]}>=[];let updated=0;ops.rows.forEach((r,i)=>{if(txt(r[2])!==oldName)return;const out=applyGuide(r,newGuide,'متزامن بعد تعديل البند');data.push({range:`'العمليات'!A${i+2}:O${i+2}`,values:[out]});updated++;});await batch(env,t,data);return{updated,oldName,newName};}

async function reconcileRemovals(env:Env){const t=await token(env),guide=await read(env,t,'دليل البنود','A:L'),ops=await read(env,t,'العمليات','A:O');const byLabel=new Map<string,Row>(),names=new Set<string>();for(const g of guide.rows){const name=txt(g[0]);if(name)names.add(name);const label=txt(g[6]);if(label&&isClassified(g))byLabel.set(label,g);}const writes:Array<{range:string;values:unknown[][]}>=[];let updated=0,unclassified=0,ambiguous=0;
 // نراجع فقط أربع عمليات حديثة لإزالة/تغيير Label، لتبقى العملية خفيفة على Cloudflare.
 const recent=ops.rows.map((r,i)=>({r,n:i+2,id:txt(r[0])})).filter(x=>x.id).slice(-4);
 for(const ex of recent){const m=await msg(t,ex.id);const matched=(m.labelIds||[]).map(l=>byLabel.get(l)).filter(Boolean) as Row[];if(matched.length===1){const out=applyGuide(ex.r,matched[0],'متزامن مع Gmail');if(JSON.stringify(out)!==JSON.stringify(ex.r.slice(0,15))){writes.push({range:`'العمليات'!A${ex.n}:O${ex.n}`,values:[out]});updated++;}}else if(matched.length===0){const out=clearGuide(ex.r,'أزيل تصنيف البند من Gmail');if(JSON.stringify(out)!==JSON.stringify(ex.r.slice(0,15))){writes.push({range:`'العمليات'!A${ex.n}:O${ex.n}`,values:[out]});unclassified++;}}else ambiguous++;}
 // حذف بند من دليل البنود لا يحذف العملية؛ فقط يزيل التصنيف المالي من السجل.
 ops.rows.forEach((r,i)=>{const item=txt(r[2]);if(!item||names.has(item))return;const out=clearGuide(r,'البند غير موجود في دليل البنود');writes.push({range:`'العمليات'!A${i+2}:O${i+2}`,values:[out]});unclassified++;});
 await batch(env,t,writes);return{updated,unclassified,ambiguous,checked:recent.length};}

export default{async fetch(request:Request,env:Env):Promise<Response>{const u=new URL(request.url);if(request.method==='OPTIONS')return current.fetch(request,env);try{
 if(u.pathname==='/api/items/update'&&request.method==='POST'){
   if(!(await auth(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
   const payload:any=await request.clone().json();const row=Number(payload?.row);const t=await token(env);const before=await read(env,t,'دليل البنود','A:L');const oldGuide=before.rows[row-2]||[];
   const base=await current.fetch(request,env);const baseData:any=await base.clone().json().catch(()=>({}));if(!base.ok)return base;
   const after=await read(env,t,'دليل البنود','A:L');const newGuide=after.rows[row-2]||[];const propagation=await propagateItem(env,t,oldGuide,newGuide);return json({...baseData,propagation},env);
 }
 if(u.pathname==='/api/sync/operations'&&request.method==='POST'){
   if(!(await auth(request,env)))return json({ok:false,error:'Unauthorized'},env,401);
   // router15 يضيف الرسائل المصنفة الجديدة ويحدث التصنيف الواضح بدون حذف أي سجل.
   const baseResp=await current.fetch(request.clone(),env);const base:any=await baseResp.json().catch(()=>({}));if(!baseResp.ok)return json(base,env,baseResp.status);
   const extra=await reconcileRemovals(env);
   return json({ok:true,added:Number(base.added||0),updated:Number(base.updated||0)+extra.updated,unclassified:extra.unclassified,ambiguous:Number(base.ambiguous||0)+extra.ambiguous,checked:Number(base.inspected||0)+extra.checked},env);
 }
 return current.fetch(request,env);
}catch(e:any){return json({ok:false,error:e?.message||String(e)},env,500);}}};
