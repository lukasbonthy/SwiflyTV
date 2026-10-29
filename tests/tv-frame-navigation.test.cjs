'use strict';
const {test,afterEach}=require('node:test'),assert=require('node:assert/strict');
const {browser,cleanup}=require('./ui-helpers.cjs'),{playerMarkup}=require('../ui/player'),{tvSource}=require('../ui/tv');afterEach(cleanup);
test('provider trailers offer an honest controller entry and Back restores the outer selection',()=>{
 const {window:w}=browser(playerMarkup({id:42,mode:'trailer',title:'Trailer',trailerUrl:'https://provider.test/embed/42'}));w.document.documentElement.dataset.svTv='true';w.localStorage.setItem('swiflytv.tvFocusMode','true');w.navigator.getGamepads=()=>[];
 for(const n of w.document.querySelectorAll('button,a,iframe,[tabindex]'))n.getBoundingClientRect=()=>({left:0,top:0,width:200,height:60,right:200,bottom:60});w.eval(tvSource());w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const button=w.document.querySelector('[data-player-enter-frame]');assert(button,'Provider entry must be explicit');button.focus();button.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(w.document.activeElement.tagName,'IFRAME');w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'BrowserBack',bubbles:true,cancelable:true}));assert.equal(w.document.activeElement,button);assert.match(w.document.querySelector('.svPlayerFrameControls').textContent,/provider|support varies/i);
});
