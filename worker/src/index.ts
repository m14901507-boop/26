export interface Env {
  FRONTEND_ORIGIN?: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
  SPREADSHEET_ID: string;
  BUDGET_SHEET_NAME?: string;
  FLOOSY_PASSWORD: string;
}

type TokenResponse={access_token?:string;error?:string;error_description?:string};
type SessionPayload={v:1;exp:number};
type GmailHeader={name?:string;value?:string};
type GmailMessage={id?:string;snippet?:string;internalDate?:string;payload?:{headers?:GmailHeader[]}};

const SESSION_COOKIE='floosy_session';
const SESSION_SECONDS=60*60*24*30;
const encoder=new TextEncoder();

function corsHeaders(env:Env){return{
  'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'https://m14901507-boop.github.io',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type,Authorization',
  'Access-Control-Allow-Credentials':'true','Vary':'Origin'
};}
function json(data:unknown,env:Env,init:ResponseInit={}){return Response.json(data,{...init,headers:{...corsHeaders(env),...(init.headers||{})}});}
function base64UrlEncode(bytes:Uint8Array){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');}
function stringToBase64Url(value:string){return base64UrlEncode(encoder.encode(value));}
async function sessionKey(env:Env){return crypto.subtle.importKey('raw',encoder.encode(`${env.FLOOSY_PASSWORD||''}\n${env.GOOGLE_CLIENT_SECRET||''}`),{name:'HMAC',hash:'SHA-256'},false,['sign']);}
async function signValue(value:string,env:Env){const key=await sessionKey(env);const sig=await crypto.subtle.sign('HMAC',key,encoder.encode(value));return base64UrlEncode(new Uint8Array(sig));}
function safeEqual(a:string,b:string){const aa=encoder.encode(a),bb=encoder.encode(b);if(aa.length!==bb.length)return false;let d=0;for(let i=0;i<aa.length;i++)d|=aa[i]^bb[i];return d===0;}
async function createSession(env:Env){const payload:SessionPayload={v:1,exp:Math.floor(Date.now()/1000)+SESSION_SECONDS};const encoded=stringToBase64Url(JSON.stringify(payload));return `${encoded}.${await signValue(encoded,env)}`;}
function getCookie(request:Request,name:string){const cookie=request.headers.get('Cookie')||'';for(const part of cookie.split(';')){const [key,...rest]=part.trim().split('=');if(key===name)return rest.join('=');}return null;}
function getSessionToken(request:Request){const auth=request.headers.get('Authorization')||'';if(/^Bearer\s+/i.test(auth))return auth.replace(/^Bearer\s+/i,'').trim();return getCookie(request,SESSION_COOKIE);}
async function validSession(request:Request,env:Env){if(!env.FLOOSY_PASSWORD)return false;const token=getSessionToken(request);if(!token)return false;const dot=token.lastIndexOf('.');if(dot<=0)return false;const encoded=token.slice(0,dot),signature=token.slice(dot+1),expected=await signValue(encoded,env);if(!safeEqual(signature,expected))return false;try{const padded=encoded.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-encoded.length%4)%4);const raw=atob(padded);const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));const p=JSON.parse(new TextDecoder().decode(bytes)) as SessionPayload;return p.v===1&&p.exp>Math.floor(Date.now()/1000);}catch{return false;}}
async function passwordMatches(input:string,env:Env){if(!env.FLOOSY_PASSWORD)return false;const a=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(input))),b=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(env.FLOOSY_PASSWORD)));if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a[i]^b[i];return d===0;}

function requireConfig(env:Env){const m:string[]=[];if(!env.GOOGLE_CLIENT_ID)m.push('GOOGLE_CLIENT_ID');if(!env.GOOGLE_CLIENT_SECRET)m.push('GOOGLE_CLIENT_SECRET');if(!env.GOOGLE_REFRESH_TOKEN)m.push('GOOGLE_REFRESH_TOKEN');if(!env.SPREADSHEET_ID)m.push('SPREADSHEET_ID');return m;}
async function getGoogleAccessToken(env:Env){const body=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID.trim(),client_secret:env.GOOGLE_CLIENT_SECRET.trim(),refresh_token:env.GOOGLE_REFRESH_TOKEN.trim(),grant_type:'refresh_token'});const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});const d=await r.json().catch(()=>({})) as TokenResponse;if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||`OAuth ${r.status}`);return d.access_token;}
async function googleGet(url:string,token:string){const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error((d as any)?.error?.message||`Google API ${r.status}`);return d;}
async function googlePut(url:string,token:string,body:unknown){const r=await fetch(url,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error((d as any)?.error?.message||`Google API ${r.status}`);return d;}

async function readSheet(env:Env,sheetName:string,rangePart='A:Z'){
  const token=await getGoogleAccessToken(env);
  const range=encodeURIComponent(`'${sheetName}'!${rangePart}`);
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const d=await googleGet(url,token) as {values?:unknown[][]};
  const v=d.values||[];
  return{ok:true,sheet:sheetName,headers:v[0]||[],rows:v.slice(1),rowCount:Math.max(v.length-1,0)};
}
async function readBudgets(env:Env){return readSheet(env,env.BUDGET_SHEET_NAME||'موازنات الحسابات','A:H');}
async function readItems(env:Env){const data=await readSheet(env,'دليل البنود','A:L');return{...data,columns:{item:1,legacyClassification:2,system:3,movement:4,action:5,active:6,gmailLabelId:7,syncStatus:8,lastSync:9,category:10,period:11,scope:12}};}
async function readOperations(env:Env){return readSheet(env,'العمليات','A:O');}
async function updateItem(env:Env,payload:any){
  const row=Number(payload?.row);if(!Number.isInteger(row)||row<2)throw new Error('رقم صف البند غير صالح');
  const allowed:{[k:string]:number}={legacyClassification:2,system:3,movement:4,action:5,active:6,category:10,period:11,scope:12};
  const entries=Object.entries(payload?.changes||{}).filter(([k])=>allowed[k]);if(!entries.length)throw new Error('لا توجد تغييرات صالحة');
  const token=await getGoogleAccessToken(env);const updated:string[]=[];
  for(const [key,value] of entries){const col=allowed[key];let n=col,s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}const range=encodeURIComponent(`'دليل البنود'!${s}${row}`);const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values/${range}?valueInputOption=USER_ENTERED`;await googlePut(url,token,{range:`دليل البنود!${s}${row}`,majorDimension:'ROWS',values:[[value??'']]});updated.push(key);}
  return{ok:true,row,updated};
}

async function googleStatus(env:Env){const missing=requireConfig(env);if(missing.length)return{ok:false,configured:false,missing};await getGoogleAccessToken(env);return{ok:true,configured:true,oauth:'connected'};}
async function unreadGmail(env:Env){const token=await getGoogleAccessToken(env);const d=await googleGet('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is%3Aunread&maxResults=1',token) as {resultSizeEstimate?:number};return{ok:true,unread:Number(d.resultSizeEstimate||0)};}
function headerValue(m:GmailMessage,name:string){return(m.payload?.headers||[]).find(x=>(x.name||'').toLowerCase()===name.toLowerCase())?.value||'';}
function extractAmount(text:string){for(const p of[/(?:OMR|RO|O\.?R\.?)\s*([0-9][0-9,]*(?:\.[0-9]{1,3})?)/i,/([0-9][0-9,]*(?:\.[0-9]{1,3})?)\s*(?:OMR|RO|O\.?R\.?)/i]){const m=text.match(p);if(m?.[1])return Number(m[1].replace(/,/g,''));}return null;}
function extractBalance(text:string){for(const p of[/available\s+bal(?:ance)?\s*(?:is\s*)?(?:OMR|RO|O\.?R\.?)\s*([0-9,]+(?:\.[0-9]{1,3})?)/i,/balance\s*(?:is|:)?\s*(?:OMR|RO|O\.?R\.?)\s*([0-9,]+(?:\.[0-9]{1,3})?)/i]){const m=text.match(p);if(m?.[1])return Number(m[1].replace(/,/g,''));}return null;}
function detectOperationType(text:string){if(/POS Purchase|Debit Card.*utili[sz]ed|purchase/i.test(text))return'مصروف/شراء بالبطاقة';if(/\bcredited\b/i.test(text))return'دخل/تحويل وارد';if(/\bdebited\b/i.test(text))return'مصروف/تحويل صادر';if(/\b(withdrawal|withdrawn|ATM)\b/i.test(text))return'مصروف/سحب نقدي';return'غير محدد';}
function senderName(from:string){const m=from.match(/^\s*"?([^"<]+?)"?\s*</);return(m?.[1]||from.split('@')[0]||from).replace(/[<>]/g,'').trim();}
async function recentBankMessages(env:Env){
  const token=await getGoogleAccessToken(env);
  const q='newer_than:180d {OMR debited credited "debit card" "credit card" ATM transaction payment purchase withdrawal balance}';
  const list=await googleGet(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=8`,token) as {messages?:Array<{id?:string}>};
  const refs=(list.messages||[]).filter(x=>x.id).slice(0,8);
  const details=await Promise.all(refs.map(ref=>googleGet(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(ref.id as string)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,token) as Promise<GmailMessage>));
  const messages=details.map(message=>{const from=headerValue(message,'From'),subject=headerValue(message,'Subject'),date=headerValue(message,'Date')||(message.internalDate?new Date(Number(message.internalDate)).toISOString():'');const preview=(message.snippet||'').replace(/\s+/g,' ').trim(),combined=`${from}\n${subject}\n${preview}`;return{id:message.id||'',bank:senderName(from),from,subject,date,amount:extractAmount(combined),balance:extractBalance(combined),operationType:detectOperationType(combined),preview:preview.slice(0,700)};}).filter(x=>/OMR|debited|credited|transaction|purchase|payment|debit card|ATM|balance/i.test(`${x.subject} ${x.preview}`)).slice(0,8);
  return{ok:true,mode:'preview-only',savedToSheet:false,count:messages.length,messages};
}

export default{async fetch(request:Request,env:Env):Promise<Response>{const url=new URL(request.url);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(env)});try{
  if(url.pathname==='/'||url.pathname==='/health')return json({ok:true,service:'floosy-api',runtime:'cloudflare-workers',time:new Date().toISOString()},env);
  if(url.pathname==='/auth/login'&&request.method==='POST'){if(!env.FLOOSY_PASSWORD)return json({ok:false,error:'FLOOSY_PASSWORD is not configured'},env,{status:503});const body=await request.json().catch(()=>({})) as {password?:string};if(!body.password||!(await passwordMatches(body.password,env)))return json({ok:false,error:'كلمة المرور غير صحيحة'},env,{status:401});const session=await createSession(env);return json({ok:true,authenticated:true,session},env,{headers:{'Set-Cookie':`${SESSION_COOKIE}=${session}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${SESSION_SECONDS}`,'Cache-Control':'no-store'}});}
  if(url.pathname==='/auth/logout'&&request.method==='POST')return json({ok:true},env,{headers:{'Set-Cookie':`${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`}});
  if(url.pathname==='/auth/status')return json({ok:true,authenticated:await validSession(request,env)},env);
  if(url.pathname.startsWith('/api/')){
    if(!(await validSession(request,env)))return json({ok:false,error:'Unauthorized'},env,{status:401});
    if(url.pathname==='/api/google/status')return json(await googleStatus(env),env);
    if(url.pathname==='/api/budgets')return json(await readBudgets(env),env);
    if(url.pathname==='/api/items')return json(await readItems(env),env);
    if(url.pathname==='/api/operations')return json(await readOperations(env),env);
    if(url.pathname==='/api/items/update'&&request.method==='POST')return json(await updateItem(env,await request.json().catch(()=>({}))),env);
    if(url.pathname==='/api/gmail/unread')return json(await unreadGmail(env),env);
    if(url.pathname==='/api/gmail/recent-bank-messages')return json(await recentBankMessages(env),env);
    return json({ok:false,error:'Not found'},env,{status:404});
  }
  return json({ok:false,error:'Not found'},env,{status:404});
}catch(error:any){return json({ok:false,error:error?.message||String(error)},env,{status:500});}}};