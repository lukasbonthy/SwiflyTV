'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

test('rail windows retain all titles without duplicates, blank pages or missing final titles',async()=>{
  const {railWindow,nextOffset}=await import('../../frontend/rails.mjs');
  const titles=Array.from({length:20},(_,i)=>i+1);
  assert.deepEqual(railWindow(titles,0,7),[1,2,3,4,5,6,7]);
  assert.equal(nextOffset(0,1,20,7),7);
  assert.equal(nextOffset(7,1,20,7),14);
  assert.deepEqual(railWindow(titles,14,7),[15,16,17,18,19,20]);
  assert.equal(nextOffset(14,1,20,7),14);
  assert.equal(nextOffset(7,-1,20,7),0);
  assert.equal(nextOffset(0,-1,20,7),0);
  assert.deepEqual(railWindow([],0,7),[]);
  assert.equal(nextOffset(0,1,0,7),0);
});
