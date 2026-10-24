// Read-only production verification. Never send email or use a real identity.
const {chromium,webkit,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base='https://faintr.com',normal=s=>s.replace(/\r\n/g,'\n');
(async()=>{
 const html=await (await fetch(base)).text();
 for(const file of ['app.js','bridge.js']){
  const asset=[...html.matchAll(/src="([^"]+)"/g)].map(m=>m[1]).find(url=>url.split('?')[0]==='/static/'+file);
  assert(asset,'Published asset missing');
  const response=await fetch(base+asset);assert(response.ok);
  assert.equal(normal(await response.text()),normal(fs.readFileSync(file==='app.js'?'ui/app.js':'web/bridge.js','utf8')),'Published '+file+' does not match reviewed source');
 }
 const results=[];
 for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch({headless:true});
  try{
   const context=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
   await context.route('**/*',route=>new URL(route.request().url()).origin===base&&['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(base+'/#error=access_denied&error_code=otp_expired&error_description=synthetic-expired-link');
   await expect(page.locator('#authDlg')).toBeVisible();await expect(page.locator('#authStatus')).toContainText('expired');
   assert(!page.url().includes('synthetic-expired-link'));
   assert(await page.evaluate(()=>window.FAINTR_BRIDGE.auth.available));
   await page.evaluate(()=>{
    window.__testResends=0;
    window.FAINTR_BRIDGE.auth.signIn=async()=>{throw {code:'email_not_confirmed',message:'Synthetic unconfirmed account'};};
    window.FAINTR_BRIDGE.auth.resendConfirmation=async()=>{window.__testResends++;};
   });
   await page.locator('#authEmail').fill('synthetic@example.invalid');await page.locator('#authPass').fill('SyntheticOnly123!');
   await page.locator('#authGo').tap();await expect(page.locator('#authStatus')).toContainText('do not need to create another account');
   await page.locator('#authResend').tap();await expect(page.locator('#authStatus')).toContainText('newest link');
   await page.locator('#authResend').tap();await expect(page.locator('#authStatus')).toContainText('wait a minute');
   assert.equal(await page.evaluate(()=>window.__testResends),1);
   const size=await page.evaluate(()=>({w:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert(size.scroll<=size.w+1);
   assert.deepEqual(errors,[]);results.push({browser:name,width:375,realSdkRejectedCallback:true,simulatedUnconfirmedAndResend:true,noOverflow:true,pageErrors:errors});
  }finally{await browser.close();}
 }
 const result={checkedAt:new Date().toISOString(),reviewedSourceMatches:true,method:'Production GET/HEAD only; real SDK rejected callback, simulated sign-in/resend. No real emails, accounts or credentials used; does not verify inbox delivery.',results};
 fs.writeFileSync(path.resolve('../output/live-auth-recovery.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
