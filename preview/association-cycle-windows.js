(()=>{
  if(window.__floosyAssociationCycleWindows)return;window.__floosyAssociationCycleWindows=true;
  const $=id=>document.getElementById(id);
  const parse=v=>{const m=/^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(v||''));if(!m)return null;return new Date(Date.UTC(+m[1],+m[2]-1,+(m[3]||1)));};
  const addMonths=(date,n)=>{const d=new Date(date.getTime());d.setUTCMonth(d.getUTCMonth()+Number(n||0));return d;};
  const fmt=d=>d?.toLocaleDateString('ar-OM',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'})||'—';
  const rangeFor=turn=>{
    const base=parse($('firstPayoutMonth')?.value||$('startMonth')?.value);const cycle=Math.max(1,Number($('payoutEveryMonths')?.value||1));
    if(!base||!turn)return null;
    const start=addMonths(base,(Math.max(1,Number(turn))-1)*cycle),endExclusive=addMonths(start,cycle),end=new Date(endExclusive.getTime()-86400000);
    return{start,end,cycle,text:`من ${fmt(start)} إلى ${fmt(end)}`};
  };
  function patchCards(){
    document.querySelectorAll('.memberCard').forEach(card=>{
      const turn=Number(card.querySelector('.turnBadge b')?.textContent||0),r=rangeFor(turn);if(!r)return;
      card.querySelectorAll('.mini').forEach(mini=>{const sp=mini.querySelector('span'),b=mini.querySelector('b');if(!sp||!b)return;if(/الاستلام المتوقع|فترة الاستلام/.test(sp.textContent||'')){sp.textContent='فترة استلام الدور';b.textContent=r.text;b.title=r.text;}});
    });
  }
  function patchDetail(){
    const box=$('memberDetail');if(!box||box.style.display==='none')return;const turnTxt=$('detailContact')?.textContent?.match(/الدور\s*(\d+)/)?.[1],r=rangeFor(Number(turnTxt||0));if(!r)return;
    const el=$('detailContact');if(el){const lines=(el.innerHTML||'').split(/<br\s*\/?\s*>/i);if(lines.length>=3)lines[2]=`الدور ${turnTxt} • فترة الاستلام ${r.text}`;el.innerHTML=lines.join('<br>');}
  }
  function patchOverview(){
    const cycle=Math.max(1,Number($('payoutEveryMonths')?.value||1));
    const sub=$('assocSub');if(sub&&/الاستلام كل/.test(sub.textContent||''))sub.textContent=(sub.textContent||'').replace(/الاستلام كل\s*\d+\s*شهر/,'مدة كل دور استلام '+cycle+' أشهر');
    const cards=[...document.querySelectorAll('.memberCard')].map(card=>({name:card.querySelector('.memberName')?.textContent||'',turn:Number(card.querySelector('.turnBadge b')?.textContent||0)})).filter(x=>x.turn);
    const now=new Date(),today=new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()));
    const next=cards.map(x=>({...x,r:rangeFor(x.turn)})).filter(x=>x.r&&x.r.end>=today).sort((a,b)=>a.r.start-b.r.start)[0];
    const n=$('nextPayout');if(n&&next)n.textContent=`${next.name} • ${next.r.text}`;
  }
  function patch(){patchCards();patchDetail();patchOverview();}
  let timer=0;const schedule=()=>{clearTimeout(timer);timer=setTimeout(patch,40);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(patch,80));else setTimeout(patch,80);
  new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['value','style']});
  document.addEventListener('change',schedule);document.addEventListener('input',schedule);
  window.__floosyAssociationPayoutWindow=rangeFor;
})();
