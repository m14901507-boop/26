/* Fix detailed/transactions tables so all matching operations are shown.
   Also makes date parsing more tolerant of Google Sheets/Gmail formats. */
(function(){
  function latinDigits(value){
    return String(value ?? '')
      .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  }

  parseDate = function(v){
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'number' && Number.isFinite(v) && v > 20000) return serialDate(v);

    const s = latinDigits(v).trim();
    if (!s) return null;

    let m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
      let y = Number(m[3]);
      if (y < 100) y += 2000;
      const d = new Date(y, Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
      return isNaN(d) ? null : d;
    }

    m = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
      return isNaN(d) ? null : d;
    }

    const d = new Date(s);
    return isNaN(d) ? null : d;
  };

  function renderOperationRows(rows){
    return rows
      .slice()
      .sort((a,b) => b.d - a.d)
      .map(x => `<tr><td>${formatDateTime(x.d)}</td><td>${esc(x.accountLabel||x.bankName)}</td><td><b>${esc(x.item)}</b></td><td>${esc(x.budget)}</td><td>${esc(x.movement)}</td><td class="${/دخل|وارد/i.test(x.movement)?'in':'out'}">${money(x.amount)}</td><td class="description">${esc(x.desc||'—')}</td></tr>`)
      .join('');
  }

  const originalRenderDashboard = renderDashboard;
  renderDashboard = function(){
    originalRenderDashboard();
    const s = summary();
    const body = $('dashTable');
    if (body) body.innerHTML = renderOperationRows(s.ops);
  };

  const originalRenderTransactions = renderTransactions;
  renderTransactions = function(){
    originalRenderTransactions();
    const s = summary();
    const body = $('txTable');
    if (body) body.innerHTML = renderOperationRows(s.ops);
  };
})();
