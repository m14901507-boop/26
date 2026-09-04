(()=>{
  const table=document.getElementById('itemTable');
  if(!table)return;

  table.onclick=async e=>{
    const b=e.target.closest?.('.save-item');
    if(!b)return;
    const tr=b.closest('tr[data-row][data-index]');
    if(!tr)return;

    const row=Number(tr.dataset.row),idx=Number(tr.dataset.index);
    const budget=tr.querySelector('[data-f="budget"]')?.value||'';
    const category=tr.querySelector('[data-f="category"]')?.value||'';
    const period=tr.querySelector('[data-f="period"]')?.value||'';
    const scope=tr.querySelector('[data-f="scope"]')?.value||'';

    const old=b.textContent;
    b.disabled=true;
    b.textContent='جاري الحفظ…';
    try{
      setStatus('جاري حفظ البند في Google Sheets...');
      await req('/api/items/update',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({row,changes:{legacyClassification:budget,category,period,scope}})
      });

      const i=await req('/api/items?ts='+Date.now());
      DATA.items=i.rows||[];
      const saved=DATA.items[idx]||[];
      const actual=String(saved[1]??'').trim();
      if(actual!==budget)throw new Error(`تم الإرسال لكن قيمة التصنيف في الشيت لم تتطابق. المتوقع: ${budget||'فارغ'}، الموجود: ${actual||'فارغ'}`);

      syncBudgetOptions();
      syncDependentFilters();
      renderAll();
      setStatus(`تم حفظ البند بنجاح — ${String(saved[0]||'')}`,true);
    }catch(err){
      setStatus(err.message||String(err));
      b.disabled=false;
      b.textContent=old;
    }
  };
})();
