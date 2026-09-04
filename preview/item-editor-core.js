(()=>{
  const table=document.getElementById('itemTable');
  if(!table)return;

  table.addEventListener('click',async e=>{
    const b=e.target.closest?.('.save-item');
    if(!b)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const tr=b.closest('tr[data-row][data-index]');
    if(!tr)return;
    const row=Number(tr.dataset.row);
    const budget=tr.querySelector('[data-f="budget"]')?.value||'';
    const category=tr.querySelector('[data-f="category"]')?.value||'';
    const period=tr.querySelector('[data-f="period"]')?.value||'';
    const scope=tr.querySelector('[data-f="scope"]')?.value||'';
    const old=b.textContent;
    b.disabled=true;b.textContent='جاري الحفظ…';
    try{
      setStatus('جاري حفظ البند وتحديث العمليات المرتبطة...');
      const r=await req('/api/items/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({row,changes:{legacyClassification:budget,category,period,scope}})});
      const i=await req('/api/items?ts='+Date.now());
      DATA.items=i.rows||[];
      await refresh();
      setStatus(`تم حفظ البند — تم تحديث ${Number(r.propagated||0)} عملية مرتبطة`,true);
    }catch(err){setStatus(err.message||String(err));b.disabled=false;b.textContent=old;}
  },true);
})();