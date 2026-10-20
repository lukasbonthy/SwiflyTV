'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const express=require('express');
const {chromium}=require('playwright-core');
const {createSiteGate}=require('../lib/site-gate');
const available=fs.existsSync(chromium.executablePath()) || fs.existsSync(chromium.executablePath().replace(/chromium-(\d+)\/chrome-linux\/chrome$/, 'chromium_headless_shell-$1/chrome-linux/headless_shell'));
let browser;
test.before(async()=>{if(available)browser=await chromium.launch({headless:true});});
test.after(async()=>{await browser?.close();});

async function fixture(t,options={}){
  const app=express();app.use(express.urlencoded({extended:false}));
  const gate=createSiteGate({pin:'654321',secret:'access-screen-test-only'});
  app.use(gate.router,gate.protect);
  app.get('/protected',(_req,res)=>res.send('<h1>Private cinema</h1>'));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const origin='http://127.0.0.1:'+server.address().port;
  const context=await browser.newContext(options);
  t.after(async()=>{await context.close();await new Promise(resolve=>server.close(resolve));});
  const page=await context.newPage();
  await page.goto(origin+'/access?next='+encodeURIComponent('/protected?from=invite#party'));
  return {page,origin,context};
}

test('the six visual slots accept formatted paste, native editing and Enter without losing the return route', {skip:!available&&'Chromium is not installed'},async t=>{
  const {page}=await fixture(t);
  assert.equal(await page.locator('[data-access-slot]').count(),6);
  const input=page.getByLabel('6-digit access code',{exact:true});
  const submit=page.getByRole('button',{name:'Enter SwiflyTV'});
  assert.equal(await submit.isEnabled(),false);
  await input.focus();
  await input.evaluate(node=>{
    const data=new DataTransfer();data.setData('text/plain','65 43 21');
    node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
  });
  assert.equal(await input.inputValue(),'654321');
  assert.equal((await page.locator('[data-access-slot]').allTextContents()).join(''),'654321');
  assert.equal(await submit.isEnabled(),true);
  await input.press('Backspace');
  assert.equal(await input.inputValue(),'65432');
  assert.equal(await submit.isEnabled(),false);
  await input.press('1');
  await Promise.all([page.waitForURL('**/protected?from=invite#party'),input.press('Enter')]);
  assert.equal(await page.getByRole('heading',{name:'Private cinema'}).count(),1);
});

test('incorrect codes have an accessible error that clears on editing and can be retried', {skip:!available&&'Chromium is not installed'},async t=>{
  const {page}=await fixture(t);
  await page.getByLabel('6-digit access code',{exact:true}).fill('000000');
  await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'),page.getByRole('button',{name:'Enter SwiflyTV'}).click()]);
  await page.getByRole('alert').waitFor({state:'visible'});
  assert.match(await page.getByRole('alert').innerText(),/code.*(?:right|match|incorrect)/i);
  const input=page.getByLabel('6-digit access code',{exact:true});
  assert.equal(await input.getAttribute('aria-invalid'),'true');
  await input.fill('654321');
  assert.equal(await input.getAttribute('aria-invalid'),null);
  assert.equal(await page.getByRole('alert').isVisible(),false);
  const accessible=await page.accessibility.snapshot({root:await input.elementHandle()});
  assert.doesNotMatch(accessible.description||'',/code.*(?:right|match|incorrect)/i,'editing must also dismiss the error for screen readers');
  await Promise.all([page.waitForURL('**/protected?from=invite#party'),input.press('Enter')]);
});

test('clicking a visual slot edits that digit instead of an unrelated native caret position', {skip:!available&&'Chromium is not installed'},async t=>{
  const {page}=await fixture(t);
  const input=page.getByLabel('6-digit access code',{exact:true});
  for(let index=0;index<6;index++){
    await input.fill('654321');
    const box=await page.locator('[data-access-slot]').nth(index).boundingBox();
    await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
    await input.press('Backspace');
    assert.equal(await input.inputValue(),'654321'.slice(0,index)+'654321'.slice(index+1),'slot '+(index+1)+' selects the matching digit');
  }
});

test('the self-contained entrance fits desktop and small mobile screens with usable controls', {skip:!available&&'Chromium is not installed'},async t=>{
  const {page}=await fixture(t);
  for(const viewport of [{width:1440,height:900},{width:768,height:1024},{width:390,height:844},{width:320,height:568}]){
    await page.setViewportSize(viewport);
    const geometry=await page.evaluate(()=>{
      const input=document.querySelector('input[name="code"]').getBoundingClientRect();
      const submit=document.querySelector('button[type="submit"]').getBoundingClientRect();
      return {scrollWidth:document.documentElement.scrollWidth,width:innerWidth,
        input:{x:input.x,right:input.right,height:input.height},submit:{x:submit.x,right:submit.right,height:submit.height},
        slots:[...document.querySelectorAll('[data-access-slot]')].map(n=>n.getBoundingClientRect().width),
        external:performance.getEntriesByType('resource').filter(e=>/^https?:/.test(e.name)&&!e.name.startsWith(location.origin)).length};
    });
    assert(geometry.scrollWidth<=geometry.width,JSON.stringify(viewport)+' has no horizontal overflow');
    assert(geometry.input.x>=0&&geometry.input.right<=geometry.width&&geometry.input.height>=44);
    assert(geometry.submit.x>=0&&geometry.submit.right<=geometry.width&&geometry.submit.height>=44);
    assert.equal(geometry.slots.length,6);assert(geometry.slots.every(width=>width>=26));
    assert.equal(geometry.external,0,'private entry does not wait for external fonts, imagery or scripts');
  }
  await page.getByText('Need a code?',{exact:true}).click();
  assert.equal(await page.getByText('Ask the person who invited you for their six-digit access code.').isVisible(),true);
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.access-card').evaluate(n=>getComputedStyle(n).animationName),'none');
});

test('JavaScript-disabled entry retains a labeled native field and working server submission', {skip:!available&&'Chromium is not installed'},async t=>{
  const {page}=await fixture(t,{javaScriptEnabled:false});
  const input=page.getByLabel('6-digit access code',{exact:true});
  assert.equal(await input.isVisible(),true);
  await input.fill('654321');
  assert.equal(await page.getByRole('button',{name:'Enter SwiflyTV'}).isEnabled(),true);
  await Promise.all([page.waitForURL('**/protected?from=invite#party'),input.press('Enter')]);
});
