/* SwiflyTV playback: one media element, bounded lookup, local controls. */
(() => {
  'use strict';
  if (window.SwiflyPlayer) return;
  const instances=new WeakMap();
  let defaultPlayer=null;
  function mount(app,options={}) {
    if (!app?.isConnected || app.dataset.playerMode === 'trailer') return null;
    if(instances.has(app))return instances.get(app);
    const find = name => app.querySelector('[data-player-' + name + ']');
    const stage = find('stage');
    let video = find('video');
    if (!stage || !video || !find('controls') || !find('transport-note')) return null;
    const controls = find('controls'), statusPanel = find('status');
    const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    function deadlineForSnapshot(data,fallback) {
      if(data?.deadlineAt==null)return fallback;
      const deadline=number(data.deadlineAt,NaN);if(!Number.isFinite(deadline))return fallback;
      const serverTime=data.serverTime==null?NaN:number(data.serverTime,NaN);
      return Number.isFinite(serverTime)?Date.now()+Math.max(0,deadline-serverTime):deadline;
    }
    const limit = (name, fallback, max) => Math.max(1, Math.min(max, number(app.dataset[name],fallback)));
    const config = {
      resolve:limit('playerResolveTimeoutMs',90000,90000),request:limit('playerRequestTimeoutMs',12000,15000),
      stall:limit('playerStallTimeoutMs',25000,45000),library:limit('playerLibraryTimeoutMs',12000,15000),
      pollMin:limit('playerPollMinMs',400,2500),pollMax:limit('playerPollMaxMs',2000,5000),
      controls:limit('playerControlsTimeoutMs',2600,10000)
    };
    let destroyed=false, suspended=false, generation=0, resolverGeneration=0, transportIntent=0;
    let managed=options.managed ?? (app.dataset.playerManaged==='true'), remoteMode={enabled:managed,isHost:options.isHost ?? true,manual:false};
    let phase=managed?'waiting':'loading', playable=false, source='', sourceData=null, mediaId=app.dataset.playerId, mediaType=app.dataset.playerType;
    const mediaName = () => mediaType==='tv'?'episode':'movie';
    let hls=null,dash=null,pendingPlay=false,unlockRemote=true,resumeAt=0,retryResume=0,stallTimer=0,toastTimer=0,lookupDeadline=0,loadingKey='';
    let lastTime=0,lastBuffer=0,hlsRecovery={network:0,media:0},controlsTimer=0,scrubbing=false,scrubTime=0;
    const tasks=new Set(),listeners=[],mediaListeners=[],libraryListeners=[];
    const alive = token => !destroyed && !suspended && app.isConnected && video.isConnected && token===generation;
    const locked = () => remoteMode.enabled && !remoteMode.isHost;
    const listen = (node,name,fn,bucket=listeners) => {node?.addEventListener(name,fn);bucket.push(()=>node?.removeEventListener(name,fn));};
    const clearListeners = bucket => {for(const remove of bucket.splice(0))remove();};
    function revealSelectedEpisode() {
      if(destroyed||suspended||!app.isConnected)return;
      for(const [selector,containerSelector,horizontal] of [
        ['[data-player-episode-link][aria-current="page"]','.svPlayerEpisodeGrid',false],
        ['[data-player-season-link][aria-current="true"]','.svPlayerSeasons',true]
      ]) {
        const selected=app.querySelector(selector),container=selected?.closest(containerSelector);if(!container)continue;
        const item=selected.getBoundingClientRect(),box=container.getBoundingClientRect();
        if(horizontal){if(item.left<box.left||item.right>box.right)container.scrollLeft+=item.left-box.left-(box.width-item.width)/2;}
        else if(item.top<box.top||item.bottom>box.bottom)container.scrollTop+=item.top-box.top-(box.height-item.height)/2;
      }
    }
    const dispatch = (name,detail) => {if(!destroyed&&app.isConnected)app.dispatchEvent(new CustomEvent('swiflyplayer:'+name,{bubbles:true,detail}));};
    const format = seconds => {const value=Math.max(0,Math.floor(number(seconds,0)));const hours=Math.floor(value/3600),minutes=Math.floor(value%3600/60),secs=value%60;return (hours?hours+':'+String(minutes).padStart(2,'0'):String(minutes))+':'+String(secs).padStart(2,'0');};
    const discoveryMessage = data => ({
      browser_unavailable:'The playback service could not start. The site owner needs to check its browser installation.',
      provider_blocked:'The video source rejected the request. Please try again later.',
      no_source:'The video sources returned no playable '+mediaName()+'. Please try again later.',
      busy:'Other '+mediaName()+'s are getting ready. Please try again shortly.',
      timeout:'The '+mediaName()+' took too long to become available. Try again in a moment.'
    }[data?.code] || 'The '+mediaName()+' is unavailable right now. Try again in a moment.');
    const cancelTasks = category => {for(const task of [...tasks])if(!category||task.category===category)task.cancel();};
    function getState() {
      return {currentTime:number(video?.currentTime,0),paused:phase==='ended'||phase==='error'||!video||video.paused,duration:video?.duration===Infinity?Infinity:number(video?.duration,0),ready:playable&&!destroyed&&!suspended,source,mediaId,type:mediaType,status:phase};
    }
    const emitState = () => dispatch('state',getState());
    function controlsPinned() {
      return phase!=='ready'||!playable||video.paused||video.seeking||scrubbing||!find('unlock').hidden||controls.contains(document.activeElement)||!!stage.querySelector('details[open]');
    }
    function updateVisibility({reveal=false}={}) {
      if(destroyed||suspended)return;
      if(reveal||controlsPinned()){clearTimeout(controlsTimer);controlsTimer=0;app.dataset.playerControlsVisibility='visible';}
      if(!controlsPinned()&&app.dataset.playerControlsVisibility!=='hidden'&&!controlsTimer){
        const token=generation;controlsTimer=setTimeout(()=>{controlsTimer=0;if(!alive(token))return;if(controlsPinned())updateVisibility();else app.dataset.playerControlsVisibility='hidden';},config.controls);
      }
    }
    function showToast(message) {
      const node=find('toast');clearTimeout(toastTimer);node.textContent=message;node.hidden=false;
      const token=generation;toastTimer=setTimeout(()=>{if(alive(token))node.hidden=true;toastTimer=0;},4000);
    }
    function range() {
      if (Number.isFinite(video.duration) && video.duration>0) return {start:0,end:video.duration,live:false};
      try {if(video.seekable.length){const i=video.seekable.length-1;const start=video.seekable.start(i),end=video.seekable.end(i);if(end>start)return {start,end,live:true};}} catch {}
      return null;
    }
    function bufferedEnd() {
      let end=0;try {for(let i=0;i<video.buffered.length;i++)end=Math.max(end,video.buffered.end(i));}catch{}return end;
    }
    function updateTime() {
      const bounds=range(),time=scrubbing?scrubTime:number(video.currentTime,0),seek=find('seek');
      find('current').textContent=format(time);
      find('duration').textContent=bounds?.live?'Live':Number.isFinite(video.duration)&&video.duration>0?format(video.duration):'—';
      seek.min=String(bounds?.start||0);seek.max=String(bounds?.end||0);seek.value=String(bounds?Math.max(bounds.start,Math.min(bounds.end,time)):0);
      seek.setAttribute('aria-valuetext',format(time)+(bounds?.live?' in live window':bounds?' of '+format(bounds.end):''));
      seek.disabled=!playable||locked()||!bounds;
      const width=bounds?bounds.end-bounds.start:0;
      find('progress').style.width=(width?Math.max(0,Math.min(100,(time-bounds.start)/width*100)):0)+'%';
      find('buffered').style.width=(width?Math.max(0,Math.min(100,(bufferedEnd()-bounds.start)/width*100)):0)+'%';
    }
    function updateControls() {
      const paused=getState().paused,play=find('play');
      const label=(phase==='ended'?'Replay ':paused?'Play ':'Pause ')+mediaName();
      play.setAttribute('aria-label',label);play.title=label;play.dataset.paused=String(paused);
      stage.setAttribute('aria-label',mediaType==='tv'?'Episode player':'Movie player');find('seek').setAttribute('aria-label','Seek through '+mediaName());
      play.querySelector('.svPlayerIcon path')?.setAttribute('d',paused?'m9 5 11 7-11 7V5Z':'M8 5v14M16 5v14');
      for(const name of ['play','backward','forward'])find(name).disabled=!playable||locked();
      find('retry').disabled=locked();find('speed').disabled=remoteMode.enabled;
      find('volume').value=String(video.muted?0:video.volume);
      const mute=find('mute'),muteLabel=(video.muted?'Unmute ':'Mute ')+mediaName();mute.setAttribute('aria-label',muteLabel);mute.title=muteLabel;mute.setAttribute('aria-pressed',String(video.muted));
      const volumeButton=find('volume-menu').querySelector('summary');volumeButton.setAttribute('aria-label',video.muted||video.volume===0?'Volume, muted':'Volume, '+Math.round(video.volume*100)+' percent');volumeButton.querySelector('path').setAttribute('d',video.muted||video.volume===0?'M11 4 6 8H3v8h3l5 4V4Zm5 5 6 6m0-6-6 6':'M11 4 6 8H3v8h3l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14');
      find('transport-note').textContent=remoteMode.enabled?(locked()?'Your host controls playback. Your volume and captions are yours.':'You control playback for everyone in this party.'):remoteMode.manual?'Link playback is manual. Play and seek locally; this video is not synchronized.':'Settle in. The rest can wait.';
      const syncButton=find('sync');if(syncButton)syncButton.hidden=!remoteMode.enabled;
      app.dataset.playerRemote=remoteMode.enabled?'true':'false';app.dataset.playerHost=remoteMode.isHost?'true':'false';updateTime();updateVisibility();
    }
    function setStatus(next,title,copy) {
      phase=next;app.dataset.playerState=next;
      const visible=['loading','waiting','buffering','error'].includes(next);
      statusPanel.hidden=!visible;stage.setAttribute('aria-busy',String(next==='loading'||next==='buffering'));
      find('status-title').textContent=title||({loading:'Getting your '+mediaName()+' ready',waiting:'Waiting for your party',buffering:'Buffering…',error:'This '+mediaName()+' couldn’t start.'}[next]||'');
      find('status-copy').textContent=copy||({loading:'Making your seat comfortable. This should only take a moment.',waiting:'Your host will choose when to start.',buffering:'Playback will continue as soon as the next scene is ready.'}[next]||'');
      find('status-label').textContent=next==='error'?'PLAYBACK UNAVAILABLE':next==='buffering'?'ONE MOMENT':mediaType==='tv'?'YOUR EPISODE':'YOUR MOVIE NIGHT';
      find('retry').hidden=next!=='error';updateControls();emitState();
    }
    function stopWatchdog() {clearTimeout(stallTimer);stallTimer=0;}
    function watchProgress({renew=false,delay=config.stall}={}) {
      if(stallTimer&&!renew)return;
      stopWatchdog();const token=generation;stallTimer=setTimeout(()=>{stallTimer=0;if(alive(token))fail('Playback stopped responding. Check your connection, then try again.');},Math.max(1,delay));
    }
    function cancelResolver() {resolverGeneration++;cancelTasks('resolver');lookupDeadline=0;}
    function teardownMedia({replace=false}={}) {
      for(const node of stage.querySelectorAll('details[open]'))closeMenu(node);
      generation++;transportIntent++;stopWatchdog();clearTimeout(controlsTimer);controlsTimer=0;scrubbing=false;app.dataset.playerControlsVisibility='visible';clearTimeout(toastTimer);toastTimer=0;find('toast').hidden=true;
      find('unlock').hidden=true;
      cancelTasks('library');clearListeners(mediaListeners);clearListeners(libraryListeners);
      try {hls?.destroy();}catch{}try {if(dash?.destroy)dash.destroy();else dash?.reset();}catch{}hls=null;dash=null;
      const old=video,volume=old.volume,muted=old.muted,rate=old.playbackRate;
      try {old.pause();old.removeAttribute('src');old.load();}catch{}
      playable=false;pendingPlay=false;
      if(replace){video=old.cloneNode(false);video.controls=false;video.volume=volume;video.muted=muted;video.playbackRate=rate;old.replaceWith(video);}
      updateControls();
    }
    function fail(message, sourceCode='') {
      if(destroyed||suspended)return;
      retryResume=number(video.currentTime,0);cancelResolver();teardownMedia();
      sourceData=null;
      // Show a safe, actionable reason without leaking any provider URL,
      // headers, cookies or internal scraping diagnostics.
      const known=['browser_unavailable','provider_blocked','no_source','unavailable','busy','timeout'];
      const code=known.includes(sourceCode)?sourceCode:'playback_error';
      app.dataset.playerFailureCode=code;
      setStatus('error','This '+mediaName()+' couldn’t start.',message||'The '+mediaName()+' is unavailable right now. Try again in a moment.');
      find('status-label').textContent='PLAYBACK UNAVAILABLE · '+code.replaceAll('_',' ').toUpperCase();
      dispatch('source-failure',{code,mediaType,hasPlayableSource:Boolean(source)});
    }
    function safeUrl(value) {
      const text=String(value||'').trim();if(!text||/[\u0000-\u001f]/.test(text))return '';
      try {const url=new URL(text,location.href);return ['http:','https:'].includes(url.protocol)?text:'';}catch{return '';}
    }
    function chooseSource(data) {
      // The server-selected URL may carry required proxying/authentication.
      for(const name of ['playbackUrl','hlsProxyUrl','embeddedM3u8Url','proxyVideo','m3u8','url']){const value=safeUrl(data?.[name]);if(value)return value;}return '';
    }
    function mediaKind(url,data) {
      const path=new URL(url,location.href).pathname.toLowerCase();
      if(/\.mpd$/.test(path))return 'dash';if(/\.m3u8$/.test(path))return 'hls';
      if(/\.(mp4|webm|mov|m4v|ogv|ogg|mkv|avi|mp3|m4a|wav|flac)$/.test(path))return 'native';
      if(/dash|mpd/i.test(String(data.streamType||data.streamMode||data.format||'')))return 'dash';
      if(/hls|m3u8/i.test(String(data.streamType||data.streamMode||data.format||''))||data.isHls||data.forceHls)return 'hls';return 'native';
    }
    function loadLibrary(kind) {
      if(kind==='hls'&&window.Hls)return Promise.resolve(window.Hls);
      if(kind==='dash'&&window.dashjs?.MediaPlayer)return Promise.resolve(window.dashjs);
      return new Promise((resolve,reject)=>{
        const script=document.createElement('script');script.dataset.playerLibrary=kind;script.async=true;
        script.src=kind==='hls'?'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js':'https://cdn.jsdelivr.net/npm/dashjs@4.7.4/dist/dash.all.min.js';
        let timer=0,settled=false;
        const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);script.onload=null;script.onerror=null;script.remove();tasks.delete(task);if(error)reject(error);else resolve(value);};
        const task={category:'library',cancel:()=>finish(new Error('cancelled'))};tasks.add(task);
        script.onload=()=>{const value=kind==='hls'?window.Hls:window.dashjs;if(!value)finish(new Error('library unavailable'));else finish(null,value);};
        script.onerror=()=>finish(new Error('library unavailable'));timer=setTimeout(()=>finish(new Error('library timeout')),config.library);document.head.append(script);
      });
    }
    function updateQuality() {
      const select=find('quality'),selected=select.value;let levels=[];
      try {levels=hls?.levels||dash?.getBitrateInfoListFor('video')||[];}catch{}
      select.replaceChildren();
      const option=(value,label)=>{const node=document.createElement('option');node.value=String(value);node.textContent=label;select.append(node);};
      option(-1,levels.length?'Auto':'Original');levels.forEach((level,index)=>option(level.qualityIndex??index,level.height?level.height+'p':level.bitrate?Math.round(level.bitrate/1000)+' kbps':'Quality '+(index+1)));
      select.disabled=levels.length<2;if([...select.options].some(item=>item.value===selected))select.value=selected;
    }
    function updateCaptions() {
      const select=find('captions'),selected=select.value;let tracks=[];
      try {tracks=hls?.subtitleTracks?.length?hls.subtitleTracks:dash?.getTracksFor('text')||Array.from(video.textTracks||[]);}catch{}
      if(!tracks.length)tracks=Array.from(video.querySelectorAll('track')).map(node=>({label:node.label,language:node.srclang}));
      select.replaceChildren();const off=document.createElement('option');off.value='-1';off.textContent=tracks.length?'Off':'Unavailable';select.append(off);
      tracks.forEach((track,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=track.label||track.name||track.lang||track.language||'Captions '+(index+1);select.append(option);});select.disabled=!tracks.length;
      if([...select.options].some(item=>item.value===selected))select.value=selected;
    }
    function addCaptions(data) {
      const tracks=Array.isArray(data.subtitles)?data.subtitles:Array.isArray(data.captions)?data.captions:[];
      for(const [index,item] of tracks.entries()){const url=safeUrl(item.url||item.src||item.file);if(!url)continue;const track=document.createElement('track');track.kind='subtitles';track.src=url;track.srclang=String(item.language||item.lang||'');track.label=String(item.label||item.name||item.language||'Captions '+(index+1));video.append(track);}
      updateCaptions();
    }
    function applyResume() {
      if(resumeAt>0&&video.readyState>=1){const bounds=range();if(!bounds)return;try {video.currentTime=Math.max(bounds.start,Math.min(bounds.end,resumeAt));resumeAt=0;}catch{}}
    }
    function bindMedia(token) {
      const current=video,guard=fn=>event=>{if(alive(token)&&video===current)fn(event);};
      listen(current,'loadedmetadata',guard(()=>{applyResume();updateTime();updateCaptions();}),mediaListeners);
      listen(current,'durationchange',guard(()=>{applyResume();updateTime();}),mediaListeners);
      const canPlay=guard(()=>{
        if(current.readyState<2)return;const first=!playable;playable=true;applyResume();if(first||current.paused)stopWatchdog();
        setStatus('ready');if(first)dispatch('ready',getState());
        if(pendingPlay){pendingPlay=false;play({remote:true});}else if(!current.paused)watchProgress();
      });
      listen(current,'canplay',canPlay,mediaListeners);listen(current,'playing',canPlay,mediaListeners);
      listen(current,'play',guard(()=>{updateControls();if(playable)watchProgress();emitState();}),mediaListeners);
      listen(current,'pause',guard(()=>{if(playable)stopWatchdog();if(playable&&phase!=='ended')setStatus('ready');else updateControls();emitState();}),mediaListeners);
      listen(current,'ended',guard(()=>{stopWatchdog();try{current.pause();}catch{}setStatus('ended');}),mediaListeners);
      const waiting=guard(event=>{
        if(playable){
          // A download stall can occur while buffered video is still playing.
          if(current.paused||current.ended||(event.type==='stalled'&&current.readyState>=3))return;
          lastTime=number(current.currentTime,0);setStatus('buffering');
        }
        watchProgress();
      });
      listen(current,'waiting',waiting,mediaListeners);listen(current,'stalled',waiting,mediaListeners);
      listen(current,'seeking',guard(()=>{if(playable){setStatus('buffering');watchProgress();}}),mediaListeners);
      listen(current,'seeked',guard(()=>{if(playable&&current.readyState>=2){setStatus('ready');if(current.paused)stopWatchdog();else watchProgress();}updateTime();emitState();}),mediaListeners);
      listen(current,'timeupdate',guard(()=>{
        const time=number(current.currentTime,0),advance=time-lastTime;
        if(Math.abs(advance)>.1){
          lastTime=time;if(!current.paused||phase==='buffering')watchProgress({renew:true});
          if(playable&&!current.paused&&!current.seeking&&advance>.1&&phase==='buffering')setStatus('ready');
        }
        updateTime();emitState();
      }),mediaListeners);
      listen(current,'progress',guard(()=>{const end=bufferedEnd();if(end>lastBuffer+.1){lastBuffer=end;if(stallTimer)watchProgress({renew:true});}updateTime();}),mediaListeners);
      listen(current,'volumechange',guard(updateControls),mediaListeners);
      listen(current,'ratechange',guard(()=>{find('speed').value=String(current.playbackRate);emitState();}),mediaListeners);
      listen(current,'error',guard(()=>{const code=current.error?.code;if(code===1)return;fail(code===3||code===4?'This browser could not play the '+mediaName()+'’s format. Try another browser, or retry playback.':'The '+mediaName()+' connection was interrupted. Check your connection, then try again.');}),mediaListeners);
      if(current.textTracks?.addEventListener)listen(current.textTracks,'addtrack',guard(updateCaptions),mediaListeners);
    }
    async function loadSource(data,{resumeAt:position=0}={}) {
      if(destroyed||suspended)return false;
      if(data?.status==='loading'){
        const nextId=String(data.movieId||data.mediaId||mediaId),nextType=data.type==='tv'?'tv':data.type==='movie'?'movie':mediaType;
        const key=String(data.jobId||nextId+':'+nextType);if(phase==='loading'&&loadingKey===key)return false;
        cancelResolver();teardownMedia({replace:true});source='';sourceData=null;loadingKey=key;mediaId=nextId;mediaType=nextType;setStatus('loading');
        const deadline=deadlineForSnapshot(data,Date.now()+config.resolve);watchProgress({delay:Math.min(config.resolve,Math.max(1,deadline-Date.now()))});return false;
      }
      if(['error','disabled','idle'].includes(data?.status)){mediaId=String(data.movieId||data.mediaId||mediaId);mediaType=data.type==='tv'?'tv':data.type==='movie'?'movie':mediaType;fail(discoveryMessage(data),data?.code);return false;}
      const next=chooseSource(data);
      if(!next){fail('The '+mediaName()+' is unavailable right now. Try again in a moment.');return false;}
      const nextId=String(data.movieId||data.mediaId||mediaId),nextType=data.type==='tv'?'tv':data.type==='movie'?'movie':mediaType;
      if(next===source&&nextId===mediaId&&nextType===mediaType&&sourceData&&phase!=='error'){
        if(position>0)seek(position,{remote:true});return true;
      }
      cancelResolver();teardownMedia({replace:true});source=next;sourceData={...data};mediaId=nextId;mediaType=nextType;loadingKey='';
      resumeAt=Math.max(0,number(position,0));lastTime=0;lastBuffer=0;hlsRecovery={network:0,media:0};
      const token=generation;setStatus('loading');bindMedia(token);addCaptions(data);updateQuality();watchProgress();
      const kind=mediaKind(next,data);
      try {
        if(kind==='hls'){
          if(video.canPlayType('application/vnd.apple.mpegurl')){video.src=next;video.load();return true;}
          const Hls=await loadLibrary('hls');if(!alive(token))return false;
          if(!Hls.isSupported())throw new Error('unsupported');
          hls=new Hls({enableWorker:true,maxBufferLength:30,manifestLoadingTimeOut:config.request,manifestLoadingMaxRetry:1,levelLoadingTimeOut:config.request,levelLoadingMaxRetry:1,fragLoadingTimeOut:config.request,fragLoadingMaxRetry:1});
          const instance=hls,subscribe=(name,fn)=>{if(!name)return;const callback=(event,payload)=>{if(alive(token)&&hls===instance)fn(payload||{});};instance.on(name,callback);libraryListeners.push(()=>instance.off?.(name,callback));};
          subscribe(Hls.Events.MANIFEST_PARSED,()=>{updateQuality();updateCaptions();});subscribe(Hls.Events.LEVEL_SWITCHED,updateQuality);subscribe(Hls.Events.SUBTITLE_TRACKS_UPDATED,updateCaptions);
          subscribe(Hls.Events.ERROR,error=>{
            if(!error.fatal)return;
            if(error.type===Hls.ErrorTypes.MEDIA_ERROR&&hlsRecovery.media++===0){setStatus('buffering');instance.recoverMediaError();watchProgress();return;}
            if(error.type===Hls.ErrorTypes.NETWORK_ERROR&&hlsRecovery.network++===0){setStatus('buffering');instance.startLoad();watchProgress();return;}
            fail(error.type===Hls.ErrorTypes.MEDIA_ERROR?'This browser could not play the '+mediaName()+'’s format. Try another browser, or retry playback.':'The '+mediaName()+' connection was interrupted. Check your connection, then try again.');
          });
          instance.loadSource(next);instance.attachMedia(video);
        }else if(kind==='dash'){
          const library=await loadLibrary('dash');if(!alive(token))return false;
          dash=library.MediaPlayer().create();const instance=dash,events=library.MediaPlayer.events||{};
          const subscribe=(name,fn)=>{if(!name)return;const callback=event=>{if(alive(token)&&dash===instance)fn(event);};instance.on(name,callback);libraryListeners.push(()=>instance.off?.(name,callback));};
          subscribe(events.STREAM_INITIALIZED,()=>{updateQuality();updateCaptions();});subscribe(events.TEXT_TRACKS_ADDED,updateCaptions);subscribe(events.ERROR,()=>fail('The '+mediaName()+' could not load. Check your connection, then retry playback.'));
          instance.initialize(video,next,false);
        }else {video.src=next;video.load();}
        return true;
      } catch(error) {
        if(alive(token))fail(error.message==='unsupported'?'This browser does not support this '+mediaName()+' format. Try another browser.':'Playback could not load. Check your connection or browser blockers, then try again.');return false;
      }
    }
    function requestJson(url,timeout) {
      return new Promise((resolve,reject)=>{
        const controller=new AbortController();let settled=false,timer=0;
        const finish=(error,data)=>{if(settled)return;settled=true;clearTimeout(timer);tasks.delete(task);if(error)reject(error);else resolve(data);};
        const task={category:'resolver',cancel:()=>{controller.abort();finish(new Error('cancelled'));}};tasks.add(task);
        timer=setTimeout(()=>{controller.abort();finish(new Error('timeout'));},Math.max(1,timeout));
        Promise.resolve().then(()=>fetch(url,{signal:controller.signal,cache:'no-store',headers:{Accept:'application/json'}})).then(async response=>{
          if(!response.ok)throw new Error('response');const data=await response.json();finish(null,data);
        }).catch(error=>finish(error));
      });
    }
    function waitPoll(delay) {
      return new Promise(resolve=>{let timer=0;const done=value=>{clearTimeout(timer);tasks.delete(task);resolve(value);};const task={category:'resolver',cancel:()=>done(false)};tasks.add(task);timer=setTimeout(()=>done(true),delay);});
    }
    async function resolve({retry=false}={}) {
      if(destroyed||suspended)return false;
      if(managed||remoteMode.enabled){if(retry&&!locked())dispatch('retry',{mediaId,type:mediaType});return false;}
      cancelResolver();teardownMedia({replace:true});source='';sourceData=null;loadingKey='';delete app.dataset.playerFailureCode;setStatus('loading');
      const token=resolverGeneration;lookupDeadline=Date.now()+config.resolve;let first=true,transportFailures=0,busyCount=0,providerRetries=0;
      const query=new URLSearchParams();if(mediaType==='tv'){query.set('season',app.dataset.playerSeason||'1');query.set('episode',app.dataset.playerEpisode||'1');}if(app.dataset.playerProvider)query.set('provider',app.dataset.playerProvider);
      const endpoint='/api/proxy-video-wait/'+encodeURIComponent(mediaType)+'/'+encodeURIComponent(mediaId);
      while(!destroyed&&!suspended&&app.isConnected&&token===resolverGeneration){
        if(Date.now()>=lookupDeadline){fail('The '+mediaName()+' took too long to become available. Try again in a moment.');return false;}
        const requestQuery=new URLSearchParams(query);if(retry&&first)requestQuery.set('retry','1');first=false;
        try {
          const waitMs=Math.max(0,Math.min(8000,config.request-1000,lookupDeadline-Date.now()-1000));
          if(waitMs>0)requestQuery.set('wait',String(Math.floor(waitMs)));
          const queryText=requestQuery.toString();
          const data=await requestJson(endpoint+(queryText?'?'+queryText:''),Math.min(config.request,lookupDeadline-Date.now()));
          if(destroyed||suspended||token!==resolverGeneration||!app.isConnected)return false;
          transportFailures=0;
          if(data?.status==='ok'||data?.status==='ready')return loadSource(data,{resumeAt:retry?retryResume:0});
          if(data?.status==='error'&&data.code==='busy'&&busyCount++<8){
            if(!await waitPoll(Math.min(number(data.retryAfterMs,1500),lookupDeadline-Date.now())))return false;
            continue;
          }
          if(data?.status==='error'&&['no_source','unavailable','provider_blocked','timeout'].includes(data.code)
             &&providerRetries++<1&&lookupDeadline-Date.now()>7000){
            retry=true;first=true;
            if(!await waitPoll(1000))return false;
            continue;
          }
          if(data?.status!=='loading'){fail(discoveryMessage(data),data?.code);return false;}
          const serverDeadline=deadlineForSnapshot(data,lookupDeadline);lookupDeadline=Math.min(lookupDeadline,serverDeadline);
          const remaining=lookupDeadline-Date.now();if(remaining<=0){fail('The '+mediaName()+' took too long to become available. Try again in a moment.');return false;}
          const interval=Math.min(config.pollMax,Math.max(config.pollMin,number(data.retryAfterMs,700)));if(!await waitPoll(Math.min(interval,remaining)))return false;
        }catch(error){
          if(token!==resolverGeneration||destroyed||suspended)return false;
          // Losing one long-poll connection must not discard the shared server job.
          if(++transportFailures<=4 && lookupDeadline-Date.now()>1500){
            const pause=Math.min(2500,350*2**(transportFailures-1));
            if(!await waitPoll(pause))return false;
            continue;
          }
          fail('The '+mediaName()+' connection did not respond. Check your connection, then try again.');return false;
        }
      }return false;
    }
    async function play({remote=false}={}) {
      if(destroyed||suspended||!source||(!remote&&locked()))return false;
      if(!playable){if(remote)pendingPlay=true;return false;}
      const token=generation,current=video,intent=++transportIntent;
      if(phase==='ended'){try{current.currentTime=range()?.start||0;}catch{}}
      try {await current.play();if(!alive(token)||video!==current||intent!==transportIntent||(!remote&&locked()))return false;find('unlock').hidden=true;clearTimeout(toastTimer);toastTimer=0;find('toast').hidden=true;if(!remote)dispatch('action',{action:'play',time:number(current.currentTime,0)});updateControls();return true;}
      catch(error){if(!alive(token)||intent!==transportIntent)return false;if(error?.name==='NotAllowedError'){unlockRemote=remote;find('unlock').querySelector('span').textContent=remoteMode.enabled&&remote?'Join playback':'Play '+mediaName();find('unlock').hidden=false;stopWatchdog();setStatus('ready');}else if(error?.name!=='AbortError')fail('Playback could not begin. Try again in a moment.');return false;}
    }
    function pause({remote=false}={}) {
      if(destroyed||suspended||(!remote&&locked()))return false;transportIntent++;pendingPlay=false;find('unlock').hidden=true;const changed=!getState().paused;video.pause();if(playable)stopWatchdog();updateControls();if(changed&&!remote)dispatch('action',{action:'pause',time:number(video.currentTime,0)});return true;
    }
    function seek(seconds,{remote=false}={}) {
      if(destroyed||suspended||!Number.isFinite(Number(seconds))||(!remote&&locked()))return false;
      if(!playable){if(remote&&source){resumeAt=Math.max(0,Number(seconds));return true;}return false;}
      const bounds=range();if(!bounds)return false;const time=Math.max(bounds.start,Math.min(bounds.end,Number(seconds)));
      const before=number(video.currentTime,0);try {video.currentTime=time;}catch{return false;}lastTime=time;updateTime();if(!video.paused)watchProgress({renew:Math.abs(time-before)>.1});if(!remote)dispatch('action',{action:'set',time});emitState();return true;
    }
    function setRemoteMode({enabled=false,isHost=false,manual=false}={}) {
      if(destroyed)return;const entered=enabled&&!remoteMode.enabled;remoteMode={enabled:!!enabled,isHost:!!isHost,manual:!!manual};managed=!!enabled||!!manual;app.dataset.playerManaged=String(managed);
      if(entered){cancelResolver();if(!source){stopWatchdog();setStatus('waiting');}}
      if(enabled){video.playbackRate=1;find('speed').value='1';}if(locked())scrubbing=false;updateControls();emitState();
    }
    async function fullscreen() {
      try {if(document.fullscreenElement)await document.exitFullscreen();else if(stage.requestFullscreen)await stage.requestFullscreen();else if(video.webkitEnterFullscreen)video.webkitEnterFullscreen();}catch{showToast('Fullscreen is unavailable in this browser.');}
    }
    async function pictureInPicture() {
      try {if(document.pictureInPictureElement)await document.exitPictureInPicture();else if(playable&&video.requestPictureInPicture)await video.requestPictureInPicture();}catch{showToast('Picture in picture is unavailable for this '+mediaName()+'.');}
    }
    function keyboard(event) {
      if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||!stage.contains(event.target)||document.querySelector('dialog[open]'))return;
      if(event.key==='Escape'){const open=stage.querySelectorAll('details[open]');if(open.length){open.forEach(node=>{closeMenu(node);node.querySelector('summary')?.focus();});event.preventDefault();}return;}
      if(event.target.closest('input,select,textarea,button,a,summary,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="menu"]')||stage.querySelector('details[open]'))return;
      const key=event.key.toLowerCase();if(['k',' ','j','l','arrowleft','arrowright'].includes(key)&&locked())return;
      if(key==='k'||key===' '){event.preventDefault();getState().paused?play():pause();}
      else if(key==='j'||key==='arrowleft'){event.preventDefault();seek(number(video.currentTime,0)-10);}
      else if(key==='l'||key==='arrowright'){event.preventDefault();seek(number(video.currentTime,0)+10);}
      else if(key==='m'){event.preventDefault();video.muted=!video.muted;updateControls();}
      else if(key==='f'){event.preventDefault();fullscreen();}
    }
    function destroy() {
      if(destroyed)return;cancelResolver();teardownMedia();cancelTasks();clearListeners(listeners);destroyed=true;instances.delete(app);sourceData=null;video.controls=true;controls.hidden=true;emitState();
    }
    const api=Object.freeze({loadSource,resolve,retry:()=>resolve({retry:true}),getState,play,pause,seek,setRemoteMode,destroy});
    instances.set(app,api);
    listen(find('play'),'click',()=>getState().paused?play():pause());
    listen(find('backward'),'click',()=>seek(number(video.currentTime,0)-10));listen(find('forward'),'click',()=>seek(number(video.currentTime,0)+10));
    listen(find('seek'),'input',event=>{if(locked())return;scrubbing=true;scrubTime=Number(event.target.value);updateTime();updateVisibility({reveal:true});});
    listen(find('seek'),'change',event=>{const value=Number(event.target.value);scrubbing=false;seek(value);updateTime();updateVisibility({reveal:true});});
    listen(find('seek'),'pointercancel',()=>{scrubbing=false;updateTime();updateVisibility({reveal:true});});
    listen(find('retry'),'click',()=>{if(!locked())resolve({retry:true});});
    listen(find('settings-close'),'click',()=>{closeMenu(find('settings'));find('settings').querySelector('summary').focus();});
    listen(find('volume-close'),'click',()=>{closeMenu(find('volume-menu'));find('volume-menu').querySelector('summary').focus();});
    listen(find('sync'),'click',()=>{dispatch('sync',getState());closeMenu(find('settings'));find('settings').querySelector('summary').focus();});
    listen(find('unlock'),'click',()=>play({remote:unlockRemote}));
    listen(find('volume'),'input',event=>{video.volume=Math.max(0,Math.min(1,Number(event.target.value)));video.muted=video.volume===0;updateControls();});
    listen(find('mute'),'click',()=>{video.muted=!video.muted;updateControls();});
    listen(find('speed'),'change',event=>{if(remoteMode.enabled)return;video.playbackRate=Number(event.target.value);});
    listen(find('quality'),'change',event=>{const quality=Number(event.target.value);try{if(hls)hls.currentLevel=quality;if(dash){dash.updateSettings({streaming:{abr:{autoSwitchBitrate:{video:quality<0}}}});if(quality>=0)dash.setQualityFor('video',quality,true);}}catch{showToast('That picture quality is unavailable.');}});
    listen(find('captions'),'change',event=>{const selected=Number(event.target.value);try{if(hls?.subtitleTracks?.length){hls.subtitleTrack=selected;hls.subtitleDisplay=selected>=0;}else if(dash)dash.setTextTrack(selected);else Array.from(video.textTracks||[]).forEach((track,index)=>track.mode=index===selected?'showing':'disabled');}catch{showToast('These captions are unavailable.');}});
    listen(find('fullscreen'),'click',fullscreen);listen(find('pip'),'click',()=>{pictureInPicture();closeMenu(find('settings'));find('settings').querySelector('summary').focus();});listen(app,'keydown',event=>{updateVisibility({reveal:true});keyboard(event);});
    listen(stage,'pointermove',()=>updateVisibility({reveal:true}));listen(stage,'pointerdown',()=>updateVisibility({reveal:true}));
    listen(stage,'focusin',()=>updateVisibility({reveal:true}));listen(stage,'focusout',()=>{const token=generation;queueMicrotask(()=>{if(alive(token))updateVisibility();});});
    listen(stage,'click',event=>{if(event.target===video||event.target===stage){stage.focus({preventScroll:true});if(playable&&!locked())getState().paused?play():pause();}});
    function closeMenu(node) {
      node.open=false;try{node.querySelector('[popover]')?.hidePopover?.();}catch{}
    }
    function positionMenu(node) {
      const body=node.querySelector('[popover]');if(!node.open||!body)return;
      const anchor=node.querySelector('summary').getBoundingClientRect();
      if(body.showPopover){
        body.style.setProperty('--player-menu-left',Math.max(12,Math.min(window.innerWidth-body.offsetWidth-12,anchor.right-body.offsetWidth))+'px');
        body.style.setProperty('--player-menu-top',Math.max(12,Math.min(window.innerHeight-body.offsetHeight-12,anchor.top-body.offsetHeight-20))+'px');
        return;
      }
      // Older engines keep the same reachable sheet. Calibrate against the
      // actual containing block created by glass/containment, including embeds.
      body.dataset.playerMenuFallback='true';
      const compact=stage.clientWidth<=560,width=Math.min(compact?360:300,window.innerWidth-32);
      Object.assign(body.style,{position:'fixed',inset:'auto',left:'0px',top:'0px',right:'auto',bottom:'auto',width:width+'px',maxWidth:'none',maxHeight:Math.max(100,window.innerHeight-132)+'px',margin:'0',animation:'none'});
      const origin=body.getBoundingClientRect(),height=body.offsetHeight;
      const left=compact?(window.innerWidth-width)/2:Math.max(12,Math.min(window.innerWidth-width-12,anchor.right-width));
      const top=compact?Math.max(12,window.innerHeight-height-(document.fullscreenElement===stage?20:88)):Math.max(12,Math.min(window.innerHeight-height-12,anchor.top-height-20));
      body.style.left=(left-origin.left)+'px';body.style.top=(top-origin.top)+'px';
    }
    for(const node of stage.querySelectorAll('details'))listen(node,'toggle',()=>{
      const body=node.querySelector('[popover]');
      if(node.open){
        for(const other of stage.querySelectorAll('details[open]'))if(other!==node)closeMenu(other);
        if(body?.showPopover){try{body.showPopover();}catch{}}
        positionMenu(node);
      }else if(body?.hidePopover){try{body.hidePopover();}catch{}}
      updateVisibility({reveal:true});
    });
    const positionOpenMenus=()=>{for(const node of stage.querySelectorAll('details[open]'))positionMenu(node);};
    listen(window,'resize',positionOpenMenus);listen(window,'scroll',positionOpenMenus);
    listen(document,'pointerdown',event=>{for(const node of stage.querySelectorAll('details[open]'))if(!node.contains(event.target))closeMenu(node);});
    listen(document,'fullscreenchange',()=>{for(const node of stage.querySelectorAll('details[open]'))closeMenu(node);const active=!!document.fullscreenElement;find('fullscreen').setAttribute('aria-label',active?'Exit fullscreen':'Enter fullscreen');find('fullscreen').setAttribute('aria-pressed',String(active));});
    listen(window,'pagehide',event=>{
      if(!event.persisted){destroy();return;}const snapshot=getState(),data=sourceData,copy=find('status-copy').textContent,title=find('status-title').textContent;suspended=true;cancelResolver();teardownMedia();sourceData=null;source='';suspendState={snapshot,data,copy,title};
    });
    let suspendState=null;
    listen(window,'pageshow',event=>{
      if(!event.persisted||destroyed||!suspended)return;suspended=false;const cached=suspendState;suspendState=null;
      if(cached?.snapshot.status==='error'){setStatus('error',cached.title,cached.copy);return;}
      if(cached?.data){const loading=loadSource(cached.data,{resumeAt:cached.snapshot.currentTime}),token=generation;loading.then(ok=>{if(ok&&alive(token)&&!cached.snapshot.paused)play({remote:true});});if(managed)dispatch('resume',getState());}
      else if(!managed)resolve();else {setStatus('waiting');dispatch('resume',getState());}
    });
    video.controls=false;controls.hidden=false;find('fullscreen').hidden=!(stage.requestFullscreen||video.webkitEnterFullscreen);
    find('pip').hidden=!(document.pictureInPictureEnabled&&video.requestPictureInPicture);updateControls();
    revealSelectedEpisode();listen(window,'resize',revealSelectedEpisode);
    if(managed)setStatus('waiting');else resolve();
    return api;
  }
  const methods=['loadSource','resolve','retry','getState','play','pause','seek','setRemoteMode','destroy'];
  window.SwiflyPlayer=Object.freeze({mount,...Object.fromEntries(methods.map(name=>[name,(...args)=>defaultPlayer?.[name](...args)]))});
  function boot(){const root=document.querySelector('.svPlayerPage');if(root&&!defaultPlayer)defaultPlayer=mount(root);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
