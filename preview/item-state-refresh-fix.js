(()=>{
  const text=v=>String(v??'').trim();

  function itemsData(){
    try{return Array.isArray(DATA?.items)?DATA.items:[];}catch{return[];}
  }

  function diagnose(r){
    const classification=text(r?.[1]);
    const system=text(r?.[2]);
    const movement=text(r?.[3]);
    const action=text(r?.[4]);
    const active=text(r?.[5]);
    const gmailLabel=text(r?.[6]);
    const syncStatus=text(r?.[7]);
    const category=text(r?.[9]);
    const period=text(r?.[10]);
    const scope=text(r?.[11]);
    const combined=[classification,system,movement,action,syncStatus].join(' ');

    if(/^(لا|no|false|0|غير نشط)$/i.test(active))return{state:'inactive',reasons:['البند غير نشط']};
    if(/غير\s*مالي|non.?financial/i.test([system,movement,action,classification].join(' ')))return{state:'nonfinancial',reasons:['مصنف كغير مالي']};
    if(/تحويل\s*داخلي|تحويلات\s*داخلية|internal.?transfer/i.test(combined))return{state:'internal',reasons:['تحويل داخلي']};
    if(!gmailLabel)return{state:'nolabel',reasons:['لا يوجد معرف تصنيف Gmail']};

    const reasons=[];
    const isExpense=/مصروف|expense|شراء|purchase|سحب/i.test([movement,classification,action].join(' '));
    if(/يحتاج\s*مراجعة|بند\s*المراجعة|مراجعة|review/i.test(combined))reasons.push('حالة البند في دليل البنود تحتاج مراجعة');
    if(isExpense&&!category)reasons.push('الفئة غير محددة');
    if(isExpense&&!period)reasons.push('الفترة غير محددة');
    if(isExpense&&!scope)reasons.push('الصنف/النطاق غير محدد');
    if(!classification)reasons.push('التصنيف غير محدد');

    if(reasons.length)return{state:'review',reasons};
    return{state:'complete',reasons:[]};
  }

  const label={review:'يحتاج مراجعة',complete:'مكتمل',nonfinancial:'غير مالي',internal:'تحويل داخلي',inactive:'غير نشط',nolabel:'بدون تصنيف Gmail'};

  function decorate(){
    const items=itemsData();
    const rows=[...document.querySelectorAll('#itemTable tr[data-index]')];
    const wanted=document.getElementById('itemStateFilter')?.value||'';
    let visible=0;

    rows.forEach(tr=>{
      const idx=Number(tr.dataset.index),d=diagnose(items[idx]||[]),first=tr.querySelector('td');
      tr.dataset.itemState=d.state;
      const show=!wanted||d.state===wanted;
      tr.style.display=show?'':'none';
      if(show)visible++;

      if(!first)return;
      let badge=first.querySelector('.item-state-badge');
      if(!badge){badge=document.createElement('span');badge.className='item-state-badge';first.appendChild(document.createTextNode(' '));first.appendChild(badge);}
      badge.className='item-state-badge state-'+d.state;
      badge.textContent=label[d.state]||d.state;
      badge.title=d.reasons.join('، ');

      let reason=first.querySelector('.item-review-reason');
      if(d.state==='review'){
        if(!reason){reason=document.createElement('div');reason.className='item-review-reason';first.appendChild(reason);}
        reason.textContent=d.reasons.join('، ');
      }else if(reason)reason.remove();
    });

    const kpi=document.querySelector('#itemKpis .metric:first-child strong');
    if(kpi)kpi.textContent=String(wanted?visible:rows.length);
  }

  async function hardReloadItems(){
    try{
      const i=await req('/api/items?ts='+Date.now());
      DATA.items=i.rows||[];
      syncBudgetOptions();
      syncDependentFilters();
      renderAll();
      requestAnimationFrame(decorate);
      setStatus(`تم تحديث دليل البنود — ${DATA.items.length} بند`,true);
    }catch(e){setStatus(e.message||String(e));}
  }

  document.getElementById('syncItemsNow')?.addEventListener('click',()=>setTimeout(hardReloadItems,50));
  const table=document.getElementById('itemTable');
  if(table)new MutationObserver(()=>requestAnimationFrame(decorate)).observe(table,{childList:true,subtree:true});
  document.getElementById('itemStateFilter')?.addEventListener('change',decorate);
  setTimeout(decorate,900);

  const style=document.createElement('style');
  style.textContent=`
    .item-review-reason{margin-top:4px;color:#ffcf4a;font-size:8px;line-height:1.45;white-space:normal;max-width:280px}
    #itemTable tr[style*="display: none"]{display:none!important}
  `;
  document.head.appendChild(style);
})();
