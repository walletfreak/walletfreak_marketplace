'use strict';
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {mkdtempSync,readFileSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=resolve(__dirname,'..'),data=mkdtempSync(join(tmpdir(),'wf-layout-'));
 const script=join(root,'plugins/walletfreak/scripts/local.py'),env={...process.env,WALLETFREAK_DATA:data};
 const cli=(...args)=>execFileSync('python3',[script,...args],{env,encoding:'utf8'}).trim();
 let browser;
 try{
  const url=cli('start','--port','0');browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.getByRole('button',{name:'Travel',exact:true}).click();
  await page.locator('#overview-content').waitFor({state:'hidden'});
  assert.equal(await page.locator('#overview-intro').isVisible(),true);
  assert.equal(await page.locator('#overview-customize').count(),0);
  assert.equal(await page.locator('#confirmation-import').count(),0);
  const findings=JSON.parse(readFileSync(join(root,'tests/fixtures/route-trip.json'),'utf8'));
  execFileSync('python3',[script,'publish','--input','-'],{env,input:JSON.stringify({findings})});
  await page.reload();await page.locator('#overview-content .travel-map-pin').first().waitFor();
  assert.equal(await page.locator('#overview-content .travel-map-pin').count(),3);
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`layout overflows at ${width}`);}
  assert.deepEqual(errors,[]);console.log('Travel layout, empty state, mapped trip and responsive widths: OK');
 }finally{await browser?.close();try{cli('stop')}catch{}rmSync(data,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1});
