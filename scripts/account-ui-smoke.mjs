import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let snapshot = { revision: 0, data: null };
  let token = '';
  const user = { id: 'test-user', email: 'tester@qq.com', createdAt: new Date().toISOString() };
  await page.route('**/api/auth/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let response = {};
    if (path.endsWith('/code')) response = { expiresInSeconds: 600 };
    if (path.endsWith('/register')) { token = 'test-token'; response = { user, token }; }
    if (path.endsWith('/me')) response = { user };
    if (path.endsWith('/logout')) { token = ''; response = { ok: true }; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
  await page.route('**/api/sync', async (route) => {
    if (!token) throw new Error('sync without login');
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      if (body.revision !== snapshot.revision) throw new Error('revision mismatch');
      snapshot = { revision: snapshot.revision + 1, data: body.data };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: snapshot.revision }) });
    } else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot) });
  });
  await page.goto(process.env.SMOKE_BASE_URL || 'http://127.0.0.1:8788/');
  await page.getByRole('button', { name: '任务', exact: true }).click();
  await page.getByRole('button', { name: '添加任务' }).click();
  await page.getByPlaceholder('今天想完成什么？').fill('跨设备保存验收');
  await page.getByRole('button', { name: '写上公告板' }).click();
  await page.getByRole('button', { name: /注册.*登录/ }).first().click();
  await page.getByRole('button', { name: '邮箱注册' }).click();
  await page.getByPlaceholder('例如：你的 QQ 邮箱').fill('tester@qq.com');
  await page.getByRole('button', { name: '发送验证码' }).click();
  await page.getByPlaceholder('6 位验证码').fill('123456');
  await page.getByPlaceholder('至少 8 个字符').fill('StrongPass123');
  await page.getByRole('button', { name: '注册并保存数据' }).click();
  await page.getByText('tester@qq.com', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('.account-profile')?.textContent?.includes('已同步'));
  if (!snapshot.data?.quests?.some((item) => item.title === '跨设备保存验收')) throw new Error('guest data not uploaded');
  await page.reload();
  await page.getByRole('button', { name: '任务', exact: true }).click();
  await page.getByText('跨设备保存验收').first().waitFor();
  console.log('account registration, migration and restore passed');
} finally { await browser.close(); }
