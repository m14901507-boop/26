(()=>{
  const topbar=document.querySelector('.topbar'),refreshBtn=document.getElementById('refresh');
  if(!topbar||!refreshBtn)return;
  const wrap=document.createElement('div');wrap.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center';
  const ops=document.createElement('button');ops.id='syncOperationsNow';ops.className='btn primary';ops.textContent='تحديث العمليات';
  const items=document.createElement('button');items.id='syncItemsNow';items.className='btn';items.textContent='تحديث البنود';
  refreshBtn.parentNode?.insertBefore(wrap,refreshBtn);wrap.append(ops,items,refreshBtn);

  async function reloadItems(){items.disabled=true;const old=items.textContent;items.textContent='جاري تحديث البنود…';try{const i=await req('/api/items?ts='+Date.now());DATA.items=i.rows||[];syncBudgetOptions();syncDependentFilters();renderAll();setStatus(`تم تحديث دليل البنود — ${DATA.items.length} بند`,true);}catch(e){setStatus(e.message||String(e));}finally{items.disabled=false;items.textContent=old;}}

  async function syncOps(full=false,silent=false){if(ops.disabled)return;ops.disabled=true;const old=ops.textContent;if(!silent)ops.textContent='جاري المزامنة…';try{const since=localStorage.getItem('floosy_gmail_history_id')||'';const q=new URLSearchParams();if(since&&!full)q.set('since',since);if(full)q.set('full','1');const r=await req('/api/sync/operations?'+q.toString(),{method:'POST'});if(r.historyId)localStorage.setItem('floosy_gmail_history_id',String(r.historyId));const changed=Number(r.added||0)+Number(r.updated||0)+Number(r.cleared||0)+Number(r.guideUpdated||0);if(changed){await refresh();if(!silent)setStatus(`تمت المزامنة — جديد ${r.added||0}، تحديث ${r.updated||0}، بدون تصنيف ${r.cleared||0}`,true);}else if(!silent)setStatus('لا توجد تغييرات جديدة',true);return r;}catch(e){if(!silent)setStatus(e.message||String(e));}finally{ops.disabled=false;ops.textContent=old;}}

  ops.addEventListener('click',()=>syncOps(true,false));
  items.addEventListener('click',reloadItems);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncOps(false,true);});
  setInterval(()=>{if(document.visibilityState==='visible')syncOps(false,true);},60000);
  setTimeout(()=>syncOps(false,true),5000);
})();