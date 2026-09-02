(()=>{
  function byId(id){return document.getElementById(id)}
  function ensureToolbar(){
    const editor=byId('budgetEditor');
    if(!editor||byId('budgetActions'))return;
    const toolbar=document.createElement('div');
    toolbar.id='budgetActions';
    toolbar.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px';
    toolbar.innerHTML='<button id="saveBudgetsBtn" class="btn primary" type="button">حفظ الموازنات</button><button id="copyPrevBudgetsBtn" class="btn" type="button">نسخ موازنات الشهر السابق</button>';
    editor.parentElement.insertBefore(toolbar,editor);

    byId('saveBudgetsBtn').onclick=saveBudgets;
    byId('copyPrevBudgetsBtn').onclick=copyPrevious;
  }

  function selectedAccount(){
    const key=byId('accountFilter')?.value||'';
    if(!key)return{accountKey:'',accountName:''};
    try{
      const reg=accountRegistry();
      const ai=reg.get(key);
      return{accountKey:key,accountName:ai?.label||''};
    }catch(_){return{accountKey:key,accountName:''}}
  }

  function collectEntries(){
    const editor=byId('budgetEditor');
    if(!editor)return[];
    const acc=selectedAccount();
    return [...editor.querySelectorAll('.budget-edit-card')].map(card=>{
      const budget=card.querySelector('label')?.textContent?.trim()||'';
      const input=card.querySelector('input');
      const amount=Number(input?.value||0);
      return{budget,amount,accountKey:acc.accountKey,accountName:acc.accountName};
    }).filter(x=>x.budget);
  }

  async function saveBudgets(){
    const month=byId('month')?.value||nowMonth();
    const btn=byId('saveBudgetsBtn');
    if(btn)btn.disabled=true;
    try{
      setStatus('جاري حفظ الموازنات...');
      const d=await req('/api/budgets/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({month,budgets:collectEntries()})});
      setStatus(`تم حفظ ${d.total||0} موازنة للشهر ${month}`,true);
      await refresh();
    }catch(e){setStatus(e.message||String(e));}
    finally{if(btn)btn.disabled=false;}
  }

  async function copyPrevious(){
    const month=byId('month')?.value||nowMonth();
    if(!confirm(`نسخ موازنات الشهر السابق إلى ${month}؟`))return;
    const btn=byId('copyPrevBudgetsBtn');
    if(btn)btn.disabled=true;
    try{
      setStatus('جاري نسخ موازنات الشهر السابق...');
      const d=await req('/api/budgets/copy-previous',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({month})});
      setStatus(`تم نسخ ${d.total||0} موازنة من ${d.from} إلى ${d.to}`,true);
      await refresh();
    }catch(e){setStatus(e.message||String(e));}
    finally{if(btn)btn.disabled=false;}
  }

  const oldRender=renderBudgets;
  renderBudgets=function(){oldRender();ensureToolbar();};
  ensureToolbar();
})();
