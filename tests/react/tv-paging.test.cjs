'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {browser,cleanup}=require('../ui-helpers.cjs');
const {tvSource}=require('../../ui/tv');
test.afterEach(cleanup);

test('TV arrow navigation pages past the seven mounted posters in both directions',()=>{
  const env=browser('<main><section class="dsRow" data-sv-react-row="true"><h2>Titles</h2><div data-sv-react-pager><button aria-label="Previous titles">Previous</button><button aria-label="Next titles">Next</button></div><div class="movieRail" data-sv-react-rail="true">'+Array.from({length:7},(_,i)=>`<article class="movieCard"><a class="posterWrap" id="card${i}" href="#${i}">Movie ${i}</a></article>`).join('')+'</div></section></main>');
  const w=env.window,d=w.document;
  w.localStorage.setItem('swiflytv.tvFocusMode','true');w.navigator.getGamepads=()=>[];
  w.HTMLElement.prototype.scrollIntoView=function(){};
  for(const [index,element]of [...d.querySelectorAll('a,button,.movieRail')].entries())element.getBoundingClientRect=()=>({left:30+index*150,top:100,width:140,height:210,right:170+index*150,bottom:310});
  let next=0,previous=0;
  d.querySelector('[aria-label="Next titles"]').onclick=()=>next++;
  d.querySelector('[aria-label="Previous titles"]').onclick=()=>previous++;
  w.eval(tvSource());d.dispatchEvent(new w.Event('DOMContentLoaded'));
  d.getElementById('card6').focus();d.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
  assert.equal(next,1,'Right on card seven reaches the next React window');
  d.getElementById('card0').focus();d.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));
  assert.equal(previous,1,'Left on the first card reaches the previous window');
  d.querySelector('[aria-label="Previous titles"]').disabled=true;
  d.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));
  assert.equal(previous,1,'The beginning of the catalog stays bounded');
});
