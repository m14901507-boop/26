(()=>{
  const text=v=>String(v??'').trim();
  const labels={review:'يحتاج مراجعة',complete:'مكتمل',nonfinancial:'غير مالي',internal:'تحويل داخلي',inactive:'غير نشط',nolabel:'بدون تصنيف Gmail'};
  function stateOf(r){
    const classification=text(r?.[1]),system=text(r?.[2]),movement=text(r?.[3]),action=text(r?.[4]),active=text(r?.[5]).toLowerCase(),gmailLabel=text(r?.[6]),category=text(r?.[9]),period=text(r?.[10]),scope=text(r?.[11]);
    const combined=[classification,system,movement,action].join(' ');
    if(/^(لا|no|false|0|غير نشط)$/i.test(active))return'inactive';
    if(/غير\s*مالي|non.?financial/i.test(combined))return'nonfinancial';
    if(/تحويل\s*داخلي|تحويلات\s*داخلية|internal.?transfer/i.test(combined))return'internal';
    if(!gmailLabel)return'nolabel';
    const expense=/مصروف|expense|شراء|purchase|سحب/i.test(combined);
    if(/مراجعة|review/i.test(combined)||!classification||(expense&&(!category||!period||!scope)))return'review';
    return'complete';
  }
  function ensureFilter(){
    if(document.getElementById('itemStateFilter'))return;
    const bar=document.querySelector('.filterbar');if(!bar)return;
    const w=document.createElement('div');w.className='filtergroup item-state-filter hidden';w.id='itemStateGroup';
    w.innerHTML='<label>حالة البند</label><select id="itemStateFilter" class="control"><option value="">كل البنود</option>'+Object.entries(labels).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')+'</select>';
    bar.appendChild(w);document.getElementById('itemStateFilter')?.addEventListener('change',apply);
  }
  function apply(){
    ensureFilter();const page=document.getElementById('items'),group=document.getElementById('itemStateGroup'),active=page?.classList.contains('active');
    if(group)group.classList.toggle('hidden',!active);if(!active)return;
    const wanted=document.getElementById('itemStateFilter')?.value||'',items=Array.isArray(DATA?.items)?DATA.items:[];let visible=0;
    document.querySelectorAll('#itemTable tr[data-index]').forEach(tr=>{
      const idx=Number(tr.dataset.index),state=stateOf(items[idx]||[]),show=!wanted||state===wanted;tr.dataset.itemState=state;tr.style.display=show?'':'none';if(show)visible++;
      const first=tr.querySelector('td');if(first){let badge=first.querySelector('.item-state-badge');if(!badge){badge=document.createElement('span');badge.className='item-state-badge';first.append(' ',badge);}badge.className='item-state-badge state-'+state;badge.textContent=labels[state]||state;}
    });
    const kpi=document.querySelector('#itemKpis .metric:first-child strong');if(kpi&&wanted)kpi.textContent=String(visible);
  }
  ensureFilter();
  document.getElementById('nav')?.addEventListener('click',()=>requestAnimationFrame(apply));
  document.getElementById('syncItemsNow')?.addEventListener('click',()=>setTimeout(apply,120));
  document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(apply,120));
  const originalRenderItems=renderItems;renderItems=function(){originalRenderItems();requestAnimationFrame(apply)};
  const style=document.createElement('style');style.textContent='.item-state-badge{display:inline-flex;margin-right:6px;padding:2px 7px;border-radius:999px;font-size:8px;font-weight:700;border:1px solid rgba(255,255,255,.12)}.state-review{color:#ffd95c}.state-complete{color:#5ce9b2}.state-internal{color:#68b8ff}.state-nolabel{color:#ff8a98}.state-nonfinancial,.state-inactive{color:#aeb8c5}';document.head.appendChild(style);
})();