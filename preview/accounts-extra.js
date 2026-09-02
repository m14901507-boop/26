(()=>{
  const API='https://floosy-api.m14901507.workers.dev';
  const page=document.getElementById('accounts');
  if(!page)return;
  const panel=document.createElement('div');
  panel.className='panel';
  panel.id='internalTransfersPanel';
  panel.innerHTML='<h2>التحويلات الداخلية</h2><div class="table-wrap"><table class="table"><thead><tr><th>التاريخ والوقت</th><th>الحساب</th><th>البند</th><th>المبلغ</th><th>الوصف</th></tr></thead><tbody id="internalTransfersRows"><tr><td colspan="5">جاري التحميل…</td></tr></tbody></table></div>';
  page.appendChild(panel);

  const norm=s=>String(s||'').toLowerCase().replace(/[\s_\-]+/g,'');
  function idx(h,patterns){for(let i=0;i<h.length;i++){const x=norm(h[i]);if(patterns.some(p=>p.test(x)))return i;}return-1;}
  function money(v){return Number(v||0).toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3})+' ر.ع';}
  function dateText(v){const d=new Date(v);return isNaN(d.getTime())?String(v||'—'):d.toLocaleString('ar-OM');}
  async function req(path){const token=sessionStorage.getItem('floosy_preview_session');const r=await fetch(API+path,{headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{})},credentials:'omit'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'API '+r.status);return d;}
  async function load(){const body=document.getElementById('internalTransfersRows');if(!body)return;try{const d=await req('/api/accounts/internal-transfers'),h=d.headers||[],m={date:idx(h,[/التاريخوالوقت/,/التاريخ/,/date/]),item:idx(h,[/^البند$/,/item/]),amount:idx(h,[/المبلغ/,/amount/]),account:idx(h,[/^البنك$/,/الحساب/,/bank/,/account/]),desc:idx(h,[/الطرف/,/الوصف/,/description/,/merchant/])};const rows=(d.rows||[]).slice().sort((a,b)=>new Date(b[m.date]).getTime()-new Date(a[m.date]).getTime());body.innerHTML=rows.length?rows.map(r=>`<tr><td>${dateText(r[m.date])}</td><td>${r[m.account]||'—'}</td><td>${r[m.item]||'—'}</td><td class="account-no">${money(r[m.amount])}</td><td class="description">${r[m.desc]||'—'}</td></tr>`).join(''):'<tr><td colspan="5">لا توجد تحويلات داخلية مصنفة في دليل البنود ضمن البيانات الحالية.</td></tr>';}
    catch(e){body.innerHTML=`<tr><td colspan="5">${String(e.message||e)}</td></tr>`;}}

  const originalRefresh=document.getElementById('refresh');
  if(originalRefresh)originalRefresh.addEventListener('click',()=>setTimeout(load,900));
  document.getElementById('nav')?.addEventListener('click',e=>{const b=e.target.closest('[data-page="accounts"]');if(b)setTimeout(load,100);});
  setTimeout(load,1200);
})();
