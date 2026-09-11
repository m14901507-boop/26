(()=>{
  if(window.__floosyAssociationEmailTemplateV1)return;window.__floosyAssociationEmailTemplateV1=true;
  const $=id=>document.getElementById(id),API='https://floosy-api.m14901507.workers.dev';
  const DEFAULT_SUBJECT='إشعار استلام دفعة — {{association_name}}';
  const DEFAULT_BODY=`الفاضل/ {{member_name}}
السلام عليكم ورحمة الله وبركاته،

تم بحمد الله استلام دفعتكم الخاصة بالجمعية بنجاح.

تفاصيل الدفعة:
- اسم الجمعية: {{association_name}}
- مبلغ الدفعة: {{amount}} ر.ع
- تاريخ الدفعة: {{payment_date}}
- الفترة: {{payment_period}}
- عدد الدفعات المسجلة: {{paid_count}}
- إجمالي الدفعات المسجلة: {{paid_total}} ر.ع

تفاصيل دوركم:
- رقم الدور: {{turn_no}}
- فترة الاستلام: {{receipt_period}}
- الاستلام الشهري المتوقع: {{monthly_receipt}} ر.ع
- إجمالي استلام الدور المتوقع: {{role_total}} ر.ع

للاطلاع على تفاصيل العضوية ومواعيد الاستلام وسجل الدفعات:
{{member_public_link}}

شاكرين لكم التزامكم وتعاونكم.

FLOOSY`;
  const money=v=>Number(v||0).toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3});
  const fmt=v=>{if(!v)return'—';const d=v instanceof Date?v:new Date(v);return isNaN(d)?String(v):d.toLocaleDateString('ar-OM',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'})};
  const getData=()=>{try{return typeof DATA!=='undefined'&&DATA?DATA:{associations:[],members:[],payments:[]}}catch(e){return{associations:[],members:[],payments:[]}}};
  const currentId=()=>String($('associationSelect')?.value||'');
  const currentAssociation=()=>{const d=getData(),id=currentId();return(d.associations||[]).find(a=>String(a.associationId)===id)||null};
  const selectedMember=()=>{const d=getData(),id=String($('paymentMemberId')?.value||'');return(d.members||[]).find(m=>String(m.memberId)===id)||null};
  let loadingTemplate=false,lastAssociationId='';

  function style(){if($('assocEmailTemplateStyle'))return;const s=document.createElement('style');s.id='assocEmailTemplateStyle';s.textContent=`
  .assoc-email-editor{margin-top:8px;border:1px solid #2a4159;border-radius:13px;background:#09121b;overflow:hidden}.assoc-email-editor>summary{padding:11px 12px;cursor:pointer;font-weight:800;color:#dbe8f5;list-style:none;display:flex;justify-content:space-between;gap:10px;align-items:center}.assoc-email-editor>summary::-webkit-details-marker{display:none}.assoc-email-editor>summary small{color:#7990a7;font-size:9px;font-weight:500}.assoc-email-editor[open]>summary{border-bottom:1px solid #22364a}.assoc-email-body{padding:12px;display:grid;gap:9px}.assoc-email-body textarea{min-height:310px;line-height:1.65;font-family:Tahoma,"Segoe UI",Arial,sans-serif}.assoc-email-vars{display:flex;gap:5px;flex-wrap:wrap}.assoc-email-var{padding:4px 7px;border:1px solid #2c465f;border-radius:999px;background:#0d1823;color:#9fc4e8;font-size:8px;cursor:pointer}.assoc-email-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center}.assoc-email-save-state{font-size:9px;color:#7f96ab}.assoc-email-preview-overlay{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.78);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;padding:20px}.assoc-email-preview-overlay.open{display:flex}.assoc-email-preview-modal{width:min(850px,100%);max-height:90vh;overflow:auto;border:1px solid #35516d;border-radius:20px;background:linear-gradient(145deg,#101a25,#070d14);box-shadow:0 30px 90px rgba(0,0,0,.55);padding:17px}.assoc-email-preview-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.assoc-email-preview-head h3{margin:0;font-size:17px}.assoc-email-preview-head p{margin:5px 0 0;color:#8499ad;font-size:9px}.assoc-email-preview-card{border:1px solid #263c52;border-radius:14px;background:#08111a;padding:13px}.assoc-email-preview-subject{padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid #22364a}.assoc-email-preview-subject span{display:block;color:#7890a7;font-size:8px}.assoc-email-preview-subject b{display:block;margin-top:4px;font-size:12px}.assoc-email-preview-message{white-space:pre-wrap;line-height:1.85;font-size:11px;color:#e8f0f7;font-family:Tahoma,"Segoe UI",Arial,sans-serif}.assoc-email-preview-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:12px}.assoc-email-notice{padding:8px 10px;border:1px solid rgba(20,146,255,.25);border-radius:10px;background:rgba(20,146,255,.05);color:#93b8d9;font-size:9px;line-height:1.6}
  `;document.head.appendChild(s)}
  async function api(path,init={}){const token=sessionStorage.getItem('floosy_preview_session')||localStorage.getItem('floosy_preview_session')||'';const r=await fetch(API+path,{...init,headers:{Accept:'application/json',Authorization:`Bearer ${token}`,...(init.headers||{})},cache:'no-store'}),d=await r.json().catch(()=>({}));if(!r.ok||d.ok===false)throw Error(d.error||`HTTP ${r.status}`);return d}
  function vars(){return['member_name','association_name','amount','payment_date','payment_period','paid_count','paid_total','turn_no','receipt_period','monthly_receipt','role_total','member_public_link']}
  function ensureEditor(){
    const form=$('paymentForm');if(!form||$('assocEmailEditor'))return !!form;style();
    const oldMessage=$('paymentMessage')?.closest('label');if(oldMessage)oldMessage.style.display='none';
    const receipt=$('receiptMessage')?.closest('label');if(receipt)receipt.style.display='none';
    const submit=[...form.querySelectorAll('button')].find(b=>b.type==='submit'||(!b.type&&/تسجيل الاستلام/.test(b.textContent||'')));
    const details=document.createElement('details');details.id='assocEmailEditor';details.className='assoc-email-editor';details.innerHTML=`<summary><span>✉ صيغة رسالة البريد كاملة</span><small>يمكن تعديل الرسالة من أول سطر إلى آخر سطر قبل الإرسال</small></summary><div class="assoc-email-body"><label class="field">عنوان الرسالة<input id="assocEmailSubject" class="control"></label><label class="field">نص الرسالة الكامل<textarea id="assocEmailBody" class="control"></textarea></label><div class="assoc-email-notice">استخدم المتغيرات التالية داخل النص، وسيستبدلها FLOOSY تلقائيًا ببيانات العضو والدفعة عند المعاينة والإرسال.</div><div id="assocEmailVars" class="assoc-email-vars"></div><div class="assoc-email-actions"><button type="button" id="assocEmailSave" class="btn primary sm">حفظ الصيغة لهذه الجمعية</button><button type="button" id="assocEmailReset" class="btn sm">استعادة الصيغة الافتراضية</button><span id="assocEmailSaveState" class="assoc-email-save-state"></span></div></div>`;
    if(submit)form.insertBefore(details,submit);else form.appendChild(details);
    $('assocEmailVars').innerHTML=vars().map(v=>`<button type="button" class="assoc-email-var" data-var="${v}">{{${v}}}</button>`).join('');
    $('assocEmailVars').onclick=e=>{const b=e.target.closest('[data-var]');if(!b)return;const ta=$('assocEmailBody'),token=`{{${b.dataset.var}}}`;if(!ta)return;const start=ta.selectionStart??ta.value.length,end=ta.selectionEnd??start;ta.value=ta.value.slice(0,start)+token+ta.value.slice(end);ta.focus();ta.selectionStart=ta.selectionEnd=start+token.length};
    $('assocEmailSave').onclick=saveTemplate;
    $('assocEmailReset').onclick=()=>{$('assocEmailSubject').value=DEFAULT_SUBJECT;$('assocEmailBody').value=DEFAULT_BODY;$('assocEmailSaveState').textContent='تم تحميل الصيغة الافتراضية. اضغط حفظ لاعتمادها.'};
    return true
  }
  async function loadTemplate(force=false){
    if(!ensureEditor())return;const id=currentId();if(!id){$('assocEmailSubject').value=DEFAULT_SUBJECT;$('assocEmailBody').value=DEFAULT_BODY;return}if(!force&&id===lastAssociationId)return;if(loadingTemplate)return;loadingTemplate=true;
    try{const d=await api('/api/preview/association/template?associationId='+encodeURIComponent(id));$('assocEmailSubject').value=d.subjectTemplate||DEFAULT_SUBJECT;$('assocEmailBody').value=d.bodyTemplate||DEFAULT_BODY;lastAssociationId=id;$('assocEmailSaveState').textContent=d.isDefault?'الصيغة الافتراضية الحالية — يمكنك تعديلها وحفظها.':'تم تحميل الصيغة المحفوظة.'}
    catch(e){$('assocEmailSubject').value=DEFAULT_SUBJECT;$('assocEmailBody').value=DEFAULT_BODY;$('assocEmailSaveState').textContent='تعذر تحميل الصيغة المحفوظة؛ تم استخدام الافتراضية.'}
    finally{loadingTemplate=false}
  }
  async function saveTemplate(){const id=currentId();if(!id)return;$('assocEmailSaveState').textContent='جاري الحفظ…';try{await api('/api/preview/association/template',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({associationId:id,subjectTemplate:$('assocEmailSubject').value,bodyTemplate:$('assocEmailBody').value})});lastAssociationId=id;$('assocEmailSaveState').textContent='✓ تم حفظ الصيغة لهذه الجمعية.'}catch(e){$('assocEmailSaveState').textContent='تعذر الحفظ: '+e.message}}
  function roleInfo(a,m){try{const sc=window.__floosyAssociationReceiptSchedule?.(Number(m.turnNo||1));if(sc)return sc}catch(e){}try{const r=window.__floosyAssociationStrictPeriod?.(Number(m.turnNo||1));if(r)return{...r,monthlyPool:0,total:0}}catch(e){}return null}
  function values(){
    const d=getData(),a=currentAssociation(),m=selectedMember(),amount=Number($('paymentAmount')?.value||0),date=$('paymentDate')?.value||'',period=$('paymentPeriod')?.value||'',mine=(d.payments||[]).filter(p=>String(p.memberId)===String(m?.memberId)&&String(p.associationId)===String(a?.associationId)),paidBefore=mine.reduce((s,p)=>s+Number(p.amount||0),0),sc=a&&m?roleInfo(a,m):null;
    return{member_name:m?.name||'عضو الجمعية',association_name:a?.name||'الجمعية',amount:money(amount),payment_date:fmt(date),payment_period:period||'—',paid_count:String(mine.length+1),paid_total:money(paidBefore+amount),turn_no:String(m?.turnNo||'—'),receipt_period:sc?.start&&sc?.end?`من ${fmt(sc.start)} إلى ${fmt(sc.end)}`:'—',monthly_receipt:sc?.monthlyPool?money(sc.monthlyPool):'—',role_total:sc?.total?money(sc.total):'—',member_public_link:m?.publicUrl||'—'}
  }
  function renderTemplate(text,map){return String(text||'').replace(/\{\{([a-z_]+)\}\}/g,(all,key)=>Object.prototype.hasOwnProperty.call(map,key)?String(map[key]):all)}
  function ensureModal(){if($('assocEmailPreviewOverlay'))return;const div=document.createElement('div');div.id='assocEmailPreviewOverlay';div.className='assoc-email-preview-overlay';div.innerHTML=`<div class="assoc-email-preview-modal"><div class="assoc-email-preview-head"><div><h3>معاينة رسالة البريد قبل الإرسال</h3><p id="assocEmailPreviewTo"></p></div><button type="button" id="assocEmailPreviewClose" class="btn sm">إغلاق</button></div><div class="assoc-email-preview-card"><div class="assoc-email-preview-subject"><span>العنوان</span><b id="assocEmailPreviewSubject"></b></div><div id="assocEmailPreviewMessage" class="assoc-email-preview-message"></div></div><div class="assoc-email-preview-actions"><button type="button" id="assocEmailBackEdit" class="btn">العودة للتعديل</button><button type="button" id="assocEmailConfirm" class="btn green">تسجيل الدفعة وإرسال البريد</button></div></div>`;document.body.appendChild(div);$('assocEmailPreviewClose').onclick=closeModal;$('assocEmailBackEdit').onclick=()=>{closeModal();$('assocEmailEditor').open=true;$('assocEmailBody').focus()}}
  function closeModal(){$('assocEmailPreviewOverlay')?.classList.remove('open')}
  function openPreview(){ensureModal();const m=selectedMember(),map=values(),subject=renderTemplate($('assocEmailSubject').value,map),body=renderTemplate($('assocEmailBody').value,map);$('assocEmailPreviewTo').textContent=`إلى: ${m?.email||'لا يوجد بريد مسجل'}`;$('assocEmailPreviewSubject').textContent=subject;$('assocEmailPreviewMessage').textContent=body;$('assocEmailPreviewOverlay').dataset.subject=subject;$('assocEmailPreviewOverlay').dataset.message=body;$('assocEmailPreviewOverlay').classList.add('open')}
  async function confirmSend(){
    const overlay=$('assocEmailPreviewOverlay'),btn=$('assocEmailConfirm'),member=selectedMember();if(!overlay||!member)return;btn.disabled=true;btn.textContent='جاري التسجيل والإرسال…';
    const body={associationId:currentId(),memberId:member.memberId,amount:Number($('paymentAmount').value||0),date:$('paymentDate').value,period:$('paymentPeriod').value,notes:$('paymentNotes').value,sendEmail:true,subject:overlay.dataset.subject||'',fullMessage:overlay.dataset.message||''};
    try{const d=await api('/api/preview/associations/payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});closeModal();const st=$('status');if(st){st.className=/تم الإرسال/.test(d.emailStatus)?'status good':'status warn';st.textContent=`تم تسجيل الدفعة — حالة إشعار البريد: ${d.emailStatus||'غير محدد'}`;}setTimeout(()=>$('refresh')?.click(),350)}catch(e){const st=$('status');if(st){st.className='status bad';st.textContent=e.message}}
    finally{btn.disabled=false;btn.textContent='تسجيل الدفعة وإرسال البريد'}
  }
  function installSubmitGuard(){const form=$('paymentForm');if(!form||form.dataset.emailPreviewGuard)return false;form.dataset.emailPreviewGuard='1';form.addEventListener('submit',e=>{if(!$('sendEmail')?.checked)return;e.preventDefault();e.stopImmediatePropagation();loadTemplate().then(openPreview)},true);ensureModal();$('assocEmailConfirm').onclick=confirmSend;return true}
  function install(){if(!ensureEditor())return false;installSubmitGuard();loadTemplate();$('associationSelect')?.addEventListener('change',()=>{lastAssociationId='';setTimeout(()=>loadTemplate(true),40)});return true}
  let tries=0,t=setInterval(()=>{if(install()||++tries>60)clearInterval(t)},100);
})();
