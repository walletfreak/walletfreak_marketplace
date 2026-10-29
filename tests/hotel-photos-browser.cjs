const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {mkdtempSync,readFileSync,writeFileSync,rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join,resolve} = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const root=resolve(__dirname,'..'), data=mkdtempSync(join(tmpdir(),'walletfreak-photos-'));
  const script=join(root,'plugins/walletfreak/scripts/local.py'), env={...process.env,WALLETFREAK_DATA:data};
  const cli=(...args)=>execFileSync('python3',[script,...args],{env,encoding:'utf8'}).trim();
  let browser;
  try {
    cli('start','--port','0');
    const findings={title:'Photo test',generated_at:new Date().toISOString(),options:[
      {id:'hotel',kind:'hotel',status:'unverified',title:'Hotel with photo',image:{url:'https://hotel.example.com/pool.png?rw=640&session=secret',alt:'Hotel pool',source_url:'https://hotel.example.com/gallery'}},
      {id:'broken',kind:'hotel',status:'unverified',title:'Hotel with missing photo',image:{url:'https://hotel.example.com/missing.png',alt:'Hotel exterior',source_url:'https://hotel.example.com/gallery'}},
      {id:'plain',kind:'hotel',status:'unverified',title:'Hotel without photo'}],itinerary:[{when:'Day 1',title:'Hotel stay',detail:'Proposed stay',option_id:'hotel'}]};
    const published=JSON.parse(execFileSync('python3',[script,'publish','--input','-'],{env,encoding:'utf8',input:JSON.stringify({findings})}));
    const url=cli('start','--port','0','--trip',published.id);
    browser=await chromium.launch({args:['--headless=new'],headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    const context=await browser.newContext(); const photoRequests=[];
    await context.route('https://hotel.example.com/**',async route=>{
      photoRequests.push(route.request());
      if(route.request().url().includes('missing'))return route.fulfill({status:404,body:''});
      await route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
    });
    const page=await context.newPage();page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url,{waitUntil:'commit'});
    await page.locator('#research-title').getByText('Photo test').waitFor({timeout:60000});
await page.locator('#options img[alt="Hotel pool"]').scrollIntoViewIfNeeded();
    await page.locator('#options img[alt="Hotel pool"]').evaluate(img=>img.decode());
    await page.locator('#options .hotel-photo').filter({has:page.locator('img[alt="Hotel exterior"]')}).scrollIntoViewIfNeeded();
    await page.locator('#options img[alt="Hotel exterior"][hidden]').waitFor({state:'attached'});
    assert.equal(await page.locator('#options .hotel-photo').count(),2);
    assert.equal(await page.locator('#overview-content .hotel-photo').count(),0);
    await page.locator('[data-shortlist="hotel"]').check();await page.locator('[data-evidence="hotel"]').click();await page.locator('#research-detail').waitFor({state:'visible'});await page.locator('#research-detail-close').click();
    for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    const descriptor=JSON.parse(readFileSync(join(data,'server.json')));
    const response=await fetch(descriptor.origin+'/api/export/'+published.id,{headers:{Authorization:'Bearer '+descriptor.agent_token}});
    const output=join(data,'trip.html');writeFileSync(output,await response.text());
    await page.goto(pathToFileURL(output).href);
await page.locator('.options img[alt="Hotel pool"]').scrollIntoViewIfNeeded();
    await page.locator('.options img[alt="Hotel pool"]').evaluate(img=>img.decode());
    await page.locator('.options .hotel-photo').filter({has:page.locator('img[alt="Hotel exterior"]')}).scrollIntoViewIfNeeded();
    await page.locator('.options img[alt="Hotel exterior"][hidden]').waitFor({state:'attached'});
    assert.ok(photoRequests.length>0);assert.ok(photoRequests.every(r=>!r.headers().referer&&!r.url().includes('secret')));
    assert.deepEqual(errors,[]);
    console.log('Passed: remote hotel photos, lazy loading, no referrer/session leakage, broken/missing photos, comparisons, itinerary, mobile layout and standalone export.');
  } finally {if(browser)await browser.close();try{cli('stop');}catch{}rmSync(data,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
