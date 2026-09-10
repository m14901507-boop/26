(()=>{
  const style=document.createElement('style');
  style.id='floosy-focus-style';
  style.textContent=`
  body{font-family:"Segoe UI",Tahoma,Arial,sans-serif!important}
  .main{max-width:1680px;width:100%;margin-inline:auto}
  .topbar{position:sticky;top:10px;z-index:40;padding:12px 14px!important;border:1px solid rgba(255,255,255,.10)!important;border-radius:16px;background:rgba(5,9,14,.88)!important;backdrop-filter:blur(20px) saturate(140%);box-shadow:0 14px 38px rgba(0,0,0,.28)!important}
  .headline p{font-size:11px!important;line-height:1.65;color:#9fb0c4!important}
  .sync{align-items:center!important;min-height:48px;padding:9px 13px!important}
  .page{gap:16px!important}
  .filterbar{padding:14px!important;gap:11px!important;border-radius:17px!important}
  .metric{min-height:102px!important;padding:14px!important}
  .metric label{font-size:10px!important;letter-spacing:.1px}.metric strong{font-size:22px!important}.metric small{line-height:1.45!important}
  .panel{padding:16px!important}.panel h2{font-size:15px!important;margin-bottom:13px!important}
  .panel:hover,.metric:hover{transform:translateY(-2px)!important}
  .focus-hero{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(320px,.65fr);gap:14px;margin-bottom:2px}
  .focus-card{position:relative;overflow:hidden;border:1px solid #30465f;border-radius:20px;background:linear-gradient(145deg,rgba(20,31,45,.97),rgba(8,14,22,.97));box-shadow:0 24px 60px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.055)}
  .focus-main{padding:20px 21px}.focus-main:before{content:"";position:absolute;inset:0 auto auto 0;width:58%;height:2px;background:linear-gradient(90deg,#1492ff,#20d98b,transparent)}
  .focus-eyebrow{display:flex;gap:8px;align-items:center;color:#90a6bd;font-size:10px;font-weight:700}.focus-eyebrow i{width:8px;height:8px;border-radius:50%;background:#20d98b;box-shadow:0 0 16px rgba(32,217,139,.65)}
  .focus-title{margin:8px 0 4px;font-size:24px;line-height:1.35}.focus-copy{margin:0;color:#9fb0c4;font-size:11px;line-height:1.7}
  .focus-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:17px}.focus-stat{padding:11px 12px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.025)}.focus-stat span{display:block;color:#91a2b5;font-size:9px}.focus-stat b{display:block;margin-top:6px;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.focus-stat.good b{color:#55e9ac}.focus-stat.warn b{color:#ffe06b}.focus-stat.bad b{color:#ff7180}
  .focus-actions{padding:18px;display:grid;align-content:center;gap:9px}.focus-actions h3{margin:0 0 2px;font-size:13px}.focus-actions p{margin:0 0 5px;color:#91a2b5;font-size:10px;line-height:1.55}.focus-action-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.focus-action{min-height:40px;border:1px solid #31445b;border-radius:12px;background:#0d1620;color:#fff;cursor:pointer;font-weight:700}.focus-action.primary{border-color:#168df2;background:linear-gradient(135deg,#168df2,#0865cc)}.focus-action:hover{border-color:#1492ff;transform:translateY(-1px)}
  .focus-section-head{display:flex;justify-content:space-between;gap:10px;align-items:end;margin:2px 2px -2px}.focus-section-head h2{margin:0;font-size:15px}.focus-section-head small{color:#8395aa;font-size:9px}
  .focus-balances{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:9px}.focus-balance-card{min-height:96px;padding:13px 14px;border:1px solid rgba(32,217,139,.28);border-radius:15px;background:linear-gradient(145deg,#111c27,#0a1018);box-shadow:0 13px 34px rgba(0,0,0,.25)}.focus-balance-card.missing{border-color:rgba(255,209,26,.25)}.focus-balance-card .bank{font-size:10px;color:#9fb0c4}.focus-balance-card .account{margin-top:3px;font-size:9px;color:#71849a}.focus-balance-card .value{margin-top:9px;font-size:19px;font-weight:800}.focus-balance-card:not(.missing) .value{color:#5aeab0}.focus-balance-card.missing .value{color:#ffe06b}.focus-balance-card .date{margin-top:5px;color:#74869a;font-size:8px}
  #accounts .kpis{grid-template-columns:repeat(auto-fit,minmax(205px,1fr))!important}
  #accounts .metric{min-height:112px!important}
  .table td,.table th{padding:10px 9px!important}.table tbody tr{transition:background .16s ease}.description{color:#c6d0db}
  .nav-btn{min-height:46px!important}.nav-btn.active{font-weight:700}
  .floosy-last-refresh{color:#8192a6;font-size:9px;white-space:nowrap}
  @media(max-width:1100px){.focus-hero{grid-template-columns:1fr}.focus-actions{grid-template-columns:1fr}.focus-stats{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:700px){.topbar{position:relative;top:auto}.focus-main{padding:16px}.focus-title{font-size:21px}.focus-stats{grid-template-columns:1fr 1fr}.focus-action-row{grid-template-columns:1fr}.focus-balances{grid-template-columns:1fr 1fr}}
  @media(max-width:480px){.focus-stats,.focus-balances{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const ghostItem=v=>/gmail/i.test(String(v||''))&&/غير\s*مصنف/i.test(String(v||''));
  try{
    if(typeof filteredGuideRows==='function'){
      const originalFilteredGuideRows=filteredGuideRows;
      filteredGuideRows=function(){return originalFilteredGuideRows().filter(x=>!ghostItem(x?.r?.[0]));};
    }
  }catch(e){}

  let lastDataRefresh=0;
  function fmtClock(ts){if(!ts)return'لم يتم التحديث بعد';try{return new Date(ts).toLocaleTimeString('ar-OM',{hour:'2-digit',minute:'2-digit'});}catch{return'';}}
  function fixedAccounts(){
    const reg=accountRegistry(),bm=balanceMap(),map=new Map();
    for(const ai of reg.values())if(ai&&ai.key)map.set(ai.key,{...ai});
    for(const b of bm.values())if(b&&b.key&&!map.has(b.key))map.set(b.key,{bank:b.bank,number:b.number,key:b.key,label:b.label});
    return[...map.values()].sort((a,b)=>String(a.bank||'').localeCompare(String(b.bank||''),'ar')||String(a.number||'').localeCompare(String(b.number||''),'en',{numeric:true}));
  }
  function fmtBalanceDate(v){
    try{if(typeof parseBalanceDate==='function'){const d=parseBalanceDate(v);return d?d.toLocaleDateString('ar-OM'):'—';}}
    catch(e){}
    const d=new Date(v||0);return isNaN(d.getTime())?'—':d.toLocaleDateString('ar-OM');
  }
  function ensureDashboardShell(){
    const dash=document.getElementById('dashboard'),k=document.getElementById('dashKpis');if(!dash||!k)return null;
    let hero=document.getElementById('focusHero');
    if(!hero){
      hero=document.createElement('div');hero.id='focusHero';hero.className='focus-hero';k.parentNode.insertBefore(hero,k);
      const head=document.createElement('div');head.className='focus-section-head';head.id='focusBalanceHead';head.innerHTML='<div><h2>الأرصدة المؤكدة</h2><small>أحدث رصيد لكل حساب — مستقل عن فلاتر الموازنة</small></div><span class="floosy-last-refresh" id="focusLastRefresh"></span>';
      k.parentNode.insertBefore(head,k);
      const balances=document.createElement('div');balances.id='focusBalanceGrid';balances.className='focus-balances';k.parentNode.insertBefore(balances,k);
      hero.addEventListener('click',e=>{
        const b=e.target.closest('[data-focus-action]');if(!b)return;
        const a=b.dataset.focusAction;
        if(a==='refresh'){document.getElementById('refresh')?.click();return;}
        if(a==='sync'){document.getElementById('syncOperationsNow')?.click();return;}
        document.querySelector(`#nav [data-page="${a}"]`)?.click();
      });
    }
    return hero;
  }
  function updateDashboardFocus(){
    const hero=ensureDashboardShell();if(!hero)return;
    let s;try{s=summary();}catch{return;}
    const rows=fixedAccounts(),bm=balanceMap(),confirmed=rows.filter(x=>bm.has(x.key)),complete=rows.length>0&&confirmed.length===rows.length;
    const confirmedTotal=confirmed.reduce((sum,x)=>sum+Number(bm.get(x.key)?.balance||0),0);
    const usage=s.budgetTotal>0?s.spent/s.budgetTotal:null,cashflow=s.income-s.spent;
    const usageText=usage==null?'—':`${Math.round(usage*100)}%`,usageClass=usage==null?'warn':usage>1?'bad':usage>=.8?'warn':'good';
    hero.innerHTML=`<div class="focus-card focus-main"><div class="focus-eyebrow"><i></i><span>ملخص مالي مباشر</span></div><h2 class="focus-title">وضعك المالي في ${esc(s.label)}</h2><p class="focus-copy">الأهم أولاً: الرصيد المؤكد، المتبقي من الموازنة، نسبة الصرف وصافي التدفق — دون الحاجة للتنقل بين الصفحات.</p><div class="focus-stats"><div class="focus-stat ${complete?'good':'warn'}"><span>إجمالي الرصيد المؤكد</span><b>${complete?money(confirmedTotal):`${confirmed.length}/${rows.length} حسابات`}</b></div><div class="focus-stat ${s.remain<0?'bad':'good'}"><span>المتبقي من الموازنة</span><b>${money(s.remain)}</b></div><div class="focus-stat ${usageClass}"><span>استخدام الموازنة</span><b>${usageText}</b></div><div class="focus-stat ${cashflow<0?'bad':'good'}"><span>صافي التدفق</span><b>${money(cashflow)}</b></div></div></div><div class="focus-card focus-actions"><h3>إجراءات سريعة</h3><p>التصنيف يبقى من Gmail. من هنا تراجع النتائج وتحدّثها فقط.</p><div class="focus-action-row"><button class="focus-action primary" data-focus-action="sync">مزامنة العمليات</button><button class="focus-action" data-focus-action="refresh">تحديث البيانات</button><button class="focus-action" data-focus-action="accounts">الحسابات</button><button class="focus-action" data-focus-action="transactions">العمليات</button></div></div>`;
    const grid=document.getElementById('focusBalanceGrid');if(grid){
      grid.innerHTML=rows.length?rows.map(ai=>{const b=bm.get(ai.key),label=esc(ai.bank||'حساب'),no=esc(ai.number||'—');return`<div class="focus-balance-card ${b?'':'missing'}"><div class="bank">${label}</div><div class="account">حساب ${no}</div><div class="value">${b?money(b.balance):'—'}</div><div class="date">${b?`مؤكد ${fmtBalanceDate(b.date)}`:'لا يوجد رصيد مؤكد بعد'}</div></div>`;}).join(''):'<div class="focus-balance-card missing"><div class="bank">الأرصدة</div><div class="value">—</div><div class="date">لم يتم اكتشاف حسابات بعد</div></div>';
    }
    const lr=document.getElementById('focusLastRefresh');if(lr)lr.textContent=`آخر تحديث: ${fmtClock(lastDataRefresh)}`;
    document.querySelectorAll('#itemFilter option').forEach(o=>{if(ghostItem(o.textContent))o.remove();});
  }

  const descriptions={dashboard:'نظرة مختصرة تساعدك على اتخاذ القرار بسرعة.',budgets:'تابع حدود الموازنات والمتبقي ونسبة الاستخدام.',transactions:'راجع العمليات المصنفة القادمة من Gmail والشيت.',accounts:'أرصدة مؤكدة ثابتة لكل حساب وحركة الأموال.',items:'دليل البنود المالي المستخدم في التصنيف والموازنات.',alerts:'تنبيهات عملية للتجاوزات والنقاط التي تحتاج انتباه.'};
  document.getElementById('nav')?.addEventListener('click',e=>{
    const b=e.target.closest('[data-page]');if(!b)return;const p=document.querySelector('.headline p');if(p)p.textContent=descriptions[b.dataset.page]||p.textContent;
  });

  try{
    const originalRenderAll=renderAll;
    renderAll=function(){originalRenderAll();updateDashboardFocus();};
  }catch(e){}

  try{
    const originalRefresh=refresh;
    refresh=async function(...args){const r=await originalRefresh(...args);if(document.getElementById('loginBox')?.style.display==='none')lastDataRefresh=Date.now();updateDashboardFocus();return r;};
    const rb=document.getElementById('refresh');if(rb)rb.onclick=refresh;
  }catch(e){}

  const p=document.querySelector('.headline p');if(p)p.textContent=descriptions.dashboard;
  updateDashboardFocus();
})();
