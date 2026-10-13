/* SwiflyTV movie playback: one media element, bounded lookup, local controls. */
(() => {
  'use strict';
  if (window.SwiflyPlayer) return;
  function boot() {
    const app = document.querySelector('.svPlayerPage');
    if (!app || app.dataset.playerMode === 'trailer') return;
    const find = name => app.querySelector('[data-player-' + name + ']');
    const stage = find('stage');
    let video = find('video');
    if (!stage || !video) return;
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
      pollMin:limit('playerPollMinMs',400,2500),pollMax:limit('playerPollMaxMs',2000,5000)
    };
    let destroyed=false, suspended=false, generation=0, resolverGeneration=0, transportIntent=0;
    let managed=app.dataset.playerManaged==='true', remoteMode={enabled:managed,isHost:true};
    let phase=managed?'waiting':'loading', playable=false, source='', sourceData=null, mediaId=app.dataset.playerId, mediaType=app.dataset.playerType;
    let hls=null,dash=null,pendingPlay=false,unlockRemote=true,resumeAt=0,retryResume=0,stallTimer=0,toastTimer=0,lookupDeadline=0,loadingKey='';
    let lastTime=0,lastBuffer=0,hlsRecovery={network:0,media:0};
    const tasks=new Set(),listeners=[],mediaListeners=[],libraryListeners=[];
    const alive = token => !destroyed && !suspended && app.isConnected && video.isConnected && token===generation;
    const locked = () => remoteMode.enabled && !remoteMode.isHost;
    const listen = (node,name,fn,bucket=listeners) => {node?.addEventListener(name,fn);bucket.push(()=>node?.removeEventListener(name,fn));};
    const clearListeners = bucket => {for(const remove of bucket.splice(0))remove();};
    const dispatch = (name,detail) => {if(!destroyed&&app.isConnected)app.dispatchEvent(new CustomEvent('swiflyplayer:'+name,{bubbles:true,detail}));};
    const format = seconds => {const value=Math.max(0,Math.floor(number(seconds,0)));const hours=Math.floor(value/3600),minutes=Math.floor(value%3600/60),secs=value%60;return (hours?hours+':'+String(minutes).padStart(2,'0'):String(minutes))+':'+String(secs).padStart(2,'0');};
    const discoveryMessage = data => ({
      browser_unavailable:'The playback service could not start. The site owner needs to check its browser installation.',
      provider_blocked:'The video source rejected the request. Please try again later.',
      no_source:'The video sources returned no playable movie or episode. Please try again later.',
      busy:'Other movies are getting ready. Please try again shortly.',
      timeout:'The movie took too long to become available. Try again in a moment.'
    }[data?.code] || 'The movie is unavailable right now. Try again in a moment.');
    const cancelTasks = category => {for(const task of [...tasks])if(!category||task.category===category)task.cancel();};
    function getState() {
      return {currentTime:number(video?.currentTime,0),paused:phase==='ended'||phase==='error'||!video||video.paused,duration:video?.duration===Infinity?Infinity:number(video?.duration,0),ready:playable&&!destroyed&&!suspended,source,mediaId,type:mediaType,status:phase};
    }
    const emitState = () => dispatch('state',getState());
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
      const bounds=range(),time=number(video.currentTime,0),seek=find('seek');
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
      const label=phase==='ended'?'Replay movie':paused?'Play movie':'Pause movie';
      play.setAttribute('aria-label',label);play.title=label;
      play.querySelector('.svPlayerIcon path')?.setAttribute('d',paused?'m9 5 11 7-11 7V5Z':'M8 5v14M16 5v14');
      for(const name of ['play','backward','forward'])find(name).disabled=!playable||locked();
      find('retry').disabled=locked();find('speed').disabled=remoteMode.enabled;
      find('volume').value=String(video.muted?0:video.volume);
      const mute=find('mute');mute.setAttribute('aria-label',video.muted?'Unmute movie':'Mute movie');mute.title=video.muted?'Unmute movie':'Mute movie';mute.setAttribute('aria-pressed',String(video.muted));
      find('transport-note').textContent=remoteMode.enabled?(locked()?'Your host controls playback. Your volume and captions are yours.':'You control playback for everyone in this party.'):'Settle in. The rest can wait.';
      app.dataset.playerRemote=remoteMode.enabled?'true':'false';app.dataset.playerHost=remoteMode.isHost?'true':'false';updateTime();
    }
    function setStatus(next,title,copy) {
      phase=next;app.dataset.playerState=next;
      const visible=['loading','waiting','buffering','error'].includes(next);
      statusPanel.hidden=!visible;stage.setAttribute('aria-busy',String(next==='loading'||next==='buffering'));
      find('status-title').textContent=title||({loading:'Getting your movie ready',waiting:'Waiting for your party',buffering:'Buffering…',error:'This movie couldn’t start.'}[next]||'');
      find('status-copy').textContent=copy||({loading:'Making your seat comfortable. This should only take a moment.',waiting:'Your host will choose when to start.',buffering:'Playback will continue as soon as the next scene is ready.'}[next]||'');
      find('status-label').textContent=next==='error'?'PLAYBACK UNAVAILABLE':next==='buffering'?'ONE MOMENT':'YOUR MOVIE NIGHT';
      find('retry').hidden=next!=='error';updateControls();emitState();
    }
    function stopWatchdog() {clearTimeout(stallTimer);stallTimer=0;}
    function watchProgress({renew=false,delay=config.stall}={}) {
      if(stallTimer&&!renew)return;
      stopWatchdog();const token=generation;stallTimer=setTimeout(()=>{stallTimer=0;if(alive(token))fail('Playback stopped responding. Check your connection, then try again.');},Math.max(1,delay));
    }
    function cancelResolver() {resolverGeneration++;cancelTasks('resolver');lookupDeadline=0;}
    function teardownMedia({replace=false}={}) {
      generation++;transportIntent++;stopWatchdog();clearTimeout(toastTimer);toastTimer=0;find('toast').hidden=true;
      find('unlock').hidden=true;
      cancelTasks('library');clearListeners(mediaListeners);clearListeners(libraryListeners);
      try {hls?.destroy();}catch{}try {if(dash?.destroy)dash.destroy();else dash?.reset();}catch{}hls=null;dash=null;
      const old=video,volume=old.volume,muted=old.muted,rate=old.playbackRate;
      try {old.pause();old.removeAttribute('src');old.load();}catch{}
      playable=false;pendingPlay=false;
      if(replace){video=old.cloneNode(false);video.controls=false;video.volume=volume;video.muted=muted;video.playbackRate=rate;old.replaceWith(video);}
      updateControls();
    }
    function fail(message) {
      if(destroyed||suspended)return;
      retryResume=number(video.currentTime,0);cancelResolver();teardownMedia();
      sourceData=null;
      setStatus('error','This movie couldn’t start.',message||'The movie is unavailable right now. Try again in a moment.');
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
      const waiting=guard(()=>{if(playable)setStatus('buffering');watchProgress();});
      listen(current,'waiting',waiting,mediaListeners);listen(current,'stalled',waiting,mediaListeners);
      listen(current,'seeking',guard(()=>{if(playable){setStatus('buffering');watchProgress();}}),mediaListeners);
      listen(current,'seeked',guard(()=>{if(playable&&current.readyState>=2){setStatus('ready');if(current.paused)stopWatchdog();else watchProgress();}updateTime();emitState();}),mediaListeners);
      listen(current,'timeupdate',guard(()=>{const time=number(current.currentTime,0);if(Math.abs(time-lastTime)>.1){lastTime=time;if(!current.paused||phase==='buffering')watchProgress({renew:true});}updateTime();emitState();}),mediaListeners);
      listen(current,'progress',guard(()=>{const end=bufferedEnd();if(end>lastBuffer+.1){lastBuffer=end;if(stallTimer)watchProgress({renew:true});}updateTime();}),mediaListeners);
      listen(current,'volumechange',guard(updateControls),mediaListeners);
      listen(current,'ratechange',guard(()=>{find('speed').value=String(current.playbackRate);emitState();}),mediaListeners);
      listen(current,'error',guard(()=>{const code=current.error?.code;if(code===1)return;fail(code===3||code===4?'This browser could not play the movie’s format. Try another browser, or retry playback.':'The movie connection was interrupted. Check your connection, then try again.');}),mediaListeners);
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
      if(['error','disabled','idle'].includes(data?.status)){fail(discoveryMessage(data));return false;}
      const next=chooseSource(data);
      if(!next){fail('The movie is unavailable right now. Try again in a moment.');return false;}
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
            fail(error.type===Hls.ErrorTypes.MEDIA_ERROR?'This browser could not play the movie’s format. Try another browser, or retry playback.':'The movie connection was interrupted. Check your connection, then try again.');
          });
          instance.loadSource(next);instance.attachMedia(video);
        }else if(kind==='dash'){
          const library=await loadLibrary('dash');if(!alive(token))return false;
          dash=library.MediaPlayer().create();const instance=dash,events=library.MediaPlayer.events||{};
          const subscribe=(name,fn)=>{if(!name)return;const callback=event=>{if(alive(token)&&dash===instance)fn(event);};instance.on(name,callback);libraryListeners.push(()=>instance.off?.(name,callback));};
          subscribe(events.STREAM_INITIALIZED,()=>{updateQuality();updateCaptions();});subscribe(events.TEXT_TRACKS_ADDED,updateCaptions);subscribe(events.ERROR,()=>fail('The movie could not load. Check your connection, then retry playback.'));
          instance.initialize(video,next,false);
        }else {video.src=next;video.load();}
        return true;
      } catch(error) {
        if(alive(token))fail(error.message==='unsupported'?'This browser does not support this movie format. Try another browser.':'Playback could not load. Check your connection or browser blockers, then try again.');return false;
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
      cancelResolver();teardownMedia({replace:true});source='';sourceData=null;loadingKey='';setStatus('loading');
      const token=resolverGeneration;lookupDeadline=Date.now()+config.resolve;let first=true;
      const query=new URLSearchParams();if(mediaType==='tv'){query.set('season',app.dataset.playerSeason||'1');query.set('episode',app.dataset.playerEpisode||'1');}if(app.dataset.playerProvider)query.set('provider',app.dataset.playerProvider);
      const endpoint='/api/proxy-video-wait/'+encodeURIComponent(mediaType)+'/'+encodeURIComponent(mediaId);
      while(!destroyed&&!suspended&&app.isConnected&&token===resolverGeneration){
        if(Date.now()>=lookupDeadline){fail('The movie took too long to become available. Try again in a moment.');return false;}
        const requestQuery=new URLSearchParams(query);if(retry&&first)requestQuery.set('retry','1');first=false;
        try {
          const waitMs=Math.max(0,Math.min(8000,config.request-1000,lookupDeadline-Date.now()-1000));
          if(waitMs>0)requestQuery.set('wait',String(Math.floor(waitMs)));
          const queryText=requestQuery.toString();
          const data=await requestJson(endpoint+(queryText?'?'+queryText:''),Math.min(config.request,lookupDeadline-Date.now()));
          if(destroyed||suspended||token!==resolverGeneration||!app.isConnected)return false;
          if(data?.status==='ok'||data?.status==='ready')return loadSource(data,{resumeAt:retry?retryResume:0});
          if(data?.status!=='loading'){fail(discoveryMessage(data));return false;}
          const serverDeadline=deadlineForSnapshot(data,lookupDeadline);lookupDeadline=Math.min(lookupDeadline,serverDeadline);
          const remaining=lookupDeadline-Date.now();if(remaining<=0){fail('The movie took too long to become available. Try again in a moment.');return false;}
          const interval=Math.min(config.pollMax,Math.max(config.pollMin,number(data.retryAfterMs,700)));if(!await waitPoll(Math.min(interval,remaining)))return false;
        }catch(error){if(token!==resolverGeneration||destroyed||suspended)return false;fail('The movie connection did not respond. Check your connection, then try again.');return false;}
      }return false;
    }
    async function play({remote=false}={}) {
      if(destroyed||suspended||!source||(!remote&&locked()))return false;
      if(!playable){if(remote)pendingPlay=true;return false;}
      const token=generation,current=video,intent=++transportIntent;
      if(phase==='ended'){try{current.currentTime=range()?.start||0;}catch{}}
      try {await current.play();if(!alive(token)||video!==current||intent!==transportIntent||(!remote&&locked()))return false;find('unlock').hidden=true;clearTimeout(toastTimer);toastTimer=0;find('toast').hidden=true;if(!remote)dispatch('action',{action:'play',time:number(current.currentTime,0)});updateControls();return true;}
      catch(error){if(!alive(token)||intent!==transportIntent)return false;if(error?.name==='NotAllowedError'){unlockRemote=remote;find('unlock').querySelector('span').textContent=remoteMode.enabled&&remote?'Join playback':'Play movie';find('unlock').hidden=false;stopWatchdog();setStatus('ready');}else if(error?.name!=='AbortError')fail('Playback could not begin. Try again in a moment.');return false;}
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
    function setRemoteMode({enabled=false,isHost=false}={}) {
      if(destroyed)return;const entered=enabled&&!remoteMode.enabled;remoteMode={enabled:!!enabled,isHost:!!isHost};managed=!!enabled;app.dataset.playerManaged=String(managed);
      if(entered){cancelResolver();if(!source){stopWatchdog();setStatus('waiting');}}
      if(enabled){video.playbackRate=1;find('speed').value='1';}updateControls();emitState();
    }
    async function fullscreen() {
      try {if(document.fullscreenElement)await document.exitFullscreen();else if(stage.requestFullscreen)await stage.requestFullscreen();else if(video.webkitEnterFullscreen)video.webkitEnterFullscreen();}catch{showToast('Fullscreen is unavailable in this browser.');}
    }
    async function pictureInPicture() {
      try {if(document.pictureInPictureElement)await document.exitPictureInPicture();else if(playable&&video.requestPictureInPicture)await video.requestPictureInPicture();}catch{showToast('Picture in picture is unavailable for this movie.');}
    }
    function keyboard(event) {
      if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||!stage.contains(event.target)||document.querySelector('dialog[open]'))return;
      if(event.key==='Escape'){const open=stage.querySelectorAll('details[open]');if(open.length){open.forEach(node=>{node.open=false;node.querySelector('summary')?.focus();});event.preventDefault();}return;}
      if(event.target.closest('input,select,textarea,button,a,summary,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="menu"]')||stage.querySelector('details[open]'))return;
      const key=event.key.toLowerCase();if(['k',' ','j','l','arrowleft','arrowright'].includes(key)&&locked())return;
      if(key==='k'||key===' '){event.preventDefault();getState().paused?play():pause();}
      else if(key==='j'||key==='arrowleft'){event.preventDefault();seek(number(video.currentTime,0)-10);}
      else if(key==='l'||key==='arrowright'){event.preventDefault();seek(number(video.currentTime,0)+10);}
      else if(key==='m'){event.preventDefault();video.muted=!video.muted;updateControls();}
      else if(key==='f'){event.preventDefault();fullscreen();}
    }
    function destroy() {
      if(destroyed)return;cancelResolver();teardownMedia();cancelTasks();clearListeners(listeners);destroyed=true;sourceData=null;video.controls=true;controls.hidden=true;emitState();
    }
    const api=Object.freeze({loadSource,resolve,retry:()=>resolve({retry:true}),getState,play,pause,seek,setRemoteMode,destroy});
    window.SwiflyPlayer=api;
    listen(find('play'),'click',()=>getState().paused?play():pause());
    listen(find('backward'),'click',()=>seek(number(video.currentTime,0)-10));listen(find('forward'),'click',()=>seek(number(video.currentTime,0)+10));
    listen(find('seek'),'input',event=>{const value=Number(event.target.value);find('current').textContent=format(value);event.target.setAttribute('aria-valuetext',format(value));});
    listen(find('seek'),'change',event=>seek(Number(event.target.value)));
    listen(find('retry'),'click',()=>{if(!locked())resolve({retry:true});});
    listen(find('unlock'),'click',()=>play({remote:unlockRemote}));
    listen(find('volume'),'input',event=>{video.volume=Math.max(0,Math.min(1,Number(event.target.value)));video.muted=video.volume===0;updateControls();});
    listen(find('mute'),'click',()=>{video.muted=!video.muted;updateControls();});
    listen(find('speed'),'change',event=>{if(remoteMode.enabled)return;video.playbackRate=Number(event.target.value);});
    listen(find('quality'),'change',event=>{const quality=Number(event.target.value);try{if(hls)hls.currentLevel=quality;if(dash){dash.updateSettings({streaming:{abr:{autoSwitchBitrate:{video:quality<0}}}});if(quality>=0)dash.setQualityFor('video',quality,true);}}catch{showToast('That picture quality is unavailable.');}});
    listen(find('captions'),'change',event=>{const selected=Number(event.target.value);try{if(hls?.subtitleTracks?.length){hls.subtitleTrack=selected;hls.subtitleDisplay=selected>=0;}else if(dash)dash.setTextTrack(selected);else Array.from(video.textTracks||[]).forEach((track,index)=>track.mode=index===selected?'showing':'disabled');}catch{showToast('These captions are unavailable.');}});
    listen(find('fullscreen'),'click',fullscreen);listen(find('pip'),'click',pictureInPicture);listen(app,'keydown',keyboard);
    listen(stage,'click',event=>{if(event.target===video||event.target===stage){stage.focus({preventScroll:true});if(playable&&!locked())getState().paused?play():pause();}});
    for(const node of stage.querySelectorAll('details'))listen(node,'toggle',()=>{if(node.open)for(const other of stage.querySelectorAll('details[open]'))if(other!==node)other.open=false;});
    listen(document,'pointerdown',event=>{for(const node of stage.querySelectorAll('details[open]'))if(!node.contains(event.target))node.open=false;});
    listen(document,'fullscreenchange',()=>{const active=!!document.fullscreenElement;find('fullscreen').setAttribute('aria-label',active?'Exit fullscreen':'Enter fullscreen');find('fullscreen').setAttribute('aria-pressed',String(active));});
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
    if(managed)setStatus('waiting');else resolve();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
