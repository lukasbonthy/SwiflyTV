/* A screening follows the server's clock, never a viewer elected as host. */
(() => {
 'use strict';
 const root=document.querySelector('[data-movie-nights]');if(!root||window.SwiflyMovieNights)return;
 const $=selector=>root.querySelector(selector),make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 let state;try{state=JSON.parse($('[data-night-boot]').textContent);}catch{state={};}
 let event=state.event,id=event?.id||'',viewer=state.viewer||{signedIn:false},socket,player,playerRoot,disposed=false,suspended=false,online=false,admitted=false,admissionEpoch=0,pendingJoin=null,joined=false,following=true,sourceKey='',playerId='',mountEpoch=0,epoch=0,serverOffset=Number(state.serverTime)?Number(state.serverTime)-Date.now():0,lastSync=0,refreshController,playerController,loadingSource=false,autoplayBlocked=false,clock,lastDraft=null,owner=window.SwiflyAccount?.user?.id||'',personalSequence=0,appliedPersonalSequence=0,lastServerTime=0,sendTimer;
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
 const date=value=>new Intl.DateTimeFormat(undefined,{
  weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',
  timeZone:state.schedule?.timeZone||'America/New_York',timeZoneName:'short'
 }).format(new Date(Number(value)));
 function dates(){
  for(const node of root.querySelectorAll('[data-night-date]')){
   const time=Date.parse(node.dateTime);
   if(Number.isFinite(time))node.textContent=date(time);
  }
  if(event){
   $('[data-night-event-date]').textContent=date(event.startsAt);
   $('[data-night-vote-deadline]').textContent=event.candidates?.length
    ? 'Voting '+(event.phase==='voting'?'closes ':'closed ')+date(event.votingClosesAt) : '';
  }
 }
 function updateClock(){
  if(disposed||suspended||!event)return;
  if(joined&&online&&navigator.onLine===false){revokeAdmission();status('Connection lost. Reconnecting to the screening…');}
  if(joined&&!admitted&&navigator.onLine!==false&&socket?.connected&&!pendingJoin)void enter();
  const count=$('[data-night-countdown]');if(event.phase==='voting'||event.phase==='countdown'){
   const seconds=Math.max(0,Math.ceil((event.startsAt-now())/1000)),days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60),remaining=seconds%60;
   count.textContent=seconds?'Starts in '+(days?days+'d ':hours?hours+'h ':'')+(days?hours+'h':minutes+'m '+String(remaining).padStart(2,'0')+'s'):event.sourceStatus==='loading'?'Preparing the shared source…':'Waiting for the screening to start…';
  }else count.textContent=event.phase==='live'?'The screening is live':event.phase==='ended'?'Thanks for watching':'';
  if(joined&&following&&canPlay()&&sourceKey&&atLive()&&player?.getState().ready&&!loadingSource){
   const current=player.getState(),drift=expected()-current.currentTime,video=playerRoot?.querySelector('[data-player-video]');
   if(Math.abs(drift)>2.25){player.seek(expected(),{remote:true});if(video)video.playbackRate=1;}
   else if(video&&!current.paused&&!video.seeking)video.playbackRate=Math.abs(drift)>.35?(drift>0?1.035:.965):1;
   if(!current.paused)autoplayBlocked=false;
   if(current.paused&&!autoplayBlocked)void resumeSharedPlayback();
  }
  if(socket?.connected&&id&&Date.now()-lastSync>15000){lastSync=Date.now();const sentAt=Date.now(),scope=epoch,identity=owner,admission=admissionEpoch,sequence=++personalSequence;socket.emit('night:sync',{id,sentAt},reply=>{if(reply?.ok&&!disposed&&!suspended&&scope===epoch&&admission===admissionEpoch&&ownerMatches(identity))apply(reply,{personal:true,sentAt,sequence});});}
 }
 async function resumeSharedPlayback({gesture=false}={}){
  if(!canPlay()||!joined||!following||!atLive()||!player)return false;
  const admission=admissionEpoch,currentPlayer=player;
  const ok=await currentPlayer.play({remote:true,...(gesture?{gesture:true}:{})});
  if(!canPlay()||admission!==admissionEpoch||currentPlayer!==player)return false;
  // Pending metadata and an interrupted play are recoverable. Only the native
  // player's explicit unlock prompt represents a browser autoplay denial.
  const unlock=playerRoot?.querySelector('[data-player-unlock]');
  autoplayBlocked=!ok&&Boolean(unlock&&!unlock.hidden);
  if(autoplayBlocked)status('Playback needs one more tap. Press Play on the screening to continue.');
  return ok;
 }
 function followingUI(){root.dataset.nightFollowing=String(following);$('[data-night-live]').hidden=!(joined&&!following&&atLive());}
 function appendMessage(message){
  if(!message||typeof message.id!=='string'||messageIds.has(message.id))return;
  const list=$('[data-night-message-list]'),nearEnd=list.scrollHeight-list.scrollTop-list.clientHeight<100;list.querySelector('[data-night-chat-empty]')?.remove();messageIds.add(message.id);
  const article=make('article','nightMessage');article.dataset.nightMessageId=message.id;
  const avatar=make('span','nightAvatar',String(message.name||'Member').slice(0,1).toUpperCase());avatar.setAttribute('aria-hidden','true');
  const copy=make('div'),head=make('header'),time=make('time');head.append(make('strong','',String(message.name||'Member').slice(0,60)));
  if(Number.isFinite(message.createdAt)){time.dateTime=new Date(message.createdAt).toISOString();time.textContent=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',timeZone:state.schedule?.timeZone||'America/New_York'}).format(new Date(message.createdAt));head.append(time);}
  copy.append(head,make('p','',String(message.text||'').slice(0,1200)));article.append(avatar,copy);list.append(article);
  while(list.querySelectorAll('[data-night-message-id]').length>50){const first=list.querySelector('[data-night-message-id]');messageIds.delete(first.dataset.nightMessageId);first.remove();}if(nearEnd)list.scrollTop=list.scrollHeight;
 }
 function newBallot(film){
  const card=make('article','nightBallotCard');
  card.dataset.nightCandidate=String(film.id);
  card.id='night-film-'+film.id;
  const poster=make('div','nightBallotPoster'),url=art(film.poster);
  if(url){
   const image=make('img');
   Object.assign(image,{src:url,alt:'',loading:'lazy',decoding:'async',width:200,height:300});
   poster.append(image);
  }
  const copy=make('div','nightBallotCopy');
  copy.append(make('h3','',film.title),make('p','',[film.year,film.runtime?film.runtime+' min':''].filter(Boolean).join(' · ')));
  const totals=make('div','nightVoteTotals'),votes=make('span'),number=make('b'),percent=make('span');
  number.dataset.nightFilmVotes='';
  percent.dataset.nightFilmPercent='';
  votes.append(number,document.createTextNode(' votes'));
  totals.append(votes,percent);
  const bar=make('span','nightVoteBar');
  bar.setAttribute('aria-hidden','true');
  bar.append(make('i'));
  const button=make('button','nightVoteButton');
  button.type='button';
  button.dataset.nightVote=String(film.id);
  button.append(make('span'));
  copy.append(totals,bar,button);
  card.append(poster,copy);
  return card;
 }
 function ballot(){
  const films=Array.isArray(event?.candidates)?event.candidates:[],grid=$('[data-night-ballot]');
  const open=event.phase==='voting',keys=films.map(film=>film.id).join(',');
  if(grid.dataset.ballotKeys!==keys){
   const existing=[...grid.querySelectorAll('[data-night-candidate]')].map(node=>node.dataset.nightCandidate);
   if(existing.join(',')!==keys){
    const cards=films.map(newBallot);
    if(!cards.length)cards.push(make('p','nightEmptyBallot','The ballot is currently unavailable.'));
    grid.replaceChildren(...cards);
   }
   grid.dataset.ballotKeys=keys;
  }
  films.forEach((film,index)=>{
   const card=grid.children[index],mine=Number(event.yourVote)===film.id;
   const percent=event.totalVotes?Math.round(100*film.votes/event.totalVotes):0;
   const button=card.querySelector('[data-night-vote]');
   card.classList.toggle('isSelected',mine);
   card.querySelector('[data-night-film-votes]').textContent=film.votes;
   card.querySelector('[data-night-film-percent]').textContent=percent+'%';
   card.querySelector('.nightVoteBar i').style.width=percent+'%';
   button.setAttribute('aria-pressed',String(mine));
   button.disabled=!open;
   button.querySelector('span').textContent=mine?'Your vote':open?'Vote':'Voting closed';
  });
  $('[data-night-ballot-summary]').hidden=!films.length;
  $('[data-night-total-votes]').textContent=event.totalVotes||0;
  $('#nightBallotTitle').textContent=open?'Vote for the next movie':films.length?'Voting results':'Movie ballot';
  $('[data-night-ballot-copy]').textContent=open?'You can change your vote until five minutes before the screening.'
   :films.length?'The community’s pick is shown above.':'';
 }
 function upcoming(rows){
  if(!Array.isArray(rows))return;const grid=$('[data-night-upcoming]'),filtered=rows.filter(row=>validId(row.id)&&row.id!==id),keys=filtered.map(row=>row.id+':'+row.phase).join(',');if(grid.dataset.upcomingKeys===keys)return;grid.dataset.upcomingKeys=keys;
  const cards=filtered.map(row=>{const link=make('a','nightUpcomingCard');link.href='/movie-night/'+row.id;const mark=make('span','nightUpcomingIcon','◷'),copy=make('span'),time=make('time');time.dataset.nightDate='';time.dateTime=new Date(row.startsAt).toISOString();time.textContent=date(row.startsAt);copy.append(make('strong','',row.title),time);link.append(mark,copy,make('span','nightUpcomingAction',row.phase==='voting'?'Vote now →':'View screening →'));return link;});grid.replaceChildren(...cards);
 }
 async function mountPlayer({sync=false,gesture=false}={}){
  if(!canPlay()||!joined||!event?.winner||!event.source||event.sourceStatus!=='ready'||!window.SwiflyPlayer)return;
  const film=event.winner,key=String(film.id),eventId=id,admission=admissionEpoch;let replaced=false;
  if(playerId!==key){
   if(loadingSource)return;loadingSource=true;const generation=++mountEpoch;playerController?.abort();playerController=new AbortController();
   try{
    let content=$('[data-night-player-template]')?.content?.cloneNode(true);const candidate=content?.querySelector('[data-player-root]');
    if(!candidate||candidate.dataset.playerId!==key){const response=await fetch('/api/movie-nights/'+encodeURIComponent(id)+'/player',{signal:playerController.signal}),data=await response.json();if(!response.ok||typeof data.html!=='string')throw Error(data.message||'The screening player could not load. Try again.');const template=document.createElement('template');template.innerHTML=data.html;content=template.content;}
    if(!canPlay()||admission!==admissionEpoch||generation!==mountEpoch||id!==eventId)return;
    player?.destroy();const target=$('[data-night-player]');target.replaceChildren(content);playerRoot=target.querySelector('[data-player-root]');if(!playerRoot)throw Error('The screening player is unavailable. Reload to try again.');
    player=window.SwiflyPlayer.mount(playerRoot);player.setRemoteMode(atLive()?{manual:true}:{enabled:true,isHost:false,manual:true});playerId=key;replaced=true;sourceKey='';
    const note=playerRoot.querySelector('[data-player-transport-note]');if(note)note.textContent='The screening follows a shared clock. Your sound and captions are yours.';
    listen(playerRoot,'swiflyplayer:action',action=>{if(!canPlay()){player?.pause({remote:true});status('Reconnecting to the screening. Playback will resume after the connection is verified.');return;}if(action.detail?.action==='pause'||action.detail?.action==='set'){following=false;followingUI();}else if(action.detail?.action==='play'){autoplayBlocked=false;following=true;player.seek(expected(),{remote:true});followingUI();}});
    listen(playerRoot,'swiflyplayer:state',()=>{if(!player?.getState().paused)autoplayBlocked=false;});
    listen(playerRoot,'swiflyplayer:retry',()=>void retry());listen(playerRoot,'swiflyplayer:sync',()=>void joinLive());listen(playerRoot,'swiflyplayer:resume',()=>{sourceKey='';void mountPlayer();});
   }catch(error){if(!disposed&&error.name!=='AbortError')status(error.message);return;}finally{loadingSource=false;}
  }
  if(!player)return;
  const nextSourceKey=[id,event.winner.id,event.source.playbackUrl||event.source.proxyVideo||event.source.hlsProxyUrl||event.source.m3u8||'',event.source.expiresAt||''].join('|');
  if(sourceKey!==nextSourceKey){replaced=true;sourceKey=nextSourceKey;loadingSource=true;const generation=mountEpoch;try{await player.loadSource({...event.source,status:'ok'},{resumeAt:atLive()?expected():0});}finally{if(generation===mountEpoch)loadingSource=false;}}
  if(!canPlay()||admission!==admissionEpoch||!player)return;
  $('[data-night-player]').hidden=!atLive();$('[data-night-lobby]').hidden=atLive();
  if(atLive()&&following&&(sync||replaced)){player.seek(expected(),{remote:true});if(!autoplayBlocked&&player.getState().paused)await resumeSharedPlayback({gesture});}else if(!atLive())player.pause({remote:true});followingUI();
 }
 function apply(data,{personal=false,sentAt=Date.now(),sequence=data?._requestSequence||0}={}){
  if(disposed||suspended||!data)return;
  if(personal&&data._ownerEpoch!==undefined&&data._ownerEpoch!==epoch)return;
  if(personal&&sequence&&sequence<appliedPersonalSequence)return;
  if(personal&&sequence)appliedPersonalSequence=sequence;
  if(Number.isFinite(data.serverTime)&&data.serverTime<lastServerTime){if(!personal)return;data={...data,event:event?{...event,yourVote:data.event?.yourVote??null}:data.event,serverTime:lastServerTime};}
  if(Number.isFinite(data.serverTime))lastServerTime=Math.max(lastServerTime,data.serverTime);
  if(Number.isFinite(data.serverTime))serverOffset=data.serverTime-(sentAt+Date.now())/2;
  if(data.message&&data.code)status(data.message);
  if(!data.event){$('[data-night-refresh]').hidden=false;return;}
  if(id&&data.event.id!==id)return;
  const storageWasUnavailable=state.code==='storage_unavailable';
  const chatWasClosed=event?.phase==='ended'||storageWasUnavailable;
  const savedVote=event?.yourVote;event={...data.event,...(!personal?{yourVote:savedVote??null}:{})};id=event.id;root.dataset.nightId=id;state={...state,...data,event,code:data.code};
  if(personal&&data.viewer)viewer=data.viewer;
  const leader=event.winner||[...(event.candidates||[])].sort((a,b)=>b.votes-a.votes)[0];
  const open=event.phase==='voting',ended=event.phase==='ended';
  const unavailable=event.phase==='unavailable',storageUnavailable=data.code==='storage_unavailable';
  root.dataset.nightPhaseState=event.phase;
  $('[data-night-phase]').textContent=({voting:'Voting open',countdown:event.sourceStatus==='loading'?'Preparing the screening':'Starting soon',live:'Live',ended:'Screening ended',unavailable:'Unavailable'}[event.phase]||'Connecting');
  $('[data-night-feature-title]').textContent=leader?.title||'The next screening';
  $('[data-night-feature-label]').textContent=event.winner?'COMMUNITY PICK':leader?(leader.votes>0?'LEADING THE VOTE':'ON THE BALLOT'):'SCHEDULED SCREENING';
  $('[data-night-feature-meta]').textContent=[leader?.year,leader?.runtime?leader.runtime+' min':''].filter(Boolean).join(' · ');
  const backdrop=art(leader?.backdrop);
  let image=$('[data-night-art]');
  if(backdrop){
   if(!image){image=make('img','nightFeatureArt');image.dataset.nightArt='';image.alt='';$('[data-night-lobby]').prepend(image);}
   if(image.src!==backdrop)image.src=backdrop;
  }else image?.remove();
  const startTime=$('.nightStart [data-night-date]');
  if(startTime)startTime.dateTime=new Date(event.startsAt).toISOString();
  $('[data-night-event-title]').textContent=atLive()&&event.winner?event.winner.title:event.title;
  $('[data-night-viewers]').textContent=event.viewers+' here';
  $('[data-night-presence]').hidden=storageUnavailable;
  $('[data-night-on-air]').hidden=!atLive();
  $('[data-night-view-ballot]').hidden=!open;
  const join=$('[data-night-join]');
  join.hidden=join.disabled=ended||unavailable||event.sourceStatus==='error';
  join.querySelector('span').textContent=joined&&!atLive()?'You’re in':'Join screening';
  const redirect='/login?redirect='+encodeURIComponent(location.pathname+location.search);
  const signIn=$('[data-night-signin]'),ballotSignIn=$('[data-night-ballot-signin]');
  signIn.hidden=Boolean(viewer.signedIn)||ended||storageUnavailable;
  ballotSignIn.hidden=Boolean(viewer.signedIn)||!open;
  signIn.href=ballotSignIn.href=redirect;
  $('[data-night-message-form]').hidden=!viewer.signedIn||ended||storageUnavailable;
  if(ended||storageUnavailable||chatWasClosed)status(ended?'Chat is closed for this screening.':storageUnavailable?'Chat is temporarily unavailable.':'','[data-night-compose-status]');
  $('[data-night-retry]').hidden=event.sourceStatus!=='error'||!viewer.signedIn;
  $('[data-night-refresh]').hidden=!data.code&&!unavailable;
  if(event.sourceStatus==='error')status('The shared source could not load. The selected film is saved; retry when you’re ready.');
  else if((online||storageWasUnavailable)&&!data.code)status('');
  if(!atLive()){++mountEpoch;playerController?.abort();loadingSource=false;sourceKey='';player?.setRemoteMode({enabled:true,isHost:false,manual:true});player?.pause({remote:true});$('[data-night-player]').hidden=true;$('[data-night-lobby]').hidden=false;}else if(canPlay())player?.setRemoteMode({manual:true});$('[data-night-event-copy]').textContent=({voting:'The most voted film plays at showtime.',countdown:'The community’s pick starts soon.',live:'Watch together and pause whenever you need.',ended:'See the schedule for the next screening.',unavailable:'Check back for the next screening.'}[event.phase]||'');ballot();upcoming(data.upcoming);dates();for(const message of event.messages||[])appendMessage(message);followingUI();updateClock();void mountPlayer();
 }
 function staleRequest(){return Object.assign(new Error('The account or screening changed.'),{name:'AbortError'});}
 function ownerMatches(value){return owner===value&&(!window.SwiflyAccount||String(window.SwiflyAccount.user?.id||'')===value);}
 async function request(url,options={}){
  const generation=epoch,expectedOwner=owner,sequence=++personalSequence;
  if(options.method&&options.method!=='GET'){
   if(window.SwiflyAccount?.ready)await window.SwiflyAccount.ready;
   if(generation!==epoch||!ownerMatches(expectedOwner))throw staleRequest();
   if(!expectedOwner)throw Object.assign(new Error('Sign in to make this change.'),{code:'signin_required'});
   options={...options,headers:{...options.headers,'X-Swifly-Account':expectedOwner}};
  }
  const controller=new AbortController();requests.add(controller);let timedOut=false;const timer=setTimeout(()=>{timedOut=true;controller.abort();},12000);
  try{
   const response=await fetch(url,{...options,signal:controller.signal,credentials:'same-origin'}),data=await response.json();
   if(generation!==epoch||!ownerMatches(expectedOwner))throw staleRequest();
   // An unavailable screening still returns its schedule and retry state.
   const unavailableSnapshot=(!options.method||options.method==='GET')&&response.status===503&&data.event;
   if(!response.ok&&!unavailableSnapshot){const error=new Error(data.message||'This change could not be saved. Try again.');error.code=data.code;throw error;}
   return{...data,_requestSequence:sequence,_ownerEpoch:generation};
  }catch(error){
   if(timedOut&&generation===epoch&&ownerMatches(expectedOwner))throw new Error('The screening did not respond. Please try again.');
   throw error;
  }finally{clearTimeout(timer);requests.delete(controller);}
 }

 async function refresh({revalidate=true}={}){
  const generation=epoch,recovering=state.code==='storage_unavailable';
  try{
   if(recovering&&revalidate)await window.SwiflyAccount?.revalidate?.();
   // Account hydration may already have reopened the room for the verified owner.
   if(generation!==epoch)return;
   const sentAt=Date.now(),data=await request('/api/movie-nights'+(id?'/'+encodeURIComponent(id):''));
   if(generation!==epoch)return;
   apply(data,{personal:true,sentAt});
   if(!socket&&id)connect();
   else if(socket?.connected&&!admitted&&!data.code)void enter();
  }catch(error){
   if(generation!==epoch||error.name==='AbortError')return;
   if(error.code==='storage_unavailable')state.code=error.code;
   status(recovering?'Voting and chat are temporarily unavailable. Try again shortly.':error.message);
   $('[data-night-refresh]').hidden=false;
  }
 }
 async function retry(){if(event?.sourceStatus==='ready'&&event.source){if(!canPlay()){status('Reconnecting to the screening. Try playback once the connection returns.');return;}sourceKey='';status('Reconnecting your player to the live screening…');await mountPlayer();if(canPlay()&&player?.getState().ready)status('');return;}if(!viewer.signedIn){status('Sign in to retry the shared source.');return;}status('Retrying the shared source…');try{apply(await request('/api/movie-nights/'+encodeURIComponent(id)+'/retry',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),{personal:true});}catch(error){if(error.name!=='AbortError')status(error.message);}}
 function enter(){
  if(disposed||suspended||!socket?.connected||!id)return Promise.resolve(false);
  if(pendingJoin)return pendingJoin.promise;
  const generation=++admissionEpoch,scope=epoch,identity=owner,sequence=++personalSequence;admitted=false;online=false;const sentAt=Date.now(),pending={generation,promise:null,resolve:null,timer:null,finish:null};
  pending.promise=new Promise(resolve=>{pending.resolve=resolve;});
  pending.finish=ok=>{clearTimeout(pending.timer);if(pendingJoin===pending)pendingJoin=null;pending.resolve(ok);};pendingJoin=pending;
  pending.timer=setTimeout(()=>{if(pendingJoin===pending){status('The screening did not connect. Try again.');pending.finish(false);}},10000);
  socket.emit('night:join',{id},reply=>{
   if(disposed||suspended||generation!==admissionEpoch||scope!==epoch||!ownerMatches(identity)||!socket?.connected){pending.finish(false);return;}
   if(reply?.ok){admitted=true;online=true;player?.setRemoteMode({manual:true});lastSync=Date.now();apply(reply,{personal:true,sentAt,sequence});pending.finish(true);return;}
   if(reply?.code==='storage_unavailable'){
    state.code=reply.code;
    $('[data-night-refresh]').hidden=false;
   }
   status(reply?.message||'The screening could not connect. Try again.');
   pending.finish(false);
  });
  return pending.promise;
 }

 function connect(){if(disposed||suspended||!id)return;if(typeof window.io!=='function'){status('The live connection did not load. Reload this page to try again.');return;}socket=window.io('/movie-nights');socket.on('connect',enter);socket.on('disconnect',()=>{if(disposed||suspended)return;revokeAdmission();status('Connection lost. Reconnecting to the screening…');});socket.on('connect_error',error=>{revokeAdmission();status(error?.message||'The screening could not connect. Try again.');});socket.on('night:update',data=>apply(data));socket.on('night:presence',data=>{if(data?.id===id){event.viewers=Number(data.viewers)||0;$('[data-night-viewers]').textContent=event.viewers+' here';}});socket.on('night:message',appendMessage);if(socket.connected)enter();}
 async function joinLive(){joined=true;following=true;autoplayBlocked=false;followingUI();if(!canPlay()&&!await enter()){status('Reconnecting to the screening. Playback will resume after the connection is verified.');return;}await mountPlayer({sync:true,gesture:true});if(!canPlay()||!player||!atLive())status(event?.sourceStatus==='error'?'The source needs a retry before the screening can begin.':'You’re in. The screening will start here when the film is ready.');$('[data-night-join] span').textContent='You’re in';}
 listen(root,'click',async action=>{
  const vote=action.target.closest('[data-night-vote]');if(vote){if(!viewer.signedIn){status('Sign in to cast your vote.','[data-night-vote-status]');$('[data-night-ballot-signin]').focus();return;}if(!event||event.phase!=='voting')return;status('Saving your vote…','[data-night-vote-status]');try{apply(await request('/api/movie-nights/'+encodeURIComponent(id)+'/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({movieId:Number(vote.dataset.nightVote)})}),{personal:true});status('Your vote is saved.','[data-night-vote-status]');}catch(error){if(error.name==='AbortError')return;status(error.message,'[data-night-vote-status]');if(error.code==='account_changed'||error.code==='signin_required')void refresh();}return;}
  if(action.target.closest('[data-night-join],[data-night-live]'))void joinLive();
  if(action.target.closest('[data-night-refresh]'))void refresh();if(action.target.closest('[data-night-retry]'))void retry();
  if(action.target.closest('[data-night-share]')){const url=new URL('/movie-night/'+id,location.origin).href;try{await navigator.clipboard.writeText(url);status('Screening invite copied.');}catch{status('Invite: '+url);}}
  const toggle=action.target.closest('[data-night-chat-toggle]');if(toggle){const body=$('[data-night-chat-body]');body.hidden=!body.hidden;toggle.setAttribute('aria-expanded',String(!body.hidden));toggle.textContent=body.hidden?'Show':'Hide';$('[data-night-chat]').dataset.collapsed=String(body.hidden);}
 });
 listen($('[data-night-message-form]'),'submit',action=>{
  action.preventDefault();const input=$('[data-night-message]'),text=input.value.trim();if(!text||event?.phase==='ended')return;if(!socket?.connected||!admitted){status('Reconnecting. Your message is still here.','[data-night-compose-status]');return;}
  const draft=lastDraft?.text===text?lastDraft:{text,clientId:window.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(36).slice(2)},current=epoch;lastDraft=draft;status('Sending…','[data-night-compose-status]');const button=action.target.querySelector('button');button.disabled=true;
  clearTimeout(sendTimer);sendTimer=setTimeout(()=>{if(current!==epoch)return;button.disabled=false;status('No confirmation yet. Try sending again.','[data-night-compose-status]');},8000);
  socket.emit('night:message',{id,text,clientId:draft.clientId},reply=>{if(disposed||suspended||current!==epoch)return;clearTimeout(sendTimer);button.disabled=false;if(reply?.ok){appendMessage(reply.message);if(input.value.trim()===text)input.value='';lastDraft=null;status('','[data-night-compose-status]');}else{status(reply?.message||'Your message could not send. Try again.','[data-night-compose-status]');if(['signin_required','account_changed'].includes(reply?.code))void refresh();}});
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
 function clearPrivateDraft(){lastDraft=null;clearTimeout(sendTimer);$('[data-night-message]').value='';$('[data-night-message-form] button').disabled=false;status('','[data-night-compose-status]');status('','[data-night-vote-status]');}
 function accountChanged(nextOwner,{reconnect=true}={}){
  stop();owner=nextOwner;appliedPersonalSequence=0;clearPrivateDraft();viewer={signedIn:false};
  if(event)event={...event,yourVote:null};
  // Clearing another account's draft is local state, not a new server timestamp.
  apply({event,viewer,code:state.code,message:state.message},{personal:true});
  if(reconnect){connect();void refresh({revalidate:false});clock=setInterval(updateClock,1000);}
 }
 listen(document,'swifly:account-suspended',()=>accountChanged('',{reconnect:false}));
 listen(document,'swifly:account-hydrated',()=>{const next=window.SwiflyAccount?.user?.id||'';if(next!==owner||!socket||!admitted)accountChanged(next);});
 listen(window,'storage',action=>{if(action.key==='swiflytv.accountOwner')accountChanged(String(action.newValue||'guest')==='guest'?'':String(action.newValue||''));});

 window.SwiflyMovieNights=Object.freeze({refresh,join:joinLive,destroy,get active(){return !disposed;}});
 apply(state,{personal:true});if(window.matchMedia('(max-width:620px)').matches){$('[data-night-chat-body]').hidden=true;$('[data-night-chat-toggle]').setAttribute('aria-expanded','false');$('[data-night-chat-toggle]').textContent='Show';$('[data-night-chat]').dataset.collapsed='true';}connect();clock=setInterval(updateClock,1000);dates();
})();
