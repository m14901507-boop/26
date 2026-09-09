(()=>{
  const authToken=()=>sessionStorage.getItem('floosy_preview_session')||localStorage.getItem('floosy_preview_session');
  req=async function(path,opt={}){
    const token=authToken();
    const headers={Accept:'application/json',...(opt.headers||{})};
    if(token)headers.Authorization='Bearer '+token;
    const response=await fetch(API+path,{...opt,headers,credentials:'include'});
    const data=await response.json().catch(()=>({}));
    if(response.status===401){
      if(path!=='/auth/login'){
        sessionStorage.removeItem('floosy_preview_session');
        localStorage.removeItem('floosy_preview_session');
      }
      const message=data.error&&data.error!=='Unauthorized'
        ?data.error
        :(path==='/auth/login'?'تعذر تسجيل الدخول. تحقق من كلمة المرور.':'انتهت جلسة FLOOSY. سجّل الدخول مرة أخرى.');
      const error=new Error(message);
      error.status=401;
      throw error;
    }
    if(!response.ok)throw new Error(data.error||('API '+response.status));
    return data;
  };

  const loginForm=document.getElementById('loginForm');
  if(loginForm)loginForm.onsubmit=async event=>{
    event.preventDefault();
    sessionStorage.removeItem('floosy_preview_session');
    localStorage.removeItem('floosy_preview_session');
    try{
      const data=await req('/auth/login',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({password:$('password').value})
      });
      if(!data.session)throw new Error('الخادم لم يُرجع جلسة تسجيل دخول.');

      sessionStorage.setItem('floosy_preview_session',data.session);
      localStorage.setItem('floosy_preview_session',data.session);

      // Verify the newly issued token before requesting protected data.
      const status=await req('/auth/status?ts='+Date.now());
      if(!status.authenticated){
        sessionStorage.removeItem('floosy_preview_session');
        localStorage.removeItem('floosy_preview_session');
        throw new Error('تم قبول كلمة المرور لكن الخادم لم يقبل الجلسة الجديدة. يلزم تحديث Cloudflare Worker.');
      }

      $('password').value='';
      setStatus('تم تسجيل الدخول بنجاح. جاري تحميل البيانات...',true);
      await refresh();
    }catch(error){
      setStatus(error.message||String(error));
      $('loginBox').style.display='block';
    }
  };

  refresh=async function(){
    if(!authToken()){
      setStatus('الواجهة جاهزة. أدخل كلمة المرور لتسجيل الدخول.');
      $('loginBox').style.display='block';
      return;
    }
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
      if(o.ok===false||!Array.isArray(o.rows)||!Array.isArray(o.headers))throw new Error(o.error||'استجابة العمليات غير صالحة؛ تعذر قراءة بيانات الشيت');
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
      const records=allOps(),invalidDates=records.filter(x=>!x.d).length,invalidAmounts=records.filter(x=>!Number.isFinite(x.amount)).length;
      if(invalidDates)warnings.push(`${invalidDates} عملية بتاريخ غير صالح`);
      if(invalidAmounts)warnings.push(`${invalidAmounts} عملية بمبلغ غير صالح`);
      setStatus(warnings.length?`تم تحميل العمليات — تعذر مؤقتًا: ${warnings.join('، ')}`:`متصل — ${DATA.operations.length} عملية، ${balanceMap().size} رصيد مؤكد`,warnings.length===0);
    }catch(e){
      setStatus(e.message||String(e));
      if(e.status===401||String(e.message).includes('Unauthorized')||String(e.message).includes('جلسة'))$('loginBox').style.display='block';
    }
  };
  const r=document.getElementById('refresh');if(r)r.onclick=refresh;
})();
