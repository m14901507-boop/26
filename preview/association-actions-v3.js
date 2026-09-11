(()=>{
  if(window.__floosyAssociationActionsV3)return;window.__floosyAssociationActionsV3=true;
  const API='https://floosy-api.m14901507.workers.dev';
  const $=id=>document.getElementById(id);
  const originalFetch=window.fetch.bind(window);
  const token=()=>sessionStorage.getItem('floosy_preview_session')||'';
  const status=(text,type='')=>{const s=$('status');if(!s)return;s.textContent=text;s.className='status'+(type?' '+type:'');};
  async function api(path,body){
    const r=await originalFetch(API+path,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json',...(token()?{Authorization:'Bearer '+token()}:{})},body:JSON.stringify(body),credentials:'omit'});
    const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'API '+r.status);return d;
  }
  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:input?.url||'';
    let nextInit=init;
    if(url.includes('/api/preview/associations/member/upsert')&&String(init?.method||'GET').toUpperCase()==='POST'&&init?.body){
      try{
        const p=JSON.parse(String(init.body));
        const selected=$('associationSelect')?.value||'';
        if(selected)p.associationId=selected;
        nextInit={...init,body:JSON.stringify(p)};
      }catch(e){}
    }
    return originalFetch(input,nextInit);
  };
  function openAssociationEditor(){
    const details=$('associationForm')?.closest('details');
    if(details)details.open=true;
    $('associationName')?.focus();
    $('associationForm')?.scrollIntoView({behavior:'smooth',block:'center'});
  }
  function openMemberEditorSafe(){
    const sel=$('associationSelect');
    if(!sel?.value){status('أنشئ جمعية أولاً ثم أضف الأعضاء.','warn');return;}
    sel.dispatchEvent(new Event('change',{bubbles:true}));
    setTimeout(()=>{$('addMember')?.click();},0);
  }
  async function deleteAssociation(){
    const id=$('associationSelect')?.value||'';
    const name=$('associationSelect')?.selectedOptions?.[0]?.textContent||'الجمعية';
    if(!id)return status('لا توجد جمعية محددة للحذف.','warn');
    if(!confirm(`هل تريد حذف ${name} من العرض؟\nسيتم الاحتفاظ بسجل الدفعات في البيانات.`))return;
    try{status('جاري حذف الجمعية…');await api('/api/preview/associations/delete',{associationId:id});$('refresh')?.click();window.parent?.postMessage({type:'floosy-association-updated'},location.origin);status('تم حذف الجمعية من القائمة مع الاحتفاظ بالسجل.','good');}
    catch(e){status(e.message||String(e),'bad');}
  }
  async function deleteMember(memberId,name){
    if(!memberId)return;
    if(!confirm(`هل تريد حذف العضو ${name||''} من الجمعية؟\nسيتم الاحتفاظ بسجل دفعاته في البيانات.`))return;
    try{status('جاري حذف العضو…');await api('/api/preview/associations/member/delete',{memberId});$('refresh')?.click();status('تم حذف العضو من القائمة مع الاحتفاظ بسجل الدفعات.','good');}
    catch(e){status(e.message||String(e),'bad');}
  }
  function addMemberDeleteButtons(){
    document.querySelectorAll('.memberCard').forEach(card=>{
      const actions=card.querySelector('.rowActions');if(!actions||actions.querySelector('[data-act="delete"]'))return;
      const any=actions.querySelector('button[data-id]');const memberId=any?.dataset?.id;if(!memberId)return;
      const name=card.querySelector('.memberName')?.textContent||'';
      const b=document.createElement('button');b.type='button';b.className='btn sm red';b.dataset.act='delete';b.dataset.id=memberId;b.textContent='حذف';
      b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();deleteMember(memberId,name);});
      actions.appendChild(b);
    });
  }
  function fixAddMember(){
    const add=$('addMember');if(!add||add.dataset.v3Fixed)return;add.dataset.v3Fixed='1';
    const old=add.onclick;
    add.onclick=e=>{
      const sel=$('associationSelect');if(!sel?.value){status('أنشئ جمعية أولاً ثم أضف الأعضاء.','warn');return;}
      sel.dispatchEvent(new Event('change',{bubbles:true}));
      if(typeof old==='function')old.call(add,e);
      setTimeout(()=>{const editor=$('memberEditor');if(editor&&!editor.classList.contains('active'))editor.classList.add('active');$('memberName')?.focus();},0);
    };
  }
  function enhance(){addMemberDeleteButtons();fixAddMember();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance);else enhance();
  new MutationObserver(enhance).observe(document.documentElement,{subtree:true,childList:true});
  window.__floosyAssociationOpenMember=openMemberEditorSafe;
  window.__floosyAssociationEdit=openAssociationEditor;
  window.__floosyAssociationDelete=deleteAssociation;
})();
