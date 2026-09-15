(function(){
  'use strict';
  if(document.querySelector('.floosy-waterfield')) return;
  document.body.classList.add('glass-performance');
  const compact=matchMedia('(max-width: 640px)').matches;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer=matchMedia('(hover: hover) and (pointer: fine)').matches;
  const water=document.createElement('div');
  water.className='floosy-waterfield';
  water.setAttribute('aria-hidden','true');
  water.innerHTML=compact?'<i class="water-orb"></i>':'<i class="water-orb"></i><i class="water-orb"></i>';
  document.body.prepend(water);

  if(finePointer&&!reduced){
    let raf=0,lastEvent=null;
    document.addEventListener('pointermove',function(e){
      lastEvent=e;
      if(raf)return;
      raf=requestAnimationFrame(function(){
        const card=lastEvent&&lastEvent.target.closest('.panel,.topbar,.focus-main');
        if(card){
          const r=card.getBoundingClientRect();
          card.style.setProperty('--gx',((lastEvent.clientX-r.left)/r.width*100).toFixed(1)+'%');
          card.style.setProperty('--gy',((lastEvent.clientY-r.top)/r.height*100).toFixed(1)+'%');
        }
        raf=0;
      });
    },{passive:true});
  }

  if(finePointer&&!reduced)document.addEventListener('pointerdown',function(e){
    if(!e.target.closest('button,.btn,.nav-btn,.metric,.focus-balance-card'))return;
    const ripple=document.createElement('span');
    ripple.className='glass-ripple';
    ripple.style.left=e.clientX+'px';
    ripple.style.top=e.clientY+'px';
    document.body.appendChild(ripple);
    setTimeout(function(){ripple.remove()},900);
  },{passive:true});

  const revealPage=function(){
    if(compact||reduced)return;
    document.querySelectorAll('.page.active .metric,.page.active>.panel,.page.active .focus-card').forEach(function(el,i){
      el.animate([{opacity:.55,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:280,delay:Math.min(i*18,110),easing:'cubic-bezier(.2,.8,.2,1)'});
    });
  };
  revealPage();
  document.addEventListener('click',function(e){if(e.target.closest('.nav-btn'))requestAnimationFrame(revealPage)},{passive:true});
  document.addEventListener('visibilitychange',function(){document.body.classList.toggle('floosy-paused',document.hidden)});
})();
