'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const React=require('react');

async function fixture(width=390){
  const dom=new JSDOM('<body class="svCleanShell"><main></main></body>',{url:'http://localhost/',pretendToBeVisual:true}),w=dom.window;
  const saved=new Map(['window','document','navigator','CustomEvent','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(global,key)]));
  for(const [key,value] of Object.entries({window:w,document:w.document,navigator:w.navigator,CustomEvent:w.CustomEvent,IS_REACT_ACT_ENVIRONMENT:true}))Object.defineProperty(global,key,{value,configurable:true,writable:true});
  let screen=width;const listeners=new Set(),frames=new Map();let frameId=0;
  w.matchMedia=query=>({matches:query.includes('max-width')?screen<=Number(query.match(/\d+/)[0]):false,addEventListener(_type,fn){listeners.add(fn);},removeEventListener(_type,fn){listeners.delete(fn);}});
  w.requestAnimationFrame=fn=>{frames.set(++frameId,fn);return frameId;};w.cancelAnimationFrame=id=>frames.delete(id);
  const flush=async()=>React.act(async()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(16));});
  const {MovieRailSection}=await import('../../frontend/document.mjs');
  const {createRoot}=require('react-dom/client'),root=createRoot(w.document.querySelector('main'));
  const node={tag:'section',attrs:{class:'dsRow'},children:[{tag:'header',attrs:{class:'dsRowHead'},children:[{tag:'h2',children:['Movies']}]},{tag:'div',attrs:{class:'movieRail'},children:Array.from({length:20},(_,id)=>({tag:'article',attrs:{class:'movieCard'},children:[{tag:'a',attrs:{href:'/movie/'+(id+1),class:'posterWrap'},children:['Movie '+(id+1)]}]}))}]};
  await React.act(async()=>{root.render(React.createElement(MovieRailSection,{node}));});
  const rail=w.document.querySelector('[data-sv-react-rail]');Object.defineProperty(rail,'clientWidth',{get:()=>screen,configurable:true});
  rail.scrollTo=({left})=>{rail.scrollLeft=left;rail.dispatchEvent(new w.Event('scroll'));};
  return {w,rail,flush,async scrollPixels(left){await React.act(async()=>{rail.scrollLeft=left;rail.dispatchEvent(new w.Event('scroll'));});await flush();},async scroll(index,size=2){await React.act(async()=>{rail.scrollLeft=index*(screen+16)/size;rail.dispatchEvent(new w.Event('scroll'));});await flush();},async resize(value){screen=value;await React.act(async()=>{for(const fn of listeners)fn();});},async close(){await React.act(async()=>root.unmount());dom.window.close();for(const [key,value]of saved)value?Object.defineProperty(global,key,value):delete global[key];}};
}

test('phone rails retain native scroll tracks with a bounded poster window',async()=>{
  const f=await fixture();try{
    assert.equal(f.rail.dataset.svNativeRail,'true');
    assert(f.rail.querySelectorAll('.movieCard').length<=7);
    await f.scroll(10);
    assert(f.rail.querySelector('a[href="/movie/11"]'),'The visible title remains mounted after swiping far along the rail');
    assert(f.rail.querySelectorAll('.movieCard').length<=7,'Swiping cannot expand the poster budget');
    assert(f.rail.querySelector('[data-sv-rail-spacer]'),'Skipped titles retain their native scroll tracks');
    assert.equal(f.rail.scrollLeft,10*406/2,'Virtualization must not reset native scroll position');
  }finally{await f.close();}
});

test('phone arrows scroll smoothly and every title remains reachable',async()=>{
  const f=await fixture();try{
    const next=f.w.document.querySelector('[aria-label="Next titles"]');let requested;
    const scroll=f.rail.scrollTo;f.rail.scrollTo=options=>{requested=options;scroll(options);};
    for(let index=0;index<10&&!next.disabled;index++){await React.act(async()=>next.click());await f.flush();}
    assert.equal(requested.behavior,'smooth');assert(f.rail.querySelector('a[href="/movie/20"]'));
    assert(next.disabled);assert(f.rail.querySelectorAll('.movieCard').length<=7);
  }finally{await f.close();}
});

test('native snap padding does not leave the visible title range one poster behind',async()=>{
  const f=await fixture();try{await f.scrollPixels(2*406/2-8);assert.equal(f.rail.getAttribute('aria-label'),'Titles 3 to 4 of 20');}finally{await f.close();}
});

test('native arrows measure the content tracks instead of including rail padding',async()=>{
  const f=await fixture();try{
    f.rail.style.paddingLeft='16px';f.rail.style.paddingRight='16px';let requested;
    const scroll=f.rail.scrollTo;f.rail.scrollTo=options=>{requested=options;scroll(options);};
    await React.act(async()=>f.w.document.querySelector('[aria-label="Next titles"]').click());await f.flush();
    assert.equal(requested.left,374);assert.equal(f.rail.getAttribute('aria-label'),'Titles 3 to 4 of 20');
  }finally{await f.close();}
});

test('desktop page turns use one transform animation and respect reduced motion',async()=>{
  const f=await fixture(1280);try{
    const animations=[];let cancelled=0;f.rail.animate=(frames,options)=>{animations.push({frames,options});return {cancel(){cancelled++;}};};
    await React.act(async()=>f.w.document.querySelector('[aria-label="Next titles"]').click());
    assert.equal(animations.length,1);assert.equal(animations[0].options.duration,220);
    assert(animations[0].frames.every(frame=>Object.keys(frame).join(',')==='transform'),'Page turns must not animate layout, opacity, or glass filters');
    f.w.document.body.classList.add('reduceMotion');
    await React.act(async()=>f.w.document.querySelector('[aria-label="Next titles"]').click());
    assert.equal(animations.length,1);assert.equal(cancelled,1);
    assert.equal(f.rail.querySelectorAll('[data-sv-rail-spacer]').length,0);
  }finally{await f.close();}
});

test('tablet virtualization and desktop resize preserve the title budget and paging',async()=>{
  const f=await fixture(820);try{
    await f.scroll(8,4);assert(f.rail.querySelector('a[href="/movie/9"]'));assert(f.rail.querySelectorAll('.movieCard').length<=7);
    await f.resize(1280);assert.equal(f.rail.dataset.svNativeRail,undefined);assert.equal(f.rail.querySelectorAll('.movieCard').length,7);assert.equal(f.rail.scrollLeft,0);assert.equal(f.rail.querySelectorAll('[data-sv-rail-spacer]').length,0,'Desktop pages must start with visible posters');
    await React.act(async()=>f.w.document.querySelector('[aria-label="Next titles"]').click());
    assert(f.rail.querySelector('a[href="/movie/20"]'));
  }finally{await f.close();}
});

test('a queued native scroll cannot reset the desktop page after a breakpoint change',async()=>{
  const f=await fixture();try{
    await f.scroll(10);
    await React.act(async()=>{f.rail.scrollLeft=11*406/2;f.rail.dispatchEvent(new f.w.Event('scroll'));});
    await f.resize(1280);assert.equal(f.rail.getAttribute('aria-label'),'Titles 8 to 14 of 20');
    await f.flush();assert.equal(f.rail.getAttribute('aria-label'),'Titles 8 to 14 of 20');
  }finally{await f.close();}
});
