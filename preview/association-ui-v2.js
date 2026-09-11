(()=>{
  if(window.__floosyAssocUiV2)return;window.__floosyAssocUiV2=true;
  const API='https://floosy-api.m14901507.workers.dev';
  const $=id=>document.getElementById(id);
  const originalFetch=window.fetch.bind(window);
  const labelOf=id=>$(id)?.closest('label.field')||$(id)?.parentElement;
  const addMonths=(value,months)=>{
    const m=/^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(value||''));if(!m)return'';
    const d=new Date(Date.UTC(+m[1],+m[2]-1,+(m[3]||1)));d.setUTCMonth(d.getUTCMonth()+Math.max(0,Number(months)||0));
    return d.toISOString().slice(0,10);
  };
  const monthsBetween=(a,b)=>{
    const x=new Date(a),y=new Date(b);if(isNaN(x)||isNaN(y)||y<x)return 0;
    let n=(y.getFullYear()-x.getFullYear())*12+(y.getMonth()-x.getMonth());if(y.getDate()>x.getDate())n++;return Math.max(1,n);
  };
  function setLabel(id,text){const l=labelOf(id);if(!l)return;for(const n of l.childNodes){if(n.nodeType===3&&String(n.textContent||'').trim()){n.textContent=text;return;}}l.insertBefore(document.createTextNode(text),l.firstChild);}
  function syncEnd(){const s=$('startMonth')?.value,d=Number($('durationMonths')?.value||0),e=$('associationEndDate');if(s&&d>0&&e)e.value=addMonths(s,d);if($('firstPayoutMonth'))$('firstPayoutMonth').value=s||'';}
  function syncDuration(){const s=$('startMonth')?.value,e=$('associationEndDate')?.value;if(s&&e&&$('durationMonths'))$('durationMonths').value=monthsBetween(s,e)||$('durationMonths').value;}
  async function loadExtended(){
    const sel=$('associationSelect'),planned=$('associationPlannedMembers'),end=$('associationEndDate');if(!sel||!planned||!end)return;
    try{
      const token=sessionStorage.getItem('floosy_preview_session');if(!token)return;
      const r=await originalFetch(API+'/api/preview/associations',{headers:{Accept:'application/json',Authorization:'Bearer '+token},credentials:'omit'});if(!r.ok)return;
      const d=await r.json();const a=(d.associations||[]).find(x=>String(x.associationId)===String(sel.value));
      if(a){planned.value=a.plannedMembers||'';end.value=a.endDate||addMonths(a.startMonth,a.durationMonths);}
      else{planned.value='';end.value='';}
    }catch(e){}
    window.parent?.postMessage({type:'floosy-association-updated'},location.origin);
  }
  window.fetch=async function(input,init){
    let nextInit=init,url=typeof input==='string'?input:input?.url||'';
    if(url.includes('/api/preview/associations/upsert')&&String(init?.method||'GET').toUpperCase()==='POST'&&init?.body){
      try{
        const p=JSON.parse(String(init.body));
        p.plannedMembers=Math.max(0,Math.round(Number($('associationPlannedMembers')?.value||0)));
        p.endDate=$('associationEndDate')?.value||'';
        p.startMonth=$('startMonth')?.value||p.startMonth||'';
        p.firstPayoutMonth=p.startMonth;
        p.paymentEveryMonths=1;
        p.payoutEveryMonths=Math.max(1,Number($('payoutEveryMonths')?.value||1));
        nextInit={...init,body:JSON.stringify(p)};
      }catch(e){}
    }
    const r=await originalFetch(input,nextInit);
    if(url.includes('/api/preview/associations/upsert')&&r.ok)setTimeout(loadExtended,250);
    return r;
  };
  function enhance(){
    const form=$('associationForm');if(!form||$('associationPlannedMembers'))return;
    setLabel('contributionAmount','مبلغ المساهمة لكل عضو');
    setLabel('durationMonths','مدة الجمعية (بالأشهر)');
    setLabel('startMonth','تاريخ بدء الجمعية');
    setLabel('payoutEveryMonths','فترة كل دورة استلام الجمعية (بالأشهر)');
    if($('startMonth'))$('startMonth').type='date';
    const payEvery=labelOf('paymentEveryMonths');if(payEvery){payEvery.style.display='none';if($('paymentEveryMonths'))$('paymentEveryMonths').value='1';}
    const firstPayout=labelOf('firstPayoutMonth');if(firstPayout)firstPayout.style.display='none';
    const plannedLabel=document.createElement('label');plannedLabel.className='field';plannedLabel.innerHTML='عدد الأعضاء<input id="associationPlannedMembers" class="control" type="number" min="1" step="1" placeholder="مثال: 10">';
    const endLabel=document.createElement('label');endLabel.className='field';endLabel.innerHTML='تاريخ انتهاء الجمعية<input id="associationEndDate" class="control" type="date">';
    const nameLabel=labelOf('associationName');nameLabel?.after(plannedLabel);
    const startLabel=labelOf('startMonth');startLabel?.after(endLabel);
    $('startMonth')?.addEventListener('change',syncEnd);$('durationMonths')?.addEventListener('input',syncEnd);$('associationEndDate')?.addEventListener('change',()=>{syncDuration();if($('firstPayoutMonth'))$('firstPayoutMonth').value=$('startMonth')?.value||'';});
    $('associationSelect')?.addEventListener('change',()=>setTimeout(loadExtended,80));
    $('newAssociation')?.addEventListener('click',()=>setTimeout(()=>{if($('associationPlannedMembers'))$('associationPlannedMembers').value='';if($('associationEndDate'))$('associationEndDate').value='';},0));
    const submit=form.querySelector('button[type="submit"],button:not([type])');if(submit)submit.textContent='حفظ بيانات الجمعية';
    const receiptLabel=labelOf('receiptMessage');if(receiptLabel){const details=document.createElement('details');details.style.marginTop='4px';const sum=document.createElement('summary');sum.textContent='إعدادات إضافية للإشعارات والملاحظات';sum.style.cursor='pointer';receiptLabel.parentNode?.insertBefore(details,receiptLabel);details.append(sum,receiptLabel);const notes=labelOf('associationNotes');if(notes)details.appendChild(notes);}
    setTimeout(()=>{syncEnd();loadExtended();},120);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance);else enhance();
  new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
})();
