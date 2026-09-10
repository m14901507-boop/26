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

  .focus-hero{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(330px,.65fr);gap:14px;margin-bottom:2px}
  .focus-card{position:relative;overflow:hidden;border:1px solid #30465f;border-radius:20px;background:linear-gradient(145deg,rgba(20,31,45,.97),rgba(8,14,22,.97));box-shadow:0 24px 60px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.055)}
  .focus-card:after{content:"";position:absolute;inset:-40% -35%;pointer-events:none;background:linear-gradient(115deg,transparent 38%,rgba(255,255,255,.055) 50%,transparent 62%);transform:translateX(34%);animation:focusSweep 8s ease-in-out infinite}
  .focus-main{padding:20px 21px}.focus-main:before{content:"";position:absolute;inset:0 auto auto 0;width:58%;height:2px;background:linear-gradient(90deg,#1492ff,#20d98b,transparent);animation:linePulse 3.6s ease-in-out infinite}
  .focus-eyebrow{display:flex;gap:8px;align-items:center;color:#90a6bd;font-size:10px;font-weight:700}.focus-eyebrow i{width:8px;height:8px;border-radius:50%;background:#20d98b;box-shadow:0 0 16px rgba(32,217,139,.65);animation:dotPulse 2s ease-in-out infinite}
  .focus-title{margin:8px 0 4px;font-size:24px;line-height:1.35}.focus-copy{margin:0;color:#9fb0c4;font-size:11px;line-height:1.7}
  .focus-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:17px}.focus-stat{padding:11px 12px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.025)}.focus-stat span{display:block;color:#91a2b5;font-size:9px}.focus-stat b{display:block;margin-top:6px;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.focus-stat.good b{color:#55e9ac}.focus-stat.warn b{color:#ffe06b}.focus-stat.bad b{color:#ff7180}

  .behavior-card{padding:16px 17px;display:grid;grid-template-columns:126px 1fr;gap:15px;align-items:center;background:radial-gradient(circle at 22% 50%,rgba(20,146,255,.13),transparent 38%),linear-gradient(145deg,rgba(17,28,40,.98),rgba(7,12,19,.98))}
  .behavior-card:before{content:"";position:absolute;width:220px;height:220px;border-radius:50%;left:-88px;bottom:-110px;background:radial-gradient(circle,rgba(32,217,139,.11),transparent 70%);filter:blur(6px);animation:behaviorFloat 6s ease-in-out infinite alternate}
  .behavior-ring{--score:0;--ring:#20d98b;width:118px;height:118px;border-radius:50%;display:grid;place-items:center;position:relative;background:conic-gradient(var(--ring) calc(var(--score)*1%),rgba(255,255,255,.08) 0);box-shadow:0 0 36px color-mix(in srgb,var(--ring) 28%,transparent);animation:ringBreathe 2.8s ease-in-out infinite}
  .behavior-ring:before{content:"";position:absolute;inset:9px;border-radius:50%;background:linear-gradient(145deg,#111a25,#080d14);border:1px solid rgba(255,255,255,.08);box-shadow:inset 0 0 28px rgba(0,0,0,.55)}
  .behavior-score{position:relative;z-index:1;text-align:center}.behavior-score b{display:block;font-size:28px;line-height:1}.behavior-score span{display:block;margin-top:5px;font-size:8px;color:#8da0b5}
  .behavior-copy{position:relative;z-index:2;min-width:0}.behavior-copy h3{margin:0;font-size:14px}.behavior-state{margin-top:4px;font-size:18px;font-weight:800}.behavior-state.good{color:#55e9ac}.behavior-state.warn{color:#ffe06b}.behavior-state.bad{color:#ff7180}
  .behavior-note{margin:5px 0 10px;color:#93a4b7;font-size:9px;line-height:1.5}
  .behavior-row{display:grid;grid-template-columns:78px 1fr 44px;gap:7px;align-items:center;margin-top:7px;font-size:8px;color:#8fa1b5}.behavior-row b{text-align:left;color:#d8e2ec;font-size:9px}.behavior-track{height:7px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden;position:relative}.behavior-track i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#0c69d1,#2ca7ff,#6dc3ff);box-shadow:0 0 14px rgba(20,146,255,.42);transition:width .6s cubic-bezier(.2,.8,.2,1)}.behavior-track.time i{background:linear-gradient(90deg,#866500,#ffd11a,#fff096);box-shadow:0 0 14px rgba(255,209,26,.32)}
  .behavior-forecast{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}.behavior-mini{padding:8px 9px;border-radius:11px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025)}.behavior-mini span{display:block;color:#8093a8;font-size:8px}.behavior-mini b{display:block;margin-top:4px;font-size:10px;color:#e8eef5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

  .focus-section-head{display:flex;justify-content:space-between;gap:10px;align-items:end;margin:2px 2px -2px}.focus-section-head h2{margin:0;font-size:15px}.focus-section-head small{color:#8395aa;font-size:9px}
  .focus-balances{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:9px}.focus-balance-card{min-height:96px;padding:13px 14px;border:1px solid rgba(32,217,139,.28);border-radius:15px;background:linear-gradient(145deg,#111c27,#0a1018);box-shadow:0 13px 34px rgba(0,0,0,.25);transition:.22s ease}.focus-balance-card:hover{transform:translateY(-3px);border-color:rgba(32,217,139,.5);box-shadow:0 18px 40px rgba(0,0,0,.32),0 0 24px rgba(32,217,139,.08)}.focus-balance-card.missing{border-color:rgba(255,209,26,.25)}.focus-balance-card .bank{font-size:10px;color:#9fb0c4}.focus-balance-card .account{margin-top:3px;font-size:9px;color:#71849a}.focus-balance-card .value{margin-top:9px;font-size:19px;font-weight:800}.focus-balance-card:not(.missing) .value{color:#5aeab0}.focus-balance-card.missing .value{color:#ffe06b}.focus-balance-card .date{margin-top:5px;color:#74869a;font-size:8px}
  #accounts .kpis{grid-template-columns:repeat(auto-fit,minmax(205px,1fr))!important}
  #accounts .metric{min-height:112px!important}
  .table td,.table th{padding:10px 9px!important}.table tbody tr{transition:background .16s ease}.description{color:#c6d0db}
  .nav-btn{min-height:46px!important}.nav-btn.active{font-weight:700}
  .floosy-last-refresh{color:#8192a6;font-size:9px;white-space:nowrap}

  @keyframes focusSweep{0%,56%{transform:translateX(38%)}82%,100%{transform:translateX(-38%)}}
  @keyframes linePulse{0%,100%{opacity:.55;transform:scaleX(.78);transform-origin:right}50%{opacity:1;transform:scaleX(1)}}
  @keyframes dotPulse{0%,100%{transform:scale(.85);box-shadow:0 0 8px rgba(32,217,139,.35)}50%{transform:scale(1.16);box-shadow:0 0 20px rgba(32,217,139,.7)}}
  @keyframes ringBreathe{0%,100%{transform:scale(.985)}50%{transform:scale(1.015)}}
  @keyframes behaviorFloat{from{transform:translate3d(0,0,0)}to{transform:translate3d(22px,-14px,0)}}
  @media(max-width:1100px){.focus-hero{grid-template-columns:1fr}.focus-stats{grid-template-columns:repeat(2,1fr)}.behavior-card{grid-template-columns:120px 1fr}}
  @media(max-width:700px){.topbar{position:relative;top:auto}.focus-main{padding:16px}.focus-title{font-size:21px}.focus-stats{grid-template-columns:1fr 1fr}.focus-balances{grid-template-columns:1fr 1fr}.behavior-card{grid-template-columns:105px 1fr}.behavior-ring{width:100px;height:100px}.behavior-score b{font-size:24px}}
  @media(max-width:480px){.focus-stats,.focus-balances{grid-template-columns:1fr}.behavior-card{grid-template-columns:1fr}.behavior-ring{margin:auto}.behavior-copy{text-align:center}.behavior-row{grid-template-columns:72px 1fr 40px;text-align:right}.behavior-forecast{text-align:right}}
  @media(prefers-reduced-motion:reduce){.focus-card:after,.focus-main:before,.focus-eyebrow i,.behavior-ring,.behavior-card:before{animation:none!important}}
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
  function currentPeriodProgress(s){
    if(!s||!Array.isArray(s.keys)||s.keys.length!==1)return null;
    const key=s.keys[0],parts=String(key).split('-').map(Number);if(parts.length<2||!parts[0]||!parts[1])return null;
    const now=new Date(),start=new Date(parts[0],parts[1]-1,1),end=new Date(parts[0],parts[1],0,23,59,59,999);
    if(now<start)return 0;if(now>end)return 1;
    return Math.min(1,Math.max(0,now.getDate()/end.getDate()));
  }
  function behaviorData(s){
    const budget=Number(s?.budgetTotal||0),spent=Math.max(0,Number(s?.spent||0)),income=Math.max(0,Number(s?.income||0)),cashflow=income-spent;
    if(!(budget>0))return{score:null,state:'أضف موازنة لقياس السلوك',cls:'warn',usage:null,progress:currentPeriodProgress(s),forecast:null,diff:null,note:'المؤشر يعتمد على الموازنة، سرعة الصرف وصافي التدفق.'};
    const usage=spent/budget,progress=currentPeriodProgress(s),pace=progress&&progress>0?usage/progress:usage;
    let score=100;
    if(usage>1)score-=45+Math.min(30,(usage-1)*50);
    else if(pace>1.35)score-=34;
    else if(pace>1.15)score-=20;
    else if(pace>1.02)score-=10;
    if(cashflow<0)score-=Math.min(22,Math.abs(cashflow)/Math.max(spent,1)*22);
    score=Math.round(Math.max(0,Math.min(100,score)));
    const cls=score>=80?'good':score>=60?'warn':'bad';
    const state=score>=88?'منضبط جدًا':score>=80?'منضبط':score>=60?'يحتاج مراقبة':'ضغط صرف مرتفع';
    const forecast=progress&&progress>.08&&progress<1?spent/progress:spent;
    const diff=budget-forecast;
    const note=progress==null?'قياس مبني على نسبة استخدام الموازنة وصافي التدفق.':pace<=1.02?'سرعة الصرف ضمن أو أقل من مسار الشهر.':pace<=1.15?'سرعة الصرف أعلى قليلًا من مسار الشهر.':'سرعة الصرف أعلى من المسار المتوقع وتحتاج متابعة.';
    return{score,state,cls,usage,progress,forecast,diff,note};
  }
  function ensureDashboardShell(){
    const dash=document.getElementById('dashboard'),k=document.getElementById('dashKpis');if(!dash||!k)return null;
    let hero=document.getElementById('focusHero');
    if(!hero){
      hero=document.createElement('div');hero.id='focusHero';hero.className='focus-hero';k.parentNode.insertBefore(hero,k);
      const head=document.createElement('div');head.className='focus-section-head';head.id='focusBalanceHead';head.innerHTML='<div><h2>الأرصدة المؤكدة</h2><small>أحدث رصيد لكل حساب — مستقل عن فلاتر الموازنة</small></div><span class="floosy-last-refresh" id="focusLastRefresh"></span>';
      k.parentNode.insertBefore(head,k);
      const balances=document.createElement('div');balances.id='focusBalanceGrid';balances.className='focus-balances';k.parentNode.insertBefore(balances,k);
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
    const bd=behaviorData(s),scoreText=bd.score==null?'—':String(bd.score),ringColor=bd.cls==='good'?'#20d98b':bd.cls==='warn'?'#ffd11a':'#ff3b4f';
    const usagePct=bd.usage==null?0:Math.min(100,Math.max(0,bd.usage*100)),timePct=bd.progress==null?0:Math.min(100,Math.max(0,bd.progress*100));
    hero.innerHTML=`<div class="focus-card focus-main"><div class="focus-eyebrow"><i></i><span>ملخص مالي مباشر</span></div><h2 class="focus-title">وضعك المالي في ${esc(s.label)}</h2><p class="focus-copy">الرصيد، المتبقي، نسبة الصرف وصافي التدفق في مكان واحد.</p><div class="focus-stats"><div class="focus-stat ${complete?'good':'warn'}"><span>إجمالي الرصيد المؤكد</span><b>${complete?money(confirmedTotal):`${confirmed.length}/${rows.length} حسابات`}</b></div><div class="focus-stat ${s.remain<0?'bad':'good'}"><span>المتبقي من الموازنة</span><b>${money(s.remain)}</b></div><div class="focus-stat ${usageClass}"><span>استخدام الموازنة</span><b>${usageText}</b></div><div class="focus-stat ${cashflow<0?'bad':'good'}"><span>صافي التدفق</span><b>${money(cashflow)}</b></div></div></div><div class="focus-card behavior-card"><div class="behavior-ring" style="--score:${bd.score??0};--ring:${ringColor}"><div class="behavior-score"><b>${scoreText}</b><span>من 100</span></div></div><div class="behavior-copy"><h3>مؤشر انضباط الصرف</h3><div class="behavior-state ${bd.cls}">${esc(bd.state)}</div><p class="behavior-note">${esc(bd.note)}</p><div class="behavior-row"><span>الصرف</span><div class="behavior-track"><i style="width:${usagePct}%"></i></div><b>${bd.usage==null?'—':Math.round(bd.usage*100)+'%'}</b></div><div class="behavior-row"><span>وقت الفترة</span><div class="behavior-track time"><i style="width:${timePct}%"></i></div><b>${bd.progress==null?'—':Math.round(bd.progress*100)+'%'}</b></div><div class="behavior-forecast"><div class="behavior-mini"><span>متوقع نهاية الفترة</span><b>${bd.forecast==null?'—':money(bd.forecast)}</b></div><div class="behavior-mini"><span>فرق عن الموازنة</span><b>${bd.diff==null?'—':money(bd.diff)}</b></div></div></div></div>`;
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
