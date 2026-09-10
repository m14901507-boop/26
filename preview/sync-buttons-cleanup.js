(()=>{
  function clean(){
    // Keep one clear manual Gmail sync action in the top bar.
    document.getElementById('syncItemsNow')?.remove();
    document.getElementById('syncAllNow')?.remove();

    // The dashboard hero already has navigation shortcuts; avoid duplicating sync there.
    const duplicate=document.querySelector('[data-focus-action="sync"]');
    if(duplicate){
      duplicate.dataset.focusAction='budgets';
      duplicate.classList.remove('primary');
      duplicate.textContent='الموازنات';
    }
  }

  clean();
  document.addEventListener('DOMContentLoaded',clean,{once:true});
  setTimeout(clean,0);
})();
