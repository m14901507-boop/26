(()=>{
  const table=document.getElementById('itemTable');
  if(!table)return;

  async function reloadEverything(){
    const i=await req('/api/items?ts='+Date.now());
    DATA.items=i.rows||[];
    try{await req('/api/sync/operations',{method:'POST'});}catch{}
    await refresh();
    syncBudgetOptions();
    syncDependentFilters();
    renderAll();
  }

  table.addEventListener('click',async e=>{
    const b=e.target.closest?.('.save-item');
    if(!b)return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const tr=b.closest('tr[data-index]');
    if(!tr)return;
    const idx=Number(tr.dataset.index);
    const row=Number(tr.dataset.row)||idx+2;
    const budget=tr.querySelector('[data-f="budget"]')?.value||'';
    const category=tr.querySelector('[data-f="category"]')?.value||'';
    const period=tr.querySelector('[data-f="period"]')?.value||'';
    const scope=tr.querySelector('[data-f="scope"]')?.value||'';

    const old=b.textContent;
    b.disabled=true;
    b.textContent='جاري الحفظ…';
    try{
      setStatus('جاري حفظ البند وتحديث العمليات المرتبطة...');
      const r=await req('/api/items/update',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({row,changes:{legacyClassification:budget,category,period,scope}})
      });
      const i=await req('/api/items?ts='+Date.now());
      DATA.items=i.rows||[];
      const saved=DATA.items[idx]||[];
      const actual=String(saved[1]??'').trim();
      if(actual!==budget)throw new Error(`لم يتم حفظ الموازنة في الشيت. المتوقع: ${budget||'فارغ'}، الموجود: ${actual||'فارغ'}`);
      await reloadEverything();
      setStatus(`تم الحفظ والمزامنة — ${String(saved[0]||'البند')}${r?.propagation?` — تحديث ${Number(r.propagation.updated||0)} عملية`:''}`,true);
    }catch(err){
      setStatus(err?.message||String(err));
      b.disabled=false;
      b.textContent=old;
    }
  },true);
})();
