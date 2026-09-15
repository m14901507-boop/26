/* FLOOSY preview — confirmed balances become an explicit, user-controlled filter. */
(()=>{
  'use strict';
  const ALL='__all_confirmed_balances__';

  function rowsAndBalances(){
    let reg,bm;
    try{reg=accountRegistry();bm=balanceMap();}catch(_){return{rows:[],bm:new Map()};}
    const map=new Map();
    for(const ai of reg.values())if(ai&&ai.key)map.set(ai.key,{...ai});
    for(const b of bm.values())if(b&&b.key&&!map.has(b.key))map.set(b.key,{bank:b.bank,number:b.number,key:b.key,label:b.label});
    const rows=[...map.values()].sort((a,b)=>String(a.bank||'').localeCompare(String(b.bank||''),'ar')||String(a.number||'').localeCompare(String(b.number||''),'en',{numeric:true}));
    return{rows,bm};
  }

  function balanceDate(value){
    try{if(typeof parseBalanceDate==='function'){const d=parseBalanceDate(value);if(d)return d.toLocaleDateString('ar-OM');}}catch(_){}
    const d=new Date(value||0);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('ar-OM');
  }

  function ensureFilter(){
    const head=document.getElementById('focusBalanceHead'),grid=document.getElementById('focusBalanceGrid');
    if(!head||!grid)return null;
    const copy=head.querySelector('small');
    if(copy)copy.textContent='اختر الحساب أولًا لعرض رصيده المؤكد';
    let tools=document.getElementById('confirmedBalanceTools');
    if(!tools){
      tools=document.createElement('div');
      tools.id='confirmedBalanceTools';
      tools.className='confirmed-balance-tools';
      tools.innerHTML='<label for="confirmedBalanceFilter">عرض الرصيد المؤكد</label><select id="confirmedBalanceFilter" class="control confirmed-balance-select"><option value="">اختر الحساب</option></select>';
      const refresh=head.querySelector('.floosy-last-refresh');
      head.insertBefore(tools,refresh||null);
      tools.querySelector('select').addEventListener('change',renderConfirmedBalances);
    }
    return{head,grid,select:tools.querySelector('select')};
  }

  function hideStaticBalanceKpi(){
    document.querySelectorAll('#dashKpis .metric').forEach(card=>{
      const label=(card.querySelector('label')?.textContent||'').trim();
      card.classList.toggle('filtered-balance-kpi',label==='الرصيد المؤكد');
    });
  }

  function updateHero(choice,rows,bm){
    const stat=document.querySelector('#focusHero .focus-main .focus-stat');
    if(!stat)return;
    const label=stat.querySelector('span'),value=stat.querySelector('b');
    stat.classList.remove('good','warn','bad');
    if(!choice){
      stat.classList.add('warn');
      if(label)label.textContent='الرصيد المؤكد';
      if(value)value.textContent='اختر حسابًا';
      return;
    }
    if(choice===ALL){
      const confirmed=rows.map(ai=>bm.get(ai.key)).filter(Boolean);
      const total=confirmed.reduce((sum,b)=>sum+Number(b.balance||0),0);
      stat.classList.add(confirmed.length?'good':'warn');
      if(label)label.textContent='إجمالي الأرصدة المختارة';
      if(value)value.textContent=confirmed.length?money(total):'لا يوجد رصيد مؤكد';
      return;
    }
    const ai=rows.find(x=>x.key===choice),balance=bm.get(choice);
    stat.classList.add(balance?'good':'warn');
    if(label)label.textContent=ai?`${ai.bank} — حساب ${ai.number}`:'الرصيد المؤكد';
    if(value)value.textContent=balance?money(balance.balance):'غير مؤكد';
  }

  function card(ai,bm){
    const b=bm.get(ai.key),bank=esc(ai.bank||'حساب'),number=esc(ai.number||'—');
    return `<article class="focus-balance-card ${b?'confirmed':'missing'}">
      <div class="balance-card-head"><div><div class="bank">${bank}</div><div class="account">حساب ${number}</div></div><span class="balance-status">${b?'مؤكد':'غير مؤكد'}</span></div>
      <div class="value">${b?money(b.balance):'—'}</div>
      <div class="date">${b?`آخر رسالة: ${balanceDate(b.date)}`:'لا توجد رسالة رصيد مؤكدة لهذا الحساب'}</div>
    </article>`;
  }

  function renderConfirmedBalances(){
    const ui=ensureFilter();if(!ui)return;
    const {rows,bm}=rowsAndBalances(),previous=ui.select.value;
    ui.select.innerHTML='<option value="">اختر الحساب</option><option value="'+ALL+'">كل الحسابات</option>'+rows.map(ai=>`<option value="${esc(ai.key)}">${esc(ai.bank||'حساب')} — حساب ${esc(ai.number||'—')}${bm.has(ai.key)?' ✓':''}</option>`).join('');
    const valid=previous===ALL||rows.some(ai=>ai.key===previous);
    ui.select.value=valid?previous:'';
    const choice=ui.select.value;
    hideStaticBalanceKpi();
    updateHero(choice,rows,bm);
    if(!choice){
      ui.grid.innerHTML='<div class="focus-balance-empty"><span>◎</span><b>اختر حسابًا لعرض الرصيد المؤكد</b><small>لن تظهر بيانات الأرصدة قبل اختيارك من الفلتر.</small></div>';
      return;
    }
    const visible=choice===ALL?rows:rows.filter(ai=>ai.key===choice);
    ui.grid.innerHTML=visible.length?visible.map(ai=>card(ai,bm)).join(''):'<div class="focus-balance-empty"><span>!</span><b>لا توجد حسابات متاحة</b><small>حدّث البيانات ثم أعد المحاولة.</small></div>';
  }

  try{
    const previousRenderAll=renderAll;
    renderAll=function(){const result=previousRenderAll();renderConfirmedBalances();return result;};
  }catch(_){}
  try{
    const previousRefresh=refresh;
    refresh=async function(...args){const result=await previousRefresh(...args);renderConfirmedBalances();return result;};
    const refreshButton=document.getElementById('refresh');if(refreshButton)refreshButton.onclick=refresh;
  }catch(_){}
  document.getElementById('nav')?.addEventListener('click',event=>{
    const button=event.target.closest('[data-page]');
    if(button?.dataset.page==='accounts')requestAnimationFrame(()=>{const p=document.querySelector('.headline p');if(p)p.textContent='اختر الحساب لعرض رصيده المؤكد وحركة الأموال المرتبطة به.';});
  });
  renderConfirmedBalances();
})();
