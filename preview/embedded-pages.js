(()=>{
  const nav=document.getElementById('nav');
  const main=document.querySelector('.main');
  const filter=document.querySelector('.filterbar');
  const sync=document.querySelector('.sync');
  if(!nav||!main)return;

  function ensurePage(id,title,src){
    let section=document.getElementById(id);
    if(!section){
      section=document.createElement('section');
      section.id=id;
      section.className='page embedded-page';
      section.innerHTML=`<div class="embedded-shell"><iframe id="${id}Frame" title="${title}" src="${src}" loading="eager"></iframe></div>`;
      const footer=document.querySelector('.footer');
      if(footer)main.insertBefore(section,footer);else main.appendChild(section);
    }
    return section;
  }

  ensurePage('rentals','الإيجارات','rentals.html?embed=1');
  ensurePage('associations','الجمعيات','associations.html?embed=1');

  function replaceLink(selector,page,label,cls){
    const old=nav.querySelector(selector);
    if(!old)return null;
    if(old.tagName==='BUTTON'){
      old.dataset.page=page;
      return old;
    }
    const b=document.createElement('button');
    b.type='button';
    b.className=`nav-btn ${cls}`;
    b.dataset.page=page;
    b.textContent=label;
    old.replaceWith(b);
    return b;
  }

  replaceLink('.nav-special-rent','rentals','⌂ الإيجارات','nav-special-rent');
  replaceLink('.nav-special-assoc','associations','◈ الجمعيات','nav-special-assoc');

  function applyView(page){
    document.querySelectorAll('.page').forEach(x=>x.classList.toggle('active',x.id===page));
    document.querySelectorAll('#nav .nav-btn').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
    const special=page==='rentals'||page==='associations';
    if(filter)filter.style.display=special?'none':'';
    if(sync)sync.style.display=special?'none':'';
    const title=document.getElementById('pageTitle');
    const btn=nav.querySelector(`.nav-btn[data-page="${page}"]`);
    if(title&&btn)title.textContent=btn.textContent.trim();
    if(special){
      const frame=document.getElementById(`${page}Frame`);
      if(frame){
        frame.style.height='calc(100vh - 125px)';
        try{frame.contentWindow?.postMessage({type:'floosy-refresh'},location.origin)}catch(_){}
      }
    }
  }

  nav.addEventListener('click',e=>{
    const b=e.target.closest('.nav-btn');
    if(!b||!b.dataset.page)return;
    if(b.dataset.page==='rentals'||b.dataset.page==='associations'){
      e.preventDefault();
      e.stopPropagation();
      applyView(b.dataset.page);
    }else requestAnimationFrame(()=>{
      if(filter)filter.style.display='';
      if(sync)sync.style.display='';
    });
  },true);

  window.addEventListener('message',e=>{
    if(e.origin!==location.origin)return;
    if(e.data?.type==='floosy-back')applyView('dashboard');
  });
})();
