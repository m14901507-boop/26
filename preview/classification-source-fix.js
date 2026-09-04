(()=>{
  // العمود B في دليل البنود هو المرجع الوحيد للتصنيف المالي.
  // القيمة الفارغة تعني: يحتاج تصنيف، وليست موازنة مستقلة.
  try{
    budgetForItem=function(r){
      const classification=String(r?.[1]??'').trim();
      return defs.includes(classification)?classification:'';
    };

    guide=function(){
      return new Map((DATA.items||[]).map(r=>[norm(r?.[0]),budgetForItem(r)]));
    };

    // مهم: لا نعيد ضبط قيمة قائمة الموازنة أثناء تحرير المستخدم.
    // renderItems يرسم القيمة الحالية من DATA، لذلك لا حاجة إلى MutationObserver يعيدها للخلف.
    const cleanEditors=()=>{
      document.querySelectorAll('#itemTable select[data-f="budget"]').forEach(sel=>{
        [...sel.options].forEach(o=>{if(o.value==='غير مصنف')o.remove();});
        if(![...sel.options].some(o=>o.value==='')){
          const o=document.createElement('option');o.value='';o.textContent='— يحتاج تصنيف —';sel.insertBefore(o,sel.firstChild);
        }
      });
    };

    const reapply=()=>{try{syncBudgetOptions();syncDependentFilters();renderAll();requestAnimationFrame(cleanEditors);}catch{}};
    document.getElementById('syncItemsNow')?.addEventListener('click',()=>setTimeout(reapply,500));
    document.getElementById('syncOperationsNow')?.addEventListener('click',()=>setTimeout(reapply,700));
    document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(reapply,700));
    setTimeout(reapply,900);
  }catch(e){console.error('classification-source-fix',e);}
})();
