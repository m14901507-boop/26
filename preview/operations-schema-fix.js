/* Resolve operations by named headers so column moves do not change meaning. */
(()=>{
  function budgetName(value){
    const name=String(value??'').trim().replace(/\s+/g,' ');
    const aliases={'العائلي الشهري':'عائلي شهري','العائلي السنوي':'عائلي سنوي','الشخصي الشهري':'شخصي شهري','الشخصي السنوي':'شخصي سنوي'};
    return aliases[name]||name;
  }
  budgetForItem=function(r){const name=budgetName(r?.[1]);return defs.includes(name)?name:'';};
  budgetAmount=function(name,month){
    const row=DATA.budgets.find(r=>{const d=parseDate(r[0]);return (d?mk(d)===month:String(r[0]).includes(month))&&budgetName(r[2])===budgetName(name);});
    return row?Number(row[4])||0:0;
  };
  const originalAccountNo=normalizeAccountNo;
  normalizeAccountNo=function(bank,no){
    if(bank==='ميثاق'&&['22','022','0022'].includes(String(no??'').replace(/\D/g,'')))return '0022';
    return originalAccountNo(bank,no);
  };
  function columnMap(){
    const headers=(DATA.opHeaders||[]).map(h=>String(h??'').trim().replace(/[\u200e\u200f\u061c\ufeff]/g,''));
    const names={id:'معرف الرسالة',date:'التاريخ والوقت',item:'البند',classification:'التصنيف',amount:'المبلغ',desc:'الطرف',movement:'نوع العملية',bank:'البنك',accountKey:'معرف الحساب',sourceBudget:'مصدر الموازنة'};
    const map={};
    for(const [key,name] of Object.entries(names)){
      map[key]=headers.indexOf(name);
      if(map[key]>=0&&headers.lastIndexOf(name)!==map[key])throw new Error('عنوان مكرر في ورقة العمليات: '+name);
    }
    for(const key of ['date','item','amount','movement'])if(map[key]<0)throw new Error('عنوان مفقود في ورقة العمليات: '+names[key]);
    return map;
  }
  function amountValue(v){
    if(typeof v==='number')return Number.isFinite(v)?Math.abs(v):NaN;
    const s=String(v??'').trim().replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/٬/g,',').replace(/٫/g,'.');
    if(!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s))return NaN;
    return Math.abs(Number(s.replace(/,/g,'')));
  }
  function accountFromKey(key,bankRaw){
    const k=String(key||'').trim();
    if(k==='AHLI_001')return{key:'بنك الأهلي|001',bank:'بنك الأهلي',number:'001',label:'بنك الأهلي — حساب 001'};
    if(k==='AHLI_002')return{key:'بنك الأهلي|002',bank:'بنك الأهلي',number:'002',label:'بنك الأهلي — حساب 002'};
    if(k==='MEETHAQ_21')return{key:'ميثاق|0021',bank:'ميثاق',number:'0021',label:'ميثاق — حساب 0021'};
    if(k==='MEETHAQ_22')return{key:'ميثاق|0022',bank:'ميثاق',number:'0022',label:'ميثاق — حساب 0022'};
    if(k==='SOHAR_7010')return{key:'بنك صحار|7010',bank:'بنك صحار',number:'7010',label:'بنك صحار — حساب 7010'};
    if(k==='SOHAR_7240')return{key:'بنك صحار|7240',bank:'بنك صحار',number:'7240',label:'بنك صحار — حساب 7240'};
    if(k.startsWith('DHOFAR_')){const n=k.slice(7)||'—';return{key:'بنك ظفار|'+n,bank:'بنك ظفار',number:n,label:'بنك ظفار — حساب '+n};}
    const ai=accountInfo(String(bankRaw||''));
    return{key:ai.key,bank:ai.bank,number:ai.number,label:ai.label};
  }

  allOps=function(){
    const rows=Array.isArray(DATA.operations)?DATA.operations:[];
    if(!rows.length)return [];
    const ix=columnMap();
    return rows.filter(r=>Array.isArray(r)&&r.some(v=>String(v??'').trim()!=='')).map(r=>{
      const d=parseDate(r[ix.date]);
      const item=String(r[ix.item]??'').trim();
      const classification=String(r[ix.classification]??'').trim();
      const amount=amountValue(r[ix.amount]);
      const desc=String(r[ix.desc]??'').trim();
      const movement=String(r[ix.movement]??'').trim();
      const bankRaw=String(r[ix.bank]??'').trim();
      const accountKeyRaw=String(r[ix.accountKey]??'').trim();
      const sourceBudget=String(r[ix.sourceBudget]??'').trim();
      const ai=accountFromKey(accountKeyRaw,bankRaw);
      const budget=budgetName(sourceBudget||classification)||'غير مصنف';
      return{
        r,d,item,
        account:bankRaw,
        accountKey:ai.key,
        bankName:ai.bank,
        accountNo:ai.number,
        accountLabel:ai.label,
        movement,amount,desc,budget,
        sourceBudget,
        classification,
        messageId:String(r[ix.id]??'').trim()
      };
    });
  };

  // Internal transfers remain visible but are not household income or spending.
  const isInternal=x=>/تحويل\s*داخلي|تحويلات\s*داخلية|internal\s*transfer/i.test(x.movement);
  const isIncome=x=>!isInternal(x)&&/دخل|وارد|credit|income/i.test(x.movement);
  spendOps=function(){return filteredOps().filter(x=>!isInternal(x)&&!isIncome(x)&&/مصروف|صرف|شراء|سحب|صادر|debit|expense|purchase|withdraw/i.test(x.movement));};
  const originalSummary=summary;
  summary=function(){const result=originalSummary();result.income=result.ops.filter(isIncome).reduce((sum,x)=>sum+x.amount,0);return result;};

  // فلتر الشهر يعتمد فقط على تاريخ العملية B.
  filteredOps=function(){
    const f=filterState(),keys=periodMonths();
    return allOps()
      .filter(x=>x.d&&keys.includes(mk(x.d)))
      .filter(x=>!(f.offset===0&&f.week)||weekOfMonth(x.d)===Number(f.week))
      .filter(x=>!f.account||x.accountKey===f.account)
      .filter(x=>!f.budget||x.budget===f.budget)
      .filter(x=>!f.item||norm(x.item)===norm(f.item))
      .filter(x=>!f.movement||x.movement===f.movement)
      .filter(x=>!f.q||norm([x.item,x.account,x.bankName,x.accountNo,x.movement,x.desc,x.budget].join(' ')).includes(f.q));
  };
})();
