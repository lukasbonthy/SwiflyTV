'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),dgram=require('node:dgram');
const {chromium}=require('playwright-core');
const {loadServer}=require('./ui-helpers.cjs');
const {createSourceJobs}=require('../lib/source-jobs');
const available=fs.existsSync(chromium.executablePath());
let api,browser,origin,stun,jobs,oldIce;
const shows=Array.from({length:6},(_,index)=>({id:101+index,name:'Series chapter '+(index+1),first_air_date:'2025-01-01',poster_path:'/poster.jpg',backdrop_path:'/backdrop.jpg',overview:'A story worth sharing.',seasons:[{season_number:1,episode_count:2},{season_number:2,episode_count:2}]}));
test.before(async()=>{
  if(!available)return;
  stun=dgram.createSocket('udp4');stun.on('message',(message,remote)=>{
    if(message.length<20||message.readUInt16BE(0)!==1||message.readUInt32BE(4)!==0x2112a442)return;
    const reply=Buffer.alloc(32);reply.writeUInt16BE(0x101,0);reply.writeUInt16BE(12,2);message.copy(reply,4,4,20);reply.writeUInt16BE(0x20,20);reply.writeUInt16BE(8,22);reply[25]=1;reply.writeUInt16BE(remote.port^0x2112,26);const address=remote.address.split('.').map(Number);[0x21,0x12,0xa4,0x42].forEach((byte,i)=>reply[28+i]=address[i]^byte);stun.send(reply,remote.port,remote.address);
  });await new Promise(resolve=>stun.bind(0,'127.0.0.1',resolve));
  oldIce=process.env.WATCHROOM_ICE_SERVERS;process.env.WATCHROOM_ICE_SERVERS=JSON.stringify([{urls:'stun:127.0.0.1:'+stun.address().port}]);
  api=loadServer();api.setTmdb(async endpoint=>{
    if(/^\/tv\/\d+\/season\/\d+$/.test(endpoint))return {episodes:[{episode_number:1,name:'The beginning'},{episode_number:2,name:'The next chapter'}]};
    if(/^\/tv\/\d+$/.test(endpoint))return {...shows[0],credits:{cast:[]},videos:{results:[]},images:{logos:[]},recommendations:{results:[]},similar:{results:[]}};
    if(endpoint==='/trending/tv/week')return {results:shows};
    return {results:shows.map(row=>({...row,title:'Film '+row.id,release_date:row.first_air_date})),total_pages:1};
  });
  jobs=createSourceJobs({resolve:async()=>({status:'error',message:'Local layout fixture: no external movie playback.'}),deadlineMs:1000});api.setSourceJobs(jobs);
  await new Promise(resolve=>api.httpServer.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+api.httpServer.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--allow-loopback-in-peer-connection','--force-webrtc-ip-handling-policy=default_public_interface_only','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
});
test.after(async()=>{await browser?.close();jobs?.destroy();if(api)await new Promise(resolve=>api.io.close(resolve));if(stun)await new Promise(resolve=>stun.close(resolve));if(oldIce===undefined)delete process.env.WATCHROOM_ICE_SERVERS;else process.env.WATCHROOM_ICE_SERVERS=oldIce;});
async function context(name,viewport){
  const context=await browser.newContext({viewport,reducedMotion:'reduce'});
  await context.addInitScript(name=>{
    localStorage.setItem('swiflytv.session',JSON.stringify({email:'call-layout@example.test'}));localStorage.setItem('swiflytv.activeProfile',JSON.stringify({id:name,name}));
    window.captureRequests=[];window.captureTracks=[];window.callPeers=[];
    const capture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{captureRequests.push(options);const stream=await capture(options);captureTracks.push(...stream.getTracks());return stream;};
    const Original=RTCPeerConnection;window.RTCPeerConnection=class extends Original{constructor(config){super(config);callPeers.push(this);}};
    const add=window.addEventListener.bind(window);window.addEventListener=(type,listener,options)=>{if(!['gamepadconnected','gamepaddisconnected'].includes(type))add(type,listener,options);};Object.defineProperty(navigator,'getGamepads',{value:()=>[]});
  },name);
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());if(url.origin===origin)return route.continue();
    return route.fulfill({contentType:route.request().resourceType()==='image'?'image/svg+xml':route.request().resourceType()==='stylesheet'?'text/css':'text/plain',body:route.request().resourceType()==='image'?'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="960"><rect width="640" height="960" fill="#263b54"/></svg>':''});
  });return context;
}
async function inbound(page,kind){await page.waitForFunction(async kind=>{for(const peer of callPeers){for(const report of (await peer.getStats()).values())if(report.type==='inbound-rtp'&&report.kind===kind&&report.bytesReceived>0&&(kind!=='video'||report.framesDecoded>0))return true;}return false;},kind,{timeout:15000});}
async function controlsFit(page,standalone,tv=false){
  const geometry=await page.evaluate(standalone=>{
    const box=node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
    const call=document.querySelector('[data-watchroom-call]'),panel=standalone?document.querySelector('[data-watch-party]'):call;
    return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,panel:box(panel),call:box(call),insideChat:panel.contains(call),controls:[...call.querySelectorAll('button')].filter(node=>!node.hidden&&getComputedStyle(node).display!=='none').map(node=>({...box(node),label:node.textContent,font:parseFloat(getComputedStyle(node.querySelector('.svNavMatchedLabel')||node).fontSize)})),composer:standalone?box(panel.querySelector('[data-party-chat-form]')):null};
  },standalone);
  assert(geometry.pageWidth<=geometry.width,'No page overflow: '+JSON.stringify(geometry));
  for(const button of geometry.controls){assert(button.height>=44&&button.width>=44,'Call buttons retain usable targets: '+JSON.stringify(geometry));assert(button.left>=geometry.call.left&&button.right<=geometry.call.right+1&&button.top>=geometry.call.top&&button.bottom<=geometry.call.bottom+1,'Call controls fit their own panel: '+JSON.stringify(geometry));if(tv)assert(button.font>=16,'TV call labels remain readable: '+JSON.stringify(geometry));}
  if(standalone){assert(!geometry.insideChat,'The call has room beneath the player instead of competing with fixed-height chat');assert(geometry.composer.bottom<=geometry.panel.bottom+1,'The chat composer remains inside its visible panel: '+JSON.stringify(geometry));}
}
test('Full Party Hub and TV player exchange real call media through room signaling without hiding chat controls',{skip:!available&&'Chromium is not installed',timeout:45000},async()=>{
  const hostContext=await context('Ava',{width:390,height:844}),guestContext=await context('Ben',{width:1280,height:720});
  try{
    const host=await hostContext.newPage();await host.goto(origin+'/social?tab=watchrooms');await host.locator('[data-party-featured-show-id]').first().waitFor();assert.equal(await host.locator('[data-party-featured-show-id]').count(),6);
    await host.locator('[data-party-featured-show-id="101"]').click();await host.locator('[data-party-lobby-season]').selectOption('2');await host.locator('[data-party-lobby-episode] option[value="2"]').waitFor({state:'attached'});await host.locator('[data-party-lobby-episode]').selectOption('2');
    await host.locator('#sv100CreateRoomForm button[type="submit"]').click();await host.locator('[data-call-join]:not(:disabled)').waitFor();const roomId=new URL(host.url()).searchParams.get('roomId');assert(roomId);
    await host.locator('[data-call-join]').click();await host.locator('[data-call-controls]').waitFor({state:'visible'});assert.equal(await host.evaluate(()=>captureRequests.length),0);
    await controlsFit(host,false);
    const guest=await guestContext.newPage();await guest.goto(origin+'/watch/tv/101?mode=movie&s=2&e=2&roomId='+roomId);await guest.locator('[data-call-join]:not(:disabled)').waitFor();await guest.locator('[data-call-join]').click();await guest.locator('[data-call-controls]').waitFor({state:'visible'});assert.equal(await guest.evaluate(()=>captureRequests.length),0);
    await Promise.all([host.locator('[data-call-audio]').click(),guest.locator('[data-call-video]').click()]);await Promise.all([inbound(host,'video'),inbound(guest,'audio')]);
    assert.equal(await host.evaluate(()=>captureRequests[0].video),false);assert.equal(await guest.evaluate(()=>captureRequests[0].audio),false);await controlsFit(guest,true);
    await guest.keyboard.press('F8');await guest.waitForFunction(()=>document.documentElement.dataset.svTv==='true');await controlsFit(guest,true,true);
    await guest.locator('[data-call-leave]').click();await guest.waitForFunction(()=>captureTracks.every(track=>track.readyState==='ended')&&callPeers.every(peer=>peer.connectionState==='closed'));await host.waitForFunction(()=>document.querySelectorAll('[data-call-peer]').length===0);
    await host.locator('[data-call-leave]').click();await host.waitForFunction(()=>captureTracks.every(track=>track.readyState==='ended'));
  }finally{await hostContext.close();await guestContext.close();}
});
