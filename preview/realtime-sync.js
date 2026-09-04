(()=>{
  let running=false,last=0;
  async function sync(reason='تلقائي'){
    if(running||document.hidden)return;
    const now=Date.now();
    if(reason==='تلقائي'&&now-last<55000)return;
    running=true;
    try{
      const r=await req('/api/sync/operations',{method:'POST'});
      const i=await req('/api/items?ts='+Date.now());
      DATA.items=i.rows||[];
      await refresh();
      syncBudgetOptions();
      syncDependentFilters();
      renderAll();
      last=Date.now();
      if(reason!=='تلقائي')setStatus(`تمت المزامنة — تحديث ${Number(r.updated||0)}، بدون تصنيف ${Number(r.unclassified||0)}`,true);
    }catch(e){
      if(reason!=='تلقائي')setStatus(e?.message||String(e));
    }finally{running=false;}
  }

  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(()=>sync('عودة للتبويب'),500);});
  window.addEventListener('focus',()=>setTimeout(()=>sync('عودة للتبويب'),700));
  setInterval(()=>sync('تلقائي'),60000);
  setTimeout(()=>sync('تلقائي'),5000);
  window.floosyRealtimeSync=sync;
})();
