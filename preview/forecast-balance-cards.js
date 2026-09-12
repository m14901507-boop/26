(()=>{
  const STORAGE_KEY='floosy-preview-expected-expenses-v2';

  function loadItems(){
    try{
      const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
      return Array.isArray(raw)?raw.filter(x=>x&&String(x.name||'').trim()&&Number.isFinite(Number(x.amount))&&Number(x.amount)>=0):[];
    }catch{return[];}
  }

  function saveItems(items){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(items));}catch{}
  }

  function totals(items){
    const monthly=items.filter(x=>x.period==='monthly').reduce((s,x)=>s+Number(x.amount||0),0);
    const annualOnly=items.filter(x=>x.period==='annual').reduce((s,x)=>s+Number(x.amount||0),0);
    // Annual forecast includes recurring monthly items for 12 months plus annual/one-time items.
    const annual=monthly*12+annualOnly;
    return{monthly,annualOnly,annual};
  }

  function statusText(remain){
    if(remain==null)return'لا يوجد رصيد مؤكد';
    return remain>=0?`يكفي الرصيد — يتبقى ${money(remain)}`:`الرصيد غير كافٍ — العجز ${money(Math.abs(remain))}`;
  }

  function metric(label,value,small,cls){
    return `<div class="metric ${cls||''}" data-forecast-card="1"><label>${esc(label)}</label><strong>${value==null?'—':money(value)}</strong><small>${esc(small||'')}</small></div>`;
  }

  function ensureStyle(){
    if(document.getElementById('expectedExpenseStyle'))return;
    const style=document.createElement('style');
    style.id='expectedExpenseStyle';
    style.textContent=`
      .expected-expense-panel{margin-top:0}
      .expected-expense-form{display:grid;grid-template-columns:minmax(160px,1.4fr) minmax(120px,.7fr) minmax(140px,.8fr) auto;gap:8px;align-items:end}
      .expected-expense-form label{display:grid;gap:5px;color:#b7b7b7;font-size:10px}
      .expected-expense-list{display:grid;gap:7px;margin-top:12px}
      .expected-expense-row{display:grid;grid-template-columns:minmax(130px,1fr) 100px 120px auto;gap:8px;align-items:center;padding:9px 10px;border:1px solid #292929;border-radius:11px;background:#080808}
      .expected-expense-row b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .expected-expense-row small{color:#aaa}
      .expected-expense-empty{color:#888;padding:8px 0}
      .expected-expense-note{margin:10px 0 0;color:#999;font-size:10px;line-height:1.7}
      @media(max-width:700px){.expected-expense-form{grid-template-columns:1fr 1fr}.expected-expense-form .expense-name{grid-column:1/-1}.expected-expense-form button{width:100%}.expected-expense-row{grid-template-columns:1fr auto}.expected-expense-row .expense-period,.expected-expense-row .expense-amount{font-size:11px}.expected-expense-row button{grid-column:2;grid-row:1/3}}
    `;
    document.head.appendChild(style);
  }

  function renderExpectedPanel(items){
    const dash=document.getElementById('dashboard');
    const kpi=document.getElementById('dashKpis');
    if(!dash||!kpi)return;
    let panel=document.getElementById('expectedExpensePanel');
    if(!panel){
      panel=document.createElement('div');
      panel.id='expectedExpensePanel';
      panel.className='panel expected-expense-panel';
      kpi.insertAdjacentElement('afterend',panel);
    }

    panel.innerHTML=`
      <h2>المصروفات المتوقعة</h2>
      <form id="expectedExpenseForm" class="expected-expense-form">
        <label class="expense-name">البند المتوقع<input id="expectedExpenseName" class="control" required placeholder="مثال: تأمين السيارة"></label>
        <label>المبلغ (ر.ع)<input id="expectedExpenseAmount" class="control" type="number" min="0" step="0.001" required placeholder="0.000"></label>
        <label>الفترة<select id="expectedExpensePeriod" class="control"><option value="monthly">شهري متكرر</option><option value="annual">سنوي / مرة خلال السنة</option></select></label>
        <button class="btn primary" type="submit">إضافة</button>
      </form>
      <div id="expectedExpenseList" class="expected-expense-list"></div>
      <p class="expected-expense-note">المتوقع السنوي = البنود السنوية + (البنود الشهرية × 12). الحساب يقارن المتوقع بآخر رصيد مؤكد للحساب المحدد في فلتر «الحساب»، أو بمجموع الأرصدة المؤكدة عند اختيار كل الحسابات.</p>
    `;

    const list=panel.querySelector('#expectedExpenseList');
    if(!items.length){
      list.innerHTML='<div class="expected-expense-empty">لا توجد بنود متوقعة بعد. أضف أول بند أعلاه.</div>';
    }else{
      list.innerHTML=items.map(x=>`
        <div class="expected-expense-row" data-id="${esc(x.id)}">
          <b>${esc(x.name)}</b>
          <span class="expense-amount">${money(Number(x.amount)||0)}</span>
          <small class="expense-period">${x.period==='annual'?'سنوي / مرة خلال السنة':'شهري متكرر'}</small>
          <button class="btn small" type="button" data-remove="${esc(x.id)}">حذف</button>
        </div>`).join('');
    }

    panel.querySelector('#expectedExpenseForm').addEventListener('submit',e=>{
      e.preventDefault();
      const name=String(panel.querySelector('#expectedExpenseName').value||'').trim();
      const amount=Number(panel.querySelector('#expectedExpenseAmount').value);
      const period=panel.querySelector('#expectedExpensePeriod').value==='annual'?'annual':'monthly';
      if(!name||!Number.isFinite(amount)||amount<0)return;
      const next=[...loadItems(),{id:`e${Date.now()}${Math.random().toString(36).slice(2,6)}`,name,amount,period}];
      saveItems(next);
      renderDashboard();
    });

    panel.querySelectorAll('[data-remove]').forEach(btn=>btn.addEventListener('click',()=>{
      const id=btn.getAttribute('data-remove');
      const next=loadItems().filter(x=>String(x.id)!==String(id));
      saveItems(next);
      renderDashboard();
    }));
  }

  function appendForecastCards(items){
    const host=document.getElementById('dashKpis');
    if(!host)return;
    host.querySelectorAll('[data-forecast-card="1"]').forEach(x=>x.remove());

    const t=totals(items);
    const sb=selectedBalance();
    const balance=sb.value==null?null:Number(sb.value);
    const monthlyRemain=balance==null?null:balance-t.monthly;
    const annualRemain=balance==null?null:balance-t.annual;

    host.insertAdjacentHTML('beforeend',[
      metric('إجمالي المتوقع الشهري',t.monthly,`${items.filter(x=>x.period==='monthly').length} بند شهري`,''),
      metric('الباقي بعد المتوقع الشهري',monthlyRemain,statusText(monthlyRemain),monthlyRemain!=null&&monthlyRemain<0?'red':'green'),
      metric('إجمالي المتوقع السنوي',t.annual,`${money(t.annualOnly)} سنوي + الشهري × 12`,''),
      metric('الباقي بعد المتوقع السنوي',annualRemain,statusText(annualRemain),annualRemain!=null&&annualRemain<0?'red':'green')
    ].join(''));
  }

  ensureStyle();
  const originalRenderDashboard=renderDashboard;
  renderDashboard=function(){
    originalRenderDashboard();
    const items=loadItems();
    appendForecastCards(items);
    renderExpectedPanel(items);
  };
})();
