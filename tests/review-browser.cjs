'use strict';
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {mkdtempSync, rmSync, writeFileSync} = require('node:fs');
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
    writeFileSync(join(data,'wallet.json'),JSON.stringify({version:2,revision:'test-wallet',preferences:'',people:[{id:'alex',name:'Alex'}],cards:[{id:'card',person_id:'alex',owner:'Alex',name:'Capital One Venture X; personal/business variant not specified',notes:'',reported_on:'',reward_account_id:'miles'}],programs:[{id:'miles',person_id:'alex',owner:'Alex',name:'Capital One Miles',account_label:'Alex · Capital One Miles',balance:'68000',approximate:false,status:'',preserve:false,reported_on:'',notes:''}],benefits:[]}));
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
    assert.equal((await page.request.get(new URL('/assets/dashboard/research-board.css', link).href)).status(),200);
    await page.locator('#comparison').waitFor();
    await page.waitForFunction(() => document.querySelector('#trip-library').open && document.querySelector('#trip-alternatives').open);
    assert.equal(await page.locator('#research-title').innerText(),'Review link trip');
    assert.equal(await page.locator('#research-tabs [role="tab"]').count(),2);
    assert.equal(await page.locator('#options .research-card').count(),2);
    assert.equal(await page.locator('#compare-tray').isVisible(),false);
    await page.locator('[data-evidence="priced"]').click();
    assert.match(await page.locator('#research-detail').innerText(),/USD 600/);
    await page.locator('#research-detail-close').click();
    await page.locator('[data-compare="priced"]').click();
    await page.locator('[data-compare="unknown"]').click();
    await page.locator('#compare-open').click();
    assert.match(await page.locator('#comparison').innerText(),/Not directly comparable/);
    await page.getByRole('tab',{name:/Stays/}).click();
    assert.equal(await page.locator('#options .research-card').count(),1);
    await page.getByRole('tab',{name:/Flights/}).click();
    await page.waitForFunction(id => document.querySelector('#overview-trip').value === id, published.id);
    assert.equal(await page.locator('#overview-content [data-component="trip-brief"]').count(),1);
    assert.equal(await page.locator('#overview-content [data-component="action-queue"]').count(),1);
    assert.equal(await page.locator('#overview-content [data-component="itinerary"]').count(),1);
    assert.equal(await page.locator('#overview-content [data-component="action-queue"] [data-action-target="research"]').count(),2);
    await page.locator('#manage-trips').click();
    assert.equal(await page.locator('#trip-manager-list [data-delete-trip]').count(),1);
    await page.locator('#trip-manager-close').click();
    await page.setViewportSize({width:390,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.ok(await page.evaluate(()=>document.querySelector('.wf-trip-brief').getBoundingClientRect().left-document.querySelector('#overview').getBoundingClientRect().left)>=16);
    await page.setViewportSize({width:1280,height:720});
    assert.equal(await page.locator('#overview-costs').isVisible(),false);
    const actions = await page.evaluate(() => window.getTripActions(state.trips.find(t => t.id === activeId)));
    assert.deepEqual(actions.map(a => a.option).sort(), ['hotel','priced']);
    await page.locator('#overview-content [data-component="action-queue"] [data-action-option="priced"]').click();
    await page.waitForFunction(() => {
      const item = document.querySelector('[data-option-id="priced"]');
      return document.querySelector('#trip-library').open && document.querySelector('#trip-alternatives').open && item && item.getBoundingClientRect().top < innerHeight;
    });
    await page.locator('.workspace-nav [data-tab="wallet"]').click();
    await page.locator('#wallet-form').waitFor();
    assert.equal(JSON.parse(cli(['wallet'])).cards.length,1);
    await page.locator('[data-tab="overview"]').first().click();
    await page.locator('#manage-trips').click();
    page.on('dialog',dialog=>dialog.accept());
    await page.locator('#clear-trips').click();
    await page.waitForFunction(()=>state.trips.length===0);
    assert.equal(JSON.parse(cli(['wallet'])).cards.length,1);
    console.log('review links and actionable research: OK');
  } finally {
    if (browser) await browser.close();
    try {cli(['stop']);} catch {}
    rmSync(data, {recursive:true,force:true});
  }
})().catch(error => {console.error(error);process.exitCode = 1;});
