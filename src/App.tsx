import { useEffect, useMemo, useState } from 'react';
import { authStatus, getBankMessages, getBudgets, getUnread, login } from './services/api';
import type { BankMessage, BudgetRow } from './types';

const BUDGETS = [
  ['عائلي شهري', 'AHLI_001', 'الأهلي 001'],
  ['عائلي سنوي', 'AHLI_001', 'الأهلي 001'],
  ['شخصي شهري', 'AHLI_001', 'الأهلي 001'],
  ['شخصي سنوي', 'AHLI_001', 'الأهلي 001'],
  ['تأمين المصروف', 'AHLI_002', 'الأهلي 002'],
  ['تأمين الدخل', 'AHLI_002', 'الأهلي 002'],
  ['الادخار والاستثمار', 'DHOFAR', 'بنك ظفار'],
] as const;

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthSerial(month: string) {
  const [year, monthNo] = month.split('-').map(Number);
  const utc = Date.UTC(year, monthNo - 1, 1);
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((utc - epoch) / 86400000);
}

function monthMatches(value: unknown, month: string) {
  const [year, monthNo] = month.split('-');
  if (typeof value === 'number') return Math.abs(value - monthSerial(month)) < 2;
  const text = String(value ?? '').trim();
  const mm = monthNo.padStart(2, '0');
  return text === `${mm}/${year}` || text === `${year}-${mm}` || text.startsWith(`01/${mm}/${year}`) || text.startsWith(`${year}-${mm}-01`);
}

function money(value: number | null | undefined) {
  return Number.isFinite(value) ? `${Number(value).toLocaleString('ar-OM', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ر.ع` : '—';
}

function normalizeRows(rows: unknown[][]): BudgetRow[] {
  return rows.map((row) => ({
    month: row[0], accountKey: String(row[1] ?? ''), budget: String(row[2] ?? ''),
    accountName: String(row[3] ?? ''), amount: row[4] == null || row[4] === '' ? null : Number(row[4]),
    active: String(row[5] ?? ''), notes: String(row[6] ?? ''), updatedAt: row[7],
  }));
}

function extractBalance(text: string) {
  const match = text.match(/available\s+bal(?:ance)?\s*(?:is\s*)?(?:OMR|RO)\s*([0-9,]+(?:\.\d{1,3})?)/i);
  return match?.[1] ? Number(match[1].replace(/,/g, '')) : null;
}

function detectAccount(message: BankMessage) {
  const text = `${message.subject} ${message.preview}`;
  const from = message.from.toLowerCase();
  if (from.includes('ahlibank')) {
    if (/#{3,}002\b|xxxx0*02\b|0*02\b/i.test(text)) return 'AHLI_002';
    return 'AHLI_001';
  }
  if (/bankdhofar|dhofar/i.test(`${from} ${text}`)) return 'DHOFAR';
  return null;
}

export default function App() {
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [messages, setMessages] = useState<BankMessage[]>([]);
  const [unread, setUnread] = useState<number | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('جاري التحقق من الجلسة...');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    setStatus('جاري تحميل البيانات من Floosy API...');
    try {
      const [budgetData, unreadData, messageData] = await Promise.all([getBudgets(), getUnread(), getBankMessages()]);
      setRows(normalizeRows(budgetData.rows || []));
      setUnread(unreadData.unread);
      setMessages(messageData.messages || []);
      setAuthenticated(true);
      setStatus('تم تحديث البيانات بنجاح.');
    } catch (error) {
      setAuthenticated(false);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    authStatus().then((ok) => {
      setAuthenticated(ok);
      setStatus(ok ? 'الجلسة آمنة ومتصلة.' : 'سجّل الدخول لعرض البيانات المحمية.');
      if (ok) void refresh();
    });
  }, []);

  const monthData = useMemo(() => {
    const monthRows = rows.filter((row) => monthMatches(row.month, month));
    const map = new Map(monthRows.map((row) => [row.budget, row]));
    return BUDGETS.map(([budget, accountKey, accountName]) => ({ budget, accountKey, accountName, amount: map.get(budget)?.amount ?? null }));
  }, [rows, month]);

  const total = monthData.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? Number(item.amount) : 0), 0);
  const configured = monthData.filter((item) => Number.isFinite(item.amount)).length;

  const accounts = [
    { key: 'AHLI_001', name: 'الأهلي 001', purpose: 'عائلي + شخصي' },
    { key: 'AHLI_002', name: 'الأهلي 002', purpose: 'تأمين المصروف + تأمين الدخل' },
    { key: 'DHOFAR', name: 'بنك ظفار', purpose: 'الادخار والاستثمار' },
  ].map((account) => {
    const message = messages.find((item) => detectAccount(item) === account.key && Number.isFinite(extractBalance(item.preview)));
    return { ...account, balance: message ? extractBalance(message.preview) : null };
  });

  const submitLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setStatus('جاري التحقق من كلمة المرور...');
    try {
      await login(password);
      setPassword('');
      setAuthenticated(true);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">ف</div><div><strong>فلوسي</strong><small>React + TypeScript</small></div></div>
        <nav><button className="active">لوحة العرض</button><button>الموازنات</button><button>آخر العمليات</button><button>الحسابات</button></nav>
        <div className="secure">● اتصال آمن عبر Cloudflare Worker</div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><span className="eyebrow">الملخص المالي</span><h1>لوحة العرض</h1><p>نفس بيانات Google Sheets الحالية، بطبقة عرض React جديدة.</p></div>
          <div className="actions"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /><button onClick={() => void refresh()} disabled={!authenticated || busy}>تحديث</button></div>
        </header>

        <div className={`status ${authenticated ? 'ok' : 'warning'}`}>{status}</div>

        {!authenticated && (
          <form className="login-card" onSubmit={submitLogin}>
            <h2>تسجيل الدخول إلى Floosy</h2>
            <p>يتم استخدام نفس الحماية الحالية بدون تغيير الربط.</p>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="كلمة مرور Floosy" required />
            <button disabled={busy}>دخول</button>
          </form>
        )}

        <section className="kpis">
          <article><span>إجمالي الموازنات</span><strong>{money(total)}</strong></article>
          <article><span>الموازنات المحددة</span><strong>{configured} / {BUDGETS.length}</strong></article>
          <article><span>Gmail غير المقروء</span><strong>{unread ?? '—'}</strong></article>
          <article><span>العمليات البنكية</span><strong>{messages.length || '—'}</strong></article>
        </section>

        <section><div className="section-title"><div><span className="eyebrow">الحسابات</span><h2>الرصيد الحالي</h2></div></div><div className="accounts">{accounts.map((account) => <article key={account.key}><span>{account.name}</span><strong>{money(account.balance)}</strong><small>{account.purpose}</small></article>)}</div></section>

        <section className="grid-two">
          <article className="panel"><h2>الموازنات</h2><div className="budget-list">{monthData.map((item) => { const share = total > 0 && Number.isFinite(item.amount) ? Number(item.amount) / total * 100 : 0; return <div className="budget-row" key={item.budget}><div><span>{item.budget}</span><strong>{money(item.amount)}</strong></div><div className="track"><i style={{ width: `${Math.min(100, share)}%` }} /></div></div>; })}</div></article>
          <article className="panel"><h2>آخر العمليات البنكية</h2><div className="transactions">{messages.length ? messages.slice(0, 10).map((item) => <div key={item.id}><div><strong>{item.subject || 'عملية بنكية'}</strong><small>{item.bank} · {item.operationType}</small></div><b>{money(item.amount)}</b></div>) : <p className="muted">لا توجد بيانات للعرض.</p>}</div></article>
        </section>
      </main>
    </div>
  );
}
