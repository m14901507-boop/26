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

    selectedBalance=function(){
      const f=filterState(),bm=balanceMap(),reg=accountRegistry();
      if(f.account){const x=bm.get(f.account),ri=reg.get(f.account);return{value:x?.balance??null,partialValue:x?.balance??null,label:ri?.label||x?.label||f.account,count:x?1:0,total:1,complete:Boolean(x),missing:x?[]:[ri?.label||f.account],date:x?.date||''};}
      const known=[...reg.values()].filter(x=>x&&x.key),confirmed=known.map(x=>bm.get(x.key)).filter(Boolean),missing=known.filter(x=>!bm.has(x.key));
      const partial=confirmed.length?confirmed.reduce((s,x)=>s+Number(x.balance||0),0):null,complete=known.length>0&&missing.length===0;
      return{value:complete?partial:null,partialValue:partial,label:complete?'كل الحسابات':`غير مكتمل — ${confirmed.length}/${known.length} حسابات`,count:confirmed.length,total:known.length,complete,missing:missing.map(x=>x.label),date:''};
    };
  }catch(e){}

  function fixedBalanceAccounts(){
    const reg=accountRegistry(),bm=balanceMap(),m=new Map();
    for(const ai of reg.values())if(ai&&ai.key)m.set(ai.key,{...ai});
    for(const x of bm.values())if(x&&x.key&&!m.has(x.key))m.set(x.key,{bank:x.bank,number:x.number,key:x.key,label:x.label});
    return[...m.values()].sort((a,b)=>String(a.bank||'').localeCompare(String(b.bank||''),'ar')||String(a.number||'').localeCompare(String(b.number||''),'en',{numeric:true}));
  }

  try{
    renderAccounts=function(){
      const s=summary(),bm=balanceMap(),rows=fixedBalanceAccounts();
      const confirmed=rows.filter(ai=>bm.has(ai.key));
      const cards=rows.map(ai=>{
        const lb=bm.get(ai.key),title=`${ai.bank} — حساب ${ai.number}`;
        return[title,lb?money(lb.balance):'—',lb?.date?`آخر رصيد مؤكد: ${formatBalanceDate(lb.date)}`:'لا يوجد رصيد مؤكد بعد',lb?'green':'gold'];
      });
      if(!cards.length)cards.push(['الأرصدة المؤكدة','—','لم يتم اكتشاف حسابات بعد','gold']);
      kpis('accountKpis',cards);

      bars('accountBars',[...bm.values()].map(x=>({k:x.label,v:x.balance})));
      $('accountChart').innerHTML=svgTrend(temporalRepeatData());
      const complete=rows.length>0&&confirmed.length===rows.length;
      const total=confirmed.reduce((sum,ai)=>sum+Number(bm.get(ai.key)?.balance||0),0);
      const balanceInsight=complete
        ?['good','إجمالي الأرصدة المؤكدة',money(total)]
        :['warn','الأرصدة المؤكدة',`${confirmed.length}/${rows.length} حسابات لديها رصيد مؤكد — لا يتم عرض مجموع ناقص على أنه إجمالي مؤكد`];
      insights('accountInsights',[balanceInsight,['good','طريقة العرض','بطاقة ثابتة لكل حساب — لا تعتمد على اختيار الموازنة أو فلاتر الصفحة'],['warn','المصدر','أحدث رصيد فعلي محفوظ لكل حساب في Google Sheets']]);

      $('accountTable').innerHTML=rows.map(ai=>{const os=s.ops.filter(x=>x.accountKey===ai.key),out=spendOps().filter(x=>x.accountKey===ai.key).reduce((a,c)=>a+c.amount,0),inc=os.filter(x=>!/تحويل\s*داخلي|تحويلات\s*داخلية|internal\s*transfer/i.test(x.movement)&&/دخل|وارد|credit|income/i.test(x.movement)).reduce((a,c)=>a+c.amount,0),lb=bm.get(ai.key);return`<tr><td>${esc(ai.bank)}</td><td class="account-no">${esc(ai.number)}</td><td>${lb?money(lb.balance):'غير مؤكد'}</td><td>${lb?.date?esc(formatBalanceDate(lb.date)):'—'}</td><td>${os.length}</td><td>${money(out)}</td><td>${money(inc)}</td></tr>`}).join('');
    };
  }catch(e){}
})();
