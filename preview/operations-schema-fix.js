/* Operations schema A:T + direct month filtering from operation date column B. */
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
    const required={id:'معرف الرسالة',date:'التاريخ والوقت',item:'البند',classification:'التصنيف',amount:'المبلغ',desc:'الطرف',movement:'نوع العملية',bank:'البنك'};
    const optional={accountKey:'معرف الحساب',sourceBudget:'مصدر الموازنة'};
    const fallback={accountKey:15,sourceBudget:16};
    const find=(name,requiredField)=>{const first=headers.indexOf(name);if(first>=0&&headers.indexOf(name,first+1)>=0)throw new Error('عنوان مكرر: '+name);if(first<0&&requiredField)throw new Error('عنوان مفقود: '+name);return first;};
    const map={};
    for(const [key,name] of Object.entries(required))map[key]=find(name,true);
    for(const [key,name] of Object.entries(optional)){const ix=find(name,false);map[key]=ix>=0?ix:fallback[key];}
    return map;
  }
  function latin(v){return String(v??'').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[\u200e\u200f\u061c\ufeff]/g,'').replace(/\u00a0/g,' ').trim();}
  function operationMonth(raw){
    if(typeof raw==='number'&&Number.isFinite(raw)&&raw>20000){const d=parseDate(raw);return d?mk(d):'';}
    const s=latin(raw);let m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4}|\d{2})/);
    if(m){let y=+m[3];if(y<100)y+=2000;const mo=+m[2];return mo>=1&&mo<=12?`${y}-${String(mo).padStart(2,'0')}`:'';}
    m=s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if(m){const mo=+m[2];return mo>=1&&mo<=12?`${m[1]}-${String(mo).padStart(2,'0')}`:'';}
    const d=parseDate(raw);return d?mk(d):'';
  }
  function amountValue(v){
    if(typeof v==='number')return Number.isFinite(v)?Math.abs(v):NaN;
    let s=latin(v).replace(/٬/g,',').replace(/٫/g,'.').trim();
    if(!s)return NaN;
    // Accept the legacy formats used in FLOOSY sheets, e.g. OMR 12.500, 12.500 OMR, ر.ع 12.500.
    s=s
      .replace(/^\((.*)\)$/,'-$1')
      .replace(/[−–—]/g,'-')
      .replace(/(?:OMR|O\.?R\.?|RO|R\.O\.?|ر\.?\s*ع\.?|ريال\s*عماني)/gi,'')
      .replace(/\s+/g,'')
      .trim();
    if(!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s))return NaN;
    const n=Number(s.replace(/,/g,''));
    return Number.isFinite(n)?Math.abs(n):NaN;
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
    const ai=accountInfo(String(bankRaw||''));return{key:ai.key,bank:ai.bank,number:ai.number,label:ai.label};
  }

  allOps=function(){
    const rows=Array.isArray(DATA.operations)?DATA.operations:[];if(!rows.length)return [];
    const ix=columnMap();
    return rows.filter(r=>Array.isArray(r)&&r.some(v=>String(v??'').trim()!=='' )).map(r=>{
      const rawDate=r[ix.date],d=parseDate(rawDate),monthKey=operationMonth(rawDate);
      const item=String(r[ix.item]??'').trim(),classification=String(r[ix.classification]??'').trim(),amount=amountValue(r[ix.amount]),desc=String(r[ix.desc]??'').trim(),movement=String(r[ix.movement]??'').trim(),bankRaw=String(r[ix.bank]??'').trim(),accountKeyRaw=String(r[ix.accountKey]??'').trim(),sourceBudget=String(r[ix.sourceBudget]??'').trim();
      const ai=accountFromKey(accountKeyRaw,bankRaw),budget=budgetName(sourceBudget||classification)||'غير مصنف';
      return{r,d,monthKey,item,account:bankRaw,accountKey:ai.key,bankName:ai.bank,accountNo:ai.number,accountLabel:ai.label,movement,amount,desc,budget,sourceBudget,classification,messageId:String(r[ix.id]??'').trim()};
    });
  };

  const isInternal=x=>/تحويل\s*داخلي|تحويلات\s*داخلية|internal\s*transfer/i.test([x.movement,x.classification,x.sourceBudget].join(' '));
  const isIncome=x=>!isInternal(x)&&/دخل|وارد|credit|income/i.test(x.movement);
  spendOps=function(){return filteredOps().filter(x=>!isInternal(x)&&!isIncome(x)&&/مصروف|صرف|شراء|سحب|صادر|debit|expense|purchase|withdraw/i.test(x.movement));};
  const originalSummary=summary;
  summary=function(){const result=originalSummary();result.income=result.ops.filter(isIncome).reduce((sum,x)=>sum+(Number.isFinite(x.amount)?x.amount:0),0);return result;};

  filteredOps=function(){
    const f=filterState(),keys=periodMonths();
    return allOps()
      .filter(x=>x.monthKey&&keys.includes(x.monthKey))
      .filter(x=>!(f.offset===0&&f.week)||(x.d&&weekOfMonth(x.d)===Number(f.week)))
      .filter(x=>!f.account||x.accountKey===f.account)
      .filter(x=>!f.budget||x.budget===f.budget)
      .filter(x=>!f.item||norm(x.item)===norm(f.item))
      .filter(x=>!f.movement||x.movement===f.movement)
      .filter(x=>!f.q||norm([x.item,x.account,x.bankName,x.accountNo,x.movement,x.desc,x.budget].join(' ')).includes(f.q));
  };

  // Changing the month must not retain an old week that hides the new month's rows.
  const monthInput=document.getElementById('month');
  if(monthInput&&typeof monthInput.addEventListener==='function')monthInput.addEventListener('change',()=>{const w=document.getElementById('weekFilter');if(w)w.value='';setTimeout(()=>{updateWeekUi();syncDependentFilters();renderAll();},0);});
})();
