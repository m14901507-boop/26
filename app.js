const API_BASE = 'https://floosy-api.m14901507.workers.dev';

const APP = {
  budgets: [],
  messages: [],
  unread: null,
  loggedIn: false,
};

const BUDGET_DEFS = [
  { budget: 'عائلي شهري', accountKey: 'AHLI_001', accountName: 'الأهلي 001' },
  { budget: 'عائلي سنوي', accountKey: 'AHLI_001', accountName: 'الأهلي 001' },
  { budget: 'شخصي شهري', accountKey: 'AHLI_001', accountName: 'الأهلي 001' },
  { budget: 'شخصي سنوي', accountKey: 'AHLI_001', accountName: 'الأهلي 001' },
  { budget: 'تأمين المصروف', accountKey: 'AHLI_002', accountName: 'الأهلي 002' },
  { budget: 'تأمين الدخل', accountKey: 'AHLI_002', accountName: 'الأهلي 002' },
  { budget: 'الادخار والاستثمار', accountKey: 'DHOFAR', accountName: 'بنك ظفار' },
];

const $ = (id) => document.getElementById(id);

function money(value) {
  const n = Number(value);
  return Number.isFinite(n)
    ? `${n.toLocaleString('ar-OM', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ر.ع`
    : '—';
}

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthSerial(month) {
  const [year, monthNo] = month.split('-').map(Number);
  const utc = Date.UTC(year, monthNo - 1, 1);
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((utc - epoch) / 86400000);
}

function monthMatches(value, month) {
  const [year, monthNo] = month.split('-');
  if (typeof value === 'number') return Math.abs(value - monthSerial(month)) < 2;
  const text = String(value || '').trim();
  const mm = monthNo.padStart(2, '0');
  return text === `${mm}/${year}` || text === `${year}-${mm}` || text.startsWith(`01/${mm}/${year}`) || text.startsWith(`${year}-${mm}-01`);
}

function setStatus(message, type = 'loading') {
  const box = $('statusBox');
  box.textContent = message;
  box.className = `status ${type}`;
}

async function api(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    APP.loggedIn = false;
    throw new Error('Unauthorized');
  }
  if (!response.ok) throw new Error(data.error || `API error ${response.status}`);
  return data;
}

async function checkSession() {
  try {
    const data = await api('/auth/status');
    APP.loggedIn = Boolean(data.authenticated);
  } catch {
    APP.loggedIn = false;
  }
  $('loginBtn').textContent = APP.loggedIn ? 'الحساب متصل' : 'تسجيل الدخول';
  $('loginBtn').className = APP.loggedIn ? 'btn secondary' : 'btn primary';
  return APP.loggedIn;
}

function normalizeBudgetRows(data) {
  const rows = Array.isArray(data.rows) ? data.rows : [];
  APP.budgets = rows.map((row) => ({
    month: row[0],
    accountKey: String(row[1] || ''),
    budget: String(row[2] || ''),
    accountName: String(row[3] || ''),
    amount: row[4] === '' || row[4] == null ? null : Number(row[4]),
    active: String(row[5] || ''),
    notes: String(row[6] || ''),
    updatedAt: row[7],
  }));
}

function rowsForMonth() {
  const month = $('monthInput').value || currentMonthValue();
  return APP.budgets.filter((row) => monthMatches(row.month, month));
}

function dedupeMonthRows(rows) {
  const map = new Map();
  rows.forEach((row) => {
    if (!row.budget) return;
    const current = map.get(row.budget);
    const currentTime = Number(current?.updatedAt || 0);
    const incomingTime = Number(row.updatedAt || 0);
    if (!current || incomingTime >= currentTime) map.set(row.budget, row);
  });
  return map;
}

function renderBudgetData() {
  const rows = rowsForMonth();
  const byBudget = dedupeMonthRows(rows);
  const values = BUDGET_DEFS.map((def) => {
    const row = byBudget.get(def.budget);
    return {
      ...def,
      amount: Number.isFinite(row?.amount) ? row.amount : null,
      active: row?.active || '',
    };
  });

  const total = values.reduce((sum, row) => sum + (Number.isFinite(row.amount) ? row.amount : 0), 0);
  const configured = values.filter((row) => Number.isFinite(row.amount)).length;

  $('totalBudget').textContent = money(total);
  $('configuredBudgets').textContent = `${configured} / ${BUDGET_DEFS.length}`;
  $('budgetTotalBadge').textContent = money(total);
  $('donutValue').textContent = total ? total.toLocaleString('ar-OM', { maximumFractionDigits: 0 }) : '0';

  const bars = $('budgetBars');
  bars.innerHTML = '';

  const table = $('budgetTableBody');
  table.innerHTML = '';

  values.forEach((row) => {
    const share = total > 0 && Number.isFinite(row.amount) ? (row.amount / total) * 100 : 0;

    const bar = document.createElement('div');
    bar.className = 'budget-row';
    bar.innerHTML = `
      <div class="budget-row-head">
        <span>${row.budget}</span>
        <span>${Number.isFinite(row.amount) ? money(row.amount) : 'غير محدد'}</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(0, Math.min(100, share))}%"></div></div>
    `;
    bars.appendChild(bar);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${row.budget}</strong></td>
      <td>${row.accountName}</td>
      <td>${Number.isFinite(row.amount) ? money(row.amount) : '—'}</td>
      <td><span class="state-pill">${row.active === 'نعم' ? 'نشط' : row.active || '—'}</span></td>
      <td>
        <div class="share">
          <div class="mini-track"><div class="mini-fill" style="width:${Math.min(100, share)}%"></div></div>
          <span>${share.toFixed(0)}%</span>
        </div>
      </td>
    `;
    table.appendChild(tr);
  });

  const shares = values.map((v) => total > 0 && Number.isFinite(v.amount) ? (v.amount / total) * 100 : 0);
  const palette = ['#3b82f6','#22c55e','#8b5cf6','#f59e0b','#06b6d4','#ef4444','#64748b'];
  let cursor = 0;
  const stops = [];
  shares.forEach((share, i) => {
    if (share <= 0) return;
    const start = cursor;
    cursor += share;
    stops.push(`${palette[i % palette.length]} ${start}% ${cursor}%`);
  });
  $('donut').style.background = stops.length ? `conic-gradient(${stops.join(',')})` : '#17263a';
}

function extractAvailableBalance(text) {
  const patterns = [
    /available\s+bal(?:ance)?\s*(?:is\s*)?(?:OMR|RO)\s*([0-9,]+(?:\.\d{1,3})?)/i,
    /available\s+balance\s*(?:is\s*)?(?:OMR|RO)\s*([0-9,]+(?:\.\d{1,3})?)/i,
  ];
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match?.[1]) return Number(match[1].replace(/,/g, ''));
  }
  return null;
}

function detectAccount(message) {
  const text = `${message.subject || ''} ${message.preview || ''}`;
  const from = String(message.from || '').toLowerCase();
  if (from.includes('ahlibank')) {
    if (/0*02\b|#{3,}002\b|xxxx0*02\b/i.test(text)) return 'AHLI_002';
    if (/0*01\b|#{3,}001\b|xxxx0*01\b/i.test(text)) return 'AHLI_001';
    return 'AHLI_001';
  }
  if (/bankdhofar|dhofar/i.test(from + ' ' + text)) return 'DHOFAR';
  return null;
}

function newestBalance(accountKey) {
  for (const message of APP.messages) {
    if (detectAccount(message) !== accountKey) continue;
    const balance = extractAvailableBalance(message.preview);
    if (Number.isFinite(balance)) return { balance, message };
  }
  return null;
}

function renderAccounts() {
  const definitions = [
    { key: 'AHLI_001', bank: 'الأهلي الإسلامي', name: 'الأهلي 001', purpose: 'العائلي والشخصي' },
    { key: 'AHLI_002', bank: 'الأهلي الإسلامي', name: 'الأهلي 002', purpose: 'تأمين المصروف والدخل' },
    { key: 'DHOFAR', bank: 'بنك ظفار', name: 'الادخار والاستثمار', purpose: 'الادخار والاستثمار' },
  ];

  const grid = $('accountsGrid');
  grid.innerHTML = '';

  definitions.forEach((def) => {
    const latest = newestBalance(def.key);
    const card = document.createElement('article');
    card.className = 'account-card';
    card.innerHTML = `
      <div class="account-top">
        <div>
          <div class="account-bank">${def.bank}</div>
          <div class="account-name">${def.name}</div>
        </div>
        <div class="account-tag">${latest ? 'رصيد مؤكد' : 'بانتظار رصيد'}</div>
      </div>
      <div class="balance">${latest ? money(latest.balance) : '—'}</div>
      <div class="balance-sub">
        <span>${def.purpose}</span>
        <span>${latest ? 'من آخر رسالة بنكية' : 'لا توجد رسالة رصيد حديثة'}</span>
      </div>
    `;
    grid.appendChild(card);
  });
}

function cleanBankName(value) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/Notifications/gi, '')
    .trim() || 'البنك';
}

function renderActivity() {
  const list = $('activityList');
  list.innerHTML = '';

  if (!APP.messages.length) {
    list.innerHTML = '<div class="empty-state">لا توجد عمليات بنكية للعرض حاليًا.</div>';
    return;
  }

  APP.messages.slice(0, 10).forEach((item) => {
    const incoming = /دخل|وارد|credited/i.test(item.operationType || '');
    const row = document.createElement('div');
    row.className = 'activity-item';
    row.innerHTML = `
      <div class="activity-main">
        <div class="activity-title">${item.subject || item.operationType || 'عملية بنكية'}</div>
        <div class="activity-meta">${cleanBankName(item.bank)} · ${item.operationType || 'غير محدد'} · ${item.date || ''}</div>
      </div>
      <div class="activity-amount ${incoming ? 'in' : 'out'}">${Number.isFinite(Number(item.amount)) ? money(item.amount) : '—'}</div>
    `;
    list.appendChild(row);
  });
}

async function refreshAll() {
  const started = performance.now();
  if (!APP.loggedIn) {
    setStatus('سجّل الدخول إلى Floosy لعرض البيانات المحمية.', 'warning');
    return;
  }

  setStatus('جاري تحميل المؤشرات من Google Sheets وGmail...', 'loading');
  try {
    const [budgets, unread, messages] = await Promise.all([
      api('/api/budgets'),
      api('/api/gmail/unread').catch(() => ({ unread: null })),
      api('/api/gmail/recent-bank-messages').catch(() => ({ messages: [] })),
    ]);

    normalizeBudgetRows(budgets);
    APP.unread = Number.isFinite(Number(unread.unread)) ? Number(unread.unread) : null;
    APP.messages = Array.isArray(messages.messages) ? messages.messages : [];

    renderBudgetData();
    renderAccounts();
    renderActivity();

    $('gmailUnread').textContent = APP.unread == null ? 'غير متاح' : String(APP.unread);
    const seconds = ((performance.now() - started) / 1000).toFixed(2);
    $('loadTime').textContent = `${seconds} ث`;
    $('lastUpdated').textContent = new Date().toLocaleString('ar-OM');
    setStatus('تم تحديث لوحة Floosy بنجاح من نفس مصادر البيانات الحالية.', 'ok');
  } catch (error) {
    if (error.message === 'Unauthorized') {
      APP.loggedIn = false;
      $('loginBtn').textContent = 'تسجيل الدخول';
      $('loginBtn').className = 'btn primary';
      setStatus('انتهت جلسة Floosy أو لم يتم تسجيل الدخول. اضغط تسجيل الدخول ثم عد إلى اللوحة.', 'warning');
      return;
    }
    setStatus(error.message || String(error), 'error');
  }
}

$('monthInput').value = currentMonthValue();
$('monthInput').addEventListener('change', renderBudgetData);
$('refreshBtn').addEventListener('click', refreshAll);
$('loginBtn').addEventListener('click', () => {
  if (APP.loggedIn) {
    refreshAll();
    return;
  }
  window.open(`${API_BASE}/login`, '_blank', 'noopener');
  setStatus('أكمل تسجيل الدخول في الصفحة الجديدة، ثم ارجع واضغط تحديث البيانات.', 'warning');
});

(async function init() {
  const loggedIn = await checkSession();
  if (loggedIn) await refreshAll();
  else {
    $('accountsGrid').innerHTML = [1,2,3].map(() => '<article class="account-card"><div class="account-bank">محمي</div><div class="account-name">سجّل الدخول لعرض الحساب</div><div class="balance">—</div><div class="balance-sub"><span>بيانات خاصة</span><span>Floosy Secure API</span></div></article>').join('');
    $('activityList').innerHTML = '<div class="empty-state">سجّل الدخول لعرض آخر العمليات البنكية.</div>';
    $('budgetTableBody').innerHTML = '<tr><td colspan="5" class="empty-state">سجّل الدخول لعرض بيانات الموازنات.</td></tr>';
    setStatus('اللوحة محمية. اضغط تسجيل الدخول للمتابعة.', 'warning');
  }
})();
