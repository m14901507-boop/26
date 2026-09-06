(()=>{
  refresh=async function(){
    setStatus('جاري تحميل بيانات Google Sheets...');
    const get=path=>req(path).catch(error=>({__error:error}));
    try{
      const [b,i,o,lb]=await Promise.all([
        get('/api/budgets?ts='+Date.now()),
        get('/api/items?ts='+Date.now()),
        get('/api/operations?ts='+Date.now()),
        get('/api/gmail/latest-balances?ts='+Date.now())
      ]);
      if(o.__error)throw o.__error;
      DATA={
        budgets:b.__error?DATA.budgets:(b.rows||[]),
        items:i.__error?DATA.items:(i.rows||[]),
        operations:o.rows||[],
        opHeaders:o.headers||[],
        messages:[],
        balances:lb.__error?DATA.balances:(lb.balances||[]),
        liveCount:0
      };
      $('loginBox').style.display='none';
      buildBaseFilters();
      syncDependentFilters();
      renderAll();
      $('liveNote').textContent='العرض من Google Sheets — Gmail يتزامن عند الضغط على تحديث العمليات';
      const warnings=[b.__error?'الموازنات':'',i.__error?'البنود':'',lb.__error?'الأرصدة':''].filter(Boolean);
      setStatus(warnings.length?`تم تحميل العمليات — تعذر مؤقتًا: ${warnings.join('، ')}`:`متصل — ${DATA.operations.length} عملية، ${balanceMap().size} رصيد مؤكد`,warnings.length===0);
    }catch(e){
      setStatus(e.message||String(e));
      if(String(e.message).includes('Unauthorized'))$('loginBox').style.display='block';
    }
  };
  const r=document.getElementById('refresh');if(r)r.onclick=refresh;
})();