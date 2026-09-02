(()=>{
  const topbar=document.querySelector('.topbar');
  const refreshBtn=document.getElementById('refresh');
  if(!topbar||!refreshBtn)return;

  const wrap=document.createElement('div');
  wrap.style.display='flex';
  wrap.style.gap='8px';
  wrap.style.flexWrap='wrap';
  wrap.style.alignItems='center';

  const opsBtn=document.createElement('button');
  opsBtn.id='syncOperationsNow';
  opsBtn.className='btn primary';
  opsBtn.textContent='تحديث العمليات';

  const itemsBtn=document.createElement('button');
  itemsBtn.id='syncItemsNow';
  itemsBtn.className='btn';
  itemsBtn.textContent='تحديث البنود';

  refreshBtn.parentNode?.insertBefore(wrap,refreshBtn);
  wrap.appendChild(opsBtn);
  wrap.appendChild(itemsBtn);
  wrap.appendChild(refreshBtn);

  async function reloadItems(){
    itemsBtn.disabled=true;
    const old=itemsBtn.textContent;
    itemsBtn.textContent='جاري تحديث البنود…';
    try{
      setStatus('جاري تحديث دليل البنود من Google Sheets...');
      const i=await req('/api/items');
      DATA.items=i.rows||[];
      syncBudgetOptions();
      syncDependentFilters();
      renderAll();
      setStatus(`تم تحديث دليل البنود — ${DATA.items.length} بند`,true);
    }catch(e){setStatus(e.message||String(e));}
    finally{itemsBtn.disabled=false;itemsBtn.textContent=old;}
  }

  async function syncOperations(){
    opsBtn.disabled=true;
    const old=opsBtn.textContent;
    opsBtn.textContent='جاري مزامنة العمليات…';
    try{
      setStatus('جاري فحص الرسائل البنكية المصنفة حديثًا...');
      const r=await req('/api/sync/operations',{method:'POST'});
      setStatus(`تم فحص الرسائل — تمت إضافة ${Number(r.added||0)} عملية جديدة`,true);
      await refresh();
    }catch(e){setStatus(e.message||String(e));}
    finally{opsBtn.disabled=false;opsBtn.textContent=old;}
  }

  opsBtn.addEventListener('click',syncOperations);
  itemsBtn.addEventListener('click',reloadItems);

  document.addEventListener('click',e=>{
    const save=e.target.closest?.('.save-item');
    if(save)setTimeout(reloadItems,800);
  },true);
})();
