/* Verified skip markers and media-clock episode timing; no frame loop. */
(() => {
 'use strict';const app=document.querySelector('.svPlayerPage[data-player-mode="movie"]');if(!app)return;const root=app.querySelector('[data-assist-root]');if(!root)return;
 const find=name=>root.querySelector('[data-assist-'+name+']'),skip=find('skip'),next=find('next'),autoplay=find('autoplay'),countdown=find('countdown'),song=find('song'),songResult=find('song-result'),songStatus=find('song-status'),songLink=find('song-link');
 const player=()=>window.SwiflyPlayer?.mount?.(app)||window.SwiflyPlayer;
 const locked=()=>app.dataset.playerManaged==='true'&&app.dataset.playerHost!=='true'||app.dataset.playerRemote==='true'&&app.dataset.playerHost!=='true';
 let video=null,identity='',segments={},segmentEpoch=0,segmentController=null,dismissed=false,advanced=false,disposed=false,currentSkip=null,songController=null,songEpoch=0;
 const autoSkipped=new Set(),skipLabels={recap:'Skip recap',intro:'Skip intro',credits:'Skip credits',preview:'Skip preview',outro:'Skip outro',postCredits:'Skip post-credits segment'};
 const settings=app.querySelector('[data-player-settings] .svPlayerSettingsBody');
 if(settings&&!settings.querySelector('[data-assist-contribute]')){const link=document.createElement('a');link.dataset.assistContribute='';link.className='svPlayerMenuAction';link.href='https://theintrodb.org/';link.target='_blank';link.rel='noopener noreferrer';link.textContent='Contribute skip timings to TheIntroDB';settings.append(link);}
 function windowAt(kind,time,duration){
  for(const value of Array.isArray(segments[kind])?segments[kind]:[segments[kind]]){
   if(!value||!Number.isFinite(value.start)||value.start<0)continue;
   const end=value.end===null?duration:value.end;
   if(!Number.isFinite(end)||end<=value.start||time<value.start||time>=end-.3)continue;
   return {start:value.start,end:Number.isFinite(duration)&&duration>0?Math.min(end,duration):end,key:kind+':'+value.start+':'+value.end};
  }
  return null;
 }
 function wantsAutoSkip(){try{return window.SwiflyLibrary?.active!==false&&window.SwiflyLibrary?.preferences?.().autoSkipIntro===true;}catch{return false;}}
 const mediaIdentity=()=>[app.dataset.playerType,app.dataset.playerId,app.dataset.playerSeason,app.dataset.playerEpisode].join(':');
 try{autoplay.checked=localStorage.getItem('swiflytv.player.autoplay')!=='false';}catch{}
 const autoplayToggles=[...app.querySelectorAll('[data-assist-autoplay]')];for(const input of autoplayToggles)input.checked=autoplay.checked;
 const nextLink=()=>{const link=app.querySelector('a[data-player-episode-next]');return link&&link.getAttribute('aria-disabled')!=='true'&&!link.closest('[aria-busy="true"]')?link:null;};
 function update(){
  if(disposed||!video)return;if(identity!==mediaIdentity()){currentSkip=null;skip.hidden=true;next.hidden=true;return;}const state=player()?.getState?.(),ready=state?.ready&&video.readyState>=2,duration=video.duration;let time=video.currentTime;
  const intro=ready&&state.status==='ready'&&!locked()&&!video.paused&&!video.ended&&!video.seeking&&wantsAutoSkip()?windowAt('intro',time,duration):null;
  if(intro&&!autoSkipped.has(intro.key)){autoSkipped.add(intro.key);player()?.seek?.(intro.end);time=video.currentTime;}
  currentSkip=null;if(ready&&!locked())for(const kind of Object.keys(skipLabels)){const m=windowAt(kind,time,duration);if(m){currentSkip=m;(find('skip-label')||skip).textContent=skipLabels[kind];break;}}skip.hidden=!currentSkip;
  const link=nextLink(),show=ready&&app.dataset.playerType==='tv'&&!locked()&&!dismissed&&link&&Number.isFinite(duration)&&duration>60&&duration-time<=30&&duration-time>=-.5;
  next.hidden=!show;if(show){const remaining=Math.max(0,Math.ceil(duration-time));countdown.textContent=video.paused&&!video.ended?'Paused · '+remaining+' seconds left':autoplay.checked?'Next episode in '+remaining+' seconds':'Next episode is ready';try{const u=new URL(link.href,location.href);find('next-title').textContent='Season '+u.searchParams.get('s')+' · Episode '+u.searchParams.get('e');}catch{}}
  song.disabled=!ready;song.hidden=!ready;
 }
 function advance(){const link=nextLink();if(disposed||advanced||locked()||!link)return;advanced=true;link.click();}
 function ended(){update();if(autoplay.checked&&!dismissed&&!next.hidden&&video.ended)advance();}
 const videoEvents=['timeupdate','durationchange','loadedmetadata','canplay','playing','play','pause','seeked'];
 function bind(){const current=app.querySelector('[data-player-video]');if(current===video)return;if(video){for(const name of videoEvents)video.removeEventListener(name,update);video.removeEventListener('ended',ended);if(!video.isConnected)window.SwiflyAudioSample?.release?.(video);}cancelSong();video=current;if(video){for(const name of videoEvents)video.addEventListener(name,update);video.addEventListener('ended',ended);}update();}
 function cancelSong(){songEpoch++;songController?.abort();songController=null;find('song-cancel').hidden=true;song.removeAttribute('aria-busy');}
 async function reset(){
  const key=mediaIdentity();bind();if(key===identity){update();return;}identity=key;segments={};autoSkipped.clear();dismissed=false;advanced=false;cancelSong();songResult.hidden=true;const art=find('next-art');if(art){const src=app.dataset.playerBackdrop||app.dataset.playerPoster||'';art.hidden=!/^https:\/\/image\.tmdb\.org\/t\/p\//.test(src);if(!art.hidden)art.src=src;else art.removeAttribute('src');}if(find('next-show'))find('next-show').textContent=app.dataset.playerTitle||'';segmentController?.abort();segmentController=new AbortController();const token=++segmentEpoch;update();
  try{const response=await fetch('/api/player-assist/segments/'+app.dataset.playerType+'/'+app.dataset.playerId+'?'+new URLSearchParams({s:app.dataset.playerSeason,e:app.dataset.playerEpisode}),{signal:segmentController.signal});if(!response.ok)return;const data=await response.json();if(token!==segmentEpoch||disposed)return;segments={...data.segments,...data.windows};root.dataset.assistSource=['theintrodb','introdb'].includes(data.source)?data.source:'none';skip.title=data.source==='theintrodb'?'Timing from TheIntroDB':data.source==='introdb'?'Timing from IntroDB (legacy)':'';update();}catch{}
 }
 skip.addEventListener('click',()=>{update();if(currentSkip&&!locked())player()?.seek?.(currentSkip.end);update();});find('next-play').addEventListener('click',advance);find('dismiss').addEventListener('click',()=>{dismissed=true;next.hidden=true;});for(const input of autoplayToggles)input.addEventListener('change',()=>{for(const other of autoplayToggles)other.checked=input.checked;try{localStorage.setItem('swiflytv.player.autoplay',String(input.checked));}catch{}update();});
 song.addEventListener('click',async()=>{
  if(songController)return;const current=video,key=identity,token=++songEpoch;const controller=new AbortController();songController=controller;songResult.hidden=false;songLink.hidden=true;find('song-cancel').hidden=false;song.setAttribute('aria-busy','true');songStatus.textContent='Listening to the movie… 0 of 12 seconds';
  try{if(!window.SwiflyAudioSample)throw Error('Song identification could not load. Reload and try again.');const sample=await window.SwiflyAudioSample.capture(current,{signal:controller.signal,onProgress:n=>{if(token===songEpoch)songStatus.textContent='Listening to the movie… '+n+' of 12 seconds';}});if(token!==songEpoch||key!==identity||disposed)return;songStatus.textContent='Finding that song…';const timeout=setTimeout(()=>controller.abort(),40000);let response;try{response=await fetch('/api/player-assist/song',{method:'POST',headers:{'Content-Type':'audio/wav'},body:sample,signal:controller.signal});}finally{clearTimeout(timeout);}const data=await response.json();if(token!==songEpoch||key!==identity||disposed)return;if(!response.ok)throw Error(data.message||'Song identification is unavailable.');if(data.track){songStatus.textContent=data.track.title+' — '+data.track.artist;if(data.track.url){songLink.href=data.track.url;songLink.hidden=false;}}else songStatus.textContent='No song found in this moment. Try again when the music is clearer.';
  }catch(e){if(token===songEpoch&&!disposed)songStatus.textContent=e.name==='AbortError'?'Song identification was cancelled. Try again.':e.message;}
  finally{if(token===songEpoch){songController=null;find('song-cancel').hidden=true;song.removeAttribute('aria-busy');}}
 });
 find('song-cancel').addEventListener('click',()=>{cancelSong();songStatus.textContent='Song identification cancelled.';});find('song-close').addEventListener('click',()=>{cancelSong();songResult.hidden=true;});
 const observer=new MutationObserver(reset);observer.observe(app,{attributes:true,attributeFilter:['data-player-id','data-player-type','data-player-season','data-player-episode','data-player-managed','data-player-host','data-player-remote']});const stageObserver=new MutationObserver(bind);stageObserver.observe(app.querySelector('[data-player-stage]'),{childList:true});
 app.addEventListener('swiflyplayer:state',update);window.addEventListener('swifly:library-change',update);document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelSong();else update();});window.addEventListener('pagehide',()=>{disposed=true;segmentController?.abort();cancelSong();});window.addEventListener('pageshow',e=>{if(e.persisted){disposed=false;identity='';reset();}});reset();
})();
