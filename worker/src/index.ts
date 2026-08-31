export interface Env {
  FRONTEND_ORIGIN?: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
  SPREADSHEET_ID: string;
  BUDGET_SHEET_NAME?: string;
  FLOOSY_PASSWORD: string;
}

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type SessionPayload = {
  v: 1;
  exp: number;
};

class OAuthError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'OAuthError';
    this.code = code;
    this.status = status;
  }
}

const SESSION_COOKIE = 'floosy_session';
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();

function corsHeaders(env: Env) {
  return {
    'Access-Control-Allow-Origin': env.FRONTEND_ORIGIN || 'https://m14901507-boop.github.io',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

function json(data: unknown, env: Env, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      ...corsHeaders(env),
      ...(init.headers || {}),
    },
  });
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function stringToBase64Url(value: string) {
  return base64UrlEncode(encoder.encode(value));
}

async function sessionKey(env: Env) {
  const secret = `${env.FLOOSY_PASSWORD || ''}\n${env.GOOGLE_CLIENT_SECRET || ''}`;
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function signValue(value: string, env: Env) {
  const key = await sessionKey(env);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

function safeEqual(a: string, b: string) {
  const aa = encoder.encode(a);
  const bb = encoder.encode(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

async function createSession(env: Env) {
  const payload: SessionPayload = {
    v: 1,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  };
  const encoded = stringToBase64Url(JSON.stringify(payload));
  const signature = await signValue(encoded, env);
  return `${encoded}.${signature}`;
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get('Cookie') || '';
  for (const part of cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

async function validSession(request: Request, env: Env) {
  if (!env.FLOOSY_PASSWORD) return false;
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return false;

  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = await signValue(encoded, env);
  if (!safeEqual(signature, expected)) return false;

  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encoded.length % 4) % 4);
    const jsonText = decodeURIComponent(
      Array.from(atob(padded))
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );
    const payload = JSON.parse(jsonText) as SessionPayload;
    return payload.v === 1 && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function passwordMatches(input: string, env: Env) {
  if (!env.FLOOSY_PASSWORD) return false;
  const inputHash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(input)));
  const savedHash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(env.FLOOSY_PASSWORD)));
  if (inputHash.length !== savedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < inputHash.length; i++) diff |= inputHash[i] ^ savedHash[i];
  return diff === 0;
}

function loginPage() {
  return new Response(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>تسجيل الدخول - Floosy</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#f6f8fb;margin:0;display:grid;place-items:center;min-height:100vh;color:#172033}
    main{width:min(420px,calc(100% - 32px));background:#fff;border:1px solid #e6eaf0;border-radius:18px;padding:28px;box-shadow:0 14px 40px rgba(20,35,60,.08)}
    h1{margin:0 0 8px;font-size:28px} p{color:#657083;margin:0 0 22px}
    input,button{width:100%;box-sizing:border-box;border-radius:12px;font-size:16px;padding:13px}
    input{border:1px solid #ccd4df;margin-bottom:12px} button{border:0;background:#1769ff;color:#fff;font-weight:700;cursor:pointer}
    #msg{margin-top:14px;font-size:14px}
  </style>
</head>
<body>
<main>
  <h1>Floosy</h1>
  <p>أدخل كلمة المرور الخاصة بالنظام.</p>
  <form id="f">
    <input id="p" type="password" autocomplete="current-password" placeholder="كلمة المرور" required />
    <button type="submit">دخول</button>
  </form>
  <div id="msg"></div>
</main>
<script>
const f=document.getElementById('f'),p=document.getElementById('p'),m=document.getElementById('msg');
f.addEventListener('submit',async(e)=>{
  e.preventDefault();m.textContent='جاري التحقق...';
  const r=await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({password:p.value})});
  const d=await r.json().catch(()=>({}));
  if(r.ok){m.textContent='تم تسجيل الدخول بنجاح ✅';p.value='';}
  else{m.textContent=d.error||'تعذر تسجيل الدخول';}
});
</script>
</body>
</html>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function requireConfig(env: Env) {
  const missing: string[] = [];
  if (!env.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
  if (!env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
  if (!env.GOOGLE_REFRESH_TOKEN) missing.push('GOOGLE_REFRESH_TOKEN');
  if (!env.SPREADSHEET_ID) missing.push('SPREADSHEET_ID');
  return missing;
}

async function getGoogleAccessToken(env: Env): Promise<string> {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID.trim(),
    client_secret: env.GOOGLE_CLIENT_SECRET.trim(),
    refresh_token: env.GOOGLE_REFRESH_TOKEN.trim(),
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !data.access_token) {
    throw new OAuthError(
      data.error || 'oauth_refresh_failed',
      data.error_description || `OAuth token refresh failed (${response.status})`,
      response.status,
    );
  }
  return data.access_token;
}

async function googleGet(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data as any)?.error?.message || `Google API request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
}

async function googleStatus(env: Env) {
  const missing = requireConfig(env);
  if (missing.length) return { ok: false, configured: false, missing };
  await getGoogleAccessToken(env);
  return { ok: true, configured: true, oauth: 'connected' };
}

async function readBudgets(env: Env) {
  const accessToken = await getGoogleAccessToken(env);
  const sheetName = env.BUDGET_SHEET_NAME || 'موازنات الحسابات';
  const range = encodeURIComponent(`'${sheetName}'!A:H`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID.trim())}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`;
  const data = await googleGet(url, accessToken) as { values?: unknown[][] };
  const values = data.values || [];
  return {
    ok: true,
    sheet: sheetName,
    headers: values[0] || [],
    rows: values.slice(1),
    rowCount: Math.max(values.length - 1, 0),
  };
}

async function unreadGmail(env: Env) {
  const accessToken = await getGoogleAccessToken(env);
  const url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is%3Aunread&maxResults=1';
  const data = await googleGet(url, accessToken) as { resultSizeEstimate?: number };
  return { ok: true, unread: Number(data.resultSizeEstimate || 0) };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    try {
      if (url.pathname === '/' || url.pathname === '/health') {
        return json({
          ok: true,
          service: 'floosy-api',
          runtime: 'cloudflare-workers',
          time: new Date().toISOString(),
        }, env);
      }

      if (url.pathname === '/login' && request.method === 'GET') {
        return loginPage();
      }

      if (url.pathname === '/auth/login' && request.method === 'POST') {
        if (!env.FLOOSY_PASSWORD) {
          return json({ ok: false, error: 'FLOOSY_PASSWORD is not configured' }, env, { status: 503 });
        }
        const body = await request.json().catch(() => ({})) as { password?: string };
        if (!body.password || !(await passwordMatches(body.password, env))) {
          return json({ ok: false, error: 'كلمة المرور غير صحيحة' }, env, { status: 401 });
        }
        const session = await createSession(env);
        return json({ ok: true, authenticated: true }, env, {
          headers: {
            'Set-Cookie': `${SESSION_COOKIE}=${session}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${SESSION_SECONDS}`,
            'Cache-Control': 'no-store',
          },
        });
      }

      if (url.pathname === '/auth/logout' && request.method === 'POST') {
        return json({ ok: true }, env, {
          headers: {
            'Set-Cookie': `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`,
            'Cache-Control': 'no-store',
          },
        });
      }

      if (url.pathname === '/auth/status') {
        return json({ ok: true, authenticated: await validSession(request, env) }, env, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }

      if (url.pathname.startsWith('/api/')) {
        if (!(await validSession(request, env))) {
          return json({ ok: false, error: 'Unauthorized' }, env, { status: 401 });
        }

        if (url.pathname === '/api/google/status') {
          return json(await googleStatus(env), env);
        }
        if (url.pathname === '/api/budgets') {
          return json(await readBudgets(env), env);
        }
        if (url.pathname === '/api/gmail/unread') {
          return json(await unreadGmail(env), env);
        }
      }

      return json({ ok: false, error: 'Not found' }, env, { status: 404 });
    } catch (error) {
      if (error instanceof OAuthError) {
        return json({
          ok: false,
          stage: 'oauth_refresh',
          oauth_error: error.code,
          error: error.message,
          google_status: error.status,
        }, env, { status: 500 });
      }
      const message = error instanceof Error ? error.message : String(error);
      return json({ ok: false, error: message }, env, { status: 500 });
    }
  },
};
