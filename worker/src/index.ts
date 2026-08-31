export interface Env {
  FRONTEND_ORIGIN?: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
  SPREADSHEET_ID: string;
  BUDGET_SHEET_NAME?: string;
}

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

function corsHeaders(env: Env) {
  return {
    'Access-Control-Allow-Origin': env.FRONTEND_ORIGIN || 'https://m14901507-boop.github.io',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
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
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = (await response.json()) as TokenResponse;

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `OAuth token refresh failed (${response.status})`);
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
  if (missing.length) {
    return {
      ok: false,
      configured: false,
      missing,
    };
  }

  await getGoogleAccessToken(env);
  return {
    ok: true,
    configured: true,
    oauth: 'connected',
  };
}

async function readBudgets(env: Env) {
  const accessToken = await getGoogleAccessToken(env);
  const sheetName = env.BUDGET_SHEET_NAME || 'موازنات الحسابات';
  const range = encodeURIComponent(`'${sheetName}'!A:H`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID)}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`;
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

  return {
    ok: true,
    unread: Number(data.resultSizeEstimate || 0),
  };
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

      if (url.pathname === '/api/google/status') {
        return json(await googleStatus(env), env);
      }

      if (url.pathname === '/api/budgets') {
        return json(await readBudgets(env), env);
      }

      if (url.pathname === '/api/gmail/unread') {
        return json(await unreadGmail(env), env);
      }

      return json({ ok: false, error: 'Not found' }, env, { status: 404 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ ok: false, error: message }, env, { status: 500 });
    }
  },
};
