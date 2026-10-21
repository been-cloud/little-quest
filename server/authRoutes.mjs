export function createAuthRouter({ store, sendCode }) {
  return async (path, method, input = {}, token = '') => {
    try {
      if (path === '/api/auth/code' && method === 'POST') {
        return { status: 200, body: await store.requestCode(input.email, sendCode) };
      }
      if (path === '/api/auth/register' && method === 'POST') {
        return { status: 200, body: await store.register(input.email, input.code, input.password) };
      }
      if (path === '/api/auth/login' && method === 'POST') {
        return { status: 200, body: await store.login(input.email, input.password) };
      }
      const user = await store.currentUser(token);
      if (!user) return { status: 401, body: { error: '请先登录' } };
      if (path === '/api/auth/me' && method === 'GET') return { status: 200, body: { user } };
      if (path === '/api/auth/logout' && method === 'POST') {
        await store.logout(token);
        return { status: 200, body: { ok: true } };
      }
      if (path === '/api/sync' && method === 'GET') {
        return { status: 200, body: await store.getSnapshot(user.id) };
      }
      if (path === '/api/sync' && method === 'PUT') {
        if (!Number.isInteger(input.revision) || input.revision < 0) throw new Error('数据版本无效');
        return { status: 200, body: await store.saveSnapshot(user.id, input.revision, input.data) };
      }
      return { status: 404, body: { error: 'Not found' } };
    } catch (error) {
      const message = error instanceof Error ? error.message : '请求失败';
      const status = /同步冲突|已注册/.test(message) ? 409 : /登录尝试过多|太频繁/.test(message) ? 429 : /邮件服务未配置|邮件发送失败/.test(message) ? 503 : 400;
      return { status, body: { error: message } };
    }
  };
}
