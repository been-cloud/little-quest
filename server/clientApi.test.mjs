import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

test('TXT distillation sends the session token when polling progress', async () => {
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.localStorage;
  const requests = [];
  globalThis.localStorage = {
    getItem(key) {
      if (key === 'little-quest-api-url-v1') return 'http://127.0.0.1:8788';
      if (key === 'little-quest-session-v1') return 'test-session-token';
      return null;
    },
  };
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), authorization: new Headers(options.headers).get('Authorization') });
    if (String(url).endsWith('/api/distill/jobs')) return Response.json({ id: 'job-1' }, { status: 202 });
    return Response.json({ status: 'done', progress: 1, total: 1, mode: 'demo', card: {}, stats: {} });
  };

  try {
    const output = await build({ entryPoints: ['src/api.ts'], bundle: true, platform: 'browser', format: 'esm', write: false });
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`;
    const { distillText } = await import(moduleUrl);
    await distillText({ name: '角色', description: '', dialogue: '', text: '角色说了句话。' }, () => {});
    assert.deepEqual(requests, [
      { url: 'http://127.0.0.1:8788/api/distill/jobs', authorization: 'Bearer test-session-token' },
      { url: 'http://127.0.0.1:8788/api/distill/jobs/job-1', authorization: 'Bearer test-session-token' },
    ]);
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.localStorage = previousStorage;
  }
});
