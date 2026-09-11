(()=>{
  if(window.__floosyAssociationTabsV1)return;window.__floosyAssociationTabsV1=true;
  const $=id=>document.getElementById(id);
  const money=v=>Number(v||0).toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3})+' ر.ع';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const addMonths=(value,months)=>{const m=/^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(value||''));if(!m)return'';const d=new Date(Date.UTC(+m[1],+m[2]-1,+(m[3]||1)));d.setUTCMonth(d.getUTCMonth()+Math.max(0,Number(months)||0));return d.toISOString().slice(0,10)};
  const fmtDate=v=>{if(!v)return'—';const d=new Date(String(v).length===7?v+'-01':v);return isNaN(d)?String(v):d.toLocaleDateString('ar-OM',{year:'numeric',month:'short',day:String(v).length>7?'numeric':undefined})};
  const data=()=>{try{return typeof DATA!=='undefined'&&DATA?DATA:{associations:[],members:[],payments:[]}}catch(e){return{associations:[],members:[],payments:[]}}};
  const current=()=>{try{return typeof currentId!=='undefined'?String(currentId||''):String($('associationSelect')?.value||'')}catch(e){return String($('associationSelect')?.value||'')}};
  const setCurrent=id=>{const sel=$('associationSelect');if(!sel)return;sel.value=String(id||'');sel.dispatchEvent(new Event('change',{bubbles:true}))};
  let active='overview',scheduled=false;

  function installStyle(){if($('associationTabsStyle'))return;const s=document.createElement('style');s.id='associationTabsStyle';s.textContent=`
    .assoc-subnav{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:10px 0 13px;padding:8px;border:1px solid #2d435a;border-radius:16px;background:linear-gradient(145deg,#0f1822,#090f16);box-shadow:0 14px 34px rgba(0,0,0,.18)}
    .assoc-tabs{display:flex;gap:7px;flex-wrap:wrap}.assoc-tab{min-height:39px;padding:0 15px;border:1px solid #30455c;border-radius:11px;background:#0b131c;color:#aebdcd;font-weight:800;cursor:pointer}.assoc-tab.active{color:#fff;border-color:#168df2;background:linear-gradient(135deg,#168df2,#075fbf);box-shadow:0 7px 22px rgba(22,141,242,.18)}
    .assoc-current{display:flex;align-items:center;gap:8px;min-width:280px}.assoc-current span{font-size:9px;color:#879aaf;white-space:nowrap}.assoc-current .control{min-width:180px}
    .assoc-view{display:none}.assoc-view.active{display:block;animation:assocFade .2s ease}@keyframes assocFade{from{opacity:.3;transform:translateY(4px)}to{opacity:1;transform:none}}
    .assoc-member-tools,.assoc-list-head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 12px;padding:12px;border:1px solid #273b50;border-radius:15px;background:#0a1119}.assoc-member-tools .group,.assoc-list-head .group{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.assoc-member-tools .control{min-width:190px}
    .assoc-list-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:11px}.assoc-list-card{padding:14px;border:1px solid #2c4158;border-radius:17px;background:linear-gradient(145deg,#101a25,#080e15);transition:.18s ease;position:relative;overflow:hidden}.assoc-list-card:before{content:"";position:absolute;inset:0 auto auto 0;width:45%;height:2px;background:linear-gradient(90deg,#168df2,#27d391,transparent)}.assoc-list-card.selected{border-color:#168df2;box-shadow:0 0 0 1px rgba(22,141,242,.18),0 18px 36px rgba(0,0,0,.2)}.assoc-list-card:hover{transform:translateY(-2px)}
    .assoc-card-head{display:flex;justify-content:space-between;gap:9px;align-items:flex-start}.assoc-card-head h3{margin:0;font-size:16px}.assoc-card-head small{display:block;margin-top:4px;color:#8498ad}.assoc-card-badge{padding:5px 8px;border-radius:999px;border:1px solid rgba(39,211,145,.35);color:#63eab7;font-size:9px;white-space:nowrap}.assoc-card-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:12px 0}.assoc-card-kpi{padding:8px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:rgba(255,255,255,.018)}.assoc-card-kpi span{display:block;color:#7f92a7;font-size:8px}.assoc-card-kpi b{display:block;margin-top:4px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.assoc-card-actions{display:flex;gap:7px;flex-wrap:wrap;padding-top:10px;border-top:1px solid #223244}
    .assoc-empty{padding:30px;text-align:center;color:#8ca0b5;border:1px dashed #30455c;border-radius:16px;background:#091018}.assoc-original-toolbar{display:none!important}
    @media(max-width:760px){.assoc-subnav{align-items:stretch;flex-direction:column}.assoc-current{min-width:0;width:100%}.assoc-current .control{flex:1;min-width:0}.assoc-member-tools{align-items:stretch;flex-direction:column}.assoc-member-tools .group{display:grid;grid-template-columns:1fr}.assoc-member-tools .control{width:100%;min-width:0}.assoc-card-kpis{grid-template-columns:1fr 1fr}}
  `;document.head.appendChild(s)}

  function renderAssociationCards(){
    const grid=$('associationListGrid');if(!grid)return;
    const d=data(),assocs=Array.isArray(d.associations)?d.associations:[],selected=current();
    if(!assocs.length){grid.innerHTML='<div class="assoc-empty">لا توجد جمعية مسجلة بعد. استخدم زر «+ إضافة جمعية» لإنشاء أول جمعية.</div>';return}
    grid.innerHTML=assocs.map(a=>{
      const aid=String(a.associationId||''),ms=(d.members||[]).filter(m=>String(m.associationId)===aid&&m.active!==false),ps=(d.payments||[]).filter(p=>String(p.associationId)===aid),paid=ps.reduce((s,p)=>s+Number(p.amount||0),0),end=a.endDate||addMonths(a.startMonth,a.durationMonths),planned=Number(a.plannedMembers||0)||ms.length;
      return `<article class="assoc-list-card ${aid===selected?'selected':''}" data-association-id="${esc(aid)}"><div class="assoc-card-head"><div><h3>${esc(a.name||'جمعية')}</h3><small>${planned} عضو مخطط • ${ms.length} عضو مضاف</small></div><span class="assoc-card-badge">كل دور ${Math.max(1,Number(a.payoutEveryMonths||1))} أشهر</span></div><div class="assoc-card-kpis"><div class="assoc-card-kpi"><span>المساهمة / عضو</span><b>${money(a.contributionAmount)}</b></div><div class="assoc-card-kpi"><span>مدة الجمعية</span><b>${Number(a.durationMonths||0)} شهر</b></div><div class="assoc-card-kpi"><span>إجمالي الدفعات</span><b>${money(paid)}</b></div><div class="assoc-card-kpi"><span>تاريخ البدء</span><b>${fmtDate(a.startMonth)}</b></div><div class="assoc-card-kpi"><span>تاريخ الانتهاء</span><b>${fmtDate(end)}</b></div><div class="assoc-card-kpi"><span>عدد عمليات الدفع</span><b>${ps.length}</b></div></div><div class="assoc-card-actions"><button class="btn sm primary" data-assoc-act="open" data-id="${esc(aid)}">فتح</button><button class="btn sm" data-assoc-act="edit" data-id="${esc(aid)}">تعديل</button><button class="btn sm red" data-assoc-act="delete" data-id="${esc(aid)}">حذف</button></div></article>`;
    }).join('')
  }

  function show(tab){
    active=tab;
    document.querySelectorAll('.assoc-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    document.querySelectorAll('.assoc-view').forEach(v=>v.classList.toggle('active',v.dataset.view===tab));
    if(tab==='associations')renderAssociationCards();
    setTimeout(()=>window.parent?.postMessage({type:'floosy-association-updated'},location.origin),20)
  }

  function setup(){
    if($('associationSubnav')){scheduleRefresh();return true}
    const status=$('status'),toolbar=document.querySelector('.toolbar'),hero=document.querySelector('.hero'),charts=document.querySelector('.charts'),editor=$('memberEditor'),sectionHead=document.querySelector('.sectionHead'),cards=$('memberCards'),detail=$('memberDetail'),settings=$('associationForm')?.closest('details.panel');
    const assocSelect=$('associationSelect'),memberFilter=$('memberFilter'),memberSearch=$('memberSearch'),addMember=$('addMember'),newAssociation=$('newAssociation');
    if(!status||!toolbar||!hero||!charts||!cards||!assocSelect)return false;
    installStyle();toolbar.classList.add('assoc-original-toolbar');

    const sub=document.createElement('div');sub.id='associationSubnav';sub.className='assoc-subnav';sub.innerHTML='<div class="assoc-tabs"><button class="assoc-tab active" data-tab="overview" type="button">الرئيسية / لوحة العرض</button><button class="assoc-tab" data-tab="members" type="button">قائمة الأعضاء</button><button class="assoc-tab" data-tab="associations" type="button">قائمة الجمعيات</button></div><div class="assoc-current"><span>الجمعية الحالية</span><div id="associationSelectMount"></div></div>';
    status.after(sub);$('associationSelectMount').appendChild(assocSelect);

    const overview=document.createElement('section');overview.className='assoc-view active';overview.dataset.view='overview';overview.id='associationOverviewView';sub.after(overview);overview.append(hero,charts);

    const membersView=document.createElement('section');membersView.className='assoc-view';membersView.dataset.view='members';membersView.id='associationMembersView';overview.after(membersView);
    const memberTools=document.createElement('div');memberTools.className='assoc-member-tools';memberTools.innerHTML='<div class="group" id="assocMemberFilters"></div><div class="group" id="assocMemberActions"></div>';membersView.appendChild(memberTools);
    if(memberFilter)$('assocMemberFilters').appendChild(memberFilter);if(memberSearch)$('assocMemberFilters').appendChild(memberSearch);if(addMember)$('assocMemberActions').appendChild(addMember);
    if(editor)membersView.appendChild(editor);if(sectionHead)membersView.appendChild(sectionHead);membersView.appendChild(cards);if(detail)membersView.appendChild(detail);

    const associationsView=document.createElement('section');associationsView.className='assoc-view';associationsView.dataset.view='associations';associationsView.id='associationListView';membersView.after(associationsView);
    const listHead=document.createElement('div');listHead.className='assoc-list-head';listHead.innerHTML='<div><b>الجمعيات المسجلة</b><div style="color:#8296aa;font-size:9px;margin-top:4px">اختر جمعية لفتحها أو عدّل بياناتها من نفس القائمة.</div></div><div class="group" id="assocListActions"></div>';associationsView.appendChild(listHead);if(newAssociation)$('assocListActions').appendChild(newAssociation);
    const grid=document.createElement('div');grid.id='associationListGrid';grid.className='assoc-list-grid';associationsView.appendChild(grid);if(settings)associationsView.appendChild(settings);

    sub.addEventListener('click',e=>{const b=e.target.closest('.assoc-tab');if(b)show(b.dataset.tab)});
    grid.addEventListener('click',e=>{const b=e.target.closest('[data-assoc-act]');if(!b)return;const id=b.dataset.id,act=b.dataset.assocAct;setCurrent(id);setTimeout(()=>{if(act==='open'){show('overview');return}if(act==='edit'){show('associations');if(settings)settings.open=true;if(typeof window.__floosyAssociationEdit==='function')window.__floosyAssociationEdit();return}if(act==='delete'&&typeof window.__floosyAssociationDelete==='function')window.__floosyAssociationDelete()},40)});
    assocSelect.addEventListener('change',()=>{scheduleRefresh();if(active==='associations')renderAssociationCards()});
    document.addEventListener('click',e=>{if(e.target.closest('#newAssociation'))setTimeout(()=>show('associations'),0);if(e.target.closest('#addMember'))setTimeout(()=>show('members'),0)});
    renderAssociationCards();show('overview');return true
  }

  function refresh(){
    if(!setup())return;
    renderAssociationCards();
  }
  function scheduleRefresh(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;refresh()},80)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{let n=0,t=setInterval(()=>{if(setup()||++n>30)clearInterval(t)},100)});else{let n=0,t=setInterval(()=>{if(setup()||++n>30)clearInterval(t)},100)}
  new MutationObserver(scheduleRefresh).observe(document.body||document.documentElement,{subtree:true,childList:true});
  window.addEventListener('floosy-association-data',scheduleRefresh);
})();
