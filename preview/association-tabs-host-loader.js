(()=>{
  if(window.__floosyAssociationTabsHost)return;window.__floosyAssociationTabsHost=true;
  function inject(){
    const frame=document.getElementById('associationsProFrame');if(!frame)return false;
    const add=()=>{try{const doc=frame.contentDocument;if(!doc||doc.getElementById('associationTabsV1Script'))return;const s=doc.createElement('script');s.id='associationTabsV1Script';s.src='association-tabs-v1.js?v=1';doc.body.appendChild(s);}catch(e){}};
    frame.addEventListener('load',()=>setTimeout(add,80));setTimeout(add,120);return true;
  }
  let n=0,t=setInterval(()=>{if(inject()||++n>40)clearInterval(t)},100);
})();
