/* FLOOSY Elite — final style loader and structural polish */
(() => {
  const applyStructure = () => {
    document.documentElement.classList.add('floosy-elite');
    document.body.classList.add('floosy-elite');

    const add = (selector, className) => {
      const element = document.querySelector(selector);
      if (element) element.classList.add(className);
      return element;
    };

    add('.topbar', 'elite-topbar');
    add('.sync', 'elite-sync');
    const filterbar = add('.filterbar', 'elite-filterbar');

    if (filterbar && !filterbar.querySelector('.elite-filter-head')) {
      const head = document.createElement('div');
      head.className = 'elite-filter-head';
      head.innerHTML = '<strong>تصفية العرض</strong><span>اختر الفترة والحساب والبند لعرض أرقام أدق</span>';
      filterbar.prepend(head);
    }

    const dashboard = document.querySelector('#dashboard');
    if (dashboard) {
      dashboard.classList.add('elite-dashboard');
      const detailPanel = [...dashboard.children].find((element) => element.querySelector?.('#dashTable'));
      if (detailPanel) detailPanel.classList.add('transactions-panel');
    }

    document.querySelectorAll('.page').forEach((page) => page.classList.add('elite-page'));
    document.querySelectorAll('.table').forEach((table) => table.classList.add('elite-table'));

    document.querySelectorAll('.elite-table').forEach((table) => {
      const labels = [...table.querySelectorAll('thead th')].map((cell) => (cell.textContent || '').trim());
      table.querySelectorAll('tbody tr').forEach((row) => {
        [...row.children].forEach((cell, index) => {
          if (labels[index]) cell.dataset.label = labels[index];
        });
      });
    });
  };

  if (!document.querySelector('link[href*="elite-dashboard.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'elite-dashboard.css?v=3';
    document.head.appendChild(link);
  }

  applyStructure();
  window.addEventListener('load', applyStructure);
  window.setTimeout(applyStructure, 500);
  window.setTimeout(applyStructure, 1500);
})();
