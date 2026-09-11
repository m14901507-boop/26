(()=>{
  const nav=document.getElementById('nav');
  const main=document.querySelector('.main');
  if(!nav||!main)return;

  const assocBtn=nav.querySelector('.nav-special-assoc,[data-page="associations"]');
  if(!assocBtn)return;

  let page=document.getElementById('associations-pro');
  if(!page){
    page=document.createElement('section');
    page.id='associations-pro';
    page.className='page';
    page.style.padding='0';
    page.innerHTML='<div style="border:1px solid #27394d;border-radius:18px;overflow:hidden;background:#05070a;min-height:1180px"><iframe id="associationsProFrame" title="إدارة الجمعيات" src="associations.html?v=7" style="width:100%;height:1180px;border:0;display:block;background:#05070a"></iframe></div>';
    const footer=document.querySelector('.footer');
    if(footer)main.insertBefore(page,footer);else main.appendChild(page);
  }

  assocBtn.dataset.page='associations-pro';

  const frame=document.getElementById('associationsProFrame');
  frame?.addEventListener('load',()=>{
    try{
      const doc=frame.contentDocument;
      if(!doc)return;
      const top=doc.querySelector('.top');if(top)top.style.display='none';
      const wrap=doc.querySelector('.wrap');if(wrap){wrap.style.maxWidth='none';wrap.style.padding='12px';}
      doc.documentElement.style.background='#05070a';
      doc.body.style.background='#05070a';
      const status=doc.getElementById('status');if(status)status.style.marginTop='0';
      const resize=()=>{try{frame.style.height=Math.max(900,doc.documentElement.scrollHeight+20)+'px';}catch(e){}};
      resize();
      new MutationObserver(resize).observe(doc.body,{subtree:true,childList:true,attributes:true});
      window.addEventListener('resize',resize,{passive:true});
    }catch(e){}
  });

  nav.addEventListener('click',e=>{
    const b=e.target.closest('[data-page]');
    if(!b)return;
    if(b===assocBtn){
      const title=document.getElementById('pageTitle');if(title)title.textContent='الجمعيات';
      const p=document.querySelector('.headline p');if(p)p.textContent='إدارة الأعضاء والأدوار والدفعات والإشعارات من مكان واحد.';
    }
  });
})();
