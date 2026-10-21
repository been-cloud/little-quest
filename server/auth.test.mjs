import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AccountStore } from './auth.mjs';

async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'little-quest-auth-'));
  try { await run(join(dir, 'accounts.json')); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

test('email verification creates an account, hashes password and survives restart', async () => fixture(async (path) => {
  const store = new AccountStore(path);
  let code = '';
  await store.requestCode('TEST@QQ.COM', async (_, value) => { code = value; });
  await assert.rejects(store.register('test@qq.com', '000000', 'StrongPass123'), /验证码/);
  const registered = await store.register('test@qq.com', code, 'StrongPass123');
  assert.equal(registered.user.email, 'test@qq.com');
  assert.ok(registered.token.length >= 32);
  const restarted = new AccountStore(path);
  const login = await restarted.login('test@qq.com', 'StrongPass123');
  assert.equal(login.user.id, registered.user.id);
  assert.equal((await restarted.currentUser(login.token)).email, 'test@qq.com');
  await assert.rejects(restarted.login('test@qq.com', 'wrongpassword'), /邮箱或密码/);
  await assert.rejects(restarted.requestCode('test@qq.com', async () => {}), /已注册/);
}));

test('verification request is throttled and cannot be replayed', async () => fixture(async (path) => {
  const store = new AccountStore(path);
  let code = '';
  await store.requestCode('new@qq.com', async (_, value) => { code = value; });
  await assert.rejects(store.requestCode('new@qq.com', async () => {}), /稍后/);
  await store.register('new@qq.com', code, 'StrongPass123');
  await assert.rejects(store.register('new@qq.com', code, 'StrongPass123'), /已注册/);
}));

test('snapshots are isolated per account and revision conflicts do not overwrite', async () => fixture(async (path) => {
  const store = new AccountStore(path);
  let codeA = '';
  let codeB = '';
  await store.requestCode('a@qq.com', async (_, value) => { codeA = value; });
  await store.requestCode('b@qq.com', async (_, value) => { codeB = value; });
  const a = await store.register('a@qq.com', codeA, 'StrongPass123');
  const b = await store.register('b@qq.com', codeB, 'StrongPass123');
  assert.deepEqual(await store.getSnapshot(a.user.id), { revision: 0, data: null });
  assert.deepEqual(await store.saveSnapshot(a.user.id, 0, { coins: 10 }), { revision: 1 });
  assert.deepEqual(await store.getSnapshot(b.user.id), { revision: 0, data: null });
  await assert.rejects(store.saveSnapshot(a.user.id, 0, { coins: 99 }), /同步冲突/);
  assert.deepEqual(await new AccountStore(path).getSnapshot(a.user.id), { revision: 1, data: { coins: 10 } });
  await store.logout(a.token);
  assert.equal(await store.currentUser(a.token), null);
}));
