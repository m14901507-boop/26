import type { BankMessagesResponse, BudgetsResponse, GmailUnreadResponse } from '../types';

const API_BASE = 'https://floosy-api.m14901507.workers.dev';
const SESSION_KEY = 'floosy-session-v1';

export function getSession() {
  return sessionStorage.getItem(SESSION_KEY) || '';
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getSession();
  const headers = new Headers(init.headers || {});
  headers.set('Accept', 'application/json');
  if (session) headers.set('Authorization', `Bearer ${session}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) clearSession();
    throw new Error((data as { error?: string }).error || `API error ${response.status}`);
  }
  return data as T;
}

export async function login(password: string) {
  const data = await request<{ ok: boolean; authenticated: boolean; session?: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
  if (!data.session) throw new Error('لم يتم استلام جلسة آمنة من Floosy.');
  sessionStorage.setItem(SESSION_KEY, data.session);
  return data;
}

export async function authStatus() {
  if (!getSession()) return false;
  try {
    const data = await request<{ ok: boolean; authenticated: boolean }>('/auth/status');
    return Boolean(data.authenticated);
  } catch {
    return false;
  }
}

export const getBudgets = () => request<BudgetsResponse>('/api/budgets');
export const getUnread = () => request<GmailUnreadResponse>('/api/gmail/unread');
export const getBankMessages = () => request<BankMessagesResponse>('/api/gmail/recent-bank-messages');
