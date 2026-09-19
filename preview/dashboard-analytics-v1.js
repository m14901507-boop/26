/* FLOOSY preview — focused financial comparison and top-spend analytics. */
(()=>{
  'use strict';

  const number=value=>Number.isFinite(Number(value))?Number(value):0;
  const percent=value=>Number.isFinite(value)?`${Math.round(value*100)}%`:'—';

  function periodProgress(s){
    const keys=Array.isArray(s?.keys)?s.keys:[];
    if(!keys.length)return 1;
    let start,end;
    if(s.f?.week&&keys.length===1){
      const [year,month]=keys[0].split('-').map(Number);
      const week=Math.max(1,Number(s.f.week)||1);
      start=new Date(year,month-1,(week-1)*7+1,0,0,0,0);
      end=new Date(year,month-1,Math.min(week*7,new Date(year,month,0).getDate()),23,59,59,999);
    }else{
      const [startYear,startMonth]=keys[0].split('-').map(Number);
      const [endYear,endMonth]=keys[keys.length-1].split('-').map(Number);
      start=new Date(startYear,startMonth-1,1,0,0,0,0);
      end=new Date(endYear,endMonth,0,23,59,59,999);
    }
    const now=new Date();
    if(now<=start)return 0;
    if(now>=end)return 1;
    return Math.min(1,Math.max(0,(now-start)/(end-start)));
  }

  function forecastSpend(s){
    const spent=Math.max(0,number(s?.spent));
    const progress=periodProgress(s);
    if(progress>0.08&&progress<1)return spent/progress;
    return spent;
  }

  function usageState(limit,used,noun){
    const safeLimit=number(limit),safeUsed=Math.max(0,number(used));
    if(!(safeLimit>0)){
      return safeUsed>0
        ?{key:'bad',label:`يتجاوز ${noun}`,note:`لا توجد قيمة متاحة لـ ${noun}`,ratio:null}
        :{key:'neutral',label:`${noun} غير محدد`,note:'أضف القيمة لإظهار النسبة والمقارنة',ratio:null};
    }
    const ratio=safeUsed/safeLimit;
    if(ratio>=1)return{key:'bad',label:`يتجاوز ${noun}`,note:`التجاوز ${money(safeUsed-safeLimit)}`,ratio};
    if(ratio>=.8)return{key:'warn',label:`قريب من ${noun}`,note:`المتاح ${money(safeLimit-safeUsed)}`,ratio};
    return{key:'good',label:'متاح',note:`المتاح ${money(safeLimit-safeUsed)}`,ratio};
  }

  function contextText(s){
    const account=s.f.account?(accountRegistry().get(s.f.account)?.label||s.f.account):'اختر حسابًا';
    const budget=s.f.budget||'كل الموازنات';
    return `${account} · ${budget} · ${s.label}`;
  }

  function comparisonBlock({eyebrow,title,limitLabel,limit,usedLabel,used,differenceLabel,difference,state,progress}){
    const width=state.ratio==null?0:Math.min(100,Math.max(0,state.ratio*100));
    return `<section class="finance-comparison" data-state="${state.key}">
      <div class="finance-comparison-head">
        <div><span>${esc(eyebrow)}</span><h3>${esc(title)}</h3></div>
        <div class="finance-state"><b>${esc(state.label)}</b><small>${state.ratio==null?'—':percent(state.ratio)}</small></div>
      </div>
      <div class="finance-values">
        <div><span>${esc(usedLabel)}</span><b>${used==null?'—':money(used)}</b></div>
        <div><span>${esc(limitLabel)}</span><b>${limit==null?'—':money(limit)}</b></div>
        <div class="finance-difference"><span>${esc(differenceLabel)}</span><b>${difference==null?'—':money(difference)}</b></div>
      </div>
      <div class="finance-meter" role="progressbar" aria-label="${esc(title)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(width)}"><i style="width:${width}%"></i></div>
      <div class="finance-note"><span>${esc(state.note)}</span><small>${esc(progress||'')}</small></div>
    </section>`;
  }

  function topSpendRows(s){
    const rows=(s.st||[]).slice(0,10),max=Math.max(1,...rows.map(row=>number(row.total))),total=Math.max(0,number(s.spent));
    if(!rows.length)return'<div class="analytics-empty"><span>◎</span><b>لا توجد مصروفات مطابقة</b><small>غيّر الفترة أو الحساب أو الموازنة.</small></div>';
    return rows.map((row,index)=>{
      const share=total>0?number(row.total)/total:0;
      const width=Math.min(100,number(row.total)/max*100);
      return `<div class="top-spend-row">
        <span class="top-spend-rank">${index+1}</span>
        <div class="top-spend-main"><div class="top-spend-label"><b>${esc(row.item||'غير مصنف')}</b><span>${row.count} ${row.count===1?'عملية':'عمليات'}</span></div><div class="top-spend-track"><i style="width:${width}%"></i></div></div>
        <div class="top-spend-value"><b>${money(row.total)}</b><span>${percent(share)} من المصروف</span></div>
      </div>`;
    }).join('');
  }

  function ensureShell(){
    const dashboard=document.getElementById('dashboard');
    const anchor=document.getElementById('focusHero')||document.getElementById('dashKpis');
    if(!dashboard||!anchor)return null;
    let shell=document.getElementById('dashboardAnalytics');
    if(!shell){
      shell=document.createElement('div');
      shell.id='dashboardAnalytics';
      shell.className='financial-analytics-shell';
      dashboard.insertBefore(shell,anchor);
    }
    dashboard.classList.add('analytics-dashboard-ready');
    return shell;
  }

  function renderAnalytics(){
    const shell=ensureShell();
    if(!shell)return;
    let s;
    try{s=summary();}catch(_){return;}
    const spent=Math.max(0,number(s.spent));
    const budget=Math.max(0,number(s.budgetTotal));
    const budgetDifference=budget-spent;
    const budgetState=usageState(budget,spent,'الموازنة');
    const expected=forecastSpend(s);
    const progress=periodProgress(s);
    const accountSelected=Boolean(s.f.account);
    let selected={value:null,label:'اختر حسابًا'};
    try{selected=selectedBalance();}catch(_){ }
    const balance=accountSelected&&selected.value!=null?number(selected.value):null;
    const balanceDifference=balance==null?null:balance-expected;
    const balanceState=balance==null
      ?{key:'neutral',label:accountSelected?'لا يوجد رصيد مؤكد':'اختر حسابًا',note:accountSelected?'حدّث بيانات الرصيد المؤكد لهذا الحساب':'اختر الحساب من الفلتر لعرض المقارنة',ratio:null}
      :usageState(balance,expected,'الرصيد المؤكد');
    const top=(s.st||[])[0];

    shell.innerHTML=`
      <article class="analytics-card financial-card">
        <header class="analytics-card-head"><div><span class="analytics-eyebrow">القرار المالي</span><h2>ملخص الفترة المختارة</h2><p>${esc(contextText(s))}</p></div><span class="analytics-live-dot">مباشر</span></header>
        <div class="finance-comparisons">
          ${comparisonBlock({eyebrow:'الصرف الفعلي',title:'المصروفات مقابل الموازنة',limitLabel:'الموازنة',limit:budget,usedLabel:'المصروفات',used:spent,differenceLabel:budgetDifference>=0?'المتاح':'التجاوز',difference:Math.abs(budgetDifference),state:budgetState,progress:`الفترة: ${s.label}`})}
          ${comparisonBlock({eyebrow:'التوقع الذكي',title:'المتوقع مقابل الرصيد المؤكد',limitLabel:'الرصيد المؤكد الآن',limit:balance,usedLabel:'المصروف المتوقع',used:expected,differenceLabel:balanceDifference==null?'الفرق':balanceDifference>=0?'المتاح':'التجاوز',difference:balanceDifference==null?null:Math.abs(balanceDifference),state:balanceState,progress:progress>0&&progress<1?`اكتمل ${percent(progress)} من الفترة`:'وفق نتائج الفترة المحددة'})}
        </div>
      </article>
      <article class="analytics-card spending-card">
        <header class="analytics-card-head"><div><span class="analytics-eyebrow">تحليل المصروفات</span><h2>أعلى 10 بنود صرفًا</h2><p>${esc(s.label)} · النتائج تتبع الفلاتر الحالية</p></div></header>
        <div class="spending-summary"><div><span>أكثر بند صرفًا</span><b>${top?esc(top.item):'—'}</b><small>${top?money(top.total):'لا توجد بيانات'}</small></div><div><span>عدد العمليات</span><b>${s.ops.length}</b><small>عملية مطابقة للفلاتر</small></div></div>
        <div class="top-spend-chart" aria-label="أعلى عشرة بنود صرفًا">${topSpendRows(s)}</div>
      </article>`;
  }

  try{
    const previousRenderDashboard=renderDashboard;
    renderDashboard=function(){const result=previousRenderDashboard();renderAnalytics();return result;};
  }catch(_){ }

  renderAnalytics();
  window.addEventListener('load',renderAnalytics,{once:true});
  window.setTimeout(renderAnalytics,700);
})();
