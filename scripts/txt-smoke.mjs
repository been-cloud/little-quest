import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(process.env.SMOKE_BASE_URL || 'http://127.0.0.1:8788/');
  await page.getByRole('button', { name: '角色', exact: true }).click();
  await page.getByPlaceholder('例如：小禾').fill('唐陌');
  await page.locator('input[accept=".txt,text/plain"]').setInputFiles({
    name: 'sample.txt', mimeType: 'text/plain',
    buffer: Buffer.from('唐陌想了想，低声说：“先把眼前的事做好。”他做事谨慎，对朋友的承诺很认真。'.repeat(20)),
  });
  await page.getByRole('button', { name: '开始蒸馏角色' }).click();
  await page.locator('.sample-line').first().waitFor({ timeout: 60000 });
  const name = await page.locator('.draft-identity b').innerText();
  if (name !== '唐陌') throw new Error(`unexpected card: ${name}`);
  const stats = await page.locator('.forge-result .form-note').first().innerText();
  if (!stats.includes('分析片段')) throw new Error('missing text coverage stats');
  console.log('TXT forge smoke passed:', name, stats);
} finally {
  await browser.close();
}
