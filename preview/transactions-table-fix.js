/* Robust date reader for operations. Does not modify Google Sheets. */
(function(){
  function latinDigits(value){
    return String(value ?? '')
      .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  }

  function validLocal(y,m,d,h=0,mi=0,s=0){
    const x=new Date(y,m-1,d,h,mi,s);
    return x.getFullYear()===y&&x.getMonth()===m-1&&x.getDate()===d&&x.getHours()===h&&x.getMinutes()===mi&&x.getSeconds()===s;
  }

  function localDate(y,m,d,h=0,mi=0,s=0){
    return validLocal(y,m,d,h,mi,s)?new Date(y,m-1,d,h,mi,s):null;
  }

  function chooseAmbiguous(a,b,y,h=0,mi=0,s=0){
    const dm=localDate(y,b,a,h,mi,s); // dd/MM
    // Dates have one meaning regardless of the selected filters.
    return dm;
  }

  parseDate = function(v){
    if(v instanceof Date)return isNaN(v)?null:v;

    if(typeof v==='number'&&Number.isFinite(v)&&v>20000){
      // اقرأ Google Sheets serial بدون انزياح المنطقة الزمنية.
      const ms=Math.round(Number(v)*86400000);
      const u=new Date(Date.UTC(1899,11,30)+ms);
      return new Date(u.getUTCFullYear(),u.getUTCMonth(),u.getUTCDate(),u.getUTCHours(),u.getUTCMinutes(),u.getUTCSeconds());
    }

    const s=latinDigits(v).trim();
    if(!s)return null;

    // Absolute timestamps are displayed and filtered in Oman time.
    if(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)){
      const instant=new Date(s);
      if(!Number.isFinite(instant.getTime()))return null;
      const oman=new Date(instant.getTime()+4*3600000);
      return localDate(oman.getUTCFullYear(),oman.getUTCMonth()+1,oman.getUTCDate(),oman.getUTCHours(),oman.getUTCMinutes(),oman.getUTCSeconds());
    }
    // ISO / yyyy-MM-dd without a zone is already sheet-local time.
    let m=s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/);
    if(m){
      return localDate(+m[1],+m[2],+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0));
    }

    // الوقت قبل التاريخ: 14:30 01/09/2026
    m=s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})[\/-](\d{1,2})[\/-](\d{4}|\d{2})$/);
    if(m){
      let y=+m[6];if(y<100)y+=2000;
      return chooseAmbiguous(+m[4],+m[5],y,+m[1],+m[2],+(m[3]||0));
    }

    // The sheet's canonical text format is dd/MM/yyyy.
    m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4}|\d{2})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if(m){
      let y=+m[3];if(y<100)y+=2000;
      return chooseAmbiguous(+m[1],+m[2],y,+(m[4]||0),+(m[5]||0),+(m[6]||0));
    }

    // Do not let Date guess malformed numeric dates or normalize invalid days.
    return null;
  };

  function renderOperationRows(rows){
    return rows.slice().sort((a,b)=>b.d-a.d).map(x=>
      `<tr><td>${formatDateTime(x.d)}</td><td>${esc(x.accountLabel||x.bankName)}</td><td><b>${esc(x.item)}</b></td><td>${esc(x.budget)}</td><td>${esc(x.movement)}</td><td class="${/دخل|وارد/i.test(x.movement)?'in':'out'}">${money(x.amount)}</td><td class="description">${esc(x.desc||'—')}</td></tr>`
    ).join('');
  }

  const originalRenderDashboard=renderDashboard;
  renderDashboard=function(){originalRenderDashboard();const s=summary(),body=$('dashTable');if(body)body.innerHTML=renderOperationRows(s.ops);};

  const originalRenderTransactions=renderTransactions;
  renderTransactions=function(){originalRenderTransactions();const s=summary(),body=$('txTable');if(body)body.innerHTML=renderOperationRows(s.ops);};
})();
