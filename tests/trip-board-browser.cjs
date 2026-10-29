const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, mkdirSync } = require('node:fs');
const { createServer } = require('node:http');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const root = resolve(__dirname, '..');
  const skill = join(root, 'plugins/walletfreak/skills/trip-board');
  const directory = mkdtempSync(join(tmpdir(), 'walletfreak-board-test-'));
  const output = join(directory, 'index.html');
  execFileSync('python3', [join(skill, 'scripts/render_board.py'), join(skill, 'assets/example-trip.json'), output]);
  const html = readFileSync(output);
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({args:['--headless=new'], headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const page = await browser.newPage();
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => requests.push(request.url()));
    const screenshotDir = join(root, '.artifacts/trip-board');
    mkdirSync(screenshotDir, { recursive: true });
    for (const url of [pathToFileURL(output).href, `http://127.0.0.1:${server.address().port}/index.html`]) {
      await page.goto(url);
      await page.getByRole('heading', { name: 'A week in Tokyo' }).waitFor();
      assert.equal(await page.locator('#export-alternatives').getAttribute('open'),'');
      assert.equal(await page.locator('.option:visible').count(), 3);
      assert.equal(await page.locator('#export-tabs [role="tab"]').count(),2);
      assert.match(await page.locator('.notice').innerText(), /Fictional prices/);
      await page.locator('#option-0 .compare-button').click();
      await page.locator('#option-1 .compare-button').click();
      await page.locator('#export-compare-open').click();
      assert.match(await page.locator('#export-comparison').innerText(),/Not directly comparable/);
      await page.getByRole('tab',{name:/Stays/}).click();
      assert.equal(await page.locator('.option:visible').count(),2);
      await page.getByRole('tab',{name:/Flights/}).click();
      await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('connecting');
      assert.equal(await page.locator('.option:visible').count(), 1);
      await page.getByRole('button', { name: 'Reset filters' }).click();
      await page.getByLabel('Availability', { exact: true }).selectOption('available');
      assert.equal(await page.locator('.option:visible').count(), 2);
      await page.getByRole('checkbox', { name: 'Shortlist The same route, using miles', exact: true }).check();
      await page.getByRole('checkbox', { name: 'Shortlisted only', exact: true }).check();
      assert.equal(await page.locator('.option:visible').count(), 1);
      // A deep link must reveal a filtered-out itinerary option.
      await page.evaluate(() => { location.hash = '#option-3'; });
      await page.locator('#option-3').waitFor({ state: 'visible' });
      await page.locator('#option-3 details[open]').waitFor();
      await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('not-a-result');
      assert.ok(await page.locator('#no-results').isVisible());
      await page.getByRole('button', { name: 'Reset filters' }).click();
      assert.equal(await page.locator('.option:visible').count(), 3);
      await page.reload();
      assert.equal(await page.locator('.option input:checked').count(), 0);
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 950 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Overflow at ${width}px`);
        if (url.startsWith('http')) {
          await page.goto(url);
          await page.screenshot({ path: join(screenshotDir, `board-${width}.png`), fullPage: true });
        }
      }
      assert.ok((await page.locator('a[target="_blank"]').evaluateAll(links => links.map(a => a.href))).every(href => href.startsWith('https://') && !href.includes('?')));
    }
    assert.deepEqual(errors, []);
    assert.ok(requests.every(url => url.startsWith('file:') || new URL(url).hostname === '127.0.0.1'), 'Unexpected external request');
    const noJS = await browser.newContext({ javaScriptEnabled: false });
    const fallback = await noJS.newPage();
    await fallback.goto(pathToFileURL(output).href);
    assert.equal(await fallback.locator('.option:visible').count(), 5);
    await noJS.close();
    console.log('Passed: offline + HTTP, filters, shortlist, itinerary links, reload, 4 widths, no JS fallback, no errors/external requests.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
