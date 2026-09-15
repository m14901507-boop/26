(function(){
  'use strict';
  if(document.querySelector('.floosy-waterfield')) return;
  const water=document.createElement('div');
  water.className='floosy-waterfield';
  water.setAttribute('aria-hidden','true');
  water.innerHTML='<i class="water-orb"></i><i class="water-orb"></i><i class="water-orb"></i>';
  document.body.prepend(water);

  let raf=0,px=76,py=12;
  document.addEventListener('pointermove',function(e){
    px=(e.clientX/innerWidth*100).toFixed(2);
    py=(e.clientY/innerHeight*100).toFixed(2);
    if(raf)return;
    raf=requestAnimationFrame(function(){
      document.body.style.setProperty('--mx',px+'%');
      document.body.style.setProperty('--my',py+'%');
      raf=0;
    });
    const card=e.target.closest('.panel,.metric,.topbar,.filterbar,.sync,.login,.focus-card,.focus-balance-card');
    if(card){
      const r=card.getBoundingClientRect();
      card.style.setProperty('--gx',((e.clientX-r.left)/r.width*100).toFixed(1)+'%');
      card.style.setProperty('--gy',((e.clientY-r.top)/r.height*100).toFixed(1)+'%');
    }
  },{passive:true});

  document.addEventListener('pointerdown',function(e){
    if(!e.target.closest('button,.btn,.nav-btn,.metric,.focus-balance-card'))return;
    const ripple=document.createElement('span');
    ripple.className='glass-ripple';
    ripple.style.left=e.clientX+'px';
    ripple.style.top=e.clientY+'px';
    document.body.appendChild(ripple);
    setTimeout(function(){ripple.remove()},900);
  },{passive:true});

  const reveal=function(){
    document.querySelectorAll('.panel,.metric,.focus-balance-card').forEach(function(el,i){
      if(el.dataset.glassReady)return;
      el.dataset.glassReady='1';
      el.animate([{opacity:0,transform:'translateY(18px) scale(.985)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:520,delay:Math.min(i*36,360),easing:'cubic-bezier(.2,.8,.2,1)',fill:'both'});
    });
  };
  reveal();
  new MutationObserver(function(){requestAnimationFrame(reveal)}).observe(document.body,{childList:true,subtree:true});
})();
