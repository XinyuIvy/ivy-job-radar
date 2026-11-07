import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

const deps = process.env.IVY_AUTOFILL_TEST_DEPS;
test('company watchlist renders, searches and edits on desktop and mobile', { skip: !deps }, async () => {
  const require = createRequire(path.join(deps, 'fixture.cjs'));
  const { chromium } = require('playwright-core');
  const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Client from './app/company-watchlist/company-watchlist-client'; createRoot(document.getElementById('root')).render(React.createElement(Client));`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, outdir: '/private/tmp/ivy-watchlist-test-build', format: 'iife', jsx: 'automatic', plugins: [{ name: 'link', setup(build) {
    build.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'test' }));
    build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `import React from 'react';export default function Link(props){return React.createElement('a',props);}`, resolveDir: process.cwd() }));
  } }] });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.IVY_TEST_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    let rows = JSON.parse(await readFile(new URL('../app/company-watchlist-seed.json', import.meta.url), 'utf8')).map((row, index) => ({ ...row, id: String(index), lastCheckedAt: null }));
    let failNext = false;
    await page.route('**/*', async (route) => {
      if (!route.request().url().includes('/api/company-watchlist')) return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
      const request = route.request();
      if (failNext) { failNext = false; return route.fulfill({ status: 500, json: { error: '测试保存失败' } }); }
      const body = request.postDataJSON();
      if (request.method() === 'POST' && body.action !== 'initialize') rows.push({ ...body, id: 'new', lastCheckedAt: null });
      if (request.method() === 'PUT') rows = rows.map((row) => row.id === body.id ? { ...row, ...body } : row);
      if (request.method() === 'DELETE') rows = rows.filter((row) => row.id !== new URL(request.url()).searchParams.get('id'));
      await route.fulfill({ json: { companies: rows, monitoringEnabled: false } });
    });
    await page.goto('https://watchlist.test');
    // Include the real shared stylesheet to catch selector collisions.
    await page.addStyleTag({ content: await readFile(new URL('../app/globals.css', import.meta.url), 'utf8') });
    for (const file of bundle.outputFiles) {
      if (file.path.endsWith('.css')) await page.addStyleTag({ content: file.text });
      else await page.addScriptTag({ content: file.text });
    }
    await page.getByText('312 / 312 家公司', { exact: true }).waitFor();
    await page.getByLabel('搜索公司或网址').fill('艾昆纬');
    assert.equal(await page.locator('tbody tr').count(), 1);
    await page.getByLabel('搜索公司或网址').fill('');
    await page.getByLabel('仅看待补招聘链接').check();
    assert.equal(await page.locator('tbody tr').count(), 122);
    await page.getByLabel('仅看待补招聘链接').uncheck();
    await page.getByRole('button', { name: '＋ 添加公司', exact: true }).click();
    await page.getByLabel('公司名称', { exact: true }).fill('Browser Test Company');
    await page.getByLabel('官网链接', { exact: true }).fill('https://example.org/careers');
    failNext = true;
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '测试保存失败' }).waitFor();
    assert.equal(await page.getByLabel('公司名称', { exact: true }).inputValue(), 'Browser Test Company');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByText('313 / 313 家公司', { exact: true }).waitFor();
    await page.getByLabel('搜索公司或网址').fill('Browser Test Company');
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByLabel('公司名称', { exact: true }).fill('Updated Browser Company');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('heading', { name: '编辑公司' }).waitFor({ state: 'detached' });
    await page.getByLabel('搜索公司或网址').fill('Updated Browser');
    await page.locator('tbody tr').getByText('Updated Browser Company').waitFor();
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: '移除', exact: true }).click();
    await page.getByText('没有匹配的公司。', { exact: true }).waitFor();
    await page.getByLabel('搜索公司或网址').fill('');
    await page.screenshot({ path: '/private/tmp/ivy-company-watchlist-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: '/private/tmp/ivy-company-watchlist-mobile.png' });
  } finally { await browser.close(); }
});
