(()=>{
  const nav=document.getElementById('nav');
  const main=document.querySelector('.main');
  const filter=document.querySelector('.filterbar');
  if(!nav||!main)return;

  function addEmbeddedPage(id,title,src){
    if(document.getElementById(id))return;
    const section=document.createElement('section');
    section.id=id;
    section.className='page embedded-page';
    section.innerHTML=`<div class="embedded-shell"><iframe id="${id}Frame" title="${title}" src="${src}" loading="lazy"></iframe></div>`;
    const footer=document.querySelector('.footer');
    if(footer)main.insertBefore(section,footer); else main.appendChild(section);
    const frame=section.querySelector('iframe');
    frame.addEventListener('load',()=>{
      try{
        const d=frame.contentDocument;
        if(!d)return;
        const top=d.querySelector('.top');
        if(top)top.style.display='none';
        const wrap=d.querySelector('.wrap');
        if(wrap){wrap.style.maxWidth='none';wrap.style.padding='0';}
        d.documentElement.style.background='transparent';
        d.body.style.background='transparent';
      }catch(e){}
    });
  }

  addEmbeddedPage('rentals','الإيجارات','rentals.html?embed=1');
  addEmbeddedPage('associations','الجمعيات','associations.html?embed=1');

  const rent=nav.querySelector('.nav-special-rent');
  const assoc=nav.querySelector('.nav-special-assoc');
  if(rent){rent.removeAttribute('href');rent.setAttribute('role','button');rent.dataset.page='rentals';}
  if(assoc){assoc.removeAttribute('href');assoc.setAttribute('role','button');assoc.dataset.page='associations';}

  function syncSpecialView(){
    const active=nav.querySelector('.nav-btn.active');
    const special=active&&['rentals','associations'].includes(active.dataset.page);
    if(filter)filter.style.display=special?'none':'';
    const sync=document.querySelector('.sync');
    if(sync)sync.style.display=special?'none':'';
  }

  nav.addEventListener('click',e=>{
    const b=e.target.closest('.nav-btn');
    if(!b)return;
    if(['rentals','associations'].includes(b.dataset.page||'')){
      e.preventDefault();
      requestAnimationFrame(()=>{
        syncSpecialView();
        const frame=document.getElementById(`${b.dataset.page}Frame`);
        if(frame&&frame.contentWindow){
          try{frame.contentWindow.postMessage({type:'floosy-refresh'},location.origin)}catch(_){}
        }
      });
    }else requestAnimationFrame(syncSpecialView);
  });

  syncSpecialView();
})();
