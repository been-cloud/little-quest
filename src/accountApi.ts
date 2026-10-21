import type { AppData } from './types';
import { getApiBaseUrl } from './serverUrl';

const tokenKey = 'little-quest-session-v1';

export interface AccountUser { id: string; email: string; createdAt: string }
export interface AccountSession { user: AccountUser; token: string }
export interface CloudSnapshot { revision: number; data: AppData | null }

export const getSessionToken = () => localStorage.getItem(tokenKey) || '';
export const setSessionToken = (token: string) => localStorage.setItem(tokenKey, token);
export const clearSessionToken = () => localStorage.removeItem(tokenKey);

async function request<T>(path: string, method: string, payload?: unknown, token = getSessionToken()): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers: { ...(payload ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '服务暂不可用');
  return result as T;
}

export const requestEmailCode = (email: string) => request<{ expiresInSeconds: number }>('/api/auth/code', 'POST', { email }, '');
export const registerAccount = (email: string, code: string, password: string) => request<AccountSession>('/api/auth/register', 'POST', { email, code, password }, '');
export const loginAccount = (email: string, password: string) => request<AccountSession>('/api/auth/login', 'POST', { email, password }, '');
export const currentAccount = (token = getSessionToken()) => request<{ user: AccountUser }>('/api/auth/me', 'GET', undefined, token);
export const logoutAccount = (token = getSessionToken()) => request<{ ok: true }>('/api/auth/logout', 'POST', {}, token);
export const getCloudSnapshot = (token = getSessionToken()) => request<CloudSnapshot>('/api/sync', 'GET', undefined, token);
export const putCloudSnapshot = (revision: number, data: AppData, token = getSessionToken()) =>
  request<{ revision: number }>('/api/sync', 'PUT', { revision, data }, token);
