(()=>{
  if(window.__floosyAssociationPeriodTableFix)return;window.__floosyAssociationPeriodTableFix=true;
  const $=id=>document.getElementById(id);
  const DAY=86400000;
  const getData=()=>{try{return typeof DATA!=='undefined'&&DATA?DATA:{associations:[],members:[]}}catch(e){return{associations:[],members:[]}}};
  const parse=v=>{const m=/^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(v||''));if(!m)return null;return new Date(Date.UTC(+m[1],+m[2]-1,+(m[3]||1)));};
  const daysInMonth=(y,m)=>new Date(Date.UTC(y,m+1,0)).getUTCDate();
  const addMonths=(date,n)=>{const y=date.getUTCFullYear(),m=date.getUTCMonth(),day=date.getUTCDate(),target=m+Number(n||0),ty=y+Math.floor(target/12),tm=((target%12)+12)%12,td=Math.min(day,daysInMonth(ty,tm));return new Date(Date.UTC(ty,tm,td));};
  const fmt=d=>d?.toLocaleDateString('ar-OM',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'})||'—';
  const currentAssociation=()=>{const d=getData(),id=String($('associationSelect')?.value||'');return (d.associations||[]).find(a=>String(a.associationId)===id)||null;};
  const cycleFor=a=>{const saved=Math.max(0,Number(a?.payoutEveryMonths||0));if(saved)return saved;const duration=Math.max(0,Number(a?.durationMonths||0)),members=Math.max(0,Number(a?.plannedMembers||0));return duration&&members?Math.max(1,Math.round(duration/members)):1;};
  function rangeForTurn(turn){
    const a=currentAssociation(),first=parse(a?.startMonth),cycle=cycleFor(a),n=Math.max(1,Number(turn||1));
    if(!a||!first||!n)return null;
    let start=new Date(first.getTime()),end=null;
    for(let i=1;i<=n;i++){
      const next=addMonths(start,cycle);
      end=new Date(next.getTime()-DAY);
      if(i<n)start=new Date(end.getTime()+DAY);
    }
    return{start,end,cycle,text:`من ${fmt(start)} إلى ${fmt(end)}`};
  }
  function patch(){
    const d=getData();
    document.querySelectorAll('#assocMemberTableBody tr[data-member-id]').forEach(tr=>{
      const member=(d.members||[]).find(m=>String(m.memberId)===String(tr.dataset.memberId));
      const r=rangeForTurn(member?.turnNo);if(!r)return;
      const cell=tr.cells?.[3];if(cell&&cell.textContent!==r.text){cell.textContent=r.text;cell.title=`الدور ${member?.turnNo||''} • ${r.cycle} أشهر`;}
    });
  }
  let timer=0;const schedule=()=>{clearTimeout(timer);timer=setTimeout(patch,50);};
  $('associationSelect')?.addEventListener('change',schedule);
  document.addEventListener('change',e=>{if(e.target?.id==='associationSelect')schedule();});
  new MutationObserver(schedule).observe(document.body||document.documentElement,{subtree:true,childList:true,characterData:true});
  let n=0,t=setInterval(()=>{patch();if(++n>20)clearInterval(t)},150);
  window.__floosyAssociationStrictPeriod=rangeForTurn;
})();
