'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {browser,tick,cleanup}=require('./ui-helpers.cjs'),{movieNightsMarkup}=require('../ui/movie-nights'),{playerMarkup}=require('../ui/player');
test.afterEach(cleanup);
function fixture({signedIn=false,phase='live'}={}){
 const film={id:1,title:'A movie',poster:'https://image.tmdb.org/t/p/w342/film.jpg',backdrop:'https://image.tmdb.org/t/p/w1280/film.jpg',runtime:100,votes:1},time=Date.now();
 const snapshot={event:{id:'2026-11-21',title:'Saturday Movie Night',phase,startsAt:time-50000,votingClosesAt:time-350000,candidates:[film],winner:phase==='live'?film:null,totalVotes:1,yourVote:signedIn?1:null,sourceStatus:phase==='live'?'ready':'idle',source:phase==='live'?{status:'ok',playbackUrl:'/media/test.mp4'}:undefined,playbackStartedAt:time-50000,duration:6000,viewers:1,messages:[]},viewer:{signedIn,name:signedIn?'Luke':''},serverTime:time,upcoming:[],schedule:{timeZone:'America/New_York',hour:20,days:[5,6]}};
 const b=browser(movieNightsMarkup({snapshot,playerHtml:playerMarkup({id:1,title:'A movie',embedded:true,managed:true})}),{path:'/movie-night/2026-11-21'}),w=b.window,handlers=new Map(),sent=[],seeks=[];
 const socket={connected:true,on:(name,handler)=>{handlers.set(name,handler);return socket;},off:(name)=>handlers.delete(name),emit:(name,data,ack)=>{sent.push({name,data});if(['night:join','night:sync'].includes(name))ack?.({ok:true,...snapshot});},disconnect(){this.connected=false;}};
 let current={ready:true,status:'ready',paused:true,currentTime:0},mounted;const loads=[];
 const player={mount:root=>{mounted=root;return player;},setRemoteMode(){},getState:()=>({...current}),loadSource:async(data,options)=>{loads.push(data);current.currentTime=options?.resumeAt||0;current.ready=true;return true;},play:async()=>{current.paused=false;return true;},pause:()=>{current.paused=true;},seek:time=>{seeks.push(time);current.currentTime=time;},destroy:()=>{mounted=null;}};
 w.io=()=>socket;w.SwiflyPlayer=player;w.SwiflyAccount={user:signedIn?{id:'account-one'}:null,ready:Promise.resolve({user:signedIn?{id:'account-one'}:null})};w.fetch=async()=>({ok:true,json:async()=>snapshot});w.boot('community/movie-nights.js');
 return{...b,w,snapshot,handlers,sent,seeks,loads,player,socket,get current(){return current;},get mounted(){return mounted;},send:(name,data)=>{if(name==='disconnect')socket.connected=false;if(name==='connect')socket.connected=true;return handlers.get(name)?.(data);}};
}
test('late arrival requires a join gesture and catches up to the shared clock',async()=>{
 const f=fixture();await tick();await tick();assert(f.w.SwiflyMovieNights,'screening controller must mount');assert.equal(f.current.paused,true);f.w.document.querySelector('[data-night-join]').click();await tick();await tick();assert.equal(f.current.paused,false);assert(f.current.currentTime>=49&&f.current.currentTime<52);assert.equal(f.w.document.querySelector('[data-night-player]').hidden,false);f.w.SwiflyMovieNights.destroy();
});
test('personal pause leaves the screening clock running and Resume live catches up',async()=>{
 const f=fixture();await tick();f.w.document.querySelector('[data-night-join]').click();await tick();await tick();f.current.paused=true;f.mounted.dispatchEvent(new f.w.CustomEvent('swiflyplayer:action',{bubbles:true,detail:{action:'pause'}}));
 assert.equal(f.w.document.querySelector('[data-night-live]').hidden,false);assert.equal(f.w.document.querySelector('[data-movie-nights]').dataset.nightFollowing,'false');assert.equal(f.sent.some(x=>/control|pause/.test(x.name)),false);f.w.document.querySelector('[data-night-live]').click();await tick();assert.equal(f.current.paused,false);assert.equal(f.w.document.querySelector('[data-night-live]').hidden,true);f.w.SwiflyMovieNights.destroy();
});
test('a public vote update preserves the personalized ballot and safely appends confirmed chat',async()=>{
 const f=fixture({signedIn:true,phase:'voting'});f.snapshot.event.yourVote=1;await tick();f.send('night:update',{...f.snapshot,viewer:{signedIn:false},event:{...f.snapshot.event,totalVotes:2,yourVote:null,candidates:[{...f.snapshot.event.candidates[0],votes:2}]}});await tick();
 assert.equal(f.w.document.querySelector('[data-night-message-form]').hidden,false);assert.equal(f.w.document.querySelector('[data-night-vote]').getAttribute('aria-pressed'),'true');
 f.send('night:message',{id:'m',name:'<b>Film fan</b>',text:'<img src=x onerror=alert(1)>',createdAt:Date.now()});f.send('night:message',{id:'m',name:'Duplicate',text:'Ignore',createdAt:Date.now()});assert.equal(f.w.document.querySelectorAll('[data-night-message-id="m"]').length,1);assert.equal(f.w.document.querySelector('[data-night-message-list] img'),null);f.w.SwiflyMovieNights.destroy();
});
test('disconnect pauses locally, reconnect requests a complete current snapshot, and disposal closes transport',async()=>{
 const f=fixture();await tick();f.w.document.querySelector('[data-night-join]').click();await tick();f.send('disconnect');assert.equal(f.current.paused,true);assert.match(f.w.document.querySelector('[data-night-status]').textContent,/reconnect/i);f.send('connect');await tick();await tick();assert(f.sent.filter(x=>x.name==='night:join').length>=2);assert.equal(f.current.paused,false);f.w.SwiflyMovieNights.destroy();assert.equal(f.w.SwiflyMovieNights.active,false);
});
test('a guest retries a local media error using the shared ready source without mutating the broadcast',async()=>{
 const f=fixture();await tick();await f.w.SwiflyMovieNights.join();const before=f.loads.length;f.current.status='error';f.current.ready=false;f.mounted.dispatchEvent(new f.w.CustomEvent('swiflyplayer:retry',{bubbles:true}));await tick();await tick();assert.equal(f.loads.length,before+1);assert.equal(f.current.paused,false);assert.equal(f.sent.some(x=>/retry/.test(x.name)),false);f.w.SwiflyMovieNights.destroy();
});
test('cached sources cannot resume while disconnected, even after refresh or a native play action',async()=>{
 const f=fixture();await tick();await f.w.SwiflyMovieNights.join();f.send('disconnect');await f.w.SwiflyMovieNights.refresh();await f.w.SwiflyMovieNights.join();assert.equal(f.current.paused,true,'cached source must wait for a fresh admitted connection');f.current.paused=false;f.mounted.dispatchEvent(new f.w.CustomEvent('swiflyplayer:action',{bubbles:true,detail:{action:'play'}}));assert.equal(f.current.paused,true,'native play cannot bypass a lost connection');f.send('connect');await tick();await tick();assert.equal(f.current.paused,false);f.w.SwiflyMovieNights.destroy();
});
test('a pending local source attachment cannot start after its connection is revoked',async()=>{
 const f=fixture();await tick();let release;f.player.loadSource=()=>new Promise(resolve=>{release=resolve;});const joining=f.w.SwiflyMovieNights.join();await tick();f.send('disconnect');release(true);await joining;await tick();assert.equal(f.current.paused,true);f.w.SwiflyMovieNights.destroy();
});

test('a transient false play result during re-admission retries once media is ready rather than latching autoplay denial',async()=>{
 const f=fixture();await tick();
 await f.w.SwiflyMovieNights.join();
 assert.equal(f.current.paused,false);
 f.send('disconnect');assert.equal(f.current.paused,true);
 let attempts=0;
 f.player.play=async()=>{
   attempts++;
   if(attempts===1)return false; // a stale/interrupted play during transport recovery
   f.current.paused=false;return true;
 };
 f.send('connect');await tick();await tick();
 assert(attempts>=1,'the re-admitted session must try playback');
 await new Promise(resolve=>setTimeout(resolve,1200));
 assert(attempts>=2,'a transient failure should not be mistaken for a browser autoplay block');
 assert.equal(f.current.paused,false,'shared playback resumes automatically when the source is ready');
 f.w.SwiflyMovieNights.destroy();
});

test('browser offline detection pauses shared media even before Socket.IO disconnect and readmits on online',async()=>{
 const f=fixture();await tick();
 await f.w.SwiflyMovieNights.join();assert.equal(f.current.paused,false);
 const before=f.sent.filter(x=>x.name==='night:join').length;
 Object.defineProperty(f.w.navigator,'onLine',{configurable:true,value:false});
 f.w.dispatchEvent(new f.w.Event('offline'));
 assert.equal(f.current.paused,true,'an offline browser must not continue cached playback');
 assert.match(f.w.document.querySelector('[data-night-status]').textContent,/reconnect/i);
 f.current.paused=false;
 f.mounted.dispatchEvent(new f.w.CustomEvent('swiflyplayer:action',{bubbles:true,detail:{action:'play'}}));
 assert.equal(f.current.paused,true,'native playback cannot bypass offline admission');
 Object.defineProperty(f.w.navigator,'onLine',{configurable:true,value:true});
 f.w.dispatchEvent(new f.w.Event('online'));
 await tick();await tick();
 assert(f.sent.filter(x=>x.name==='night:join').length>before,'online recovery must request new server admission');
 assert.equal(f.current.paused,false);
 f.w.SwiflyMovieNights.destroy();
});
test('routine public updates leave an aligned playing source alone',async()=>{
 const f=fixture();await tick();await f.w.SwiflyMovieNights.join();const before=f.seeks.length;f.send('night:update',f.snapshot);await tick();f.send('night:update',f.snapshot);await tick();assert.equal(f.seeks.length,before);assert.equal(f.current.paused,false);f.w.SwiflyMovieNights.destroy();
});
test('leaving the live phase pauses and hides the previous source before preparing the next one',async()=>{
 const f=fixture();await tick();await f.w.SwiflyMovieNights.join();const loading={...f.snapshot,event:{...f.snapshot.event,phase:'countdown',sourceStatus:'loading',source:undefined}};f.send('night:update',loading);await tick();assert.equal(f.current.paused,true);assert.equal(f.w.document.querySelector('[data-night-player]').hidden,true);assert.equal(f.w.document.querySelector('[data-night-lobby]').hidden,false);f.send('night:update',{...f.snapshot,event:{...f.snapshot.event,phase:'ended',source:undefined}});assert.equal(f.current.paused,true);assert.equal(f.w.document.querySelector('[data-night-player]').hidden,true);f.w.SwiflyMovieNights.destroy();
});
test('ballot writes carry the verified account and an owner transition clears the previous draft',async()=>{
 const f=fixture({signedIn:true,phase:'voting'}),requests=[];f.w.fetch=async(url,options)=>{requests.push({url,options});return{ok:true,json:async()=>f.snapshot};};await tick();f.w.document.querySelector('[data-night-vote]').click();await tick();await tick();assert.equal(requests[0].options.headers['X-Swifly-Account'],'account-one');const input=f.w.document.querySelector('[data-night-message]');input.value='a private old draft';f.w.SwiflyAccount.user={id:'account-two'};f.w.document.dispatchEvent(new f.w.Event('swifly:account-hydrated'));await tick();assert.equal(input.value,'');f.w.SwiflyMovieNights.destroy();
});

test('a late refresh cannot replace a newer confirmed vote',async()=>{
 const f=fixture({signedIn:true,phase:'voting'});await tick();let release;const pendingResponse=new Promise(resolve=>{release=resolve;});
 const saved={...f.snapshot,serverTime:f.snapshot.serverTime+10,event:{...f.snapshot.event,totalVotes:4,yourVote:1,candidates:[{...f.snapshot.event.candidates[0],votes:4}]}};
 f.w.fetch=async(url)=>url.endsWith('/vote')?{ok:true,json:async()=>saved}:pendingResponse;
 const refreshing=f.w.SwiflyMovieNights.refresh();await tick();f.w.document.querySelector('[data-night-vote]').click();await tick();await tick();
 release({ok:true,json:async()=>({...f.snapshot,event:{...f.snapshot.event,yourVote:null}})});await refreshing;
 assert.equal(f.w.document.querySelector('[data-night-total-votes]').textContent,'4');assert.equal(f.w.document.querySelector('[data-night-vote]').getAttribute('aria-pressed'),'true');f.w.SwiflyMovieNights.destroy();
});
test('an old account response cannot restore its private vote or draft after switching accounts',async()=>{
 const f=fixture({signedIn:true,phase:'voting'});await tick();let release;
 f.w.fetch=async(url)=>url.endsWith('/vote')?new Promise(resolve=>{release=resolve;}):{ok:true,json:async()=>({...f.snapshot,viewer:{signedIn:true,name:'New member'},event:{...f.snapshot.event,yourVote:null}})};
 f.w.document.querySelector('[data-night-vote]').click();await tick();f.w.SwiflyAccount.user={id:'account-two'};f.snapshot.event.yourVote=null;
 f.w.document.dispatchEvent(new f.w.Event('swifly:account-hydrated'));await tick();
 release({ok:true,json:async()=>({...f.snapshot,event:{...f.snapshot.event,yourVote:1}})});await tick();await tick();
 assert.equal(f.w.document.querySelector('[data-night-vote]').getAttribute('aria-pressed'),'false');assert.equal(f.w.document.querySelector('[data-night-message]').value,'');assert.notEqual(f.w.document.querySelector('[data-night-vote-status]').textContent,'Your vote is saved.');f.w.SwiflyMovieNights.destroy();
});

test('a native queued play does not block a following viewer from playing again after reconnect',async()=>{
 const f=fixture();await tick();let attempts=0;
 f.player.loadSource=async()=>{f.current.ready=false;f.current.paused=true;return true;};
 f.player.play=async()=>{attempts++;if(!f.current.ready)return false;f.current.paused=false;return true;};
 await f.w.SwiflyMovieNights.join();assert.equal(attempts,1);f.current.ready=true;f.current.paused=false;f.mounted.dispatchEvent(new f.w.CustomEvent('swiflyplayer:state',{bubbles:true,detail:{...f.current}}));
 f.send('disconnect');f.send('connect');await tick();await tick();assert.equal(attempts,2,'re-admitted queued source receives a fresh native play request');f.w.SwiflyMovieNights.destroy();
});
test('current-owner network timeouts leave actionable errors on vote, refresh and source retry',async()=>{
 for(const action of ['vote','refresh','retry']){
  const f=fixture({signedIn:true,phase:'voting'});await tick();
  if(action==='retry'){f.snapshot.event.sourceStatus='error';f.send('night:update',f.snapshot);}
  const nativeTimer=f.w.setTimeout;f.w.setTimeout=(fn,delay,...args)=>nativeTimer(fn,delay===12000?1:delay,...args);
  f.w.fetch=(_url,{signal}={})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new f.w.DOMException('Aborted','AbortError'))));
  if(action==='refresh')await f.w.SwiflyMovieNights.refresh();else{f.w.document.querySelector(action==='vote'?'[data-night-vote]':'[data-night-retry]').click();await new Promise(resolve=>setTimeout(resolve,15));}
  const target=action==='vote'?'[data-night-vote-status]':'[data-night-status]';assert.match(f.w.document.querySelector(target).textContent,/try again/i,action+' timeout is recoverable');f.w.SwiflyMovieNights.destroy();f.finish();
 }
});
