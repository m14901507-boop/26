const API_BASE = 'https://floosy-api.m14901507.workers.dev';
const SESSION_KEY = 'floosy-session-v1';

const APP = {
  budgets: [],
  messages: [],
  unread: null,
  loggedIn: false,
  session: sessionStorage.getItem(SESSION_KEY) || '',
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

const $ = id => document.getElementById(id);

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

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (APP.session) headers.set('Authorization', `Bearer ${APP.session}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
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
  updateLoginButton();
  return APP.loggedIn;
}

function updateLoginButton() {
  $('loginBtn').textContent = APP.loggedIn ? 'متصل ✓' : 'تسجيل الدخول';
  $('loginBtn').className = APP.loggedIn ? 'btn secondary' : 'btn primary';
}

async function loginFromDashboard() {
  const password = window.prompt('أدخل كلمة مرور Floosy');
  if (password === null) return;
  if (!password) {
    setStatus('أدخل كلمة المرور.', 'warning');
    return;
  }

  setStatus('جاري تسجيل الدخول...', 'loading');
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    if (!data.session) throw new Error('لم يتم استلام جلسة آمنة من الخادم.');
    APP.session = data.session;
    sessionStorage.setItem(SESSION_KEY, APP.session);
    APP.loggedIn = true;
    updateLoginButton();
    await refreshAll();
  } catch (error) {
    APP.session = '';
    sessionStorage.removeItem(SESSION_KEY);
    APP.loggedIn = false;
    updateLoginButton();
    setStatus(error.message || String(error), 'error');
  }
}

function normalizeBudgetRows(data) {
  const rows = Array.isArray(data.rows) ? data.rows : [];
  APP.budgets = rows.map(row => ({
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
  return APP.budgets.filter(row => monthMatches(row.month, month));
}

function dedupeMonthRows(rows) {
  const map = new Map();
  rows.forEach(row => {
    if (!row.budget) return;
    map.set(row.budget, row);
  });
  return map;
}

function renderBudgetData() {
  const rows = rowsForMonth();
  const byBudget = dedupeMonthRows(rows);
  const values = BUDGET_DEFS.map(def => {
    const row = byBudget.get(def.budget);
    return { ...def, amount: Number.isFinite(row?.amount) ? row.amount : null, active: row?.active || '' };
  });

  const total = values.reduce((sum, row) => sum + (Number.isFinite(row.amount) ? row.amount : 0), 0);
  const configured = values.filter(row => Number.isFinite(row.amount)).length;

  $('totalBudget').textContent = money(total);
  $('configuredBudgets').textContent = `${configured} / ${BUDGET_DEFS.length}`;
  $('budgetTotalBadge').textContent = money(total);
  $('donutValue').textContent = total ? total.toLocaleString('ar-OM', { maximumFractionDigits: 0 }) : '0';

  const bars = $('budgetBars');
  const table = $('budgetTableBody');
  bars.innerHTML = '';
  table.innerHTML = '';

  values.forEach(row => {
    const share = total > 0 && Number.isFinite(row.amount) ? (row.amount / total) * 100 : 0;
    const bar = document.createElement('div');
    bar.className = 'budget-row';
    bar.innerHTML = `<div class="budget-row-head"><span>${row.budget}</span><span>${Number.isFinite(row.amount) ? money(row.amount) : 'غير محدد'}</span></div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(0, Math.min(100, share))}%"></div></div>`;
    bars.appendChild(bar);

    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${row.budget}</strong></td><td>${row.accountName}</td><td>${Number.isFinite(row.amount) ? money(row.amount) : '—'}</td><td><span class="state-pill">${row.active === 'نعم' ? 'نشط' : row.active || '—'}</span></td><td><div class="share"><div class="mini-track"><div class="mini-fill" style="width:${Math.min(100, share)}%"></div></div><span>${share.toFixed(0)}%</span></div></td>`;
    table.appendChild(tr);
  });

  const palette = ['#3b82f6','#22c55e','#8b5cf6','#f59e0b','#06b6d4','#ef4444','#64748b'];
  let cursor = 0;
  const stops = [];
  values.forEach((v, i) => {
    const share = total > 0 && Number.isFinite(v.amount) ? (v.amount / total) * 100 : 0;
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
  for (const p of patterns) {
    const m = String(text || '').match(p);
    if (m?.[1]) return Number(m[1].replace(/,/g, ''));
  }
  return null;
}

function detectAccount(message) {
  const text = `${message.subject || ''} ${message.preview || ''}`;
  const from = String(message.from || '').toLowerCase();
  if (from.includes('ahlibank')) {
    if (/#{3,}002\b|xxxx0*002\b|account\s*0*02\b/i.test(text)) return 'AHLI_002';
    return 'AHLI_001';
  }
  if (/bankdhofar|dhofar/i.test(`${from} ${text}`)) return 'DHOFAR';
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
  const defs = [
    { key: 'AHLI_001', bank: 'الأهلي الإسلامي', name: 'الأهلي 001', purpose: 'عائلي وشخصي' },
    { key: 'AHLI_002', bank: 'الأهلي الإسلامي', name: 'الأهلي 002', purpose: 'تأمين المصروف والدخل' },
    { key: 'DHOFAR', bank: 'بنك ظفار', name: 'الادخار والاستثمار', purpose: 'الادخار والاستثمار' },
  ];
  const grid = $('accountsGrid');
  grid.innerHTML = '';
  defs.forEach(def => {
    const latest = newestBalance(def.key);
    const card = document.createElement('article');
    card.className = 'account-card';
    card.innerHTML = `<div class="account-top"><div><div class="account-bank">${def.bank}</div><div class="account-name">${def.name}</div></div><div class="account-tag">${latest ? 'رصيد مؤكد' : 'بانتظار رصيد'}</div></div><div class="balance">${latest ? money(latest.balance) : '—'}</div><div class="balance-sub"><span>${def.purpose}</span><span>${latest ? 'من آخر رسالة بنكية' : 'لا توجد رسالة رصيد حديثة'}</span></div>`;
    grid.appendChild(card);
  });
}

function cleanBankName(value) {
  return String(value || '').replace(/[<>]/g, '').replace(/Notifications/gi, '').trim() || 'البنك';
}

function renderActivity() {
  const list = $('activityList');
  list.innerHTML = '';
  if (!APP.messages.length) {
    list.innerHTML = '<div class="empty-state">لا توجد عمليات بنكية للعرض حاليًا.</div>';
    return;
  }
  APP.messages.slice(0, 10).forEach(item => {
    const incoming = /دخل|وارد|credited/i.test(item.operationType || '');
    const row = document.createElement('div');
    row.className = 'activity-item';
    row.innerHTML = `<div class="activity-main"><div class="activity-title">${item.subject || item.operationType || 'عملية بنكية'}</div><div class="activity-meta">${cleanBankName(item.bank)} · ${item.operationType || 'غير محدد'} · ${item.date || ''}</div></div><div class="activity-amount ${incoming ? 'in' : 'out'}">${Number.isFinite(Number(item.amount)) ? money(item.amount) : '—'}</div>`;
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
    setStatus('تم تحديث لوحة Floosy بنجاح.', 'ok');
  } catch (error) {
    if (error.message === 'Unauthorized') {
      APP.session = '';
      sessionStorage.removeItem(SESSION_KEY);
      APP.loggedIn = false;
      updateLoginButton();
      setStatus('انتهت الجلسة. اضغط تسجيل الدخول.', 'warning');
      return;
    }
    setStatus(error.message || String(error), 'error');
  }
}

function setupNavigation() {
  const navItems = [...document.querySelectorAll('.nav-item')];
  const targets = [
    document.querySelector('.topbar'),
    document.querySelector('.budget-table-panel'),
    document.querySelector('.activity-panel'),
    document.querySelector('.section-head'),
  ];
  navItems.forEach((button, index) => {
    button.addEventListener('click', () => {
      navItems.forEach(x => x.classList.remove('active'));
      button.classList.add('active');
      targets[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

$('monthInput').value = currentMonthValue();
$('monthInput').addEventListener('change', renderBudgetData);
$('refreshBtn').addEventListener('click', refreshAll);
$('loginBtn').addEventListener('click', async () => {
  if (APP.loggedIn) return refreshAll();
  await loginFromDashboard();
});
setupNavigation();

(async function init() {
  const loggedIn = await checkSession();
  if (loggedIn) {
    await refreshAll();
  } else {
    $('accountsGrid').innerHTML = [1,2,3].map(() => '<article class="account-card"><div class="account-bank">محمي</div><div class="account-name">سجّل الدخول لعرض الحساب</div><div class="balance">—</div><div class="balance-sub"><span>بيانات خاصة</span><span>Floosy Secure API</span></div></article>').join('');
    $('activityList').innerHTML = '<div class="empty-state">سجّل الدخول لعرض آخر العمليات البنكية.</div>';
    $('budgetTableBody').innerHTML = '<tr><td colspan="5" class="empty-state">سجّل الدخول لعرض بيانات الموازنات.</td></tr>';
    setStatus('اللوحة محمية. اضغط تسجيل الدخول للمتابعة.', 'warning');
  }
})();
