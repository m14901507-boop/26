(()=>{
  const topbar=document.querySelector('.topbar'),refreshBtn=document.getElementById('refresh');
  if(!topbar||!refreshBtn)return;
  const wrap=document.createElement('div');wrap.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center';
  const ops=document.createElement('button');ops.id='syncOperationsNow';ops.className='btn primary';ops.textContent='مزامنة العمليات';
  const items=document.createElement('button');items.id='syncItemsNow';items.className='btn';items.textContent='مزامنة البنود';
  const all=document.createElement('button');all.id='syncAllNow';all.className='btn';all.textContent='مزامنة الكل';
  refreshBtn.parentNode?.insertBefore(wrap,refreshBtn);wrap.append(ops,items,all,refreshBtn);

  let busy=false;
  async function run(kind,button,silent=false){
    if(busy)return;
    busy=true;
    const old=button?.textContent||'';
    if(button){button.disabled=true;if(!silent)button.textContent='جاري المزامنة…';}
    try{
      let path='/api/sync/'+kind;
      if(kind==='operations'){
        const since=localStorage.getItem('floosy_gmail_history_id')||'';
        if(since)path+='?since='+encodeURIComponent(since);
      }
      const r=await req(path,{method:'POST'});
      if(r.historyId)localStorage.setItem('floosy_gmail_history_id',String(r.historyId));
      const changed=Number(r.changed??0)+Number(r.added||0)+Number(r.updated||0)+Number(r.removed||0);
      if(kind==='items'&&Number(r.updated||0)>0)await refresh();
      else if(kind==='all'||changed>0)await refresh();
      if(!silent){
        const partial=r.partial?' — المزامنة الشاملة جزئية بسبب حدود الخدمة':'';
        setStatus(`تمت المزامنة — جديد ${r.added||0}، تحديث ${r.updated||0}، حذف ${r.removed||0}${r.ambiguous?`، تعارض ${r.ambiguous}`:''}${partial}`,true);
      }
      return r;
    }catch(e){
      if(e&&e.status===401){
        sessionStorage.removeItem('floosy_preview_session');
        const loginBox=document.getElementById('loginBox');
        if(loginBox)loginBox.style.display='block';
        setStatus('انتهت جلسة FLOOSY. سجّل الدخول مرة أخرى.');
      }else if(!silent)setStatus(e.message||String(e));
    }
    finally{busy=false;if(button){button.disabled=false;button.textContent=old;}}
  }

  ops.addEventListener('click',()=>run('operations',ops,false));
  items.addEventListener('click',()=>run('items',items,false));
  all.addEventListener('click',()=>run('all',all,false));

  async function autoSync(){
    if(document.visibilityState!=='visible'||!(sessionStorage.getItem('floosy_preview_session')||localStorage.getItem('floosy_preview_session'))||busy)return;
    await run('operations',null,true);
  }
  // لا تبدأ أي مزامنة أثناء تسجيل الدخول أو مباشرة بعده.
  setTimeout(autoSync,120000);
  setInterval(autoSync,300000);
})();

