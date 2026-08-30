const APP = {
  token: '',
  tokenClient: null,
  rows: [],
  budgets: [
    { budget: 'عائلي شهري', accountKey: 'AHLI_001', accountName: 'الأهلي 001' },
    { budget: 'عائلي سنوي', accountKey: 'AHLI_001', accountName: 'الأهلي 001' },
    { budget: 'شخصي شهري', accountKey: 'AHLI_001', accountName: 'الأهلي 001' },
    { budget: 'شخصي سنوي', accountKey: 'AHLI_001', accountName: 'الأهلي 001' },
    { budget: 'تأمين المصروف', accountKey: 'AHLI_002', accountName: 'الأهلي 002' },
    { budget: 'تأمين الدخل', accountKey: 'AHLI_002', accountName: 'الأهلي 002' }
  ]
};

const $ = id => document.getElementById(id);
const CONFIG_KEY = 'floosy-google-config-v1';
const SHEET_NAME = 'موازنات الحسابات';
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.readonly'
].join(' ');

function normalizeClientId(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
}

function extractSpreadsheetId(value) {
  const text = String(value || '').trim();
  const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : text.replace(/\s+/g, '');
}

function isValidClientId(value) {
  return /^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(value);
}

function getConfig() {
  try {
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    return {
      clientId: normalizeClientId(config.clientId),
      sheetId: extractSpreadsheetId(config.sheetId)
    };
  } catch (_) {
    return {};
  }
}

function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({
    clientId: normalizeClientId(config.clientId),
    sheetId: extractSpreadsheetId(config.sheetId)
  }));
}

function setStatus(message, type = 'warning') {
  const box = $('statusBox');
  box.textContent = message;
  box.className = `status ${type}`;
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
  if (typeof value === 'number') {
    return Math.abs(value - monthSerial(month)) < 2;
  }
  const text = String(value || '').trim();
  const mm = monthNo.padStart(2, '0');
  return text === `${mm}/${year}` || text === `${year}-${mm}` || text.startsWith(`01/${mm}/${year}`) || text.startsWith(`${year}-${mm}-01`);
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(3)} ر.ع` : '—';
}

function initTokenClient() {
  const { clientId } = getConfig();
  if (!clientId) return;
  if (!isValidClientId(clientId)) {
    setStatus('Client ID غير صحيح. انسخه كاملًا من Google Cloud ويجب أن يبدأ بأرقام وينتهي بـ apps.googleusercontent.com.', 'error');
    return;
  }
  if (!window.google?.accounts?.oauth2) {
    setTimeout(initTokenClient, 300);
    return;
  }
  APP.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: async response => {
      if (response.error) {
        setStatus(`فشل تسجيل الدخول: ${response.error}`, 'error');
        return;
      }
      APP.token = response.access_token;
      setStatus('تم الاتصال بـ Google. جارٍ تحميل البيانات...', 'ok');
      await refreshAll();
    }
  });
}

async function googleFetch(url, options = {}) {
  if (!APP.token) throw new Error('سجل الدخول إلى Google أولًا.');
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${APP.token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    APP.token = '';
    throw new Error('انتهت جلسة Google. سجل الدخول مرة أخرى.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Google API error ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function readBudgetRows() {
  const { sheetId } = getConfig();
  if (!sheetId) throw new Error('أدخل Spreadsheet ID في الإعدادات.');
  const range = encodeURIComponent(`${SHEET_NAME}!A:H`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`;
  const data = await googleFetch(url);
  const rows = data.values || [];
  APP.rows = rows.slice(1).map((row, index) => ({
    sheetRow: index + 2,
    month: row[0],
    accountKey: String(row[1] || ''),
    budget: String(row[2] || ''),
    accountName: String(row[3] || ''),
    amount: row[4] === '' || row[4] == null ? null : Number(row[4]),
    active: String(row[5] || ''),
    notes: String(row[6] || ''),
    updatedAt: row[7]
  }));
  return APP.rows;
}

async function unreadGmailCount() {
  const url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is%3Aunread&maxResults=1';
  const data = await googleFetch(url);
  return Number(data.resultSizeEstimate || 0);
}

function rowsForMonth(month) {
  return APP.rows.filter(row => monthMatches(row.month, month));
}

function renderBudgets() {
  const month = $('monthInput').value || currentMonthValue();
  const rows = rowsForMonth(month);
  const byBudget = new Map(rows.map(row => [row.budget, row]));
  const grid = $('budgetGrid');
  grid.innerHTML = '';

  let total = 0;
  let configured = 0;

  APP.budgets.forEach(definition => {
    const row = byBudget.get(definition.budget);
    const amount = row?.amount;
    if (Number.isFinite(amount)) {
      total += amount;
      configured++;
    }

    const card = document.createElement('article');
    card.className = 'budget-card';
    card.innerHTML = `
      <h3>${definition.budget}</h3>
      <div class="meta">${definition.accountName} · ${definition.accountKey}</div>
      <div class="save-row">
        <input type="number" min="0" step="0.001" value="${Number.isFinite(amount) ? amount : ''}" aria-label="${definition.budget}">
        <button>حفظ</button>
      </div>`;
    const input = card.querySelector('input');
    const button = card.querySelector('button');
    button.addEventListener('click', () => saveBudget(definition, Number(input.value), button));
    grid.appendChild(card);
  });

  $('totalBudget').textContent = money(total);
  $('configuredBudgets').textContent = `${configured} / ${APP.budgets.length}`;
}

async function saveBudget(definition, amount, button) {
  if (!Number.isFinite(amount) || amount < 0) {
    setStatus('أدخل قيمة صحيحة للموازنة.', 'error');
    return;
  }
  const month = $('monthInput').value || currentMonthValue();
  const { sheetId } = getConfig();
  if (!sheetId) {
    setStatus('أدخل Spreadsheet ID في الإعدادات.', 'error');
    return;
  }

  button.disabled = true;
  const started = performance.now();
  try {
    let row = APP.rows.find(item => item.budget === definition.budget && monthMatches(item.month, month));

    if (!row) {
      const range = encodeURIComponent(`${SHEET_NAME}!A:H`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
      await googleFetch(url, {
        method: 'POST',
        body: JSON.stringify({
          values: [[monthSerial(month), definition.accountKey, definition.budget, definition.accountName, amount, 'نعم', '', new Date().toISOString()]]
        })
      });
    } else {
      const range = encodeURIComponent(`${SHEET_NAME}!E${row.sheetRow}`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${range}?valueInputOption=RAW`;
      await googleFetch(url, {
        method: 'PUT',
        body: JSON.stringify({ values: [[amount]] })
      });
    }

    await readBudgetRows();
    renderBudgets();
    const seconds = ((performance.now() - started) / 1000).toFixed(2);
    $('loadTime').textContent = `${seconds} ث`;
    setStatus(`تم حفظ ${definition.budget} مباشرة في Google Sheets خلال ${seconds} ثانية.`, 'ok');
  } catch (error) {
    setStatus(error.message || String(error), 'error');
  } finally {
    button.disabled = false;
  }
}

async function refreshAll() {
  const started = performance.now();
  try {
    await readBudgetRows();
    const unread = await unreadGmailCount().catch(() => null);
    renderBudgets();
    $('gmailUnread').textContent = unread == null ? 'غير متاح' : String(unread);
    const seconds = ((performance.now() - started) / 1000).toFixed(2);
    $('loadTime').textContent = `${seconds} ث`;
    setStatus(`تم تحميل Google Sheets وGmail خلال ${seconds} ثانية.`, 'ok');
  } catch (error) {
    setStatus(error.message || String(error), 'error');
  }
}

$('monthInput').value = currentMonthValue();
$('monthInput').addEventListener('change', renderBudgets);
$('refreshBtn').addEventListener('click', refreshAll);
$('connectBtn').addEventListener('click', () => {
  const config = getConfig();
  if (!config.clientId || !config.sheetId) {
    $('settingsDialog').showModal();
    return;
  }
  if (!isValidClientId(config.clientId)) {
    setStatus('Client ID غير صحيح. افتح الإعدادات والصق Client ID كاملًا من Google Cloud.', 'error');
    $('settingsDialog').showModal();
    return;
  }
  if (!APP.tokenClient) initTokenClient();
  setTimeout(() => {
    if (!APP.tokenClient) {
      setStatus('مكتبة Google لم تكتمل بعد أو Client ID غير صحيح. راجع الإعدادات.', 'warning');
      return;
    }
    APP.tokenClient.requestAccessToken({ prompt: APP.token ? '' : 'consent' });
  }, 100);
});

$('settingsBtn').addEventListener('click', () => {
  const config = getConfig();
  $('clientIdInput').value = config.clientId || '';
  $('sheetIdInput').value = config.sheetId || '';
  $('settingsDialog').showModal();
});

$('saveSettingsBtn').addEventListener('click', event => {
  event.preventDefault();
  const clientId = normalizeClientId($('clientIdInput').value);
  const sheetId = extractSpreadsheetId($('sheetIdInput').value);
  if (!clientId || !sheetId) {
    setStatus('أدخل Client ID وSpreadsheet ID.', 'error');
    return;
  }
  if (!isValidClientId(clientId)) {
    setStatus('Client ID غير صحيح. يجب أن يكون مثل: 123456789-abc.apps.googleusercontent.com', 'error');
    return;
  }
  saveConfig({ clientId, sheetId });
  $('clientIdInput').value = clientId;
  $('sheetIdInput').value = sheetId;
  APP.token = '';
  APP.tokenClient = null;
  initTokenClient();
  $('settingsDialog').close();
  setStatus('تم حفظ الإعدادات وتصحيح المعرفات تلقائيًا. اضغط تسجيل الدخول إلى Google.', 'warning');
});

initTokenClient();
renderBudgets();
