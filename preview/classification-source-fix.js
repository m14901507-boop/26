(()=>{
  // العمود B في دليل البنود هو المرجع الوحيد للتصنيف المالي.
  // القيمة الفارغة تعني: يحتاج تصنيف، وليست موازنة مستقلة.
  try{
    budgetForItem=function(r){
      const classification=String(r?.[1]??'').trim();
      return defs.includes(classification)?classification:'';
    };

    guide=function(){
      return new Map((DATA.items||[]).map(r=>[
        norm(r?.[0]),
        budgetForItem(r)
      ]));
    };

    function fixItemBudgetEditors(){
      document.querySelectorAll('#itemTable select[data-f="budget"]').forEach(sel=>{
        [...sel.options].forEach(o=>{if(o.value==='غير مصنف')o.remove();});
        if(![...sel.options].some(o=>o.value==='')){
          const o=document.createElement('option');
          o.value='';
          o.textContent='— يحتاج تصنيف —';
          sel.insertBefore(o,sel.firstChild);
        }
        const tr=sel.closest('tr[data-index]');
        const idx=Number(tr?.dataset.index);
        const classification=String(DATA.items?.[idx]?.[1]??'').trim();
        sel.value=defs.includes(classification)?classification:'';
      });
    }

    const reapply=()=>{
      try{
        syncBudgetOptions();
        syncDependentFilters();
        renderAll();
        setTimeout(fixItemBudgetEditors,0);
      }catch{}
    };

    const table=document.getElementById('itemTable');
    if(table)new MutationObserver(()=>setTimeout(fixItemBudgetEditors,0)).observe(table,{childList:true,subtree:true});
    document.getElementById('syncItemsNow')?.addEventListener('click',()=>setTimeout(reapply,900));
    document.getElementById('syncOperationsNow')?.addEventListener('click',()=>setTimeout(reapply,1200));
    document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(reapply,1200));
    document.addEventListener('click',e=>{
      if(e.target.closest?.('.save-item'))setTimeout(reapply,1300);
    },true);

    setTimeout(reapply,1200);
  }catch(e){console.error('classification-source-fix',e);}
})();
