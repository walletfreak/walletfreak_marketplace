const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {mkdtempSync,readFileSync,writeFileSync,rmSync}=require('node:fs');
const {join,resolve}=require('node:path');
const {tmpdir}=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=resolve(__dirname,'..'),data=mkdtempSync(join(tmpdir(),'wf-setup-')),env={...process.env,WALLETFREAK_DATA:data},script=join(root,'plugins/walletfreak/scripts/local.py');
 const cli=(...args)=>execFileSync('python3',[script,...args],{env,encoding:'utf8'}).trim();let browser;
 try{
  const url=cli('start','--port','0');browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage({viewport:{width:390,height:900}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.getByRole('button',{name:'Wallet',exact:true}).click();await page.evaluate(()=>openWalletSetup());await page.locator('#setup-name').fill('Alex');await page.locator('#setup-next').click();
  await page.locator('#wallet-setup [data-setup-add=cards]').click();await page.locator('#wallet-setup [data-field=name]').fill('Chase Sapphire Preferred Card');await page.locator('#setup-next').click();
  await page.getByRole('button',{name:'Add Chase Ultimate Rewards',exact:true}).click();await page.locator('#wallet-setup [data-field=balance]').fill('42000');await page.locator('#wallet-setup [data-field=member_hint]').fill('1234');
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`/tmp/wf-guided-${width}.png`,fullPage:true});}
  await page.locator('#setup-next').click();await page.getByText('Alex’s wallet',{exact:true}).waitFor();await page.locator('#setup-next').click();await page.locator('#wallet-setup').waitFor({state:'hidden'});
  let wallet=JSON.parse(cli('wallet'));assert.equal(wallet.cards[0].reward_account_id,wallet.programs[0].id);assert.equal(wallet.programs[0].balance,'42000');assert.equal(wallet.programs[0].member_hint,'1234');
  await page.evaluate(()=>openWalletSetup());await page.locator('#setup-name').fill('Renamed');await page.locator('#setup-next').click();await page.locator('#setup-cancel').click();assert.equal(JSON.parse(cli('wallet')).people[0].name,'Alex');
  await page.getByRole('button',{name:'Edit account',exact:true}).click();await page.locator('#wallet-editor [data-field=balance]').fill('999');await page.locator('#wallet-editor-close').click();assert.equal(JSON.parse(cli('wallet')).programs[0].balance,'42000');
  // Create an isolated synthetic password vault through its existing authenticated API.
  await page.locator('.wallet-tile-programs').getByRole('button',{name:'Connect sign-in',exact:true}).click();await page.locator('#credential-origin').fill('https://accounts.example.invalid');await page.locator('#credential-username').fill('synthetic-alex');await page.locator('#credential-password').fill('synthetic-secret');await page.getByRole('button',{name:'Save account',exact:true}).click();await page.getByText('Sign-in saved and linked to this wallet item.',{exact:true}).waitFor();
  wallet=JSON.parse(cli('wallet'));assert.match(wallet.programs[0].credential_id,/^[a-f0-9]{32}$/);assert.ok(!JSON.stringify(wallet).includes('synthetic-secret'));
  await page.getByRole('button',{name:'Travel',exact:true}).click();await page.getByRole('heading',{name:'No trips yet.',exact:true}).waitFor();
  const findings=JSON.parse(readFileSync(join(root,'tests/fixtures/route-trip.json'),'utf8'));
  execFileSync('python3',[script,'publish','--input','-'],{env,input:JSON.stringify({findings})});findings.title='Second distinct trip';findings.itinerary=findings.itinerary.slice(0,1);execFileSync('python3',[script,'publish','--input','-'],{env,input:JSON.stringify({findings})});
  await page.locator('#trip-library>summary').click();await page.locator('#overview-reload').click();await page.locator('#overview-trip option').nth(1).waitFor({state:'attached'});await page.locator('#overview-trip').selectOption({label:'Second distinct trip'});await page.waitForFunction(()=>document.querySelectorAll('#overview-content .wf-trip li[data-stop]').length===1);
  await page.locator('#overview-reload').click();assert.equal(await page.locator('#overview-trip option:checked').innerText(),'Second distinct trip');
  // Upload an archive through the same file control the user sees, then extract via the agent CLI.
  const zip=join(data,'statements.zip');execFileSync('python3',['-c',"import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],'w') as z: z.writestr('October/example.pdf',b'%PDF-1.4\\nsynthetic')",zip]);
  await page.getByRole('button',{name:'Spending',exact:true}).click();await page.locator('#reference-files').setInputFiles(zip);await page.getByText('Saved locally. Ask your agent to analyze these references and show the findings here.',{exact:true}).waitFor();
  let refs=JSON.parse(cli('references'));assert.equal(refs.files.length,1);execFileSync('python3',[script,'extract-references','--input','-'],{env,input:JSON.stringify({id:refs.files[0].id,expected_revision:refs.revision})});refs=JSON.parse(cli('references'));assert.equal(refs.files.length,2);assert.equal(refs.files[1].member,'October/example.pdf');await page.locator('#references-refresh').click();await page.getByText('From statements.zip / October/example.pdf',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);console.log('Passed full mobile setup, cancel rollback, account sign-in linkage, single-trip overview, refresh preservation and ZIP UI/agent extraction.');
 }finally{if(browser)await browser.close();try{cli('stop');}catch{}rmSync(data,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
