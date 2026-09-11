import current from './router36';
import type { Env } from './index';

const LIVE_MEMBER='https://m14901507-boop.github.io/26/preview/association-member-live.html';
function liveUrl(token:string){return `${LIVE_MEMBER}?t=${encodeURIComponent(String(token||''))}&v=20260912-4`;}

export default {async fetch(request:Request,env:Env):Promise<Response>{
  const u=new URL(request.url);
  if(u.pathname==='/api/preview/associations'&&request.method==='GET'){
    const resp=await current.fetch(request,env);if(!resp.ok)return resp;
    const data:any=await resp.clone().json().catch(()=>null);if(!data?.ok)return resp;
    if(Array.isArray(data.members))data.members=data.members.map((m:any)=>({...m,publicUrl:m?.publicToken?liveUrl(m.publicToken):m.publicUrl}));
    const headers=new Headers(resp.headers);headers.set('Cache-Control','no-store');
    return Response.json(data,{status:resp.status,headers});
  }
  if(u.pathname==='/api/preview/associations/member/upsert'&&request.method==='POST'){
    const resp=await current.fetch(request,env);if(!resp.ok)return resp;
    const data:any=await resp.clone().json().catch(()=>null);if(!data?.ok)return resp;
    if(data.publicToken)data.publicUrl=liveUrl(data.publicToken);
    const headers=new Headers(resp.headers);headers.set('Cache-Control','no-store');
    return Response.json(data,{status:resp.status,headers});
  }
  return current.fetch(request,env);
}};
