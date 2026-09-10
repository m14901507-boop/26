(()=>{
  const isGmailUnclassified=v=>{
    const s=String(v??'').trim().toLowerCase().replace(/[ـ_\-]+/g,' ').replace(/\s+/g,' ');
    if(!s.includes('gmail'))return false;
    return /غير\s*مصنف|بدون\s*تصنيف|غير\s*مصن[فّ]|unclassified|uncategorized|not\s*classified/.test(s);
  };

  // Unclassified Gmail messages stay in Gmail until the user labels them there.
  // They must not behave like a financial item or affect FLOOSY totals.
  try{
    const baseAllOps=allOps;
    allOps=function(){return baseAllOps().filter(x=>!isGmailUnclassified(x?.item));};
  }catch(e){}

  function cleanQuickActions(){
    document.querySelectorAll('.focus-actions').forEach(x=>x.remove());
    const hero=document.getElementById('focusHero');
    if(hero)hero.style.gridTemplateColumns='1fr';
  }

  function cleanGmailPlaceholders(){
    try{
      if(Array.isArray(DATA?.items))DATA.items=DATA.items.filter(r=>!isGmailUnclassified(r?.[0])&&!isGmailUnclassified(r?.[6]));
    }catch(e){}
    document.querySelectorAll('#itemFilter option').forEach(o=>{if(isGmailUnclassified(o.textContent)||isGmailUnclassified(o.value))o.remove();});
    document.querySelectorAll('#itemTable tbody tr').forEach(tr=>{
      const first=tr.querySelector('td')?.textContent||'';
      if(isGmailUnclassified(first))tr.remove();
    });
  }

  function clean(){cleanQuickActions();cleanGmailPlaceholders();}

  const observer=new MutationObserver(()=>clean());
  observer.observe(document.body,{childList:true,subtree:true});
  clean();

  try{
    const oldRenderAll=renderAll;
    renderAll=function(){
      cleanGmailPlaceholders();
      oldRenderAll();
      clean();
    };
  }catch(e){}

  try{
    const oldRefresh=refresh;
    refresh=async function(...args){
      const result=await oldRefresh(...args);
      cleanGmailPlaceholders();
      try{buildBaseFilters();syncDependentFilters();renderAll();}catch(e){}
      clean();
      return result;
    };
    const rb=document.getElementById('refresh');if(rb)rb.onclick=refresh;
  }catch(e){}
})();
