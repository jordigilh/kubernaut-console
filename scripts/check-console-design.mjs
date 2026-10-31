// Optional installed-Playwright smoke check. Local files only; no install/server.
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mock = join(root, 'mockups/console');
const evidence = process.env.DESIGN_CHECK_OUTPUT_DIR
  ? resolve(process.env.DESIGN_CHECK_OUTPUT_DIR)
  : mkdtempSync(join(tmpdir(), 'console-design-evidence-'));
mkdirSync(evidence, { recursive: true });
assert(!existsSync(join(evidence, 'result.json')) && !existsSync(join(evidence, 'gallery.png')), 'Fresh evidence output required');
const owned = mkdtempSync(join(tmpdir(), 'console-design-browser-'));
for (const name of ['tmp', 'home', 'profile', 'xdg']) mkdirSync(join(owned, name));
// Scope Playwright's Node-created temporary files before importing the module.
process.env.TMPDIR = join(owned, 'tmp');
const require = createRequire(process.env.DESIGN_TOOLING_PACKAGE_JSON || join(root, 'package.json'));
const result = { scope: 'Selected static design smoke, not independent/full UX/runtime acceptance', checks: [], errors: [], denied: [] };
let context, page, visit = 0;
const wait = () => page.waitForTimeout(180);
async function check(name, action) {
  try { await action(); result.checks.push({ name, passed: true }); }
  catch (error) { result.checks.push({ name, passed: false, error: String(error) }); }
}
async function menu(width, theme = 'light') {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(pathToFileURL(join(mock, 'navigation.html')).href + `?dataset=synthetic&check=${++visit}#approvals`);
  await page.waitForFunction(() => window.PriorityNavigation?.ready && window.KubernautApprovalReview?.ready);
  if (theme !== 'light') await page.locator('#theme').selectOption(theme);
  await wait();
}
try {
  const { chromium } = require('playwright');
  context = await chromium.launchPersistentContext(join(owned, 'profile'), {
    headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    serviceWorkers: 'block',
    env: { ...process.env, HOME: join(owned, 'home'), TMPDIR: join(owned, 'tmp'), XDG_CONFIG_HOME: join(owned, 'xdg'), XDG_CACHE_HOME: join(owned, 'xdg') },
    args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run'],
  });
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('file://' + mock + '/')) return route.continue();
    result.denied.push(url); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => { result.denied.push(socket.url()); socket.close(); });
  page = context.pages()[0]; page.setDefaultTimeout(7000);
  page.on('pageerror', error => result.errors.push(error.message));
  await check('Entry redirect and desktop hierarchy', async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(pathToFileURL(join(mock, 'navigation-demo.html')).href);
    await page.waitForFunction(() => window.PriorityNavigation?.ready);
    assert.match(page.url(), /navigation\.html\?dataset=synthetic#approvals$/);
    assert.equal(await page.locator('#console-nav a').count(), 8);
    assert.equal(await page.locator('#priority-more').isVisible(), false);
    assert(await page.locator('#brand-logo').evaluate(n => n.complete && n.naturalWidth > 0));
  });
  await check('Phone More, native keys and secondary route', async () => {
    await menu(390, 'dark'); await page.evaluate(() => scrollTo(0, 0));
    await page.locator('#priority-more').click(); await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'nav-overview');
    await page.keyboard.press('Escape'); assert.equal(await page.locator(':focus').getAttribute('id'), 'priority-more');
    await page.keyboard.press('Space'); await page.locator('#nav-workflows').click(); await wait();
    assert.equal(await page.locator('#priority-more').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#nav-workflows').getAttribute('aria-current'), 'page');
  });
  await check('Independent review exact-version detour and draft', async () => {
    await menu(1280);
    await page.locator('#screen-approvals a[href="#review/rar-demo-02"]').first().click();
    await page.waitForFunction(() => !!document.getElementById('proposed-workflow-link'));
    await page.locator('#decision-reason').fill('Static design smoke');
    await page.locator('#proposed-workflow-link').click(); await wait();
    assert.equal(await page.locator('#definition-version').innerText(), '1.0.7');
    await page.locator('#back-to-approval').click(); await wait();
    assert.equal(await page.locator('#decision-reason').inputValue(), 'Static design smoke');
  });
  await check('Approval-only does not acquire operational reads', async () => {
    await menu(390); await page.locator('#access-preview').selectOption('approvals');
    await page.evaluate(() => { location.hash = '#investigations'; }); await wait();
    assert.match(await page.locator('.main').innerText(), /not this operational read/);
    assert.equal(await page.locator('#nav-investigations').isVisible(), false);
  });
  await check('Standalone summary, Activity return and local draft', async () => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(pathToFileURL(join(mock, 'navigation-investigation.html')).href);
    await page.waitForFunction(() => window.ProgressMock?.ready);
    await page.locator('#prototype-controls>summary').click();
    await page.locator('#rail-preview-stage').selectOption('investigating');
    await page.locator('#prototype-controls>summary').click();
    await page.locator('#composer').fill('Local unsent draft');
    await page.locator('#activity-return').click(); await wait();
    assert.equal(await page.locator(':focus').getAttribute('id'), 'rail-investigating-message');
    assert.equal(await page.locator('#composer').inputValue(), 'Local unsent draft');
    assert(await page.locator('#case-summary').isVisible());
  });
  await check('Gallery and all current references', async () => {
    await page.goto(pathToFileURL(join(mock, 'gallery.html')).href);
    assert.equal(await page.locator('article').count(), 147);
    await page.locator('#set').selectOption('current');
    assert.equal(await page.locator('article:visible').count(), 6);
    assert(await page.locator('article img').first().evaluate(n => n.complete && n.naturalWidth > 0));
    await page.screenshot({ path: join(evidence, 'gallery.png') });
  });
  result.passed = result.checks.every(v => v.passed) && !result.errors.length && !result.denied.length;
} finally {
  if (context) await context.close();
  result.contextClosed = true;
  rmSync(owned, { recursive: true });
  result.ownedBrowserRootRemoved = true;
  writeFileSync(join(evidence, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ ...result, evidence }, null, 2));
}
if (!result.passed) process.exitCode = 1;
