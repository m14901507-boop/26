(()=>{
  const MONTHLY_BUDGETS=['عائلي شهري','شخصي شهري'];
  const ANNUAL_BUDGETS=['عائلي سنوي','شخصي سنوي'];

  function currentMonthKey(){
    return (document.getElementById('month')?.value||nowMonth());
  }

  function rowMonthKey(row){
    try{
      const d=parseDate(row?.[0]);
      if(d)return mk(d);
      const s=String(row?.[0]??'');
      const m=s.match(/(20\d{2})[-\/]?(0?[1-9]|1[0-2])/);
      return m?`${m[1]}-${String(Number(m[2])).padStart(2,'0')}`:'';
    }catch{return'';}
  }

  function expectedAmount(names,month){
    return names.reduce((sum,name)=>sum+(Number(budgetAmount(name,month))||0),0);
  }

  function budgetAccountKeys(names,month){
    const rows=Array.isArray(DATA.budgets)?DATA.budgets:[];
    const exact=rows.filter(r=>names.includes(String(r?.[2]??'').trim())&&rowMonthKey(r)===month);
    const source=exact.length?exact:rows.filter(r=>names.includes(String(r?.[2]??'').trim()));
    const keys=new Set();
    for(const r of source){
      const ai=accountInfo(`${r?.[1]??''} ${r?.[3]??''}`);
      if(ai&&ai.bank!=='غير محدد'&&ai.number!=='—')keys.add(ai.key);
    }
    return [...keys];
  }

  function confirmedFor(names,month){
    const bm=balanceMap();
    const keys=budgetAccountKeys(names,month);
    const vals=keys.map(k=>bm.get(k)).filter(x=>x&&Number.isFinite(Number(x.balance)));
    if(!vals.length)return{value:null,count:0,keys};
    return{value:vals.reduce((s,x)=>s+Number(x.balance),0),count:vals.length,keys};
  }

  function metric(label,value,small,cls){
    return `<div class="metric ${cls||''}"><label>${esc(label)}</label><strong>${value==null?'—':money(value)}</strong><small>${esc(small||'')}</small></div>`;
  }

  function appendForecastCards(){
    const host=document.getElementById('dashKpis');
    if(!host)return;
    host.querySelectorAll('[data-forecast-card="1"]').forEach(x=>x.remove());

    const month=currentMonthKey();
    const monthlyExpected=expectedAmount(MONTHLY_BUDGETS,month);
    const annualExpected=expectedAmount(ANNUAL_BUDGETS,month);
    const monthlyBalance=confirmedFor(MONTHLY_BUDGETS,month);
    const annualBalance=confirmedFor(ANNUAL_BUDGETS,month);
    const monthlyRemain=monthlyBalance.value==null?null:monthlyBalance.value-monthlyExpected;
    const annualRemain=annualBalance.value==null?null:annualBalance.value-annualExpected;

    const cards=[
      metric('المصروف المتوقع الشهري',monthlyExpected,'عائلي شهري + شخصي شهري',''),
      metric('الباقي المتوقع الشهري',monthlyRemain,monthlyBalance.value==null?'لا يوجد رصيد مؤكد لحساب شهري مخصص':`الرصيد المؤكد ${money(monthlyBalance.value)} − المتوقع الشهري` ,monthlyRemain!=null&&monthlyRemain<0?'red':'gold'),
      metric('المصروف المتوقع السنوي',annualExpected,'عائلي سنوي + شخصي سنوي',''),
      metric('الباقي المتوقع السنوي',annualRemain,annualBalance.value==null?'لا يوجد رصيد مؤكد لحساب سنوي مخصص':`الرصيد المؤكد السنوي ${money(annualBalance.value)} − المتوقع السنوي`,annualRemain!=null&&annualRemain<0?'red':'green')
    ];

    const box=document.createElement('div');
    box.style.display='contents';
    box.setAttribute('data-forecast-card','1');
    box.innerHTML=cards.join('');
    host.appendChild(box);
  }

  const originalRenderDashboard=renderDashboard;
  renderDashboard=function(){
    originalRenderDashboard();
    appendForecastCards();
  };
})();
