(()=>{
  // دليل البنود: العمود B (index 1) هو المرجع الوحيد لنوع الموازنة/التصنيف.
  // لا تستنتج تصنيفًا من الفترة أو الصنف عند حذف التصنيف من Google Sheets.
  try{
    budgetForItem=function(r){
      const classification=String(r?.[1]??'').trim();
      return defs.includes(classification)?classification:'غير مصنف';
    };

    guide=function(){
      return new Map((DATA.items||[]).map(r=>[
        norm(r?.[0]),
        budgetForItem(r)
      ]));
    };

    // بعد تحميل/تحديث البنود أعد بناء الفلاتر والواجهة بالتصنيف الحقيقي.
    const reapply=()=>{
      try{
        syncBudgetOptions();
        syncDependentFilters();
        renderAll();
      }catch{}
    };

    document.getElementById('syncItemsNow')?.addEventListener('click',()=>setTimeout(reapply,900));
    document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(reapply,1200));
    document.addEventListener('click',e=>{
      if(e.target.closest?.('.save-item'))setTimeout(reapply,1300);
    },true);

    setTimeout(reapply,1200);
  }catch(e){console.error('classification-source-fix',e);}
})();
