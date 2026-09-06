(()=>{
  const topbar=document.querySelector('.topbar'),refreshBtn=document.getElementById('refresh');
  if(!topbar||!refreshBtn)return;
  const wrap=document.createElement('div');wrap.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center';
  const ops=document.createElement('button');ops.id='syncOperationsNow';ops.className='btn primary';ops.textContent='مزامنة العمليات';
  const items=document.createElement('button');items.id='syncItemsNow';items.className='btn';items.textContent='مزامنة البنود';
  const all=document.createElement('button');all.id='syncAllNow';all.className='btn';all.textContent='مزامنة الكل';
  refreshBtn.parentNode?.insertBefore(wrap,refreshBtn);wrap.append(ops,items,all,refreshBtn);

  let busy=false;
  async function run(path,button,silent=false){
    if(busy)return;
    busy=true;
    const old=button?.textContent||'';
    if(button){button.disabled=true;if(!silent)button.textContent='جاري المزامنة…';}
    try{
      const r=await req(path,{method:'POST'});
      if(r.historyId)localStorage.setItem('floosy_gmail_history_id',String(r.historyId));
      await refresh();
      if(!silent)setStatus(`تمت المزامنة — مصنف ${r.classified||0}، جديد ${r.added||0}، تحديث ${r.updated||0}، حذف ${r.removed||0}${r.ambiguous?`، تعارض ${r.ambiguous}`:''}`,true);
      return r;
    }catch(e){if(!silent)setStatus(e.message||String(e));}
    finally{busy=false;if(button){button.disabled=false;button.textContent=old;}}
  }

  ops.addEventListener('click',()=>run('/api/sync/operations',ops,false));
  items.addEventListener('click',()=>run('/api/sync/items',items,false));
  all.addEventListener('click',()=>run('/api/sync/all',all,false));

  // مزامنة تلقائية خفيفة: تبدأ بعد فتح الموقع ولا تؤخر تسجيل الدخول.
  async function autoSync(){
    if(document.visibilityState!=='visible'||!sessionStorage.getItem('floosy_preview_session')||busy)return;
    await run('/api/sync/operations',null,true);
  }
  setTimeout(autoSync,30000);
  setInterval(autoSync,300000);
})();