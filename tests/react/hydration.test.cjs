'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const React=require('react');
const {compileDocument,renderDocument}=require('../../lib/react-document.cjs');

test('party player templates retain their inert content through hydration',async()=>{
  const html='<html><head><title>Party</title></head><body><main><template id="partyPlayerTemplate"><section class="svPlayerPage"><video id="partyVideo" controls></video><button type="button">Play</button></section></template></main></body></html>';
  const output=await renderDocument(compileDocument(html),{entry:'/test.js'});
  const dom=new JSDOM(output,{url:'http://localhost/',pretendToBeVisual:true});
  global.window=dom.window;global.document=dom.window.document;global.IS_REACT_ACT_ENVIRONMENT=true;
  const model=JSON.parse(document.getElementById('swifly-react-data').textContent),errors=[];
  const {PageContent}=await import('../../frontend/document.mjs');
  const {hydrateRoot}=require('react-dom/client');let root;
  try{
    await React.act(async()=>{root=hydrateRoot(document.body,React.createElement(PageContent,{model}),{onRecoverableError:e=>errors.push(String(e))});});
    const template=document.getElementById('partyPlayerTemplate');
    assert.equal(errors.length,0,errors.join('\n'));
    assert(template.content.querySelector('#partyVideo'),'Party controller can clone the player from template.content');
    assert.equal(template.childNodes.length,0,'Template contents remain inert');
    assert(template.content.querySelector('video').controls);
  }finally{
    await React.act(async()=>root?.unmount());dom.window.close();delete global.window;delete global.document;delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});
