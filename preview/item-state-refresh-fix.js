(()=>{
  const text=v=>String(v??'').trim();
  const low=v=>text(v).toLowerCase();

  function diagnose(r){
    const classification=text(r?.[1]);
    const system=text(r?.[2]);
    const movement=text(r?.[3]);
    const action=text(r?.[4]);
    const active=text(r?.[5]);
    const gmailLabel=text(r?.[6]);
    const category=text(r?.[9]);
    const period=text(r?.[10]);
    const scope=text(r?.[11]);
    const reasons=[];

    if(/^(لا|no|false|0|غير نشط)$/i.test(active))return{state:'inactive',reasons:['البند غير نشط']};
    if(/غير\s*مالي|non.?financial/i.test([system,movement,action].join(' ')))return{state:'nonfinancial',reasons:['مصنف كغير مالي']};
    if(/تحويل\s*داخلي|تحويلات\s*داخلية|internal.?transfer/i.test([system,movement,action,classification].join(' ')))return{state:'internal',reasons:['تحويل داخلي']};

    if(!gmailLabel)reasons.push('لا يوجد معرف Gmail');
    if(!classification)reasons.push('التصنيف غير محدد');
    if(!system)reasons.push('النظام غير محدد');
    if(!movement)reasons.push('نوع الحركة غير محدد');
    if(!action)reasons.push('الإجراء التلقائي غير محدد');

    const isExpense=/مصروف|expense|شراء|purchase|سحب/i.test([movement,classification,action].join(' '));
    if(isExpense&&!category)reasons.push('الفئة غير محددة');
    if(isExpense&&!period)reasons.push('الفترة غير محددة');
    if(isExpense&&!scope)reasons.push('النطاق غير محدد');
    if(/مراجعة|review/i.test([action,classification,system,movement].join(' ')))reasons.push('يوجد حقل مضبوط على مراجعة');

    if(reasons.length)return{state:'review',reasons};
    return{state:'complete',reasons:[]};
  }

  const label={review:'يحتاج مراجعة',complete:'مكتمل',nonfinancial:'غير مالي',internal:'تحويل داخلي',inactive:'غير نشط',nolabel:'بدون تصنيف Gmail'};

  function decorate(){
    const items=Array.isArray(window.DATA?.items)?window.DATA.items:[];
    document.querySelectorAll('#itemTable tr[data-index]').forEach(tr=>{
      const idx=Number(tr.dataset.index),d=diagnose(items[idx]||[]),first=tr.querySelector('td');
      tr.dataset.itemState=d.state;
      if(!first)return;
      let badge=first.querySelector('.item-state-badge');
      if(!badge){badge=document.createElement('span');badge.className='item-state-badge';first.appendChild(document.createTextNode(' '));first.appendChild(badge);}
      badge.className='item-state-badge state-'+d.state;
      badge.textContent=label[d.state]||d.state;
      badge.title=d.reasons.join('، ');

      let reason=first.querySelector('.item-review-reason');
      if(d.state==='review'){
        if(!reason){reason=document.createElement('div');reason.className='item-review-reason';first.appendChild(reason);}
        reason.textContent='سبب المراجعة: '+d.reasons.join('، ');
      }else if(reason)reason.remove();
    });

    const wanted=document.getElementById('itemStateFilter')?.value||'';
    let visible=0;
    document.querySelectorAll('#itemTable tr[data-index]').forEach(tr=>{
      const show=!wanted||tr.dataset.itemState===wanted;
      tr.style.display=show?'':'none';
      if(show)visible++;
    });
    const kpi=document.querySelector('#itemKpis .metric:first-child strong');
    if(kpi&&wanted)kpi.textContent=String(visible);
  }

  async function hardReloadItems(){
    try{
      const i=await req('/api/items?ts='+Date.now());
      DATA.items=i.rows||[];
      syncBudgetOptions();
      syncDependentFilters();
      renderAll();
      setTimeout(decorate,0);
      setStatus(`تم تحديث دليل البنود — ${DATA.items.length} بند`,true);
    }catch(e){setStatus(e.message||String(e));}
  }

  document.getElementById('syncItemsNow')?.addEventListener('click',()=>setTimeout(hardReloadItems,50));
  document.addEventListener('click',e=>{
    const save=e.target.closest?.('.save-item');
    if(save)setTimeout(hardReloadItems,1000);
  },true);

  const table=document.getElementById('itemTable');
  if(table)new MutationObserver(()=>setTimeout(decorate,0)).observe(table,{childList:true,subtree:true});
  document.getElementById('itemStateFilter')?.addEventListener('change',decorate);
  setTimeout(decorate,900);

  const style=document.createElement('style');
  style.textContent=`.item-review-reason{margin-top:4px;color:#ffcf4a;font-size:8px;line-height:1.45;white-space:normal;max-width:260px}`;
  document.head.appendChild(style);
})();
