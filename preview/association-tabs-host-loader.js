(()=>{
  if(window.__floosyAssociationTabsHost)return;window.__floosyAssociationTabsHost=true;
  function inject(){
    const frame=document.getElementById('associationsProFrame');if(!frame)return false;
    const add=()=>{try{
      const doc=frame.contentDocument;if(!doc)return;
      if(!doc.getElementById('associationTabsV2Script')){const s=doc.createElement('script');s.id='associationTabsV2Script';s.src='association-tabs-v2.js?v=2';doc.body.appendChild(s);}
      if(!doc.getElementById('associationMemberTableV1Script')){const s=doc.createElement('script');s.id='associationMemberTableV1Script';s.src='association-member-table-v1.js?v=3';doc.body.appendChild(s);}
      if(!doc.getElementById('associationPeriodTableFixScript')){const s=doc.createElement('script');s.id='associationPeriodTableFixScript';s.src='association-period-table-fix.js?v=1';doc.body.appendChild(s);}
      if(!doc.getElementById('associationReceiptScheduleV1Script')){const s=doc.createElement('script');s.id='associationReceiptScheduleV1Script';s.src='association-receipt-schedule-v1.js?v=1';doc.body.appendChild(s);}
    }catch(e){}};
    frame.addEventListener('load',()=>setTimeout(add,80));setTimeout(add,120);return true;
  }
  let n=0,t=setInterval(()=>{if(inject()||++n>40)clearInterval(t)},100);
})();
