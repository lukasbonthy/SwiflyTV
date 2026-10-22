'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {serverSelection}=require('../lib/server-selection');

const installed=['vidlink','vidsrc','videasy','vidfast','vidrock','cineby','vidlove','goated','netmirror','nakios'];

test('every installed manual server accepts ordinary positive TMDB movie IDs',()=>{
  for(const provider of installed){
    const selection=serverSelection({type:'movie',id:'101',provider},installed);
    assert.deepEqual(selection,{type:'movie',id:'101',season:'1',episode:'1',provider},provider+' was rejected before discovery');
  }
});
test('TV server selection accepts positive season and episode numbers',()=>{
  const selection=serverSelection({type:'tv',id:'1399',season:'2',episode:'7',provider:'vidrock'},installed);
  assert.deepEqual(selection,{type:'tv',id:'1399',season:'2',episode:'7',provider:'vidrock'});
});
test('invalid IDs, inaccessible providers and unsafe episode paths are rejected',()=>{
  for(const input of [
    {type:'movie',id:'tt1234567',provider:'vidrock'},
    {type:'movie',id:'0',provider:'vidrock'},
    {type:'movie',id:'101x',provider:'vidrock'},
    {type:'movie',id:'101',provider:'uninstalled'},
    {type:'tv',id:'1399',season:'0',episode:'2',provider:'vidrock'},
    {type:'tv',id:'1399',season:'2',episode:'3foo',provider:'vidrock'},
    {type:'tv',id:'1399',season:'2',episode:'5',provider:'vidrock?hack'},
    {type:'other',id:'1399',provider:'vidrock'}
  ])assert.equal(serverSelection(input,installed),null,JSON.stringify(input));
});
test('a provider unavailable in current configuration cannot be manually invoked',()=>{
  assert.equal(serverSelection({type:'movie',id:'101',provider:'vidrock'},['vidlink','vidsrc']),null);
});
