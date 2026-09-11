(()=>{
  const nav=document.getElementById('nav');
  const main=document.querySelector('.main');
  const genericFilter=document.querySelector('.filterbar');
  if(!nav||!main)return;

  const assocBtn=nav.querySelector('.nav-special-assoc,[data-page="associations"]');
  if(!assocBtn)return;

  const style=document.createElement('style');style.textContent=`
    .association-hostbar{display:none;grid-template-columns:minmax(190px,1.25fr) repeat(6,minmax(120px,.8fr)) auto;gap:9px;align-items:stretch;margin:0 0 14px;padding:12px;border:1px solid #294059;border-radius:17px;background:linear-gradient(145deg,#101923,#091019)}
    .association-hostbar.active{display:grid}.assoc-host-cell{min-height:58px;padding:9px 11px;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(255,255,255,.018)}.assoc-host-cell span{display:block;color:#8296aa;font-size:9px}.assoc-host-cell b{display:block;margin-top:6px;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.assoc-host-select{width:100%;margin-top:5px;border:0;background:transparent;color:#fff;font-weight:800;outline:none}.assoc-host-select option{background:#101923}.assoc-host-add{min-width:122px;border:1px solid #168df2;border-radius:12px;background:linear-gradient(135deg,#168df2,#0866cc);color:#fff;font-weight:800;cursor:pointer;padding:0 13px}.assoc-host-add:hover{transform:translateY(-1px)}
    @media(max-width:1250px){.association-hostbar{grid-template-columns:repeat(4,1fr)}.assoc-host-add{min-height:56px}}@media(max-width:700px){.association-hostbar{grid-template-columns:1fr 1fr}}@media(max-width:460px){.association-hostbar{grid-template-columns:1fr}}
  `;document.head.appendChild(style);

  const host=document.createElement('div');host.className='association-hostbar';host.id='associationHostBar';host.innerHTML=`
    <div class="assoc-host-cell"><span>الجمعية</span><select id="hostAssocSelect" class="assoc-host-select"><option value="">—</option></select></div>
    <div class="assoc-host-cell"><span>عدد الأعضاء</span><b id="hostAssocMembers">—</b></div>
    <div class="assoc-host-cell"><span>مبلغ المساهمة / عضو</span><b id="hostAssocContribution">—</b></div>
    <div class="assoc-host-cell"><span>مدة الجمعية</span><b id="hostAssocDuration">—</b></div>
    <div class="assoc-host-cell"><span>تاريخ البدء</span><b id="hostAssocStart">—</b></div>
    <div class="assoc-host-cell"><span>تاريخ الانتهاء</span><b id="hostAssocEnd">—</b></div>
    <div class="assoc-host-cell"><span>دورة الاستلام</span><b id="hostAssocCycle">—</b></div>
    <button id="hostAssocAdd" class="assoc-host-add" type="button">+ إضافة جمعية</button>`;
  if(genericFilter?.parentNode)genericFilter.parentNode.insertBefore(host,genericFilter.nextSibling);else main.insertBefore(host,main.firstChild);

  let page=document.getElementById('associations-pro');
  if(!page){
    page=document.createElement('section');
    page.id='associations-pro';
    page.className='page';
    page.style.padding='0';
    page.innerHTML='<div style="border:1px solid #27394d;border-radius:18px;overflow:hidden;background:#05070a;min-height:1180px"><iframe id="associationsProFrame" title="إدارة الجمعيات" src="associations.html?v=8" style="width:100%;height:1180px;border:0;display:block;background:#05070a"></iframe></div>';
    const footer=document.querySelector('.footer');
    if(footer)main.insertBefore(page,footer);else main.appendChild(page);
  }

  assocBtn.dataset.page='associations-pro';
  const frame=document.getElementById('associationsProFrame');
  const money=v=>Number(v||0).toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3})+' ر.ع';
  const fmtDate=v=>{if(!v)return'—';const d=new Date(v);return isNaN(d)?String(v):d.toLocaleDateString('ar-OM');};
  function syncHost(){
    try{
      const doc=frame?.contentDocument;if(!doc)return;
      const childSel=doc.getElementById('associationSelect'),hostSel=document.getElementById('hostAssocSelect');if(!hostSel)return;
      if(childSel){const old=hostSel.value;hostSel.innerHTML=[...childSel.options].map(o=>`<option value="${String(o.value).replace(/"/g,'&quot;')}">${o.textContent||'—'}</option>`).join('');hostSel.value=childSel.value||old||'';}
      const planned=doc.getElementById('associationPlannedMembers')?.value||doc.querySelectorAll('.memberCard').length||0;
      const contribution=doc.getElementById('contributionAmount')?.value;
      const duration=doc.getElementById('durationMonths')?.value;
      const start=doc.getElementById('startMonth')?.value;
      const end=doc.getElementById('associationEndDate')?.value;
      const cycle=doc.getElementById('payoutEveryMonths')?.value;
      const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v||'—';};
      set('hostAssocMembers',planned?`${planned} أعضاء`:'—');set('hostAssocContribution',contribution?money(contribution):'—');set('hostAssocDuration',duration?`${duration} شهر`:'—');set('hostAssocStart',fmtDate(start));set('hostAssocEnd',fmtDate(end));set('hostAssocCycle',cycle?`كل ${cycle} شهر`:'—');
    }catch(e){}
  }
  function assocMode(on){
    host.classList.toggle('active',on);if(genericFilter)genericFilter.style.display=on?'none':'';
    if(on)setTimeout(syncHost,100);
  }

  frame?.addEventListener('load',()=>{
    try{
      const doc=frame.contentDocument;if(!doc)return;
      const top=doc.querySelector('.top');if(top)top.style.display='none';
      const wrap=doc.querySelector('.wrap');if(wrap){wrap.style.maxWidth='none';wrap.style.padding='12px';}
      doc.documentElement.style.background='#05070a';doc.body.style.background='#05070a';
      const status=doc.getElementById('status');if(status)status.style.marginTop='0';
      const s=doc.createElement('script');s.src='association-ui-v2.js?v=1';doc.body.appendChild(s);
      const resize=()=>{try{frame.style.height=Math.max(900,doc.documentElement.scrollHeight+20)+'px';}catch(e){}};
      resize();new MutationObserver(()=>{resize();syncHost();}).observe(doc.body,{subtree:true,childList:true,attributes:true});
      doc.addEventListener('change',()=>setTimeout(syncHost,40));doc.addEventListener('input',()=>setTimeout(syncHost,40));
      window.addEventListener('resize',resize,{passive:true});setTimeout(syncHost,250);
    }catch(e){}
  });

  document.getElementById('hostAssocSelect')?.addEventListener('change',e=>{try{const child=frame.contentDocument?.getElementById('associationSelect');if(child){child.value=e.target.value;child.dispatchEvent(new Event('change',{bubbles:true}));setTimeout(syncHost,120);}}catch(err){}});
  document.getElementById('hostAssocAdd')?.addEventListener('click',()=>{try{frame.contentDocument?.getElementById('newAssociation')?.click();setTimeout(syncHost,100);}catch(e){}});
  window.addEventListener('message',e=>{if(e.origin===location.origin&&e.data?.type==='floosy-association-updated')setTimeout(syncHost,80);});

  nav.addEventListener('click',e=>{
    const b=e.target.closest('[data-page]');if(!b)return;
    const on=b===assocBtn;setTimeout(()=>assocMode(on),0);
    if(on){const title=document.getElementById('pageTitle');if(title)title.textContent='الجمعيات';const p=document.querySelector('.headline p');if(p)p.textContent='إدارة الأعضاء والأدوار والدفعات والإشعارات من مكان واحد.';}
  });
})();
