(()=>{
  function parse(v){
    const s=String(v||'').trim();
    let m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if(m)return new Date(+m[3],+m[2]-1,+m[1],+(m[4]||0),+(m[5]||0),+(m[6]||0));
    m=s.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(m)return new Date(+m[5],+m[4]-1,+m[3],+m[1],+m[2],0);
    const d=new Date(s);return Number.isFinite(d.getTime())?d:null;
  }
  function fmt(d){const z=n=>String(n).padStart(2,'0');return `${z(d.getDate())}/${z(d.getMonth()+1)}/${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`;}
  function fixBody(id){const body=document.getElementById(id);if(!body)return;const rows=[...body.querySelectorAll('tr')];const parsed=rows.map((tr,i)=>{const td=tr.querySelector('td');const d=parse(td?.textContent||'');return{tr,i,d};});parsed.sort((a,b)=>((b.d?.getTime()||0)-(a.d?.getTime()||0))||(a.i-b.i));for(const x of parsed){if(x.d){const td=x.tr.querySelector('td');if(td)td.textContent=fmt(x.d);}body.appendChild(x.tr);}}
  function apply(){fixBody('dashTable');fixBody('txTable');}
  const targets=['dashTable','txTable'].map(id=>document.getElementById(id)).filter(Boolean);
  targets.forEach(t=>new MutationObserver(()=>requestAnimationFrame(apply)).observe(t,{childList:true,subtree:true}));
  setTimeout(apply,800);
})();