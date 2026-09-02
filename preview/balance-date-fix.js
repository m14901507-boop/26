(()=>{
  function parseBalanceDate(v){
    if(v===null||v===undefined||v==='')return null;
    if(v instanceof Date)return isNaN(v.getTime())?null:v;
    if(typeof v==='number'&&v>20000){const d=new Date(Date.UTC(1899,11,30)+Number(v)*86400000);return isNaN(d.getTime())?null:d;}
    const s=String(v).trim();
    let m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if(m){const d=new Date(+m[3],+m[2]-1,+m[1],+(m[4]||0),+(m[5]||0),+(m[6]||0));return isNaN(d.getTime())?null:d;}
    m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?$/);
    if(m){const d=new Date(s);if(!isNaN(d.getTime()))return d;const x=new Date(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0));return isNaN(x.getTime())?null:x;}
    const d=new Date(s);return isNaN(d.getTime())?null:d;
  }
  function formatBalanceDate(v){const d=parseBalanceDate(v);if(!d)return'—';const p=n=>String(n).padStart(2,'0');return`${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`;}
  window.parseBalanceDate=parseBalanceDate;
  try{
    balanceMap=function(){
      const m=new Map();
      const add=(bankRaw,noRaw,balance,date)=>{
        const bank=String(bankRaw||'').trim()||'غير محدد',no=normalizeAccountNo(bank,noRaw),value=Number(balance);
        if(bank==='غير محدد'||no==='—'||!Number.isFinite(value))return;
        const key=bank+'|'+no,d=parseBalanceDate(date),ts=d?d.getTime():0,old=m.get(key),od=old?parseBalanceDate(old.date):null,oldTs=od?od.getTime():-1;
        if(!old||ts>=oldTs)m.set(key,{bank,number:no,key,label:`${bank} — حساب ${no}`,balance:value,date:date||''});
      };
      for(const x of DATA.balances||[])add(x.bankName,x.accountNumber,x.balance,x.date);
      for(const x of DATA.messages||[]){if(x.balance==null)continue;const ai=accountInfo(`${x.bankName||x.bank||x.from||''} ${x.accountNumber||''} ${x.subject||''} ${x.preview||''}`);add(x.bankName||ai.bank,x.accountNumber||ai.number,x.balance,x.date);}
      return m;
    };
  }catch(e){}
  try{
    renderAccounts=function(){
      const s=summary(),bm=balanceMap(),selected=selectedBalance(),reg=accountRegistry(),rows=[...reg.values()];
      kpis('accountKpis',[['الرصيد المؤكد',selected.value==null?'—':money(selected.value),selected.label,'green'],['أرصدة مؤكدة',selected.count,'من Google Sheets'],['عدد العمليات',s.ops.length,s.label],['الخارج',money(s.spent),'','red'],['الداخل',money(s.income),'','green'],['الحساب المحدد',selected.label,'']]);
      bars('accountBars',[...bm.values()].map(x=>({k:x.label,v:x.balance})));
      $('accountChart').innerHTML=svgTrend(temporalRepeatData());
      insights('accountInsights',[[selected.value==null?'warn':'good','آخر رصيد مؤكد',selected.value==null?'لا يوجد رصيد مؤكد مسجل لهذا الحساب':money(selected.value)],['good','الحساب',selected.label],['warn','المصدر','أحدث رصيد فعلي حسب تاريخ الرصيد في Google Sheets']]);
      $('accountTable').innerHTML=rows.map(ai=>{const os=s.ops.filter(x=>x.accountKey===ai.key),out=os.filter(x=>!/دخل|وارد/i.test(x.movement)).reduce((a,c)=>a+c.amount,0),inc=os.filter(x=>/دخل|وارد/i.test(x.movement)).reduce((a,c)=>a+c.amount,0),lb=bm.get(ai.key);return`<tr><td>${esc(ai.bank)}</td><td class="account-no">${esc(ai.number)}</td><td>${lb?money(lb.balance):'غير مؤكد'}</td><td>${lb?.date?esc(formatBalanceDate(lb.date)):'—'}</td><td>${os.length}</td><td>${money(out)}</td><td>${money(inc)}</td></tr>`}).join('');
    };
  }catch(e){}
})();
