(()=>{
  if(window.__floosyAssociationCycleWindows)return;window.__floosyAssociationCycleWindows=true;
  const $=id=>document.getElementById(id);
  const DAY=86400000;
  const parse=v=>{const m=/^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(v||''));if(!m)return null;return new Date(Date.UTC(+m[1],+m[2]-1,+(m[3]||1)));};
  const daysInMonth=(y,m)=>new Date(Date.UTC(y,m+1,0)).getUTCDate();
  const addMonths=(date,n)=>{
    const y=date.getUTCFullYear(),m=date.getUTCMonth(),day=date.getUTCDate(),target=m+Number(n||0);
    const ty=y+Math.floor(target/12),tm=((target%12)+12)%12,td=Math.min(day,daysInMonth(ty,tm));
    return new Date(Date.UTC(ty,tm,td));
  };
  const fmt=d=>d?.toLocaleDateString('ar-OM',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'})||'—';
  const setText=(el,text)=>{if(el&&el.textContent!==text)el.textContent=text;};

  // الدور الأول يبدأ من تاريخ بدء الجمعية. كل دور لاحق يبدأ في اليوم التالي مباشرة لانتهاء الدور السابق.
  const rangeFor=turn=>{
    const firstStart=parse($('startMonth')?.value||$('firstPayoutMonth')?.value),cycle=Math.max(1,Number($('payoutEveryMonths')?.value||1)),n=Math.max(1,Number(turn||1));
    if(!firstStart||!n)return null;
    let start=new Date(firstStart.getTime()),end=null,previousEnd=null;
    for(let i=1;i<=n;i++){
      start=i===1?new Date(firstStart.getTime()):new Date(previousEnd.getTime()+DAY);
      const nextPeriodStart=addMonths(start,cycle);
      end=new Date(nextPeriodStart.getTime()-DAY);
      previousEnd=end;
    }
    const nextStart=new Date(end.getTime()+DAY);
    return{start,end,nextStart,cycle,text:`من ${fmt(start)} إلى ${fmt(end)}`,nextText:`يبدأ الدور التالي ${fmt(nextStart)}`};
  };

  function patchCards(){
    document.querySelectorAll('.memberCard').forEach(card=>{
      const turn=Number(card.querySelector('.turnBadge b')?.textContent||0),r=rangeFor(turn);if(!r)return;
      card.querySelectorAll('.mini').forEach(mini=>{
        const sp=mini.querySelector('span'),b=mini.querySelector('b');if(!sp||!b)return;
        if(/الاستلام المتوقع|فترة الاستلام/.test(sp.textContent||'')){
          setText(sp,'فترة الاستلام');
          setText(b,r.text);
          const title=`${r.text} • ${r.nextText}`;if(b.title!==title)b.title=title;
        }
      });
    });
  }
  function patchDetail(){
    const box=$('memberDetail');if(!box||box.style.display==='none')return;
    const turnTxt=$('detailContact')?.textContent?.match(/الدور\s*(\d+)/)?.[1],r=rangeFor(Number(turnTxt||0));if(!r)return;
    const el=$('detailContact');if(!el)return;
    const lines=(el.innerHTML||'').split(/<br\s*\/?\s*>/i);if(lines.length<3)return;
    lines[2]=`الدور ${turnTxt} • فترة الاستلام ${r.text}`;
    const next=lines.join('<br>');if(el.innerHTML!==next)el.innerHTML=next;
  }
  function patchOverview(){
    const hasAssociation=!!($('associationId')?.value||$('associationSelect')?.value);
    const cycle=Math.max(1,Number($('payoutEveryMonths')?.value||1));
    if(hasAssociation){
      const duration=Math.max(0,Number($('durationMonths')?.value||0)),payEvery=Math.max(1,Number($('paymentEveryMonths')?.value||1));
      const desired=`مدة ${duration} شهر • الدفع كل ${payEvery} شهر • فترة كل دور ${cycle} أشهر`;
      setText($('assocSub'),desired);
    }
    const cards=[...document.querySelectorAll('.memberCard')].map(card=>({name:card.querySelector('.memberName')?.textContent||'',turn:Number(card.querySelector('.turnBadge b')?.textContent||0)})).filter(x=>x.turn);
    const now=new Date(),today=new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()));
    const next=cards.map(x=>({...x,r:rangeFor(x.turn)})).filter(x=>x.r&&x.r.end>=today).sort((a,b)=>a.r.start-b.r.start)[0];
    if(next)setText($('nextPayout'),`${next.name} • ${next.r.text}`);
  }
  function patch(){patchCards();patchDetail();patchOverview();}
  let timer=0;const schedule=()=>{clearTimeout(timer);timer=setTimeout(patch,40);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(patch,80));else setTimeout(patch,80);
  new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['value','style']});
  document.addEventListener('change',schedule);document.addEventListener('input',schedule);
  window.__floosyAssociationPayoutWindow=rangeFor;
})();
