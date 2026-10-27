'use strict';
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {mkdtempSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join, resolve} = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const root = resolve(__dirname, '..');
  const data = mkdtempSync(join(tmpdir(), 'walletfreak-review-'));
  const script = join(root, 'plugins/walletfreak/scripts/local.py');
  const env = {...process.env, WALLETFREAK_DATA:data};
  const cli = (args, input) => execFileSync('python3', [script, ...args], {env, input, encoding:'utf8'}).trim();
  let browser;
  try {
    cli(['start','--port','0']);
    const stamp = new Date().toISOString();
    const source = [{label:'Example',url:'https://example.com/travel'}];
    const findings = {
      title:'Review link trip', generated_at:stamp, illustrative:true,
      options:[
        {id:'priced',title:'Priced flight',kind:'flight',status:'available',price:'USD 600',observed_at:stamp,sources:source,choice_group:'flight-out',cost:{cash:'600',currency:'USD',complete:true}},
        {id:'unknown',title:'Unknown flight',kind:'flight',status:'unverified',price:'To confirm'},
        {id:'hotel',title:'Priced hotel',kind:'hotel',status:'available',price:'USD 180',observed_at:stamp,sources:source,choice_group:'stay',cost:{cash:'180',currency:'USD',complete:true}}
      ],
      itinerary:[
        {day:'2027-02-14',when:'10:00',title:'Priced flight',detail:'Fictional complete fare.',option_id:'priced',route:{mode:'flight'}},
        {day:'2027-02-15',when:'Time to confirm',title:'Unknown flight',detail:'Availability unknown.',option_id:'unknown',route:{mode:'flight'}},
        {day:'2027-02-16',when:'Check-in to confirm',title:'Priced hotel',detail:'Fictional one-night rate.',option_id:'hotel',stay:{check_in:'2027-02-16',check_out:'2027-02-17'}}
      ],
      lodging_window:{check_in:'2027-02-16',check_out:'2027-02-18'}, gaps:['Second hotel night is unknown.']
    };
    const published = JSON.parse(cli(['publish','--input','-'], JSON.stringify({findings})));
    const link = cli(['start','--port','0','--trip',published.id,'--review','comparison']);
    assert.match(link, /\/travel\?trip=[^#]+&review=comparison#key=/);
    browser = await chromium.launch({headless:true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    const page = await browser.newPage();
    await page.goto(link, {waitUntil:'domcontentloaded'});
    await page.locator('#comparison').waitFor();
    await page.waitForFunction(() => document.querySelector('#trip-library').open && document.querySelector('#trip-alternatives').open);
    assert.equal(await page.locator('#overview-trip').inputValue(),published.id);
    const actions = await page.evaluate(() => window.getTripActions(state.trips.find(t => t.id === activeId)));
    assert.deepEqual(actions.map(a => a.option).sort(), ['hotel','priced']);
    await page.locator('[data-tab="actions"]').first().click();
    await page.locator('#actions-list [data-action-option="priced"]').click();
    await page.waitForFunction(() => {
      const item = document.querySelector('[data-option-id="priced"]');
      return document.querySelector('#trip-library').open && document.querySelector('#trip-alternatives').open && item && item.getBoundingClientRect().top < innerHeight;
    });
    console.log('review links and actionable research: OK');
  } finally {
    if (browser) await browser.close();
    try {cli(['stop']);} catch {}
    rmSync(data, {recursive:true,force:true});
  }
})().catch(error => {console.error(error);process.exitCode = 1;});
