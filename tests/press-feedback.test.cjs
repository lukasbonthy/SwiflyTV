'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {browser,cleanup,tick}=require('./ui-helpers.cjs');
test.afterEach(cleanup);
test('Enter activation releases its original press when details move keyboard focus',async()=>{
 const f=browser('<button id="opener">More details</button><button id="dialog">Close details</button>'),w=f.window,d=w.document,active=new Set();
 w.HTMLElement.prototype.animate=function(frames,options){let resolve,reject;const animation={options,target:this,finished:new Promise((yes,no)=>{resolve=yes;reject=no;}),cancel(){active.delete(animation);reject(Error('cancelled'));},finish(){if(options.fill!=='forwards')active.delete(animation);resolve();}};active.add(animation);return animation;};
 w.boot('press.js');const opener=d.getElementById('opener'),dialog=d.getElementById('dialog');opener.addEventListener('click',()=>dialog.focus());opener.focus();
 opener.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));opener.click();dialog.dispatchEvent(new w.KeyboardEvent('keyup',{key:'Enter',bubbles:true}));
 for(const animation of [...active])if(animation.options.fill!=='forwards')animation.finish();await tick();
 assert.equal([...active].filter(animation=>animation.options.fill==='forwards').length,0,'the opener cannot retain a held dimming effect after focus enters details');f.finish();
});
