import current from './router3';
import type { Env } from './index';

function cors(env:Env){return{
  'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'https://m14901507-boop.github.io',
  'Access-Control-Allow-Headers':'Content-Type,Authorization',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Access-Control-Allow-Credentials':'true',
  'Vary':'Origin'
};}

async function authorized(request:Request,env:Env){
  const u=new URL(request.url);u.pathname='/auth/status';
  const r=await current.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env);
  const d:any=await r.json().catch(()=>({}));
  return Boolean(d?.authenticated);
}

async function accessToken(env:Env){
  const body=new URLSearchParams({
    client_id:env.GOOGLE_CLIENT_ID.trim(),
    client_secret:env.GOOGLE_CLIENT_SECRET.trim(),
    refresh_token:env.GOOGLE_REFRESH_TOKEN.trim(),
    grant_type:'refresh_token'
  });
  const r=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body
  });
  const d:any=await r.json().catch(()=>({}));
  if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||`OAuth ${r.status}`);
  return String(d.access_token);
}

function colName(col:number){
  let n=col,s='';
  while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}
  return s;
}

async function updateItemFixed(env:Env,payload:any){
  const row=Number(payload?.row);
  if(!Number.isInteger(row)||row<2)throw new Error('رقم صف البند غير صالح');

  const allowed:{[k:string]:number}={
    legacyClassification:2,
    system:3,
    movement:4,
    action:5,
    active:6,
    category:10,
    period:11,
    scope:12
  };
  const entries=Object.entries(payload?.changes||{}).filter(([k])=>allowed[k]);
  if(!entries.length)throw new Error('لا توجد تغييرات صالحة');

  const token=await accessToken(env);
  const updated:string[]=[];
  for(const [key,value] of entries){
    const cell=`'دليل البنود'!${colName(allowed[key])}${row}`;
    const encoded=encodeURIComponent(cell);
    const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values/${encoded}?valueInputOption=USER_ENTERED`;
    const r=await fetch(url,{
      method:'PUT',
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({range:cell,majorDimension:'ROWS',values:[[value??'']]})
    });
    const d:any=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d?.error?.message||`Google API ${r.status}`);
    updated.push(key);
  }
  return{ok:true,row,updated};
}

export default{
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(request.method==='OPTIONS')return current.fetch(request,env);

    if(url.pathname==='/api/items/update'&&request.method==='POST'){
      if(!(await authorized(request,env)))return Response.json({ok:false,error:'Unauthorized'},{status:401,headers:cors(env)});
      try{
        const payload=await request.json().catch(()=>({}));
        return Response.json(await updateItemFixed(env,payload),{headers:cors(env)});
      }catch(e:any){
        return Response.json({ok:false,error:e?.message||String(e)},{status:500,headers:cors(env)});
      }
    }

    return current.fetch(request,env);
  }
};
