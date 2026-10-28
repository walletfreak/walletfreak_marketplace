const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {mkdtempSync,readFileSync,writeFileSync,rmSync}=require('node:fs');
const {join,resolve}=require('node:path');
const {tmpdir}=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=resolve(__dirname,'..'),data=mkdtempSync(join(tmpdir(),'wf-routes-')),env={...process.env,WALLETFREAK_DATA:data},script=join(root,'plugins/walletfreak/scripts/local.py');
 const cli=(...args)=>execFileSync('python3',[script,...args],{env,encoding:'utf8'}).trim();let browser;
 try{
  const url=cli('start','--port','0');assert.match(cli('start','--view','wallet'),/\/wallet#key=/);browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.goto(url);await require('./setup-helper.cjs').person(page,'Alex');
  await page.getByRole('button',{name:'Add credit card',exact:true}).click();const editor=page.locator('#wallet-editor');await page.locator('#card-picker-search').fill('Chase Sapphire Preferred');await page.locator('#card-picker-results').getByRole('button',{name:'Chase Sapphire Preferred Card'}).click();await editor.getByRole('button',{name:'Create Chase Ultimate Rewards account',exact:true}).click();await editor.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.locator('.wallet-tile-programs .wallet-tile-menu>summary').click();await page.getByRole('button',{name:'Edit account',exact:true}).click();await editor.getByLabel('Points / miles 1',{exact:true}).fill('42000');await editor.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.getByRole('button',{name:'Add credit card',exact:true}).click();await page.locator('#card-picker-search').fill('Chase Freedom Flex');await page.locator('#card-picker-results').getByRole('button',{name:'Chase Freedom Flex'}).click();await editor.getByLabel('Rewards account 2',{exact:true}).selectOption({label:'Chase Ultimate Rewards · Alex'});await editor.getByRole('button',{name:'Save changes',exact:true}).click();
  let wallet=JSON.parse(cli('wallet'));assert.equal(wallet.programs.length,1);assert.equal(wallet.programs[0].balance,'42000');assert.equal(wallet.cards[0].reward_account_id,wallet.cards[1].reward_account_id);
  await require('./setup-helper.cjs').person(page,'Sam');assert.equal(await page.locator('.wallet-tile:visible').count(),3);
  assert.equal(await page.locator('.people-toolbar').isVisible(),false);
  await page.locator('#wallet-view-menu>summary').click();await page.getByRole('button',{name:'Table',exact:true}).click();await page.locator('#wallet-programs [data-field=balance]').fill('43000');await page.getByRole('button',{name:'Save table edits',exact:true}).click();await page.getByText('Wallet saved on this device. Balances are self-reported.',{exact:true}).waitFor();await page.locator('#wallet-view-menu>summary').click();await page.getByRole('button',{name:'Cards',exact:true}).click();assert.equal(JSON.parse(cli('wallet')).programs[0].balance,'43000');
  for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`wallet ${width}`);await page.screenshot({path:`/tmp/wf-wallet-${width}.png`,fullPage:true});}
  const findings=JSON.parse(readFileSync(join(root,'tests/fixtures/route-trip.json'),'utf8'));
  const firstTrip=JSON.parse(execFileSync('python3',[script,'publish','--input','-'],{env,input:JSON.stringify({findings})}));await page.getByRole('button',{name:'Travel',exact:true}).click();await page.locator('#overview-content .wf-trip').waitFor();assert.equal(await page.locator('#trip-alternatives').getAttribute('open'),null);assert.equal(await page.locator('#overview-content details[open]').count(),0);
  assert.equal(await page.locator('[data-tab=actions]').count(),0);
  assert.equal(await page.locator('[data-tab=credentials]').count(),0);
  await page.getByRole('button',{name:'Wallet',exact:true}).click();
  assert.equal(new URL(page.url()).pathname,'/wallet');
  await page.getByRole('button',{name:'Travel',exact:true}).click();
  const otherFindings={...findings,title:'Second synthetic trip'};
  const secondTrip=JSON.parse(execFileSync('python3',[script,'publish','--input','-'],{env,input:JSON.stringify({findings:otherFindings})}));
  await page.locator(`#overview-trip option[value="${secondTrip.id}"]`).waitFor({state:'attached'});
  await page.locator('#overview-trip').selectOption(secondTrip.id);
  await page.getByRole('heading',{name:'Second synthetic trip',exact:true}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('trip'),secondTrip.id);
  await page.reload();await page.getByRole('heading',{name:'Second synthetic trip',exact:true}).waitFor();
  await page.locator('#overview-trip').selectOption(firstTrip.id);
  for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`trip ${width}`);await page.screenshot({path:`/tmp/wf-trip-${width}.png`,fullPage:true});}
  await page.getByRole('button',{name:'Travel',exact:true}).click();
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('#overview-content .travel-map-pin').first().waitFor();
  assert.equal(await page.locator('#overview-content .travel-map-pin').count(),3);
  assert.match(await page.locator('.travel-route-art svg').getAttribute('aria-label'),/Tokyo stay.*Kyoto stay/);
  await page.setViewportSize({width:1440,height:1000});
  assert.ok(await page.locator('#overview-content').evaluate(el=>el.querySelector('.wf-route').getBoundingClientRect().left<el.querySelector('.wf-itinerary').getBoundingClientRect().left));
  assert.ok(await page.locator('.workspace-nav').evaluate(el=>el.getBoundingClientRect().right<document.querySelector('#overview').getBoundingClientRect().left));
  await page.locator('#overview-content .wf-info').first().click();
  await page.locator('#overview-content .wf-evidence[open]').waitFor();
  await page.locator('#overview-content .wf-evidence[open] [data-close-info]').click();
  await page.setViewportSize({width:390,height:1000});
  assert.ok(await page.locator('#overview-content').evaluate(el=>el.querySelector('.wf-route').getBoundingClientRect().bottom<el.querySelector('.wf-itinerary').getBoundingClientRect().top));
  assert.equal(await page.locator('.workspace-nav').evaluate(el=>getComputedStyle(el).position),'fixed');
  assert.ok(requests.every(r=>r.startsWith(new URL(url).origin)),'no network before map opt-in');
  await page.route('https://tile.openstreetmap.org/**',r=>r.abort());await page.locator('#overview-content [data-trip-view="map"]').click();await page.getByRole('button',{name:'Load street map',exact:true}).click();await page.locator('.leaflet-container').waitFor();assert.equal(await page.locator('.wf-map-pin').count(),3);await page.getByText('Some map tiles could not load. Your stops remain available below.',{exact:true}).waitFor();
  await page.locator('#trip-library>summary').click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download trip file',exact:true}).click();const downloaded=await pending;const html=readFileSync(await downloaded.path(),'utf8');assert.ok(!html.includes('43000'));assert.ok(!html.includes('Chase Ultimate Rewards'));
  const exportPath=join(data,'trip.html');writeFileSync(exportPath,html);const exported=await browser.newPage({viewport:{width:390,height:900}});exported.on('pageerror',e=>errors.push(e.message));await exported.goto('file://'+exportPath);await exported.locator('#export-trip .wf-trip').waitFor();await exported.getByRole('button',{name:'Map',exact:true}).click();assert.equal(await exported.locator('.wf-route-diagram button').count(),3);assert.equal(await exported.getByRole('button',{name:'Load street map',exact:true}).isVisible(),false);
  assert.deepEqual(errors,[]);console.log('Passed people, shared rewards account, tiles/table editing, mobile views, collapsed trip details, map opt-in/failure and private offline export.');
 }finally{if(browser)await browser.close();try{cli('stop');}catch{}rmSync(data,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
