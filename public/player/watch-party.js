/* Parties share the regular movie and episode player. */
(() => {
 'use strict';
 const app=document.querySelector('.svPlayerPage[data-player-mode="movie"]'), browse=document.querySelector('[data-party-browse]');
 if ((!app&&!browse)||window.SwiflyWatchParty) return;
 const root=app||browse, panel=app?.querySelector('[data-watch-party]'), dialog=app?.querySelector('.svWatchPartyDialog');
 const $=(selector,within=root)=>within?.querySelector(selector);
 if (dialog) document.body.append(dialog);
 const movieId=app?.dataset.playerId||'',pageType=app?.dataset.playerType==='tv'?'tv':'movie', player=()=>window.SwiflyPlayer;
 let username='Guest';
 try {username=String(JSON.parse(localStorage.getItem('swiflytv.activeProfile')||'null')?.name||JSON.parse(localStorage.getItem('swiflytv.session')||'null')?.name||'Guest').slice(0,40);} catch {}
 let socket=null, epoch=0, roomId='', room=null, isHost=false, joined=false, online=false, disposed=false, suspended=false, pendingSelect=false, sourceKey='', readyMovie=null, sync=null, clock=null, ackTimer=null, listEpoch=0, serverOffset=0,pickerEpoch=0,setupEpoch=0,setupLoading=false,setupError='';
 let currentMedia={movieId,type:pageType,...(pageType==='tv'?{season:app.dataset.playerSeason||'1',episode:app.dataset.playerEpisode||'1'}:{})},setupMedia={...currentMedia},currentSnapshot=null;
 const requests=new Set(), messageKeys=new Set();
 const validRoom=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9-]{0,31}$/.test(value)?value:'';
 const validMovie=value=>/^[1-9]\d*$/.test(String(value))&&Number.isSafeInteger(Number(value))?String(value):'';
 function selection(value){const id=validMovie(value?.movieId),type=value?.type||'movie';if(!id||!['movie','tv'].includes(type))return null;if(type==='movie')return {movieId:id,type};const season=validMovie(value.season),episode=validMovie(value.episode);return season&&episode?{movieId:id,type,season,episode}:null;}
 const mediaKey=value=>{const media=selection(value);return media?[media.type,media.movieId,media.season||'',media.episode||''].join(':'):'';};
 let renderedEpisodeKey=mediaKey(currentMedia),pendingEpisodeKey='';
 const transportIdentity=()=>currentSnapshot?.type?{...currentMedia,requestId:currentSnapshot.requestId||''}:{};
 const selectIdentity=()=>pageType==='tv'?{...currentMedia}:{movieId};
 function serverClock(data){if(Number.isFinite(data?.serverTime)&&data.serverTime>0)serverOffset=data.serverTime-Date.now();}
 const setupStatus=(message)=>{const el=browse?$('[data-party-setup-status]'):$('[data-party-setup-status]',dialog);if(el)el.textContent=message;};
 const status=(message)=>{const el=$('[data-party-status]',panel);if(el)el.textContent=message;};
 function inviteCode(value) {
  const input=String(value||'').trim().toLowerCase(); if(validRoom(input))return input;
  try {const url=new URL(String(value||'').trim(),location.href);if(url.origin!==location.origin||!['http:','https:'].includes(url.protocol))return '';
   if(url.searchParams.getAll('roomId').length===1&&/^\/(?:social|watch\/(?:movie|tv)\/[1-9]\d*)\/?$/.test(url.pathname))return validRoom(url.searchParams.get('roomId'));
   const path=url.pathname.match(/^\/watchrooms\/([a-z0-9-]+)\/?$/);return path?validRoom(path[1]):'';
  } catch {return '';}
 }
 async function request(url,options={}) {
  const controller=new AbortController();requests.add(controller);
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('That took too long. Please try again.'));},12000);});
  try {return await Promise.race([(async()=>{const response=await fetch(url,{cache:'no-store',...options,signal:controller.signal}),data=await response.json();if(!response.ok||data.ok===false)throw Error(data.message||'The party service is unavailable. Please try again.');return data;})(),timeout]);}
  finally {clearTimeout(timer);requests.delete(controller);}
 }
 function abortRequests(){++pickerEpoch;pendingEpisodeKey='';app?.querySelector('.svPlayerEpisodePicker')?.removeAttribute('aria-busy');requests.forEach(controller=>controller.abort());requests.clear();}
 function busy(value){for(const form of [...root.querySelectorAll('[data-party-join-form]'),...(dialog?[...dialog.querySelectorAll('form')]:[])]){form.setAttribute('aria-busy',String(value));const button=form.querySelector('button[type="submit"]');if(button)button.disabled=value;}}
 function roomUrl(id=roomId,media=currentMedia){const selected=selection(media);if(!selected)return '/social?tab=watchrooms&roomId='+encodeURIComponent(id);const query=new URLSearchParams({mode:'movie',...(selected.type==='tv'?{s:selected.season,e:selected.episode}:{}),roomId:id});return '/watch/'+selected.type+'/'+encodeURIComponent(selected.movieId)+'?'+query;}
 function navigateRoom(next) {
  const id=validRoom(next?.id), film=selection(next?.syncedMovie);if(!id)return false;
  location.assign(film?roomUrl(id,film):'/social?tab=watchrooms&roomId='+encodeURIComponent(id));return true;
 }
 function setUrl(active) {if(!app)return;const url=new URL(location.href);url.searchParams.delete('party');if(active)url.searchParams.set('roomId',roomId);else url.searchParams.delete('roomId');if(currentMedia.type==='tv'){url.searchParams.set('s',currentMedia.season);url.searchParams.set('e',currentMedia.episode);}history.replaceState(history.state,'',url.pathname+url.search+url.hash);}
 function update() {
  if(!panel)return;panel.hidden=!roomId;app.dataset.partyActive=roomId?'true':'false';
  $('[data-party-room-name]',panel).textContent=room?.name||'Movie night';$('[data-party-role]',panel).textContent=joined&&isHost?'You’re hosting':'Host controls playback';
  $('[data-party-connection]',panel).textContent=joined&&online?'Together · connected':roomId?'Reconnecting…':'Connecting…';
  $('[data-party-invite]',panel).disabled=!joined;$('[data-party-sync]',panel).disabled=!joined||!online;
  const form=$('[data-party-chat-form]',panel);form.querySelector('input').disabled=!joined||!online;form.querySelector('button').disabled=!joined||!online;
  player()?.setRemoteMode?.({enabled:Boolean(roomId),isHost:Boolean(isHost&&joined&&online)});
  const picker=app.querySelector('.svPlayerEpisodePicker');if(picker){let note=picker.querySelector('[data-party-episode-note]');if(!note){note=document.createElement('p');note.dataset.partyEpisodeNote='';note.className='svPlayerPartyEpisodeNote';picker.prepend(note);}note.hidden=!roomId;note.textContent=isHost&&joined&&online?'Choose an episode for everyone.':'The host chooses the episode for everyone.';}
  for(const link of app.querySelectorAll('[data-player-episode-link],[data-player-season-link],[data-player-episode-next],[data-player-episode-previous]')){if(roomId)link.setAttribute('aria-disabled',String(!joined||!online||!isHost));else link.removeAttribute('aria-disabled');if(link.matches('a')){const url=new URL(link.href,location.href);if(roomId)url.searchParams.set('roomId',roomId);else url.searchParams.delete('roomId');link.href=url.pathname+url.search;}}
  for(const link of app.querySelectorAll('[data-player-mode-link]')){const url=new URL(link.href,location.href);if(currentMedia.type==='tv'){url.searchParams.set('s',currentMedia.season);url.searchParams.set('e',currentMedia.episode);}if(roomId&&url.searchParams.get('mode')==='movie')url.searchParams.set('roomId',roomId);else url.searchParams.delete('roomId');link.href=url.pathname+url.search+url.hash;}
 }
 function addMessage(message) {
  if(!panel||!joined||!message||(message.roomId&&message.roomId!==roomId))return;
  const text=String(message.text||'').slice(0,1000),name=String(message.name||'Guest').slice(0,40);if(!text)return;
  const key=String(message.createdAt||'')+'|'+name+'|'+text;if(messageKeys.has(key))return;messageKeys.add(key);if(messageKeys.size>120)messageKeys.delete(messageKeys.values().next().value);
  const log=$('[data-party-messages]',panel),nearEnd=log.scrollHeight-log.scrollTop-log.clientHeight<100;log.querySelector('.svPartyEmpty')?.remove();
  const item=document.createElement('div');item.className='svInlinePartyMessage'+(name==='System'?' isSystem':'');const author=document.createElement('b'),copy=document.createElement('p');author.textContent=name;copy.textContent=text;item.append(author,copy);log.append(item);
  while(log.children.length>100)log.firstElementChild.remove();if(nearEnd)log.scrollTop=log.scrollHeight;
 }
 function clearConversation(){if(!panel)return;messageKeys.clear();const log=$('[data-party-messages]',panel),empty=document.createElement('p');empty.className='svPartyEmpty';empty.textContent='Better with company. Say hello.';log.replaceChildren(empty);$('[data-party-members]',panel).replaceChildren();$('[data-party-member-count]',panel).textContent='Who’s here';$('[data-party-chat-form] input',panel).value='';}
 function applySync() {
  if(!joined||!online||!sync||!player())return;const current=player().getState();if(!current.ready)return;
  const offset=Math.max(0,Number(sync.offset)||0),starts=Number(sync.startedAt)||0;
  const now=Date.now()+serverOffset,expected=offset+(sync.playing&&starts>0?Math.max(0,now-starts)/1000:0),playing=Boolean(sync.playing)&&(!starts||now>=starts);
  if(Math.abs(expected-current.currentTime)>2.5)player().seek(expected,{remote:true});
  if(playing&&current.paused)player().play({remote:true});else if(!playing&&!current.paused)player().pause({remote:true});
 }
 function resetClock(){clearInterval(clock);clock=null;if(joined&&online)clock=setInterval(applySync,1000);}
 async function updateEpisode(){
  if(!app||currentMedia.type!=='tv')return;
  const selected={...currentMedia},key=mediaKey(selected);
  app.dataset.playerSeason=selected.season;app.dataset.playerEpisode=selected.episode;
  const metadata=app.querySelector('[data-player-episode-label]');if(metadata)metadata.textContent='Season '+selected.season+' · Episode '+selected.episode;
  const label=$('[data-party-watching-label]',panel);if(label)label.textContent='Season '+selected.season+' · Episode '+selected.episode;
  const chapter='S'+selected.season.padStart(2,'0')+' · E'+selected.episode.padStart(2,'0');for(const element of app.querySelectorAll('.svPlayerChapter,.svPlayerStageChrome>span:last-child'))element.textContent=chapter;
  setUrl(true);update();
  if(renderedEpisodeKey===key||pendingEpisodeKey===key)return;
  const generation=++pickerEpoch;pendingEpisodeKey=key;
  const picker=app.querySelector('.svPlayerEpisodePicker');if(picker)picker.setAttribute('aria-busy','true');
  try{const data=await request('/api/social/media/tv/'+selected.movieId+'?season='+selected.season+'&episode='+selected.episode);if(generation!==pickerEpoch||!joined||disposed||suspended||key!==mediaKey(currentMedia))return;
   if(picker&&typeof data.episodePickerHtml==='string'){picker.innerHTML=data.episodePickerHtml;renderedEpisodeKey=key;}
   const name=data.media?.episodes?.find(row=>String(row.episode_number)===selected.episode)?.name||'';const episodeName=app.querySelector('.svPlayerEpisodeName');if(episodeName)episodeName.textContent=name;
   update();
  }catch{if(generation===pickerEpoch&&joined)status('Episode details could not refresh. Playback is still shared with your party.');}
  finally{if(generation===pickerEpoch){pendingEpisodeKey='';picker?.removeAttribute('aria-busy');}}
 }
 function applyMovie(movie) {
  if(!joined||!movie)return;const selected=selection(movie);if(!selected)return;if(selected.movieId!==movieId||selected.type!==pageType){navigateRoom({...room,syncedMovie:movie});return;}
  currentMedia=selected;currentSnapshot=movie;room.syncedMovie=movie;updateEpisode();
  if(movie.status==='ready'){
   readyMovie=movie;
   const key=[mediaKey(movie),movie.requestId||'',movie.playbackUrl||movie.hlsProxyUrl||movie.proxyVideo||movie.m3u8||''].join('|');
   if(key!==sourceKey||player()?.getState().status==='error'){sourceKey=key;player()?.loadSource({...movie,status:'ok'},{resumeAt:Math.max(0,Number(movie.sync?.offset)||0)});}
   sync=movie.sync||sync;status('');applySync();
  }else if(movie.status==='loading'){sourceKey='';readyMovie=null;sync=null;player()?.loadSource({...movie,status:'loading',message:'Getting your party’s '+(pageType==='tv'?'episode':'film')+' ready…'});status('The host is preparing playback.');}
  else if(movie.status==='error'){sourceKey='';readyMovie=null;sync=null;player()?.loadSource({...movie,status:'error',message:movie.message||'Playback could not start. The host can retry.'});status(isHost?'Retry playback from the player.':'The host can retry playback.');}
 }
 function emitJoin() {if(!roomId||!socket?.connected)return;online=true;joined=false;isHost=false;update();socket.emit('watchroom:join',{roomId,user:username});clearTimeout(ackTimer);const current=epoch;ackTimer=setTimeout(()=>{if(current!==epoch||joined)return;status('The room did not connect. Leave the party and try joining again.');player()?.loadSource({status:'error',message:'The room did not connect. Leave the party and try again.'});},12000);}
 function ensureSocket() {
  if(socket)return socket;if(typeof window.io!=='function')throw Error('Party connection is unavailable. Reload and try again.');
  socket=window.io();online=Boolean(socket.connected);
  socket.on('connect',()=>{if(disposed||suspended)return;emitJoin();});
  socket.on('disconnect',()=>{if(disposed||suspended)return;online=false;joined=false;isHost=false;clearTimeout(ackTimer);resetClock();player()?.pause({remote:true});update();status('Connection lost. Your party will reconnect automatically.');});
  socket.on('watchroom:joined',data=>{
   if(disposed||suspended||data?.room?.id!==roomId||!roomId)return;serverClock(data);clearTimeout(ackTimer);room=data.room;joined=true;online=true;isHost=Boolean(data.isHost);update();setUrl(true);if(dialog?.open)dialog.close();busy(false);setupStatus('');
   (data.messages||[]).forEach(addMessage);applyMovie(room.syncedMovie);resetClock();
   if(pendingSelect&&isHost){pendingSelect=false;socket.emit('watchroom:movie-select',{roomId,...selectIdentity(),name:username});}
  });
  socket.on('watchroom:movie-sync',data=>{if(!disposed&&!suspended&&data?.roomId===roomId&&joined){serverClock(data);applyMovie(data.movie);}});
  socket.on('watchroom:movie-sync-state',data=>{if(disposed||suspended||!joined||data?.roomId!==roomId||data.movieId&&String(data.movieId)!==movieId)return;if(pageType==='tv'&&(mediaKey(data)!==mediaKey(currentMedia)||data.requestId!==currentSnapshot?.requestId))return;if(data.requestId&&currentSnapshot?.requestId&&data.requestId!==currentSnapshot.requestId)return;serverClock(data);sync=data.sync;applySync();});
  socket.on('watchroom:message',data=>{if(!disposed&&!suspended)addMessage(data);});
  socket.on('watchroom:members',data=>{
   if(disposed||suspended||!joined||data?.roomId!==roomId)return;const list=$('[data-party-members]',panel),members=Array.isArray(data.members)?data.members:[];list.replaceChildren();
   members.slice(0,60).forEach(member=>{const item=document.createElement('li');item.textContent=String(member.name||'Guest').slice(0,40)+(member.isHost?' · Host':'');list.append(item);});$('[data-party-member-count]',panel).textContent=members.length+' '+(members.length===1?'person':'people')+' here';
  });
  socket.on('watchroom:host',data=>{if(!disposed&&!suspended&&joined&&data?.roomId===roomId){isHost=Boolean(data.isHost);update();}});
  return socket;
 }
 function attach(next,created=false) {
  if(!next||!validRoom(next.id))throw Error('This invite is unavailable. Check the room code.');
  const film=selection(next.syncedMovie);if(browse||film&&(film.movieId!==movieId||film.type!==pageType)||!film&&!created){navigateRoom(next);return;}
  ensureSocket();if(roomId&&roomId!==next.id)socket.emit('watchroom:leave');if(roomId!==next.id)clearConversation();roomId=next.id;room=next;pendingSelect=created;sourceKey='';readyMovie=null;sync=null;joined=false;isHost=false;player()?.pause({remote:true});update();player()?.loadSource({status:'loading',message:'Joining your watch party…'});
  if(socket.connected)emitJoin();else socket.connect?.();
 }
 async function join(value) {
  const id=inviteCode(value);if(!id){setupStatus('Use a valid invite from this site or a room code.');return;}
  const current=++epoch;abortRequests();busy(true);setupStatus('Finding your party…');
  try {const data=await request('/api/date-room/'+encodeURIComponent(id)+'/state');if(current!==epoch||disposed||suspended)return;attach(data.room);}
  catch(error){if(current!==epoch||disposed||suspended)return;setupStatus(error.message);if(app?.dataset.playerManaged==='true'&&!roomId)player()?.loadSource({status:'error',message:'This party is unavailable. Open Watch together to try another invite.'});}
  finally{if(current===epoch)busy(false);}
 }
 function leave() {
  ++epoch;abortRequests();clearTimeout(ackTimer);clearInterval(clock);clock=null;if(roomId&&socket?.connected)socket.emit('watchroom:leave');roomId='';room=null;joined=false;isHost=false;pendingSelect=false;sourceKey='';readyMovie=null;currentSnapshot=null;sync=null;clearConversation();player()?.pause({remote:true});update();setUrl(false);status('');player()?.resolve?.();
 }
 async function loadSetupEpisodes(season=setupMedia.season,episode=setupMedia.episode){
  if(pageType!=='tv'||!dialog)return;const generation=++setupEpoch;setupLoading=true;setupError='';busy(true);setupStatus('Loading episodes…');
  try{const data=await request('/api/social/media/tv/'+movieId+'?season='+season+'&episode='+episode);if(generation!==setupEpoch||disposed||suspended||!dialog.open)return;
   setupMedia={movieId,type:'tv',season:String(data.media.season),episode:String(data.media.episode)};
   for(const [selector,rows,key,label,selected]of [['[data-party-setup-season]',data.media.seasons,'season_number','Season',setupMedia.season],['[data-party-setup-episode]',data.media.episodes,'episode_number','Episode',setupMedia.episode]]){const select=$(selector,dialog);select.replaceChildren();for(const row of rows||[]){const option=document.createElement('option');option.value=String(row[key]);option.textContent=label+' '+row[key]+(label==='Episode'&&row.name?' · '+row.name:'');option.selected=option.value===selected;select.append(option);}}
   setupStatus('');
  }catch(error){if(generation===setupEpoch&&!disposed){setupError=error.message;setupStatus(error.message);}}
  finally{if(generation===setupEpoch){setupLoading=false;busy(false);}}
 }
 function open() {if(roomId){$('[data-party-chat-form]',panel)?.querySelector('input')?.focus();return;}if(!dialog)return;setupStatus('');busy(false);setupMedia={...currentMedia};if(!dialog.open)dialog.showModal();loadSetupEpisodes();}
 function cancelSetup() {if(roomId)return;++epoch;++setupEpoch;setupLoading=false;abortRequests();busy(false);setupStatus('');}
 async function create(event) {
  event.preventDefault();if(roomId||disposed||suspended||setupLoading||setupError)return;const current=++epoch;abortRequests();busy(true);setupStatus('Creating your party…');
  try {const data=await request('/api/social/watchrooms/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:String(new FormData(event.currentTarget).get('roomName')||'Movie night').slice(0,80),creator:username,...setupMedia})});if(current!==epoch||disposed||suspended)return;currentMedia={...setupMedia};attach(data.room,true);}
  catch(error){if(current===epoch&&!disposed&&!suspended)setupStatus(error.message);}finally{if(current===epoch)busy(false);}
 }
 async function directory() {
  if(!browse||disposed)return;const current=++listEpoch,statusEl=$('[data-party-directory-status]'),list=$('[data-party-rooms]');statusEl.textContent='Finding open parties…';
  try {const data=await request('/api/social/watchrooms');if(current!==listEpoch||disposed)return;list.replaceChildren();const rooms=(data.rooms||[]).filter(entry=>validRoom(entry.id)&&selection(entry.syncedMovie));
   if(!rooms.length){const empty=document.createElement('p');empty.className='svPartyEmpty';empty.textContent='No parties yet. Pick a movie or series to start one.';list.append(empty);}
   rooms.forEach(entry=>{const link=document.createElement('a');link.className='svPartyRoomLink';link.href=roomUrl(entry.id,entry.syncedMovie);const name=document.createElement('b'),note=document.createElement('small');name.textContent=String(entry.name||'Movie night').slice(0,80);note.textContent=Math.max(0,Number(entry.viewers)||0)+' watching · '+String(entry.host||'Host').slice(0,40)+(entry.syncedMovie.type==='tv'?' · S'+entry.syncedMovie.season+' E'+entry.syncedMovie.episode:'');link.append(name,note);list.append(link);});statusEl.textContent='';
  }catch(error){if(current===listEpoch&&!disposed)statusEl.textContent=error.message;}
 }
 for(const form of root.querySelectorAll('[data-party-join-form]'))form.addEventListener('submit',event=>{event.preventDefault();join(new FormData(form).get('invite'));});
 if(dialog){$('[data-party-join-form]',dialog).addEventListener('submit',event=>{event.preventDefault();join(new FormData(event.currentTarget).get('invite'));});$('[data-party-create-form]',dialog).addEventListener('submit',create);$('[data-party-dialog-close]',dialog).addEventListener('click',()=>dialog.close());dialog.addEventListener('cancel',cancelSetup);dialog.addEventListener('close',cancelSetup);}
 $('[data-party-setup-season]',dialog)?.addEventListener('change',event=>loadSetupEpisodes(event.target.value,'1'));$('[data-party-setup-episode]',dialog)?.addEventListener('change',event=>{setupMedia.episode=event.target.value;});
 app?.addEventListener('click',event=>{const link=event.target.closest('[data-player-mode-link]');if(!link||!roomId||event.defaultPrevented||event.button>0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;if(new URL(link.href,location.href).searchParams.get('mode')==='movie')event.preventDefault();});
 app?.addEventListener('click',event=>{const link=event.target.closest('[data-player-episode-link],[data-player-season-link],[data-player-episode-next],[data-player-episode-previous]');if(!link||!roomId||!link.matches('a'))return;event.preventDefault();if(!joined||!online||!isHost){status('The host chooses the episode for everyone.');return;}const url=new URL(link.href,location.href),selected=selection({movieId,type:'tv',season:url.searchParams.get('s'),episode:url.searchParams.get('e')});if(selected)socket.emit('watchroom:movie-select',{roomId,...selected,name:username});});
 $('[data-player-party-open]')?.addEventListener('click',open);$('[data-party-leave]',panel)?.addEventListener('click',leave);
 $('[data-party-sync]',panel)?.addEventListener('click',()=>{if(joined&&online){if(player()?.getState().status==='error'&&readyMovie)applyMovie(readyMovie);socket.emit('watchroom:movie-control',{roomId,...transportIdentity(),action:'sync-me'});}});
 $('[data-party-chat-form]',panel)?.addEventListener('submit',event=>{event.preventDefault();if(!joined||!online)return;const input=event.currentTarget.querySelector('input'),text=input.value.trim().slice(0,220);if(!text)return;socket.emit('watchroom:message',{roomId,name:username,text});input.value='';});
 $('[data-party-invite]',panel)?.addEventListener('click',async()=>{if(!joined)return;const url=location.origin+roomUrl();try{await navigator.clipboard.writeText(url);status('Invite copied. Send it to your friends.');}catch{status('Your invite: '+url);}});
 app?.addEventListener('swiflyplayer:action',event=>{if(!joined||!online||!isHost||!roomId||!['play','pause','set'].includes(event.detail?.action))return;const time=Number(event.detail.time);if(!Number.isFinite(time)||time<0)return;socket.emit('watchroom:movie-control',{roomId,...transportIdentity(),action:event.detail.action,time,clientTime:time,intent:'user'});});
 app?.addEventListener('swiflyplayer:retry',()=>{if(joined&&online&&isHost)socket.emit('watchroom:movie-select',{roomId,...selectIdentity(),...transportIdentity(),name:username,retry:true});});
 app?.addEventListener('swiflyplayer:ready',applySync);
 $('[data-party-directory]')?.addEventListener('toggle',event=>{if(event.currentTarget.open)directory();});$('[data-party-refresh]')?.addEventListener('click',directory);
 function suspend(){++epoch;++listEpoch;abortRequests();clearTimeout(ackTimer);clearInterval(clock);clock=null;if(roomId&&socket?.connected)socket.emit('watchroom:leave');socket?.disconnect?.();joined=false;online=false;suspended=true;}
 function destroy(){if(disposed)return;suspend();disposed=true;dialog?.remove();}
 window.addEventListener('pagehide',event=>{if(event.persisted)suspend();else destroy();});
 window.addEventListener('pageshow',event=>{if(!event.persisted||disposed)return;suspended=false;if(roomId){socket?.connect?.();if(socket?.connected)emitJoin();}});
 window.SwiflyWatchParty=Object.freeze({open,leave,destroy});
 const query=new URLSearchParams(location.search);if(app&&query.get('roomId'))join(query.get('roomId'));else if(app&&query.get('party')==='create')open();
})();
