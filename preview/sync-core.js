(()=>{
  const topbar=document.querySelector('.topbar'),refreshBtn=document.getElementById('refresh');
  if(!topbar||!refreshBtn)return;
  const wrap=document.createElement('div');wrap.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center';
  const ops=document.createElement('button');ops.id='syncOperationsNow';ops.className='btn primary';ops.textContent='مزامنة العمليات';
  const items=document.createElement('button');items.id='syncItemsNow';items.className='btn';items.textContent='مزامنة البنود';
  const all=document.createElement('button');all.id='syncAllNow';all.className='btn';all.textContent='مزامنة الكل';
  refreshBtn.parentNode?.insertBefore(wrap,refreshBtn);wrap.append(ops,items,all,refreshBtn);

  let busy=false,lastAuto=0;
  const hasSession=()=>Boolean(sessionStorage.getItem('floosy_preview_session')||localStorage.getItem('floosy_preview_session'));
  function showAuthError(e){
    if(e&&e.status===401){
      const loginBox=document.getElementById('loginBox');
      if(loginBox)loginBox.style.display='block';
      setStatus('انتهت جلسة FLOOSY. سجّل الدخول مرة أخرى.');
      return true;
    }
    return false;
  }
  function saveHistory(r){if(r&&r.historyId)localStorage.setItem('floosy_gmail_history_id',String(r.historyId));}

  async function fullOperations(button){
    if(busy)return;busy=true;
    const old=button.textContent;button.disabled=true;button.textContent='فحص جميع الرسائل…';
    try{
      const r=await req('/api/preview/sync/full',{method:'POST'});
      saveHistory(r);
      await refresh();
      setStatus(`مزامنة كاملة — فحص ${r.scanned||0} رسالة، جديد ${r.added||0}، تحديث ${r.updated||0}، موجود ${r.kept||0}${r.ambiguous?`، تعارض ${r.ambiguous}`:''}`,true);
    }catch(e){if(!showAuthError(e))setStatus(e.message||String(e));}
    finally{busy=false;button.disabled=false;button.textContent=old;}
  }

  async function syncItems(button,silent=false){
    if(busy)return;busy=true;
    const old=button?.textContent||'';if(button){button.disabled=true;if(!silent)button.textContent='تحديث البنود…';}
    try{
      const r=await req('/api/sync/items',{method:'POST'});saveHistory(r);
      if(Number(r.updated||0)>0)await refresh();
      if(!silent)setStatus(`تمت مزامنة البنود — تحديث ${r.updated||0} عملية`,true);
      return r;
    }catch(e){if(!showAuthError(e)&&!silent)setStatus(e.message||String(e));}
    finally{busy=false;if(button){button.disabled=false;button.textContent=old;}}
  }

  async function syncAll(button){
    if(busy)return;busy=true;
    const old=button.textContent;button.disabled=true;button.textContent='مزامنة شاملة…';
    try{
      const itemResult=await req('/api/sync/items',{method:'POST'});saveHistory(itemResult);
      const r=await req('/api/preview/sync/full',{method:'POST'});saveHistory(r);
      await refresh();
      setStatus(`مزامنة الكل — البنود ${itemResult.updated||0} تحديث، الرسائل ${r.scanned||0} مفحوصة، جديد ${r.added||0}، تحديث ${r.updated||0}${r.ambiguous?`، تعارض ${r.ambiguous}`:''}`,true);
    }catch(e){if(!showAuthError(e))setStatus(e.message||String(e));}
    finally{busy=false;button.disabled=false;button.textContent=old;}
  }

  async function autoSync(force=false){
    if(document.visibilityState!=='visible'||!hasSession()||busy)return;
    const now=Date.now();if(!force&&now-lastAuto<55000)return;
    busy=true;
    try{
      let path='/api/sync/operations';
      const since=localStorage.getItem('floosy_gmail_history_id')||'';
      if(since)path+='?since='+encodeURIComponent(since);
      const r=await req(path,{method:'POST'});saveHistory(r);lastAuto=Date.now();
      const changed=Number(r.changed??0)+Number(r.added||0)+Number(r.updated||0)+Number(r.removed||0);
      if(changed>0)await refresh();
    }catch(e){showAuthError(e);}
    finally{busy=false;}
  }

  ops.addEventListener('click',()=>fullOperations(ops));
  items.addEventListener('click',()=>syncItems(items,false));
  all.addEventListener('click',()=>syncAll(all));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(()=>autoSync(false),800);});
  window.addEventListener('focus',()=>setTimeout(()=>autoSync(false),1000));

  // Preview فقط: فحص تغييرات Gmail كل دقيقة أثناء فتح الموقع.
  setTimeout(()=>autoSync(true),30000);
  setInterval(()=>autoSync(false),60000);
})();
