import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = 20000 + Math.floor(Math.random() * 20000);
const child = spawn(process.execPath, ['server/index.mjs'], {
  cwd: root,
  env: { ...process.env, DEEPSEEK_API_KEY: '', PORT: String(port), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('demo API did not start')), 10000);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('Little Quest API:')) { clearTimeout(timeout); resolve(); }
    });
    child.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`demo API exited: ${code}`)); });
    child.stderr.on('data', (chunk) => { if (String(chunk).includes('EADDRINUSE')) reject(new Error('smoke port busy')); });
  });
  process.env.SMOKE_BASE_URL = `http://127.0.0.1:${port}/`;
  await import('./smoke.mjs');
} finally {
  child.kill();
}
