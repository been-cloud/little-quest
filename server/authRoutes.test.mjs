import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AccountStore } from './auth.mjs';
import { createAuthRouter } from './authRoutes.mjs';

test('HTTP auth routes enforce ownership of saved application data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'little-quest-routes-'));
  try {
    const store = new AccountStore(join(dir, 'accounts.json'));
    let code = '';
    const route = createAuthRouter({ store, sendCode: async (_, value) => { code = value; } });
    assert.equal((await route('/api/auth/code', 'POST', { email: 'a@qq.com' })).status, 200);
    const registered = await route('/api/auth/register', 'POST', { email: 'a@qq.com', code, password: 'StrongPass123' });
    assert.equal(registered.status, 200);
    const token = registered.body.token;
    assert.equal((await route('/api/sync', 'GET', {}, '')).status, 401);
    assert.deepEqual((await route('/api/sync', 'GET', {}, token)).body, { revision: 0, data: null });
    assert.equal((await route('/api/sync', 'PUT', { revision: 0, data: { coins: 7 } }, token)).body.revision, 1);
    assert.deepEqual((await route('/api/sync', 'GET', {}, token)).body.data, { coins: 7 });
    assert.equal((await route('/api/sync', 'PUT', { revision: 0, data: { coins: 8 } }, token)).status, 409);
    assert.equal((await route('/api/auth/logout', 'POST', {}, token)).status, 200);
    assert.equal((await route('/api/auth/me', 'GET', {}, token)).status, 401);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
