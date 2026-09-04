(()=>{
  function stateOf(r){
    const text=v=>String(v??'').trim();
    const low=v=>text(v).toLowerCase();
    const classification=text(r?.[1]);
    const system=low(r?.[2]);
    const movement=low(r?.[3]);
    const action=low(r?.[4]);
    const active=low(r?.[5]);
    const gmailLabel=text(r?.[6]);
    const category=text(r?.[9]);
    const period=text(r?.[10]);
    const scope=text(r?.[11]);

    if(/^(لا|no|false|0|غير نشط)$/.test(active))return 'inactive';
    if(/غير\s*مالي|non.?financial/.test(system+' '+movement+' '+action))return 'nonfinancial';
    if(/تحويل\s*داخلي|تحويلات\s*داخلية|internal.?transfer/.test(system+' '+movement+' '+action+' '+classification))return 'internal';
    if(!gmailLabel)return 'nolabel';

    const isExpense=/مصروف|expense|شراء|purchase|سحب/.test(movement+' '+classification+' '+action);
    const missingCore=!classification||!system||!movement||!action;
    const missingAnalytics=isExpense&&(!category||!period||!scope);
    if(missingCore||missingAnalytics||/مراجعة|review/.test(action+' '+classification+' '+system+' '+movement))return 'review';
    return 'complete';
  }

  const labels={
    all:'كل البنود',
    review:'يحتاج مراجعة',
    complete:'مكتمل',
    nonfinancial:'غير مالي',
    internal:'تحويل داخلي',
    inactive:'غير نشط',
    nolabel:'بدون تصنيف Gmail'
  };

  function ensureFilter(){
    if(document.getElementById('itemStateFilter'))return;
    const filterbar=document.querySelector('.filterbar');
    if(!filterbar)return;
    const wrap=document.createElement('div');
    wrap.className='filtergroup item-state-filter hidden';
    wrap.id='itemStateGroup';
    wrap.innerHTML='<label>حالة البند</label><select id="itemStateFilter" class="control">'+Object.entries(labels).map(([v,l])=>`<option value="${v==='all'?'':v}">${l}</option>`).join('')+'</select>';
    filterbar.appendChild(wrap);
    document.getElementById('itemStateFilter').addEventListener('change',apply);
  }

  function currentItems(){
    try{return Array.isArray(DATA?.items)?DATA.items:[];}catch{return[];}
  }

  function apply(){
    ensureFilter();
    const group=document.getElementById('itemStateGroup');
    const page=document.getElementById('items');
    const active=page?.classList.contains('active');
    if(group)group.classList.toggle('hidden',!active);
    if(!active)return;

    const wanted=document.getElementById('itemStateFilter')?.value||'';
    const rows=[...document.querySelectorAll('#itemTable tr[data-index]')];
    const items=currentItems();
    let visible=0;
    for(const tr of rows){
      const idx=Number(tr.dataset.index);
      const state=stateOf(items[idx]||[]);
      const show=!wanted||state===wanted;
      tr.style.display=show?'':'none';
      tr.dataset.itemState=state;
      if(show)visible++;
    }

    const kpi=document.querySelector('#itemKpis .metric:first-child strong');
    if(kpi&&wanted)kpi.textContent=String(visible);
  }

  function decorateRows(){
    const items=currentItems();
    for(const tr of document.querySelectorAll('#itemTable tr[data-index]')){
      const idx=Number(tr.dataset.index),state=stateOf(items[idx]||[]);
      tr.dataset.itemState=state;
      const first=tr.querySelector('td');
      if(first&&!first.querySelector('.item-state-badge')){
        const badge=document.createElement('span');
        badge.className='item-state-badge state-'+state;
        badge.textContent=labels[state]||state;
        first.appendChild(document.createTextNode(' '));
        first.appendChild(badge);
      }
    }
  }

  function refreshView(){decorateRows();apply();}
  ensureFilter();
  setTimeout(refreshView,700);

  const table=document.getElementById('itemTable');
  if(table)new MutationObserver(()=>setTimeout(refreshView,0)).observe(table,{childList:true,subtree:true});

  document.getElementById('nav')?.addEventListener('click',()=>setTimeout(refreshView,60));
  document.getElementById('refreshItems')?.addEventListener('click',()=>setTimeout(refreshView,500));
  document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(refreshView,900));

  const style=document.createElement('style');
  style.textContent=`
    .item-state-badge{display:inline-flex;align-items:center;margin-right:6px;padding:2px 7px;border-radius:999px;font-size:8px;font-weight:700;border:1px solid rgba(255,255,255,.12);vertical-align:middle}
    .state-review{color:#ffd95c;background:rgba(255,201,40,.10);border-color:rgba(255,201,40,.30)}
    .state-complete{color:#5ce9b2;background:rgba(33,211,139,.10);border-color:rgba(33,211,139,.28)}
    .state-nonfinancial,.state-inactive{color:#aeb8c5;background:rgba(174,184,197,.08)}
    .state-internal{color:#68b8ff;background:rgba(22,135,255,.10);border-color:rgba(22,135,255,.30)}
    .state-nolabel{color:#ff8a98;background:rgba(255,68,88,.10);border-color:rgba(255,68,88,.28)}
  `;
  document.head.appendChild(style);
})();
