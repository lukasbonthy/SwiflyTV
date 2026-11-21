/* A screening follows the server's clock, never a viewer elected as host. */
(() => {
 'use strict';
 const root=document.querySelector('[data-movie-nights]');if(!root||window.SwiflyMovieNights)return;
 const $=selector=>root.querySelector(selector),make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 let state;try{state=JSON.parse($('[data-night-boot]').textContent);}catch{state={};}
 let event=state.event,id=event?.id||'',viewer=state.viewer||{signedIn:false},socket,player,playerRoot,disposed=false,suspended=false,online=false,admitted=false,admissionEpoch=0,pendingJoin=null,joined=false,following=true,sourceKey='',playerId='',mountEpoch=0,epoch=0,serverOffset=Number(state.serverTime)?Number(state.serverTime)-Date.now():0,lastSync=0,refreshController,playerController,loadingSource=false,autoplayBlocked=false,clock,lastDraft=null;
 const listeners=[],requests=new Set(),messageIds=new Set([...root.querySelectorAll('[data-night-message-id]')].map(node=>node.dataset.nightMessageId));
 const listen=(target,name,fn)=>{target.addEventListener(name,fn);listeners.push(()=>target.removeEventListener(name,fn));};
 const status=(text,target='[data-night-status]')=>{const node=$(target);if(node)node.textContent=text||'';};
 const validId=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'');
 const art=value=>typeof value==='string'&&/^https:\/\/image\.tmdb\.org\/t\/p\/(?:w\d+|original)\/[A-Za-z0-9_.-]+$/.test(value)?value:'';
 const now=()=>Date.now()+serverOffset;
 const canPlay=()=>!disposed&&!suspended&&navigator.onLine!==false&&online&&admitted&&Boolean(socket?.connected);
 function revokeAdmission(){admitted=false;online=false;autoplayBlocked=false;++admissionEpoch;pendingJoin?.finish(false);++mountEpoch;playerController?.abort();loadingSource=false;sourceKey='';player?.setRemoteMode({enabled:true,isHost:false,manual:true});player?.pause({remote:true});}
 const atLive=()=>Boolean(event?.phase==='live'&&event.sourceStatus==='ready'&&Number.isFinite(event.playbackStartedAt));
 const expected=()=>Math.max(0,Math.min(Number(event?.duration)||43200,(now()-Number(event?.playbackStartedAt||now()))/1000));
 const date=value=>new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(Number(value)));
 function dates(){for(const node of root.querySelectorAll('[data-night-date]')){const time=Date.parse(node.dateTime);if(Number.isFinite(time))node.textContent=date(time);}if(event){$('[data-night-event-date]').textContent=date(event.startsAt);$('[data-night-vote-deadline]').textContent='Voting '+(event.phase==='voting'?'closes ':'closed ')+date(event.votingClosesAt);}}
 function updateClock(){
  if(disposed||suspended||!event)return;
  if(joined&&online&&navigator.onLine===false){revokeAdmission();status('Connection lost. Reconnecting to the screening…');}
  if(joined&&!admitted&&navigator.onLine!==false&&socket?.connected&&!pendingJoin)void enter();
  const count=$('[data-night-countdown]');if(event.phase==='voting'||event.phase==='countdown'){
   const seconds=Math.max(0,Math.ceil((event.startsAt-now())/1000)),days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60),remaining=seconds%60;
   count.textContent=seconds?'Starts in '+(days?days+'d ':hours?hours+'h ':'')+(days?hours+'h':minutes+'m '+String(remaining).padStart(2,'0')+'s'):event.sourceStatus==='loading'?'Preparing the shared source…':'Waiting for the screening to start…';
  }else count.textContent=event.phase==='live'?'The screening is live':event.phase==='ended'?'Thanks for watching':'The screening needs a moment';
  if(joined&&following&&canPlay()&&sourceKey&&atLive()&&player?.getState().ready&&!loadingSource){
   const current=player.getState(),drift=expected()-current.currentTime,video=playerRoot?.querySelector('[data-player-video]');
   if(Math.abs(drift)>2.25){player.seek(expected(),{remote:true});if(video)video.playbackRate=1;}
   else if(video&&!current.paused&&!video.seeking)video.playbackRate=Math.abs(drift)>.35?(drift>0?1.035:.965):1;
   if(current.paused&&!autoplayBlocked)void resumeSharedPlayback();
  }
  if(socket?.connected&&id&&Date.now()-lastSync>15000){lastSync=Date.now();const sentAt=Date.now();socket.emit('night:sync',{id,sentAt},reply=>{if(reply?.ok&&!disposed&&!suspended)apply(reply,{personal:true,sentAt});});}
 }
 async function resumeSharedPlayback({gesture=false}={}){
  if(!canPlay()||!joined||!following||!atLive()||!player)return false;
  const ok=await player.play({remote:true,...(gesture?{gesture:true}:{})});
  // A false result also means source not ready, interrupted transport or a
  // replaced play intent. Only the player's explicit unlock UI means autoplay
  // was denied by the browser. Do not permanently suppress retries otherwise.
  const unlock=playerRoot?.querySelector('[data-player-unlock]');
  if(ok){autoplayBlocked=false;return true;}
  if(unlock&&!unlock.hidden){autoplayBlocked=true;status('Playback needs one more tap. Press Play on the screening to continue.');}
  return false;
 }
 function followingUI(){root.dataset.nightFollowing=String(following);$('[data-night-live]').hidden=!(joined&&!following&&atLive());}
 function appendMessage(message){
  if(!message||typeof message.id!=='string'||messageIds.has(message.id))return;
  const list=$('[data-night-message-list]'),nearEnd=list.scrollHeight-list.scrollTop-list.clientHeight<100;list.querySelector('[data-night-chat-empty]')?.remove();messageIds.add(message.id);
  const article=make('article','nightMessage');article.dataset.nightMessageId=message.id;
  const avatar=make('span','nightAvatar',String(message.name||'Member').slice(0,1).toUpperCase());avatar.setAttribute('aria-hidden','true');
  const copy=make('div'),head=make('header'),time=make('time');head.append(make('strong','',String(message.name||'Member').slice(0,60)));
  if(Number.isFinite(message.createdAt)){time.dateTime=new Date(message.createdAt).toISOString();time.textContent=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date(message.createdAt));head.append(time);}
  copy.append(head,make('p','',String(message.text||'').slice(0,1200)));article.append(avatar,copy);list.append(article);
  while(list.querySelectorAll('[data-night-message-id]').length>50){const first=list.querySelector('[data-night-message-id]');messageIds.delete(first.dataset.nightMessageId);first.remove();}if(nearEnd)list.scrollTop=list.scrollHeight;
 }
 function newBallot(film,index){
  const card=make('article','nightBallotCard');card.dataset.nightCandidate=String(film.id);const poster=make('div','nightBallotPoster');if(art(film.poster)){const image=make('img');Object.assign(image,{src:art(film.poster),alt:'',loading:'lazy',decoding:'async',width:200,height:300});poster.append(image);}poster.append(make('span','nightBallotOrdinal',String(index+1).padStart(2,'0')));
  const copy=make('div','nightBallotCopy');copy.append(make('h3','',film.title),make('p','',[film.year,film.runtime?film.runtime+' min':''].filter(Boolean).join(' · ')));
  const totals=make('div','nightVoteTotals'),votes=make('span'),number=make('b');number.dataset.nightFilmVotes='';votes.append(number,document.createTextNode(' votes'));const percent=make('span');percent.dataset.nightFilmPercent='';totals.append(votes,percent);const bar=make('span','nightVoteBar');bar.setAttribute('aria-hidden','true');bar.append(make('i'));const button=make('button','nightVoteButton');button.type='button';button.dataset.nightVote=String(film.id);button.append(make('span'));copy.append(totals,bar,button);card.append(poster,copy);return card;
 }
 function ballot(){
  const films=Array.isArray(event?.candidates)?event.candidates:[],grid=$('[data-night-ballot]');
  const keys=films.map(film=>film.id).join(',');if(grid.dataset.ballotKeys!==keys){const existing=[...grid.querySelectorAll('[data-night-candidate]')].map(node=>Number(node.dataset.nightCandidate));if(existing.join(',')!==keys)grid.replaceChildren(...films.map(newBallot));grid.dataset.ballotKeys=keys;}
  for(const film of films){const card=[...grid.children].find(node=>Number(node.dataset.nightCandidate)===film.id);if(!card)continue;const mine=Number(event.yourVote)===film.id,percent=event.totalVotes?Math.round(100*film.votes/event.totalVotes):0,button=card.querySelector('[data-night-vote]');card.classList.toggle('isSelected',mine);card.querySelector('[data-night-film-votes]').textContent=film.votes;card.querySelector('[data-night-film-percent]').textContent=percent+'%';card.querySelector('.nightVoteBar i').style.width=percent+'%';button.setAttribute('aria-pressed',String(mine));button.disabled=event.phase!=='voting';button.querySelector('span').textContent=mine?'Your vote':event.phase==='voting'?'Vote for this film':'Voting closed';}
  $('[data-night-total-votes]').textContent=event?.totalVotes||0;
  $('#nightBallotTitle').textContent=event?.phase==='voting'?'What are we watching?':'The votes are in.';
  $('[data-night-ballot-copy]').textContent=event?.phase==='voting'?'Choose a film. You can change your vote until five minutes before the screening.':'The winning film was selected when voting closed.';
 }
 function upcoming(rows){
  if(!Array.isArray(rows))return;const grid=$('[data-night-upcoming]'),filtered=rows.filter(row=>validId(row.id)&&row.id!==id),keys=filtered.map(row=>row.id+':'+row.phase).join(',');if(grid.dataset.upcomingKeys===keys)return;grid.dataset.upcomingKeys=keys;
  const cards=filtered.map(row=>{const link=make('a','nightUpcomingCard');link.href='/movie-night/'+row.id;const mark=make('span','nightUpcomingIcon','▤'),copy=make('span'),time=make('time');time.dataset.nightDate='';time.dateTime=new Date(row.startsAt).toISOString();time.textContent=date(row.startsAt);copy.append(make('strong','',row.title),time);link.append(mark,copy,make('span','nightUpcomingAction',row.phase==='voting'?'Vote now →':'View screening →'));return link;});grid.replaceChildren(...cards);
 }
 async function mountPlayer(){
  if(!canPlay()||!joined||!event?.winner||!event.source||event.sourceStatus!=='ready'||!window.SwiflyPlayer)return;
  const film=event.winner,key=String(film.id),eventId=id,admission=admissionEpoch;
  if(playerId!==key){
   if(loadingSource)return;loadingSource=true;const generation=++mountEpoch;playerController?.abort();playerController=new AbortController();
   try{
    let content=$('[data-night-player-template]')?.content?.cloneNode(true);const candidate=content?.querySelector('[data-player-root]');
    if(!candidate||candidate.dataset.playerId!==key){const response=await fetch('/api/movie-nights/'+encodeURIComponent(id)+'/player',{signal:playerController.signal}),data=await response.json();if(!response.ok||typeof data.html!=='string')throw Error(data.message||'The screening player could not load. Try again.');const template=document.createElement('template');template.innerHTML=data.html;content=template.content;}
    if(!canPlay()||admission!==admissionEpoch||generation!==mountEpoch||id!==eventId)return;
    player?.destroy();const target=$('[data-night-player]');target.replaceChildren(content);playerRoot=target.querySelector('[data-player-root]');if(!playerRoot)throw Error('The screening player is unavailable. Reload to try again.');
    player=window.SwiflyPlayer.mount(playerRoot);player.setRemoteMode({manual:true});playerId=key;sourceKey='';
    const note=playerRoot.querySelector('[data-player-transport-note]');if(note)note.textContent='The screening follows a shared clock. Your sound and captions are yours.';
    listen(playerRoot,'swiflyplayer:action',action=>{if(!canPlay()){player?.pause({remote:true});status('Reconnecting to the screening. Playback will resume after the connection is verified.');return;}if(action.detail?.action==='pause'||action.detail?.action==='set'){following=false;followingUI();}else if(action.detail?.action==='play'){autoplayBlocked=false;following=true;player.seek(expected(),{remote:true});followingUI();}});
    listen(playerRoot,'swiflyplayer:retry',()=>void retry());listen(playerRoot,'swiflyplayer:sync',()=>void joinLive());listen(playerRoot,'swiflyplayer:resume',()=>{sourceKey='';void mountPlayer();});
   }catch(error){if(!disposed&&error.name!=='AbortError')status(error.message);return;}finally{loadingSource=false;}
  }
  if(!player)return;
  const nextSourceKey=[id,event.winner.id,event.source.playbackUrl||event.source.proxyVideo||event.source.hlsProxyUrl||event.source.m3u8||'',event.source.expiresAt||''].join('|');
  if(sourceKey!==nextSourceKey){sourceKey=nextSourceKey;loadingSource=true;const generation=mountEpoch;try{await player.loadSource({...event.source,status:'ok'},{resumeAt:atLive()?expected():0});}finally{if(generation===mountEpoch)loadingSource=false;}}
  if(!canPlay()||admission!==admissionEpoch||!player)return;
  $('[data-night-player]').hidden=!atLive();$('[data-night-lobby]').hidden=atLive();
  if(atLive()&&following){player.seek(expected(),{remote:true});if(!autoplayBlocked)await resumeSharedPlayback();}else player.pause({remote:true});followingUI();
 }
 function apply(data,{personal=false,sentAt=Date.now()}={}){
  if(disposed||suspended||!data)return;
  if(Number.isFinite(data.serverTime))serverOffset=data.serverTime-(sentAt+Date.now())/2;
  if(data.message&&data.code)status(data.message);
  if(!data.event){$('[data-night-refresh]').hidden=false;return;}
  if(id&&data.event.id!==id)return;
  const savedVote=event?.yourVote;event={...data.event,...(!personal?{yourVote:savedVote??null}:{})};id=event.id;root.dataset.nightId=id;state={...state,...data,event};
  if(personal&&data.viewer)viewer=data.viewer;
  const leader=event.winner||[...(event.candidates||[])].sort((a,b)=>b.votes-a.votes)[0];
  $('[data-night-phase]').textContent=({voting:'Voting open',countdown:event.sourceStatus==='loading'?'Preparing the screening':'Starting soon',live:'Live screening',ended:'Screening ended',unavailable:'Screening unavailable'}[event.phase]||'Connecting');
  $('[data-night-feature-title]').textContent=leader?.title||'The next movie is yours to choose.';$('[data-night-feature-label]').textContent=event.winner?'THE COMMUNITY’S PICK':event.phase==='voting'?'LEADING THE VOTE':'THE NEXT SCREENING';$('[data-night-feature-meta]').textContent=[leader?.year,leader?.runtime?leader.runtime+' min':''].filter(Boolean).join(' · ');
  if(art(leader?.backdrop)){let image=$('[data-night-art]');if(!image){image=make('img','nightFeatureArt');image.dataset.nightArt='';image.alt='';$('[data-night-lobby]').prepend(image);}if(image.src!==art(leader.backdrop))image.src=art(leader.backdrop);}
  const startTime=$('.nightStart [data-night-date]');if(startTime)startTime.dateTime=new Date(event.startsAt).toISOString();$('.nightBallot .nightEyebrow').textContent=event.phase==='voting'?'YOU CHOOSE THE FEATURE':'THE COMMUNITY BALLOT';$('[data-night-event-title]').textContent=atLive()&&event.winner?event.winner.title:event.title;$('[data-night-event-date]').textContent=date(event.startsAt);$('[data-night-viewers]').textContent=event.viewers+' here';$('[data-night-on-air]').hidden=!atLive();$('[data-night-join]').disabled=event.phase==='ended'||event.sourceStatus==='error';$('[data-night-join] span').textContent=joined?'You’re in':'Join screening';
  $('[data-night-signin]').hidden=Boolean(viewer.signedIn);$('[data-night-message-form]').hidden=!viewer.signedIn;$('[data-night-signin]').href='/login?redirect='+encodeURIComponent(location.pathname+location.search);$('[data-night-retry]').hidden=event.sourceStatus!=='error'||!viewer.signedIn;$('[data-night-refresh]').hidden=!data.code&&event.phase!=='unavailable';
  if(event.sourceStatus==='error')status('The shared source could not load. The selected film is saved; retry when you’re ready.');
  else if(online&&!data.code)status('');
  if(event.phase==='ended'||event.sourceStatus==='error')player?.pause({remote:true});ballot();upcoming(data.upcoming);dates();for(const message of event.messages||[])appendMessage(message);followingUI();updateClock();void mountPlayer();
 }
 async function request(url,options={}){const controller=new AbortController();requests.add(controller);const timer=setTimeout(()=>controller.abort(),12000);try{const response=await fetch(url,{...options,signal:controller.signal,credentials:'same-origin'}),data=await response.json();if(!response.ok){const error=new Error(data.message||'This change could not be saved. Try again.');error.code=data.code;throw error;}return data;}finally{clearTimeout(timer);requests.delete(controller);}}
 async function refresh(){const generation=epoch;try{const sentAt=Date.now(),data=await request('/api/movie-nights'+(id?'/'+encodeURIComponent(id):''));if(generation===epoch){apply(data,{personal:true,sentAt});if(!socket&&id)connect();}}catch(error){if(error.name!=='AbortError')status(error.message);$('[data-night-refresh]').hidden=false;}}
 async function retry(){if(event?.sourceStatus==='ready'&&event.source){if(!canPlay()){status('Reconnecting to the screening. Try playback once the connection returns.');return;}sourceKey='';status('Reconnecting your player to the live screening…');await mountPlayer();if(canPlay()&&player?.getState().ready)status('');return;}if(!viewer.signedIn){status('Sign in to retry the shared source.');return;}status('Retrying the shared source…');try{apply(await request('/api/movie-nights/'+encodeURIComponent(id)+'/retry',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),{personal:true});}catch(error){status(error.message);}}
 function enter(){
  if(disposed||suspended||!socket?.connected||!id)return Promise.resolve(false);
  if(pendingJoin)return pendingJoin.promise;
  const generation=++admissionEpoch;admitted=false;online=false;const sentAt=Date.now(),pending={generation,promise:null,resolve:null,timer:null,finish:null};
  pending.promise=new Promise(resolve=>{pending.resolve=resolve;});
  pending.finish=ok=>{clearTimeout(pending.timer);if(pendingJoin===pending)pendingJoin=null;pending.resolve(ok);};pendingJoin=pending;
  pending.timer=setTimeout(()=>{if(pendingJoin===pending){status('The screening did not connect. Try again.');pending.finish(false);}},10000);
  socket.emit('night:join',{id},reply=>{if(disposed||suspended||generation!==admissionEpoch||!socket?.connected){pending.finish(false);return;}if(reply?.ok){admitted=true;online=true;player?.setRemoteMode({manual:true});lastSync=Date.now();apply(reply,{personal:true,sentAt});pending.finish(true);}else{status(reply?.message||'The screening could not connect. Try again.');pending.finish(false);}});
  return pending.promise;
 }

 function connect(){if(disposed||suspended||!id)return;if(typeof window.io!=='function'){status('The live connection did not load. Reload this page to try again.');return;}socket=window.io('/movie-nights');socket.on('connect',enter);socket.on('disconnect',()=>{if(disposed||suspended)return;revokeAdmission();status('Connection lost. Reconnecting to the screening…');});socket.on('connect_error',error=>{revokeAdmission();status(error?.message||'The screening could not connect. Try again.');});socket.on('night:update',data=>apply(data));socket.on('night:presence',data=>{if(data?.id===id){event.viewers=Number(data.viewers)||0;$('[data-night-viewers]').textContent=event.viewers+' here';}});socket.on('night:message',appendMessage);if(socket.connected)enter();}
 async function joinLive(){joined=true;following=true;autoplayBlocked=false;followingUI();if(!canPlay()&&!await enter()){status('Reconnecting to the screening. Playback will resume after the connection is verified.');return;}await mountPlayer();if(canPlay()&&player&&atLive()){player.seek(expected(),{remote:true});await resumeSharedPlayback({gesture:true});}else status(event?.sourceStatus==='error'?'The source needs a retry before the screening can begin.':'You’re in. The screening will start here when the film is ready.');$('[data-night-join] span').textContent='You’re in';}
 listen(root,'click',async action=>{
  const vote=action.target.closest('[data-night-vote]');if(vote){if(!viewer.signedIn){status('Sign in to cast your vote.','[data-night-vote-status]');$('[data-night-signin]').focus();return;}if(!event||event.phase!=='voting')return;status('Saving your vote…','[data-night-vote-status]');try{apply(await request('/api/movie-nights/'+encodeURIComponent(id)+'/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({movieId:Number(vote.dataset.nightVote)})}),{personal:true});status('Your vote is saved.','[data-night-vote-status]');}catch(error){status(error.message,'[data-night-vote-status]');if(error.code==='account_changed'||error.code==='signin_required')void refresh();}return;}
  if(action.target.closest('[data-night-join],[data-night-live]'))void joinLive();
  if(action.target.closest('[data-night-refresh]'))void refresh();if(action.target.closest('[data-night-retry]'))void retry();
  if(action.target.closest('[data-night-share]')){const url=new URL('/movie-night/'+id,location.origin).href;try{await navigator.clipboard.writeText(url);status('Screening invite copied.');}catch{status('Invite: '+url);}}
  const toggle=action.target.closest('[data-night-chat-toggle]');if(toggle){const body=$('[data-night-chat-body]');body.hidden=!body.hidden;toggle.setAttribute('aria-expanded',String(!body.hidden));toggle.textContent=body.hidden?'Show':'Hide';$('[data-night-chat]').dataset.collapsed=String(body.hidden);}
 });
 listen($('[data-night-message-form]'),'submit',action=>{
  action.preventDefault();const input=$('[data-night-message]'),text=input.value.trim();if(!text)return;if(!socket?.connected){status('Reconnecting. Your message is still here.','[data-night-compose-status]');return;}
  const draft=lastDraft?.text===text?lastDraft:{text,clientId:window.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(36).slice(2)},current=epoch;lastDraft=draft;status('Sending…','[data-night-compose-status]');const button=action.target.querySelector('button');button.disabled=true;
  const timer=setTimeout(()=>{button.disabled=false;status('No confirmation yet. Try sending again.','[data-night-compose-status]');},8000);
  socket.emit('night:message',{id,text,clientId:draft.clientId},reply=>{clearTimeout(timer);if(disposed||suspended||current!==epoch)return;button.disabled=false;if(reply?.ok){appendMessage(reply.message);if(input.value.trim()===text)input.value='';lastDraft=null;status('','[data-night-compose-status]');}else{status(reply?.message||'Your message could not send. Try again.','[data-night-compose-status]');if(['signin_required','account_changed'].includes(reply?.code))void refresh();}});
 });
 listen(window,'offline',()=>{
  if(disposed||suspended||!joined)return;
  revokeAdmission();
  status('Connection lost. Reconnecting to the screening…');
 });
 listen(window,'online',()=>{
  if(disposed||suspended||!joined||!socket)return;
  status('Reconnecting to the screening…');
  if(socket.connected)void enter();
  else if(typeof socket.connect==='function')socket.connect();
 });
 listen(document,'visibilitychange',()=>{if(document.hidden){const video=playerRoot?.querySelector('[data-player-video]');if(video)video.playbackRate=1;}else{void refresh();updateClock();}});
 function stop(){++epoch;revokeAdmission();for(const request of requests)request.abort();requests.clear();playerController?.abort();socket?.disconnect();socket=null;player?.pause({remote:true});clearInterval(clock);}
 function destroy(){if(disposed)return;disposed=true;stop();player?.destroy();player=null;for(const remove of listeners)remove();}
 listen(window,'pagehide',action=>{if(action.persisted){suspended=true;stop();}else destroy();});listen(window,'pageshow',action=>{if(action.persisted&&!disposed){suspended=false;connect();void refresh();clock=setInterval(updateClock,1000);}});
 listen(window,'storage',action=>{if(action.key==='swiflytv.accountOwner'){stop();viewer={signedIn:false};event={...event,yourVote:null};apply({event,viewer,serverTime:now()},{personal:true});connect();void refresh();clock=setInterval(updateClock,1000);}});
 window.SwiflyMovieNights=Object.freeze({refresh,join:joinLive,destroy,get active(){return !disposed;}});
 apply(state,{personal:true});connect();clock=setInterval(updateClock,1000);dates();
})();
