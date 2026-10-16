/* v199: one lobby and the shared player over the existing room service. */
(() => {
 'use strict';
 const app=document.querySelector('.svPartyHub');if(!app||window.SwiflySocial)return;
 const $=(sel,root=app)=>root.querySelector(sel),$$=(sel,root=app)=>[...root.querySelectorAll(sel)];
 const origin=location.origin,socket=typeof window.io==='function'?window.io():null;
 const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 let username='Guest',currentRoom='channel-general',currentTitle='General',permissions={},pendingInvite='',joinEpoch=0,listEpoch=0,movieEpoch=0,callEpoch=0,disposed=false,localStream=null,callTrigger=null;
 let activeWatchRoom={id:'',name:'Movie night',joined:false,isHost:false,sync:null};
 let partyPlayer=null,partyPlayerRoot=null,partySourceData=null,mediaEpoch=0;
 const partyMediaListeners=[];
 const messageKeys=new Set(),movies=new Map();
 const featuredMovies=new Map(),lobbyMovies=new Map();
 let selectedMovie=null,roomFilm=null,wantedMovieId='',selectionPending=false,selectionError='',selectionEpoch=0,featuredEpoch=0,lobbySearchEpoch=0,pendingRoomMovie=null;
 const connected=()=>Boolean(socket?.connected)&&!disposed;
 const glyph='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m9 5 11 7-11 7V5Z"/></svg>';
 function toast(message,error=false){const el=$('#sv100Toast');el.textContent=message;el.hidden=false;el.classList.toggle('error',error);clearTimeout(el._timer);el._timer=setTimeout(()=>el.hidden=true,3200);}
 async function request(url,options={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{const res=await fetch(url,{cache:'no-store',...options,signal:controller.signal}),data=await res.json();if(!res.ok||data.ok===false)throw new Error(data.message||data.error||'The party service is unavailable. Try again.');return data;}
  catch(error){if(error.name==='AbortError')throw new Error('That took too long. Please try again.');throw error;}finally{clearTimeout(timer);}
 }
 function profile(){try{const p=JSON.parse(localStorage.getItem('swiflytv.activeProfile')||'null'),s=JSON.parse(localStorage.getItem('swiflytv.session')||'null');username=String(p?.name||s?.name||'Guest').slice(0,40);}catch{}
  $('#sv100Name').textContent=username;$('#sv100Avatar').textContent=username.slice(0,1).toUpperCase();$('#sv100CreatorInput').value=username;
 }
 function updateConnection(){
  app.dataset.partyConnection=connected()?'online':'offline';$('#sv100Status').textContent=connected()?'Connected':'Connecting / offline';
  $$('[data-requires="rooms"]').forEach(n=>n.disabled=!connected()||!permissions.canCreateWatchRooms);
  $('#sv100CreateRoomForm button[type="submit"]').disabled=!connected()||!permissions.canCreateWatchRooms||selectionPending||Boolean(selectionError)||$('#sv100CreateRoomForm').getAttribute('aria-busy')==='true';
  $('#partyJoinForm button[type="submit"]').disabled=!connected()||$('#partyJoinForm').getAttribute('aria-busy')==='true';
  $('#sv100Input').disabled=!connected();$('#sv100Composer button').disabled=!connected();
  updateHostUi();
 }
 async function loadPermissions(){
  try{permissions=(await request('/api/social/permissions?name='+encodeURIComponent(username))).permissions||{};}
  catch{const names=(app.dataset.allowedCreators||'').split(',').map(s=>s.trim().toLowerCase()),creator=names.includes(username.toLowerCase());permissions={canCreateWatchRooms:app.dataset.openRoomCreation==='true'||creator,canCreateGroups:creator,canCreateChannels:creator,canManageSocial:creator};}
  $('.creatorOnly').hidden=!permissions.canCreateWatchRooms;$('.lockedOnly').hidden=Boolean(permissions.canCreateWatchRooms);
  $$('[data-requires="groups"]').forEach(n=>n.disabled=!permissions.canCreateGroups);$$('[data-requires="channels"]').forEach(n=>n.disabled=!permissions.canCreateChannels);
  $('#sv100RoleText').textContent=permissions.canManageSocial?'Creator access':'Member access';
  $('#sv100PermText').textContent=permissions.canCreateWatchRooms?'Create a party or join your friends.':'Hosting is disabled here. You can join existing parties.';updateConnection();
 }
 const roomKey=room=>'swiflytv.social.v103.'+room;
 function readMessages(room){try{const a=JSON.parse(localStorage.getItem(roomKey(room))||'[]');return Array.isArray(a)?a:[];}catch{return [];}}
 function saveMessage(room,message){try{const a=readMessages(room);a.push(message);localStorage.setItem(roomKey(room),JSON.stringify(a.slice(-160)));}catch{}}
 function addMessage(message,persist=true,room=currentRoom){
  const normalized={author:String(message.author||message.name||'Guest'),text:String(message.text||'').slice(0,1200),createdAt:Number(message.createdAt||message.at||Date.now())};
  if(!normalized.text)return;const key=room+'|'+normalized.createdAt+'|'+normalized.author+'|'+normalized.text;if(messageKeys.has(key))return;messageKeys.add(key);
  if(persist)saveMessage(room,normalized);if(room!==currentRoom)return;
  const list=$('#sv100Messages');list.querySelector('.partyChatEmpty')?.remove();const node=document.createElement('article');node.className='sv100Msg'+(normalized.author===username?' mine':'');
  node.innerHTML='<span>'+esc(normalized.author.slice(0,1).toUpperCase())+'</span><div><header><b>'+esc(normalized.author)+'</b><small>'+new Date(normalized.createdAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+'</small></header><p>'+esc(normalized.text)+'</p></div>';
  const atBottom=list.scrollHeight-list.scrollTop-list.clientHeight<100;list.append(node);if(atBottom||normalized.author===username)list.scrollTop=list.scrollHeight;
 }
 function renderMessages(seed=[]){
  $('#sv100Messages').replaceChildren();messageKeys.clear();const messages=[...readMessages(currentRoom),...(Array.isArray(seed)?seed:[])];
  if(!messages.length){const watching=app.dataset.partyView==='rooms',recommendations=currentRoom==='channel-recommendations';$('#sv100Messages').innerHTML='<div class="partyChatEmpty"><span aria-hidden="true">'+glyph+'</span><small>'+esc(watching?'ROOM CHAT':currentTitle)+'</small><h3>'+esc(watching?'Everyone settled in?':recommendations?'What’s worth watching?':'The conversation starts here.')+'</h3><p>'+esc(watching?'Say hello while the host gets the film ready.':recommendations?'Share a recommendation. A hidden gem, an old favourite, or your latest great watch.':'Seen something good lately? Share a thought and start the conversation.')+'</p></div>';return;}
  messages.slice(-160).forEach(m=>addMessage(m,false));
 }
 function updateChatDock(){
  const roomView=app.dataset.partyView==='rooms'&&activeWatchRoom.joined;
  const panel=$('#sv100ChatPanel');(roomView?$('[data-party-chat-dock]'):$('[data-party-main-chat-slot]')).append(panel);
  $('[data-party-conversation]').hidden=!roomView;panel.hidden=app.dataset.partyView==='rooms'&&!activeWatchRoom.joined;panel.classList.toggle('active',!panel.hidden);
  $('[data-party-channel-title]').textContent=roomView?'Room chat':currentTitle;
  $('[data-party-channel-kind]').textContent=currentRoom.startsWith('group-')?'Private conversation':'Community channel';
  $('[data-party-chat-description]').textContent=roomView?'Your people, right beside the film.':currentRoom==='channel-recommendations'?'Find your next great watch. Leave a recommendation.':currentRoom.startsWith('group-')?'A space for your movie night.':'Good films, hot takes, and everything in between.';
  $$('.sv100Channel').forEach(button=>{const active=button.dataset.room===currentRoom;button.classList.toggle('active',active);button.setAttribute('aria-current',String(active));});
 }
 function switchTab(tab){
  const rooms=tab==='rooms';app.dataset.partyView=rooms?'rooms':'chat';$('#sv100RoomsPanel').classList.toggle('active',rooms);$('#sv100RoomsPanel').hidden=!rooms;
  $$('[data-tab]').forEach(b=>{const active=b.dataset.tab===(rooms?'rooms':'chat');b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');});
  if(rooms&&activeWatchRoom.joined){currentRoom='watchroom-'+activeWatchRoom.id;currentTitle=activeWatchRoom.name;}
  else if(!rooms&&currentRoom.startsWith('watchroom-')){currentRoom='channel-general';currentTitle='General';socket?.emit('social:join',{roomId:currentRoom,name:username});}
  $('#sv100Kind').textContent=rooms?'WATCH TOGETHER':'COMMUNITY';$('#sv100Title').textContent=rooms?(activeWatchRoom.joined?activeWatchRoom.name:'Party Hub'):'Community';
  $('.partyPageLead').textContent=rooms?'Good films. Better company.':'For the love of a good film.';
  $('#sv100Input').placeholder=rooms?'Say hello to the room…':'Message '+currentTitle+'…';updateChatDock();renderMessages();
 }
 function joinRoom(room,title){currentRoom=String(room||'channel-general').slice(0,80);currentTitle=title||$$('.sv100Channel').find(button=>button.dataset.room===currentRoom)?.dataset.title||'Conversation';switchTab('chat');socket?.emit('social:join',{roomId:currentRoom,name:username});}
 function roomUrl(room){const url=new URL('/social',origin);url.searchParams.set('tab','watchrooms');url.searchParams.set('roomId',room.id);return url.pathname+url.search;}
 function setupReturnLink(){
  const valid=value=>{if(!value)return null;try{const url=new URL(value,origin);return url.origin===origin&&/^\/(?:$|movies\/?$|tv\/?$|search\/?$|trending\/?$|discover\/?$|genres\/?$|my-list\/?$|liked\/?$|continue-watching\/?$|kids\/?$|(?:movie|tv|genre|person)\/\d+\/?$)/.test(url.pathname)?url:null;}catch{return null;}};
  let stored;try{stored=valid(sessionStorage.getItem('swiflytv.partyReturn'));}catch{}let referrer=valid(document.referrer);const id=app.dataset.selectedMovieId;
  if(/^[1-9]\d{0,13}$/.test(id||'')){const sameMovie=url=>{if(!url)return false;const title=url.pathname.match(/^\/(movie|tv)\/(\d+)\/?$/);return title?title[1]==='movie'&&title[2]===id:!url.searchParams.has('media')||url.searchParams.get('media')==='movie-'+id;};if(!sameMovie(stored))stored=null;if(!sameMovie(referrer))referrer=null;}
  const matching=stored&&referrer&&stored.pathname+stored.search===referrer.pathname+referrer.search;const url=matching?stored:referrer||stored||new URL(/^[1-9]\d{0,13}$/.test(id||'')?'/movie/'+id:'/movies',origin);$('[data-party-return]').setAttribute('href',url.pathname+url.search+url.hash);
 }
 function artwork(value){try{const url=new URL(String(value||''));return url.protocol==='https:'&&url.hostname==='image.tmdb.org'?url.href:'';}catch{return '';}}
 function renderPageArtwork(){
  const film=activeWatchRoom.joined?roomFilm:selectedMovie||featuredMovies.values().next().value,art=$('[data-party-hero-art]'),backdrop=film?.backdrop||'';
  art.hidden=!backdrop;art.style.backgroundImage=backdrop?'url("'+backdrop.replaceAll('"','%22')+'")':'';
 }
 function renderRoomFilm(movie){
  const previous=roomFilm?.id===String(movie?.movieId)?roomFilm:null;
  roomFilm=selectedMovieState(movie)?{id:String(movie.movieId),title:String(movie.title||previous?.title||'').trim().slice(0,240),backdrop:artwork(movie.backdrop)||(!movie.backdrop?previous?.backdrop:'')||''}:null;
  const context=$('[data-party-now-watching]'),image=$('[data-party-now-art]');context.hidden=!roomFilm?.title;
  $('[data-party-now-title]').textContent=roomFilm?.title||'';
  $('[data-party-now-label]').textContent=['ready','ok'].includes(movie?.status)?'Now watching':['loading','preparing'].includes(movie?.status)?'Getting ready':'Selected film';
  if(roomFilm){$('[data-party-now-link]').setAttribute('href','/movie/'+roomFilm.id);}else $('[data-party-now-link]').removeAttribute('href');
  image.hidden=!roomFilm?.backdrop;if(roomFilm?.backdrop)image.src=roomFilm.backdrop;else image.removeAttribute('src');
  renderPageArtwork();
 }
 function movieValue(value){const id=Number(value?.id);if(!Number.isSafeInteger(id)||id<=0||!String(value?.title||'').trim())return null;return {id:String(id),title:String(value.title).slice(0,240),year:String(value.year||''),poster:artwork(value.poster),backdrop:artwork(value.backdrop),overview:String(value.overview||'').slice(0,1000)};}
 function filmChoices(values,attribute){return values.map((movie,index)=>'<button type="button" class="partyFilmChoice" style="--party-card-order:'+Math.min(index,7)+'" '+attribute+'="'+esc(movie.id)+'" aria-label="Choose '+esc(movie.title)+'" aria-pressed="'+(selectedMovie?.id===movie.id)+'"><span>'+(movie.poster?'<img src="'+esc(movie.poster)+'" alt="" loading="lazy" decoding="async">':glyph)+'<span class="partyFilmAffordance" aria-hidden="true">Choose film '+glyph+'</span></span><b>'+esc(movie.title)+'</b><small>'+esc(movie.year||'Movie')+'</small></button>').join('');}
 function updateSelectedUrl(){if(activeWatchRoom.joined)return;try{const url=new URL(location.href);if(wantedMovieId)url.searchParams.set('movieId',wantedMovieId);else url.searchParams.delete('movieId');history.replaceState(history.state,'',url.pathname+url.search+url.hash);}catch{}}
 function renderHero(){
  const film=selectedMovie||featuredMovies.values().next().value;renderPageArtwork();
  $('[data-party-hero-label]').textContent=selectedMovie?'Selected for your party':film?'Tonight’s inspiration':'Your next shared screen';
  $('#partyHeroTitle').textContent=film?.title||'Make it a movie night.';
  $('[data-party-hero-copy]').textContent=film?.overview||'Pick a film. Bring your people. Share the whole evening.';
  const pick=$('[data-party-featured-host]');pick.hidden=!film||Boolean(selectedMovie);if(film){pick.dataset.partyFeaturedId=film.id;$('[data-party-hero-film]').textContent=film.year||'Choose this film';}
 }
 function renderSelection(){
  const panel=$('#partySelectedMovie');panel.hidden=!selectedMovie&&!selectionPending&&!selectionError;panel.classList.toggle('error',Boolean(selectionError));
  if(selectionPending)panel.innerHTML='<span role="status">Loading your selected film…</span>';
  else if(selectionError)panel.innerHTML='<div><b>This film is unavailable</b><p>'+esc(selectionError)+'</p></div><button type="button" class="partySecondaryBtn" data-action="retry-party-movie">Try again</button><button type="button" class="partySecondaryBtn" data-action="clear-party-movie">Choose another film</button>';
  else if(selectedMovie)panel.innerHTML=(selectedMovie.poster?'<img src="'+esc(selectedMovie.poster)+'" alt="" decoding="async">':'')+'<div><small>Selected for your party</small><b>'+esc(selectedMovie.title)+'</b><small>'+esc(selectedMovie.year||'Movie')+'</small><a href="/movie/'+selectedMovie.id+'">Movie details</a></div><button type="button" class="partyIconBtn" data-action="clear-party-movie" aria-label="Clear selected film">'+glyph.replace('m9 5 11 7-11 7V5Z','m6 6 12 12M18 6 6 18')+'</button>';
  else panel.replaceChildren();
  $$('[data-party-featured-id],[data-party-lobby-movie-id]').forEach(button=>button.setAttribute('aria-pressed',String((button.dataset.partyFeaturedId||button.dataset.partyLobbyMovieId)===selectedMovie?.id)));
  renderHero();updateConnection();window.SwiflyGlassSurfaces?.refresh(app);
 }
 function chooseMovie(movie){selectionEpoch++;wantedMovieId=movie.id;selectionPending=false;selectionError='';selectedMovie=movie;const field=$('#partyRoomName');if(!field.value||field.value===field.dataset.autoName){field.value=movie.title+' — movie night';field.dataset.autoName=field.value;}$('#partyStartLink').value='';updateSelectedUrl();renderSelection();}
 function clearMovie(){selectionEpoch++;selectedMovie=null;wantedMovieId='';selectionPending=false;selectionError='';const field=$('#partyRoomName');if(field.value===field.dataset.autoName)field.value='';delete field.dataset.autoName;updateSelectedUrl();renderSelection();}
 async function loadLobbyMovie(value){const id=String(value||'');if(!/^[1-9]\d{0,13}$/.test(id))return;const generation=++selectionEpoch;wantedMovieId=id;selectedMovie=null;selectionPending=true;selectionError='';updateSelectedUrl();renderSelection();
  try{const data=await request('/api/social/movies/'+id);if(generation!==selectionEpoch||disposed)return;const movie=movieValue(data.movie);if(!movie||movie.id!==id)throw new Error('This movie is unavailable. Choose another film or try again.');chooseMovie(movie);}
  catch(error){if(generation!==selectionEpoch||disposed)return;selectionPending=false;selectionError=error.message;renderSelection();}
 }
 async function loadFeaturedMovies(){const generation=++featuredEpoch,target=$('#partyFeaturedMovies');try{const data=await request('/api/social/movies/featured');if(generation!==featuredEpoch||disposed)return;featuredMovies.clear();const films=(Array.isArray(data.movies)?data.movies:[]).map(movieValue).filter(Boolean).slice(0,6);films.forEach(movie=>featuredMovies.set(movie.id,movie));target.innerHTML=films.length?filmChoices(films,'data-party-featured-id'):'<p class="partyFilmStatus">Search for a film above, or browse the movie catalog.</p>';renderHero();renderSelection();}
  catch{if(generation!==featuredEpoch||disposed)return;target.innerHTML='<div class="partyFilmStatus"><p>Suggested films are unavailable right now. You can still search or browse movies.</p><button class="partySecondaryBtn" type="button" data-action="retry-featured-movies">Try again</button></div>';window.SwiflyGlassSurfaces?.refresh(target);}
 }
 async function searchLobbyMovies(value){const query=String(value||'').trim(),generation=++lobbySearchEpoch,target=$('#partyLobbyMovieResults');if(query.length<2){target.innerHTML='<p class="partyFilmStatus">Type at least two letters to find a film.</p>';return;}target.innerHTML='<p class="partyFilmStatus" role="status">Finding films…</p>';
  try{const data=await request('/api/social/movies/search?q='+encodeURIComponent(query));if(generation!==lobbySearchEpoch||disposed)return;lobbyMovies.clear();const films=(Array.isArray(data.results)?data.results:[]).map(movieValue).filter(Boolean);films.forEach(movie=>lobbyMovies.set(movie.id,movie));target.innerHTML=films.length?filmChoices(films,'data-party-lobby-movie-id'):'<p class="partyFilmStatus">No films found. Try another title.</p>';}catch(error){if(generation===lobbySearchEpoch&&!disposed)target.innerHTML='<p class="partyFilmStatus">'+esc(error.message)+'</p>';}
 }
 function startQueuedMovie(){if(!pendingRoomMovie||pendingRoomMovie.roomId!==activeWatchRoom.id)return;const queued=pendingRoomMovie;pendingRoomMovie=null;if(!connected()||!activeWatchRoom.isHost)return;socket.emit('watchroom:movie-select',{roomId:queued.roomId,movieId:queued.movie.id,name:username});toast('Getting '+queued.movie.title+' ready for your party…');}
 function parseInvite(value){
  const text=String(value||'').trim();if(/^[a-z0-9-]{3,32}$/i.test(text))return text.toLowerCase();
  try{const url=new URL(text,origin);if(url.origin!==origin)throw new Error();const path=url.pathname.match(/^\/watchrooms\/([a-z0-9-]{3,32})\/?$/i);const code=url.pathname==='/social'?url.searchParams.get('roomId'):path?.[1];if(code&&/^[a-z0-9-]{3,32}$/i.test(code))return code.toLowerCase();}catch{}
  throw new Error('Paste a valid room code or an invite from this site.');
 }
 function readVideoLink(value){const text=String(value||'').trim();if(!text)return '';try{const url=new URL(text);if(['http:','https:'].includes(url.protocol))return url.href;}catch{}throw new Error('Use a complete http or https video link.');}
 function parseYouTube(value){try{const u=new URL(value),host=u.hostname.toLowerCase().replace(/^www\./,'');let id='';if(host==='youtu.be')id=u.pathname.split('/')[1];else if(host==='youtube.com'||host==='m.youtube.com')id=u.searchParams.get('v')||u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];return /^[A-Za-z0-9_-]{6,20}$/.test(id||'')?id:'';}catch{return '';}}
 function destroyMedia(){
  mediaEpoch++;for(const remove of partyMediaListeners.splice(0))remove();
  if(partyPlayer)partyPlayer.destroy();else {try{$('#sv103Video')?.pause();}catch{}}
  partyPlayer=null;partyPlayerRoot=null;partySourceData=null;activeWatchRoom.sync=null;
  const dock=$('#sv103ControlDock')||$('.sv103ControlDock');if(dock)dock.hidden=false;
 }
 function mediaGuard(root){const roomId=activeWatchRoom.id,generation=mediaEpoch;return ()=>connected()&&activeWatchRoom.joined&&activeWatchRoom.id===roomId&&mediaEpoch===generation&&root?.isConnected&&partyPlayerRoot===root;}
 function selectedMovieState(movie){return Boolean(movie&&/^[1-9]\d{0,13}$/.test(String(movie.movieId||'')));}
 function syncedTransport(){return selectedMovieState(activeWatchRoom.syncedMovie)&&String(partySourceData?.movieId)===String(activeWatchRoom.syncedMovie.movieId);}
 function showMedia(media={}){const movie=selectedMovieState(media.movie)?media.movie:null;activeWatchRoom.syncedMovie=movie;renderNativeMedia({...media,movie});renderRoomFilm(movie);activeWatchRoom.sync=movie?.sync||null;if(movie)applyNativeSync(true);}
 function updateHostUi(){
  const host=activeWatchRoom.joined&&activeWatchRoom.isHost&&connected();app.dataset.partyHost=host?'true':'false';
  partyPlayer?.setRemoteMode({enabled:syncedTransport(),isHost:host,manual:!syncedTransport()});
  $$('.hostOnly').forEach(el=>{el.disabled=!host;if(el.matches('details,form'))el.hidden=!host;el.querySelectorAll('input,button').forEach(n=>n.disabled=!host);});
  $('#sv103HostStatus').textContent=!activeWatchRoom.joined?'Joining…':!connected()?'Reconnecting…':host?'You’re hosting':'Watching with the host';
  $$('[data-action="invite"],[data-action="copy-room-link"],[data-action="copy-room-code"]').forEach(n=>n.disabled=!activeWatchRoom.joined);
 }
 function openNativeWatchRoom(room,movieToStart=null){
  if(!room?.id||!connected()){toast('Connect to the party service before joining.',true);return;}
  if(activeWatchRoom.joined&&activeWatchRoom.id!==room.id)leaveNativeWatchRoom(false);
  activeWatchRoom={...room,id:String(room.id),name:room.name||'Movie night',kind:room.kind||room.mediaKind||'blank',joined:true,isHost:false,sync:null};
  if(movieToStart)pendingRoomMovie={roomId:activeWatchRoom.id,movie:movieToStart};
  app.dataset.partyRoom='active';$('#sv103NativeRoom').hidden=false;$('#sv103RoomLobby').hidden=true;$('#sv103RoomTitle').textContent=activeWatchRoom.name;$('#sv103RoomSub').textContent='Your room is ready. Share the invite and get comfortable.';$('#sv103RoomCode').textContent=activeWatchRoom.id;
  showMedia({videoId:room.videoId,embedUrl:room.embedUrl,mediaKind:activeWatchRoom.kind});$('#sv103ViewerCount').textContent='…';$('#sv100MembersList').innerHTML='<p>Connecting your people…</p>';$('#sv100MemberCount').textContent='Connecting…';
  socket.emit('watchroom:join',{roomId:activeWatchRoom.id,name:activeWatchRoom.name,videoId:room.videoId||'',embedUrl:room.embedUrl||'',mediaKind:activeWatchRoom.kind,user:username});
  switchTab('rooms');updateHostUi();try{history.replaceState(history.state,'',roomUrl(activeWatchRoom));}catch{}
 }
 function leaveNativeWatchRoom(refresh=true){
  joinEpoch++;movieEpoch++;pendingRoomMovie=null;movies.clear();const id=activeWatchRoom.id;if(id)socket?.emit('watchroom:leave',{roomId:id});destroyMedia();closeCall();activeWatchRoom={id:'',name:'Movie night',joined:false,isHost:false,sync:null};
  renderRoomFilm(null);app.dataset.partyRoom='lobby';$('#sv103NativeRoom').hidden=true;$('#sv103RoomLobby').hidden=false;$('#sv103Player').innerHTML='<div class="sv103EmptyPlayer"><b>Your movie night starts here.</b><span>The host can choose a film or add a video link.</span></div>';$('#sv103RoomTitle').textContent='Party Hub';$('#sv103RoomSub').textContent='Make yourself comfortable.';$('#partyMovieResults').replaceChildren();currentRoom='channel-general';currentTitle='General';updateHostUi();switchTab('rooms');try{history.replaceState(history.state,'','/social?tab=watchrooms');}catch{}if(refresh)renderRooms();
 }
 async function createParty(form){
  if(form.getAttribute('aria-busy')==='true')return;
  const status=$('[data-party-create-status]');if(!permissions.canCreateWatchRooms){status.textContent='Hosting is disabled here. Join an existing party.';return;}if(!connected()){status.textContent='Connect to the party service first.';return;}if(selectionPending||selectionError){status.textContent=selectionPending?'Wait for your film to load.':'Choose another film or retry before creating your party.';return;}
  const operation=++joinEpoch,button=form.querySelector('button[type="submit"]');button.disabled=true;form.setAttribute('aria-busy','true');status.textContent='Making room for your people…';
  try{const name=String(form.elements.namedItem('name').value||'').trim().slice(0,80)||'Movie night',mediaUrl=readVideoLink(form.elements.namedItem('watchLink').value),movieToStart=mediaUrl?null:selectedMovie;const data=await request('/api/social/watchrooms/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({creator:username,name,mediaUrl})});if(operation!==joinEpoch||disposed)return;if(!data.room?.id)throw new Error('The room could not be created. Try again.');status.textContent='';openNativeWatchRoom(data.room,movieToStart);}
  catch(error){if(operation===joinEpoch)status.textContent=error.message;}finally{form.removeAttribute('aria-busy');updateConnection();}
 }
 async function joinInvite(value){
  const status=$('[data-party-join-status]');if(!connected()){status.textContent='Connect to the party service first.';return;}
  const operation=++joinEpoch,form=$('#partyJoinForm');form.setAttribute('aria-busy','true');form.querySelector('button[type="submit"]').disabled=true;status.textContent='Finding your room…';
  try{const code=parseInvite(value),data=await request('/api/date-room/'+encodeURIComponent(code)+'/state');if(operation!==joinEpoch||disposed)return;if(!data.room?.id)throw new Error('That party could not be found. Check the invite.');status.textContent='';openNativeWatchRoom(data.room);}
  catch(error){if(operation===joinEpoch)status.textContent=error.message==='room_not_found'?'That party could not be found. Ask the host for a fresh invite.':error.message;}finally{form.removeAttribute('aria-busy');updateConnection();}
 }
 async function renderRooms(){
  const generation=++listEpoch,target=$('#sv100RoomsList');target.setAttribute('aria-busy','true');
  try{const data=await request('/api/social/watchrooms');if(generation!==listEpoch||disposed)return;const rooms=Array.isArray(data.rooms)?data.rooms:[];$('#partyRoomCount').textContent=rooms.length?'('+rooms.length+')':'';
   if(!rooms.length){target.innerHTML='<div class="partyEmpty"><span>'+glyph+'</span><h3>A quiet room, for now.</h3><p>Make the first party. Your people can join with one invite.</p></div>';return;}
   target.innerHTML=rooms.slice(0,24).map(room=>{const encoded=encodeURIComponent(JSON.stringify(room)),people=Math.max(0,Number(room.viewers)||0);return '<article class="sv100RoomItem"><div class="partyRoomCardArt">'+glyph+'<span>'+esc(room.mediaKind==='youtube'?'VIDEO NIGHT':room.syncedMovie?.movieId?'MOVIE NIGHT':'WATCH TOGETHER')+'</span></div><div class="partyRoomCardCopy"><h4>'+esc(room.name||'Movie night')+'</h4><p>Hosted by '+esc(room.host||'Host')+'</p><small>'+people+(people===1?' person':' people')+'</small></div><nav><button type="button" class="partySecondaryBtn" data-open-native-room="'+encoded+'">Join party <span aria-hidden="true">↗</span></button><button type="button" class="partySecondaryBtn" data-copy="'+esc(origin+roomUrl(room))+'" aria-label="Copy invite for '+esc(room.name||'party')+'">Invite</button></nav></article>';}).join('');
   window.SwiflyGlassSurfaces?.refresh(target);
  }catch{if(generation===listEpoch&&!disposed)target.innerHTML='<div class="partyEmpty partyListError"><h3>Parties are unavailable right now.</h3><p>Try again when the connection is ready.</p><button type="button" class="partySecondaryBtn" data-action="refresh-rooms">Try again</button></div>';}finally{if(generation===listEpoch)target.removeAttribute('aria-busy');}
 }
 async function searchMovies(value){
  if(!activeWatchRoom.isHost||!connected())return;const query=String(value||'').trim(),target=$('#partyMovieResults'),generation=++movieEpoch;if(query.length<2){target.textContent='Type at least two letters to find a film.';return;}target.textContent='Finding films…';
  try{const data=await request('/api/social/movies/search?q='+encodeURIComponent(query));if(generation!==movieEpoch||!activeWatchRoom.isHost||disposed)return;movies.clear();const results=data.results||[];results.forEach(m=>movies.set(String(m.id),m));target.innerHTML=results.length?results.map(m=>'<button type="button" data-party-movie-id="'+esc(m.id)+'">'+(m.poster?'<img src="'+esc(m.poster)+'" alt="" loading="lazy">':'<span>'+glyph+'</span>')+'<span><b>'+esc(m.title)+'</b><small>'+esc(m.year||'Movie')+'</small></span><i aria-hidden="true">+</i></button>').join(''):'No films found. Try another title.';}
  catch(error){if(generation===movieEpoch)target.textContent=error.message;}
 }
 function selectTmdbMovie(id){if(!activeWatchRoom.isHost||!activeWatchRoom.joined||!connected()||!movies.has(String(id)))return;socket.emit('watchroom:movie-select',{roomId:activeWatchRoom.id,movieId:String(id),name:username});$('.partyMediaTools').open=false;toast('Getting the film ready…');}
 function setMediaFromUrl(value){if(!activeWatchRoom.isHost||!connected())return;try{const url=readVideoLink(value);if(!url)throw new Error('Add a video link first.');const videoId=parseYouTube(url);socket.emit('watchroom:trailer',{roomId:activeWatchRoom.id,name:activeWatchRoom.name,videoId,embedUrl:videoId?'':url,trailerUrl:videoId?'':url,mediaKind:videoId?'youtube':'embed'});}catch(error){toast(error.message,true);}}
 async function copy(value){try{if(window.swiflyCopy)await window.swiflyCopy(value);else await navigator.clipboard.writeText(value);toast('Invite copied. Send it to your people.');}catch{toast('Copy is unavailable. Select the room code and copy it manually.',true);}}
 function focusEntry(which){if(activeWatchRoom.joined)leaveNativeWatchRoom(false);switchTab('rooms');const field=$(which==='join'?'#partyInvite':'#partyRoomName');field.scrollIntoView?.({block:'center',behavior:document.body.classList.contains('reduceMotion')||matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});field.focus({preventScroll:true});}
 async function openCall(video){const modal=$('#sv100CallModal');if(modal.open)closeCall();const id=++callEpoch;callTrigger=document.activeElement;$('#sv100CallTitle').textContent='Your device preview';$('#sv100CallType').textContent=video?'Camera check':'Microphone check';$('#sv100CallStatus').textContent='Waiting for permission…';modal.showModal();modal.querySelector('[data-action="close-call"]').focus();
  try{const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:Boolean(video)});if(id!==callEpoch||!modal.open){stream.getTracks().forEach(t=>t.stop());return;}localStream=stream;$('#sv100LocalVideo').srcObject=stream;$('#sv100LocalVideo').hidden=!video;$('#sv100CallStatus').textContent=video?'Camera preview active':'Microphone ready';}catch{if(id===callEpoch)$('#sv100CallStatus').textContent='Permission blocked or device unavailable';}
 }
 function releaseCall(){callEpoch++;localStream?.getTracks().forEach(t=>t.stop());localStream=null;$('#sv100LocalVideo').srcObject=null;if(callTrigger?.isConnected)callTrigger.focus({preventScroll:true});callTrigger=null;}
 function closeCall(){const modal=$('#sv100CallModal');if(modal.open)modal.close();if(localStream||callTrigger)releaseCall();}
 function createVirtual(type){if(!(type==='channel'?permissions.canCreateChannels:permissions.canCreateGroups))return;const name=prompt(type==='channel'?'Channel name':'Group name');if(!name?.trim())return;const id=(type==='channel'?'channel-':'group-')+name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,40);const section=$$('.sv100ChannelGroup').find(s=>s.querySelector('header span')?.textContent===(type==='channel'?'Social Lounges':'Private Rooms'));const button=document.createElement('button');button.type='button';button.className='sv100Channel';button.dataset.room=id;button.dataset.title=name.trim();button.textContent=name.trim();section?.append(button);joinRoom(id,name.trim());}

 function directMediaUrl(value){
  try{const url=new URL(String(value||''),location.href);return ['http:','https:'].includes(url.protocol)&&/\.(?:m3u8|mpd|mp4|webm|mov|m4v|ogv|ogg|mkv|avi|mp3|m4a|wav|flac)$/i.test(url.pathname)?String(value):'';}catch{return '';}
 }
 function renderNativeMedia(media={}){
  const root=$('#sv103Player');if(!root)return;
  const movie=selectedMovieState(media.movie)?media.movie:null,data={...media,...movie};
  const src=['playbackUrl','hlsProxyUrl','embeddedM3u8Url','proxyVideo','m3u8','url'].map(key=>data[key]).find(Boolean)||directMediaUrl(media.embedUrl);
  if(src||movie){
   if(!partyPlayer||!partyPlayerRoot?.isConnected){
    destroyMedia();const template=$('#partyPlayerTemplate');
    if(!template?.content||!window.SwiflyPlayer?.mount){root.innerHTML='<div class="sv103EmptyPlayer error"><b>Playback could not load.</b><span>Refresh the page to try again.</span></div>';return;}
    root.replaceChildren(template.content.cloneNode(true));partyPlayerRoot=root.querySelector('[data-player-root]');partyPlayer=window.SwiflyPlayer.mount(partyPlayerRoot,{managed:true,isHost:activeWatchRoom.isHost&&connected()});
    if(!partyPlayer){root.innerHTML='<div class="sv103EmptyPlayer error"><b>Playback could not load.</b><span>Refresh the page to try again.</span></div>';return;}
    const isCurrent=mediaGuard(partyPlayerRoot),listen=(name,fn)=>{const node=partyPlayerRoot,handler=event=>{if(isCurrent())fn(event);};node.addEventListener('swiflyplayer:'+name,handler);partyMediaListeners.push(()=>node.removeEventListener('swiflyplayer:'+name,handler));};
    listen('action',event=>{const {action,time}=event.detail||{};if(!syncedTransport()||!activeWatchRoom.isHost||!['play','pause','set'].includes(action)||!Number.isFinite(time)||time<0)return;socket.emit('watchroom:movie-control',{roomId:activeWatchRoom.id,action,time,clientTime:time,name:username,intent:'user'});});
    listen('ready',()=>applyNativeSync(true));
    listen('retry',()=>{if(syncedTransport()){if(activeWatchRoom.isHost)socket.emit('watchroom:movie-select',{roomId:activeWatchRoom.id,movieId:String(partySourceData.movieId),name:username,retry:true});}else if(partySourceData)partyPlayer.loadSource(partySourceData,{resumeAt:partyPlayer.getState().currentTime});});
    listen('sync',()=>{if(syncedTransport())socket.emit('watchroom:movie-control',{roomId:activeWatchRoom.id,action:'sync-me',name:username});});
   }
   app.dataset.partyMedia='video';const dock=$('#sv103ControlDock')||$('.sv103ControlDock');if(dock)dock.hidden=true;
   partySourceData={...data,...(!data.playbackUrl&&src?{playbackUrl:src}:{})};
   partyPlayer.setRemoteMode({enabled:Boolean(movie),isHost:activeWatchRoom.isHost&&connected(),manual:!movie});
   const video=partyPlayerRoot.querySelector('[data-player-video]');if(data.title){video.setAttribute('aria-label',String(data.title));partyPlayerRoot.setAttribute('aria-label',String(data.title));}const poster=artwork(data.backdrop||data.poster);if(poster)video.poster=poster;
   partyPlayer.loadSource(partySourceData,{resumeAt:targetSeconds(movie?.sync)});return;
  }
  destroyMedia();const videoId=media.videoId||'',embedUrl=media.embedUrl||'';
  if(videoId){app.dataset.partyMedia='youtube';root.innerHTML='<iframe class="sv103MediaFrame" title="Shared YouTube video" src="https://www.youtube.com/embed/'+encodeURIComponent(videoId)+'?rel=0&playsinline=1" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen></iframe>';return;}
  if(embedUrl&&/^https?:\/\//i.test(embedUrl)){app.dataset.partyMedia='embed';root.innerHTML='<iframe class="sv103MediaFrame" title="Shared video" src="'+esc(embedUrl)+'" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="no-referrer"></iframe>';return;}
  app.dataset.partyMedia='blank';$('#sv103ControlDock').hidden=true;root.innerHTML='<div class="sv103EmptyPlayer"><span class="partyEmptyScreenMark" aria-hidden="true">'+glyph+'</span><b>Choose the first film.</b><span>The host can find a movie or add a video link below.</span></div>';
 }
 function targetSeconds(sync){
  if(!sync)return 0;const offset=Math.max(0,Number(sync.offset)||0);return sync.playing?offset+Math.max(0,(Date.now()-(Number(sync.startedAt)||Date.now()))/1000):offset;
 }
 function applyNativeSync(force){
  const sync=activeWatchRoom.sync;if(!partyPlayer||!syncedTransport()||!sync||!mediaGuard(partyPlayerRoot)())return;
  const state=partyPlayer.getState(),target=targetSeconds(sync);$('#sv103Timer').textContent=formatTime(target);
  if(state.status==='error'||!state.source)return;
  if(force||Math.abs(state.currentTime-target)>1.5)partyPlayer.seek(target,{remote:true});
  const playing=sync.playing&&(!Number(sync.startedAt)||Date.now()>=Number(sync.startedAt));
  if(playing&&state.paused)partyPlayer.play({remote:true});else if(!playing&&!state.paused)partyPlayer.pause({remote:true});
 }
 function formatTime(seconds){const s=Math.max(0,Math.floor(Number(seconds)||0));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}

 app.addEventListener('click',event=>{
  const returnLink=event.target.closest('[data-party-return]');if(returnLink&&!event.defaultPrevented&&!(event.button>0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)&&(!returnLink.target||returnLink.target==='_self')&&history.length>1){try{const target=new URL(returnLink.href),referrer=new URL(document.referrer);if(target.origin===origin&&referrer.origin===origin&&target.pathname+target.search===referrer.pathname+referrer.search){event.preventDefault();history.back();return;}}catch{}}
  const button=event.target.closest('button');if(button?.disabled)return;
  const tab=event.target.closest('[data-tab]');if(tab){switchTab(tab.dataset.tab);return;}
  const channel=event.target.closest('.sv100Channel[data-room]');if(channel){joinRoom(channel.dataset.room,channel.dataset.title);return;}
  const featured=event.target.closest('[data-party-featured-id]');if(featured){const movie=featuredMovies.get(featured.dataset.partyFeaturedId);if(movie){chooseMovie(movie);focusEntry('create');}return;}
  const lobbyMovie=event.target.closest('[data-party-lobby-movie-id]');if(lobbyMovie){loadLobbyMovie(lobbyMovie.dataset.partyLobbyMovieId);focusEntry('create');return;}
  const open=event.target.closest('[data-open-native-room]');if(open){try{const room=JSON.parse(decodeURIComponent(open.dataset.openNativeRoom));joinInvite(room.id);}catch{toast('That invite is unavailable.',true);}return;}
  const movie=event.target.closest('[data-party-movie-id]');if(movie){selectTmdbMovie(movie.dataset.partyMovieId);return;}
  const copied=event.target.closest('[data-copy]');if(copied){copy(copied.dataset.copy);return;}
  const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return;
  if(action==='clear-party-movie'){clearMovie();$('#partyLobbyMovieQuery').focus({preventScroll:true});return;}if(action==='retry-party-movie'){loadLobbyMovie(wantedMovieId);return;}if(action==='retry-featured-movies'){loadFeaturedMovies();return;}
  if(action==='native-create-party'){focusEntry('create');return;}if(action==='native-join-room'){focusEntry('join');return;}if(action==='refresh-rooms'){renderRooms();return;}
  if(action==='leave-native-room'){leaveNativeWatchRoom();return;}if(action==='copy-room-link'||action==='invite'){if(activeWatchRoom.joined)copy(origin+roomUrl(activeWatchRoom));return;}if(action==='copy-room-code'){if(activeWatchRoom.joined)copy(activeWatchRoom.id);return;}
  if(action==='new-channel'||action==='new-group'){createVirtual(action==='new-channel'?'channel':'group');return;}
  if(action==='voice'||action==='video'){openCall(action==='video');return;}if(action==='close-call'){closeCall();return;}if(action==='mute')localStream?.getAudioTracks().forEach(t=>t.enabled=!t.enabled);if(action==='camera')localStream?.getVideoTracks().forEach(t=>t.enabled=!t.enabled);
 });
 $('#sv100CreateRoomForm').addEventListener('submit',event=>{event.preventDefault();createParty(event.currentTarget);});
 $('#partyJoinForm').addEventListener('submit',event=>{event.preventDefault();joinInvite(event.currentTarget.elements.namedItem('code').value);});
 $('#partyLobbyMovieForm').addEventListener('submit',event=>{event.preventDefault();searchLobbyMovies($('#partyLobbyMovieQuery').value);});
 $('#partyStartLink').addEventListener('input',()=>{if($('#partyStartLink').value.trim()&&(selectedMovie||selectionPending||selectionError))clearMovie();});
 $('#sv103MovieForm').addEventListener('submit',event=>{event.preventDefault();searchMovies(event.currentTarget.elements.namedItem('movieId').value);});
 $('#sv103SetMediaForm').addEventListener('submit',event=>{event.preventDefault();setMediaFromUrl(event.currentTarget.elements.namedItem('mediaUrl').value);});
 $('#sv100Composer').addEventListener('submit',event=>{event.preventDefault();if(!connected())return toast('Reconnect to send a message.',true);const input=$('#sv100Input'),text=input.value.trim();if(!text)return;input.value='';if(activeWatchRoom.joined&&currentRoom==='watchroom-'+activeWatchRoom.id)socket.emit('watchroom:message',{roomId:activeWatchRoom.id,name:username,text});else socket.emit('social:message',{roomId:currentRoom,author:username,text,createdAt:Date.now()});});
 const deviceDialog=$('#sv100CallModal');deviceDialog.addEventListener('cancel',event=>{event.preventDefault();closeCall();});deviceDialog.addEventListener('close',()=>{if(!deviceDialog.open&&(localStream||callTrigger))releaseCall();});
 app.addEventListener('keydown',event=>{const modal=$('#sv100CallModal');if(!modal.open)return;if(event.key==='Escape'){event.preventDefault();closeCall();}if(event.key==='Tab'){const a=[...modal.querySelectorAll('button:not(:disabled),video[controls]')],first=a[0],last=a.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
 socket?.on('connect',()=>{updateConnection();if(pendingInvite){const code=pendingInvite;pendingInvite='';joinInvite(code);}else if(activeWatchRoom.joined)openNativeWatchRoom(activeWatchRoom);else socket.emit('social:join',{roomId:currentRoom,name:username});});
 socket?.on('disconnect',updateConnection);
 socket?.on('connect_error',()=>{updateConnection();$('#sv100Status').textContent='Connection unavailable';});
 socket?.on('social:message',message=>{if(message?.roomId===currentRoom)addMessage(message);});
 socket?.on('social:members',data=>{if(!data||data.roomId!==currentRoom||currentRoom.startsWith('watchroom-'))return;});
 socket?.on('watchroom:joined',data=>{if(!activeWatchRoom.joined||data?.room?.id!==activeWatchRoom.id)return;activeWatchRoom={...activeWatchRoom,...data.room,name:data.room.name||activeWatchRoom.name,isHost:Boolean(data.isHost),joined:true};$('#sv103RoomTitle').textContent=activeWatchRoom.name;$('#sv100Title').textContent=activeWatchRoom.name;const movie=data.room.syncedMovie;if(selectedMovieState(movie))showMedia({movie});else showMedia(data.room);updateHostUi();renderMessages((data.messages||[]).map(m=>({author:m.name,text:m.text,createdAt:m.at})));startQueuedMovie();});
 socket?.on('watchroom:host',data=>{if(!activeWatchRoom.joined||(data.roomId&&data.roomId!==activeWatchRoom.id))return;activeWatchRoom.isHost=Boolean(data.isHost);updateHostUi();});
 socket?.on('watchroom:viewers',data=>{if(data?.roomId!==activeWatchRoom.id||!activeWatchRoom.joined)return;const people=Math.max(0,Number(data.viewers)||0);$('#sv103ViewerCount').textContent=people;$('#sv100MemberCount').textContent=people+(people===1?' person':' people');});
 socket?.on('watchroom:members',data=>{if(data?.roomId!==activeWatchRoom.id||!activeWatchRoom.joined)return;$('#sv100MembersList').innerHTML=(data.members||[]).map(m=>'<p><span>'+esc(String(m.name||'Guest').slice(0,1).toUpperCase())+'</span><b>'+esc(m.name||'Guest')+'</b>'+(m.isHost?'<small>Host</small>':'')+'</p>').join('');});
 socket?.on('watchroom:message',message=>{if(!activeWatchRoom.joined||(message?.roomId&&message.roomId!==activeWatchRoom.id))return;addMessage(message,true,'watchroom-'+activeWatchRoom.id);});
 socket?.on('watchroom:trailer',data=>{if(data?.roomId!==activeWatchRoom.id||!activeWatchRoom.joined)return;activeWatchRoom.videoId=data.videoId||'';activeWatchRoom.embedUrl=data.embedUrl||data.trailerUrl||'';showMedia({...data,embedUrl:activeWatchRoom.embedUrl});toast('The room’s video is ready.');});
 socket?.on('watchroom:movie-sync',data=>{if(!connected()||data?.roomId!==activeWatchRoom.id||!activeWatchRoom.joined||!data.movie)return;activeWatchRoom.syncedMovie=data.movie;showMedia({movie:data.movie});});
 socket?.on('watchroom:movie-sync-state',data=>{if(!connected()||data?.roomId!==activeWatchRoom.id||!activeWatchRoom.joined||!syncedTransport()||(data.movieId&&String(data.movieId)!==String(activeWatchRoom.syncedMovie.movieId)))return;activeWatchRoom.sync=data.sync;applyNativeSync(false);});
 let clock;function startClock(){clearInterval(clock);clock=setInterval(()=>{if(activeWatchRoom.joined&&activeWatchRoom.sync&&connected()){$('#sv103Timer').textContent=formatTime(targetSeconds(activeWatchRoom.sync));applyNativeSync(false);}},1000);}startClock();
 window.addEventListener('pagehide',()=>{disposed=true;joinEpoch++;listEpoch++;movieEpoch++;selectionEpoch++;featuredEpoch++;lobbySearchEpoch++;destroyMedia();closeCall();socket?.disconnect?.();clearInterval(clock);});
 window.addEventListener('pageshow',event=>{if(event.persisted){disposed=false;startClock();socket?.connect?.();if(selectionPending&&wantedMovieId)loadLobbyMovie(wantedMovieId);loadFeaturedMovies();}});
 profile();setupReturnLink();updateConnection();if(app.dataset.selectedMovieId)loadLobbyMovie(app.dataset.selectedMovieId);loadFeaturedMovies();loadPermissions().then(()=>{switchTab(app.dataset.initialTab==='rooms'?'rooms':'chat');const id=app.dataset.roomId;if(id){if(connected())joinInvite(id);else pendingInvite=id;}else if(app.dataset.initialTab!=='rooms')joinRoom(new URLSearchParams(location.search).get('room')||'channel-general');if(app.dataset.denied)toast('Hosting is unavailable here. You can still join a party.',true);});renderRooms();
 window.SwiflySocial=Object.freeze({switchTab,joinRoom,renderRooms,openNativeWatchRoom,permissions:()=>({...permissions})});
})();
