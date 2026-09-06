/* Use the canonical عمليات A:T schema directly. No header guessing. */
(()=>{
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
    return (Array.isArray(DATA.operations)?DATA.operations:[]).map(r=>{
      const d=parseDate(r?.[1]);                  // B التاريخ والوقت
      const item=String(r?.[2]??'').trim();       // C البند
      const classification=String(r?.[3]??'').trim(); // D التصنيف
      const amount=Math.abs(Number(r?.[4])||0);   // E المبلغ
      const desc=String(r?.[5]??'').trim();       // F الطرف
      const movement=String(r?.[6]??'').trim();   // G نوع العملية
      const bankRaw=String(r?.[8]??'').trim();    // I البنك
      const accountKeyRaw=String(r?.[15]??'').trim(); // P معرف الحساب
      const sourceBudget=String(r?.[16]??'').trim();  // Q مصدر الموازنة
      const ai=accountFromKey(accountKeyRaw,bankRaw);
      const budget=sourceBudget||classification||'غير مصنف';
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
        messageId:String(r?.[0]??'').trim()
      };
    });
  };

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
