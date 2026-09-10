(()=>{
  function clean(){
    // Keep only the two useful manual sync actions plus data refresh.
    document.getElementById('syncAllNow')?.remove();
  }

  clean();
  document.addEventListener('DOMContentLoaded',clean,{once:true});
  setTimeout(clean,0);
})();
