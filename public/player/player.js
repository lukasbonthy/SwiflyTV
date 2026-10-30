/* SwiflyTV playback: one media element, bounded lookup, local controls. */
(() => {
  'use strict';
  if (window.SwiflyPlayer) return;
  const instances=new WeakMap();
  let defaultPlayer=null,studioId=0;
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
      resolve:limit('playerResolveTimeoutMs',90000,90000),request:limit('playerRequestTimeoutMs',15000,15000),
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
    let tvLastFocus=null;
    let stallRepairs=0,repairPosition=0;
    let glass=null,glassEnabled=null,glassUnavailable=false;
    let audioOptions=[],applyingAudio=false,observedAudio=null,observedText=null;
    let captionOptions=[],captionPreference=null,captionActive='-1',applyingCaptions=false;
    let sourceOptions=[],sourceSnapshotKey='',activeSourceData=null,failedPreferenceMedia='';
    let providersLoaded=false,serverChanging=false;
    const history=window.SwiflyContinue,historyOwner=history?.profileId?.();
    const entryQuery=new URLSearchParams(location.search);
    let soloTracking=app.classList.contains('svPlayerPage')&&!managed&&!entryQuery.has('roomId')&&!entryQuery.has('party');
    // Device-local continuity uses the real library owner, never shared jobs.
    // Keep this allowlist aligned with lib/nuvio-provider.js's installed adapters.
    const rememberedProviders=new Set(['vidlink','vidsrc','videasy','vidfast','vidrock','cineby','vidlove','goated','netmirror','nakios']),continuityTried=new Set();
    function continuityContext(){try{const library=window.SwiflyLibrary;if(typeof library?.profileId!=='function')return '';return 'swiflytv.player.lastServer.'+encodeURIComponent(JSON.stringify([String(library.ownerId?.()||'guest'),String(library.profileId())]));}catch{return '';}}
    const continuityOwner=continuityContext();
    function continuityEnabled(){try{return !!continuityOwner&&continuityContext()===continuityOwner&&window.SwiflyLibrary?.active!==false&&window.SwiflyLibrary?.preferences?.().rememberLastServer!==false;}catch{return false;}}
    function rememberedProvider(value){const id=typeof value==='string'?value.trim().toLowerCase().replace(/^api_/,'').replace(/^nuvio[-_]/,'').replace(/_(?:hls_proxy|direct_hls|non_download)$/,''):'';return rememberedProviders.has(id)?id:'';}
    function readRememberedServer(){
      if(!continuityOwner||continuityContext()!==continuityOwner)return '';
      try{if(!continuityEnabled()){if(window.SwiflyLibrary?.preferences?.().rememberLastServer===false)localStorage.removeItem(continuityOwner);return '';}return rememberedProvider(localStorage.getItem(continuityOwner));}catch{return '';}
    }
    function localContinuity(){return soloTracking&&!managed&&!remoteMode.enabled&&!remoteMode.manual&&mediaType==='tv'&&!app.dataset.playerProvider&&!entryQuery.has('provider');}
    function matchesEpisode(data){
      if(data?.type&&data.type!==mediaType)return false;
      if(data?.movieId!=null&&String(data.movieId)!==String(mediaId)||data?.mediaId!=null&&String(data.mediaId)!==String(mediaId))return false;
      return mediaType!=='tv'||(data?.season==null||Number(data.season)===Number(app.dataset.playerSeason))&&(data?.episode==null||Number(data.episode)===Number(app.dataset.playerEpisode));
    }
    function rememberServer(){
      readRememberedServer();
      if(!localContinuity()||!continuityEnabled()||!sourceData||!matchesEpisode(sourceData)||String(mediaId)!==app.dataset.playerId||mediaType!==app.dataset.playerType)return;
      const provider=[sourceData.server,activeSourceData?.server,activeSourceData?.apiProvider,sourceData.apiProvider,activeSourceData?.providerKind,sourceData.providerKind].map(rememberedProvider).find(Boolean);
      if(provider)try{localStorage.setItem(continuityOwner,provider);}catch{}
    }
    let personalResume=0,hasPlayed=false,lastProgressWrite=0,lastSavedProgress='';
    if(soloTracking&&entryQuery.get('resume')==='1'){
      const saved=history?.find?.(mediaType,mediaId,historyOwner);
      if(saved&&(mediaType!=='tv'||saved.season===Number(app.dataset.playerSeason)&&saved.episode===Number(app.dataset.playerEpisode)))personalResume=saved.currentTime;
    }
    let audioPreference='en';try{const stored=localStorage.getItem('swifly.player.audioLanguage');if(stored!==null)audioPreference=stored;}catch{}
    const tasks=new Set(),listeners=[],mediaListeners=[],libraryListeners=[];
    const alive = token => !destroyed && !suspended && app.isConnected && video.isConnected && token===generation;
    const locked = () => remoteMode.enabled && !remoteMode.isHost;
    const listen = (node,name,fn,bucket=listeners) => {node?.addEventListener(name,fn);bucket.push(()=>node?.removeEventListener(name,fn));};
    const clearListeners = bucket => {for(const remove of bucket.splice(0))remove();};
    const transparencyQuery=window.matchMedia?.('(prefers-reduced-transparency: reduce)');
    const motionQuery=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const cueStyle=document.createElement('style'),appearanceId=String(++studioId);
    cueStyle.dataset.playerCueStyle=appearanceId;app.dataset.playerStudioId=appearanceId;
    document.head.append(cueStyle);listeners.push(()=>cueStyle.remove());
    let appearance={},glassAllowed=true,controlsHovered=false;
    function applyAppearance(settings={}) {
      if(destroyed)return;
      appearance=settings&&typeof settings==='object'&&!Array.isArray(settings)?{...settings}:{};
      const bounded=(name,fallback,min,max)=>Math.max(min,Math.min(max,Number.isFinite(appearance[name])?appearance[name]:fallback));
      const choice=(name,allowed,fallback=allowed[0])=>allowed.includes(appearance[name])?appearance[name]:fallback;
      const style=choice('playerStyle',['cinema','minimal','classic']);
      const lowPower=['mobile','xbox','minimal'].includes(appearance.performancePreset);
      const flat=lowPower||appearance.reduceTransparency===true||appearance.highContrast===true||!!transparencyQuery?.matches||appearance.glass==='off';
      glassAllowed=!flat&&style==='cinema';
      app.dataset.playerStyle=style;
      app.dataset.playerEffects=flat?'flat':'full';
      app.dataset.playerMotion=appearance.reduceMotion===true||motionQuery?.matches?'reduce':'full';
      app.dataset.playerContrast=appearance.highContrast===true?'high':'normal';
      app.dataset.playerTargets=appearance.largeTargets===true||appearance.tvControls==='large'?'large':'standard';
      app.dataset.playerPosition=choice('playerPosition',['floating','bottom']);
      app.dataset.playerLoadingBackdrop=flat?'dark':choice('playerBackdrop',['dark','artwork','ambient']);
      app.style.setProperty('--player-progress-size',bounded('playerProgress',3,2,7)+'px');
      app.style.setProperty('--player-icon-scale',String(bounded('playerIconScale',100,85,125)/100));
      app.style.setProperty('--player-chrome-opacity',String(appearance.highContrast===true?1:bounded('playerOpacity',85,60,100)/100));
      for(const name of ['current','duration'])find(name).hidden=appearance.playerTime===false;
      const captionColor=/^#[\da-f]{6}$/i.test(appearance.captionColor||'')?appearance.captionColor:'#ffffff';
      const captionShadow={shadow:'0 2px 3px #000,0 0 2px #000',outline:'-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000',none:'none'}[choice('captionEdge',['shadow','outline','none'])];
      // Literal, validated ::cue values work without relying on custom-property
      // inheritance inside browser-owned caption renderers. The root selector
      // also covers video elements replaced by normal source recovery.
      cueStyle.textContent='[data-player-studio-id="'+appearanceId+'"] video::cue {font-size:'+bounded('captionSize',100,75,200)+'%;color:'+captionColor+';background-color:rgba(0,0,0,'+(bounded('captionBg',65,0,100)/100)+');text-shadow:'+captionShadow+';}';
      if([1800,2600,4000,6000].includes(appearance.playerAutoHide))config.controls=appearance.playerAutoHide;
      clearTimeout(controlsTimer);controlsTimer=0;
      updateVisibility({reveal:true});
      for(const menu of stage.querySelectorAll('details[open]'))positionMenu(menu);
    }
    function savePlayback(force=false,completed=false) {
      if(!soloTracking||managed||remoteMode.enabled||remoteMode.manual||destroyed||suspended||!playable||!hasPlayed||!history?.saveProgress)return;
      if(mediaId!==app.dataset.playerId||mediaType!==app.dataset.playerType)return;
      if(mediaType==='tv'&&sourceData&&(Number(sourceData.season||app.dataset.playerSeason)!==Number(app.dataset.playerSeason)||Number(sourceData.episode||app.dataset.playerEpisode)!==Number(app.dataset.playerEpisode)))return;
      const currentTime=number(video.currentTime,NaN),duration=number(video.duration,NaN);
      if(!Number.isFinite(currentTime)||currentTime<0||!Number.isFinite(duration)||duration<=0||!force&&currentTime<1)return;
      const ended=completed||video.ended||phase==='ended',snapshot=JSON.stringify([currentTime,duration,ended]);
      if(snapshot===lastSavedProgress||!force&&Date.now()-lastProgressWrite<5000)return;
      if(history.saveProgress({id:mediaId,type:mediaType,title:app.dataset.playerTitle,year:app.dataset.playerYear,poster:app.dataset.playerPoster,backdrop:app.dataset.playerBackdrop,
        season:Number(app.dataset.playerSeason),episode:Number(app.dataset.playerEpisode),currentTime,duration,completed:ended},historyOwner)){
        lastProgressWrite=Date.now();lastSavedProgress=snapshot;
      }
    }
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
    const television=()=>document.documentElement.dataset.svTv==='true'&&document.body.classList.contains('swifly-tv-focus-mode');
    function interactionPinned(){return !!document.activeElement?.closest('[data-assist-root],[data-watchroom-call],.svInlineParty')||!!stage.querySelector('[data-watchroom-call]:not([hidden]) [data-call-leave]:not([hidden])');}
    function controlsPinned() {
      return phase!=='ready'||!playable||video.paused||video.seeking||scrubbing||controlsHovered||!find('unlock').hidden||!television()&&controls.contains(document.activeElement)||interactionPinned()||!!stage.querySelector('details[open]');
    }
    function hideTransport(){
      if(controls.contains(document.activeElement)){tvLastFocus=document.activeElement;stage.focus({preventScroll:true});}
      clearTimeout(controlsTimer);controlsTimer=0;app.dataset.playerControlsVisibility='hidden';syncGlass();
    }
    function syncGlass() {
      // One static geometry lens belongs to the transport. Its backdrop is
      // composed by the browser; playback never samples or redraws the film.
      if(glassAllowed&&!glass&&!glassUnavailable&&!destroyed&&find('glass')&&window.SwiflyLiquidGlass?.mount){
        try{glass=window.SwiflyLiquidGlass.mount(find('glass'),{tint:.2,saturation:1,distortionScale:-180,displace:.5});}
        catch{glassUnavailable=true;}
      }
      const enabled=glassAllowed&&!destroyed&&!suspended&&app.isConnected&&!document.hidden&&!controls.hidden&&app.dataset.playerControlsVisibility!=='hidden';
      if(glass&&glassEnabled!==enabled){glassEnabled=enabled;glass.setEnabled(enabled);}
    }
    function updateVisibility({reveal=false}={}) {
      if(destroyed||suspended){syncGlass();return;}
      if(reveal||controlsPinned()){clearTimeout(controlsTimer);controlsTimer=0;app.dataset.playerControlsVisibility='visible';}
      if(!controlsPinned()&&app.dataset.playerControlsVisibility!=='hidden'&&!controlsTimer){
        const token=generation;controlsTimer=setTimeout(()=>{controlsTimer=0;if(!alive(token))return;if(controlsPinned())updateVisibility();else hideTransport();},config.controls);
      }
      syncGlass();
    }
    function tvControls(event) {
      if(destroyed||suspended||!app.isConnected||document.documentElement.dataset.svTv!=='true'||!document.body.classList.contains('swifly-tv-focus-mode'))return;
      // A controller/remote action takes ownership from the last mouse position.
      controlsHovered=false;
      if(event.detail?.action==='show'){updateVisibility({reveal:true});if(event.detail.focus&&document.activeElement===stage&&tvLastFocus?.isConnected&&!tvLastFocus.disabled&&!tvLastFocus.closest('[hidden],[inert],[aria-disabled="true"],details:not([open]) :not(summary)'))tvLastFocus.focus({preventScroll:true});return;}
      if(event.detail?.action!=='hide'||phase!=='ready'||!playable||video.paused||video.ended||video.seeking||scrubbing||controlsHovered||interactionPinned()||!find('unlock').hidden||stage.querySelector('details[open]'))return;
      hideTransport();
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
      stopWatchdog();const token=generation;
      stallTimer=setTimeout(()=>{
        stallTimer=0;if(!alive(token))return;
        const message='Playback stopped responding. Check your connection, then try again.';
        // Browsers can throttle timeupdate in background tabs. Inspect the
        // clock itself before treating missing callbacks as a dead stream.
        if(playable&&!video.paused&&!video.seeking){
          const time=number(video.currentTime,0);
          if(time>lastTime+.15){
            lastTime=time;
            if(phase==='buffering')setStatus('ready');
            watchProgress();
            return;
          }
        }
        if(playable&&sourceData&&source&&!video.paused&&!video.ended)recoverStall(message);
        else mediaFailure(message);
      },Math.max(1,delay));
    }
    function recoverStall(message) {
      if(destroyed||suspended||!sourceData||!source||video.paused||video.ended)return;
      const position=Math.max(0,number(video.currentTime,0));
      // No unbounded loops: the retry budget survives cloned media elements.
      // Only 30 seconds of actual timeline progression replenishes it.
      if(stallRepairs&&position-repairPosition>=30)stallRepairs=0;
      if(stallRepairs>=2){fail(message);return;} // Never bounce back to a previously failed source.
      let next=source,choice=sourceOptions.find(item=>item.playbackUrl===source);
      if(stallRepairs===1){
        choice=sourceOptions.find(item=>item.playbackUrl!==source);
        if(!choice){mediaFailure(message);return;}
        next=choice.playbackUrl;
      }
      stallRepairs++;repairPosition=position;
      const attempt=stallRepairs;
      const resume=attachSource(next,dataForSource(choice),{position,shouldPlay:true});
      if(source===next&&phase==='loading')
        setStatus('loading',attempt===1?'Reconnecting playback…':'Trying another source…','Keeping your place while the stream reconnects.');
      resume.catch(()=>{}); // attachSource owns error handling.
    }
    function cancelResolver() {resolverGeneration++;cancelTasks('resolver');lookupDeadline=0;}
    function teardownMedia({replace=false}={}) {
      savePlayback(true);
      for(const node of stage.querySelectorAll('details[open]'))closeMenu(node);
      generation++;transportIntent++;stopWatchdog();clearTimeout(controlsTimer);controlsTimer=0;scrubbing=false;app.dataset.playerControlsVisibility='visible';clearTimeout(toastTimer);toastTimer=0;find('toast').hidden=true;
      find('unlock').hidden=true;
      cancelTasks('library');clearListeners(mediaListeners);clearListeners(libraryListeners);
      observedAudio=null;observedText=null;audioOptions=[];captionOptions=[];captionActive='-1';
      try {hls?.destroy();}catch{}try {if(dash?.destroy)dash.destroy();else dash?.reset();}catch{}hls=null;dash=null;
      const old=video,volume=old.volume,muted=old.muted,rate=old.playbackRate;
      try {old.pause();old.removeAttribute('src');old.load();}catch{}
      playable=false;pendingPlay=false;
      if(replace){video=old.cloneNode(false);video.controls=false;video.volume=volume;video.muted=muted;video.playbackRate=rate;old.replaceWith(video);}
      updateControls();
    }
    function fail(message, sourceCode='') {
      if(destroyed||suspended)return;
      retryResume=Math.max(resumeAt,number(video.currentTime,0));cancelResolver();teardownMedia();
      sourceData=null;resetSourceOptions();
      // Show a safe, actionable reason without leaking any provider URL,
      // headers, cookies or internal scraping diagnostics.
      const known=['browser_unavailable','provider_blocked','no_source','unavailable','busy','timeout'];
      const code=known.includes(sourceCode)?sourceCode:'playback_error';
      app.dataset.playerFailureCode=code;
      setStatus('error','This '+mediaName()+' couldn’t start.',message||'The '+mediaName()+' is unavailable right now. Try again in a moment.');
      find('status-label').textContent='PLAYBACK UNAVAILABLE · '+code.replaceAll('_',' ').toUpperCase();
      dispatch('source-failure',{code,mediaType,hasPlayableSource:Boolean(source)});
    }
    function mediaFailure(message) {
      if(destroyed||suspended)return;
      const canonical=sourceData&&chooseSource(sourceData);
      if(canonical&&source!==canonical){
        // Quality and audio are personal choices, including for party guests.
        // Recover locally; a guest must not need authority to restart discovery.
        failedPreferenceMedia=mediaKey(sourceData);
        const position=Math.max(resumeAt,number(video.currentTime,0)),shouldPlay=pendingPlay||!video.paused;
        const choice=sourceOptions.find(item=>item.playbackUrl===canonical);
        const restored=attachSource(canonical,dataForSource(choice),{position,shouldPlay}),token=generation;
        restored.then(ok=>{if(ok&&alive(token)&&source===canonical)showToast('That option is unavailable. Restoring playback.');});
        return;
      }
      fail(message);
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
        script.src=kind==='hls'?'https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js':'https://cdn.jsdelivr.net/npm/dashjs@4.7.4/dist/dash.all.min.js';
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
      if(levels.length){option(-1,'Auto');levels.forEach((level,index)=>option(level.qualityIndex??index,level.height?pictureQuality(level.height+'p'):level.bitrate?Math.round(level.bitrate/1000)+' kbps':'Quality '+(index+1)));}
      const alternatives=sourceOptions.length>1?sourceOptions:[];
      alternatives.forEach((item,index)=>option('source:'+index,sourceLabel(item,index)));
      if(!levels.length&&!alternatives.length)option(-1,sourceLabel(activeSourceData||{},0));
      select.disabled=levels.length<2&&alternatives.length<2;
      const current=sourceOptions.findIndex(item=>item.playbackUrl===source);
      select.value=levels.length&&[...select.options].some(item=>item.value===selected)&&!selected.startsWith('source:')?selected:alternatives.length?'source:'+current:'-1';
      updateServers();
    }
    function pictureQuality(value) {
      const quality=String(value||'').trim();return quality==='2160p'?'4K (2160p)':quality;
    }
    function sourceLabel(item,index) {
      const quality=pictureQuality(item.streamQuality);let label=quality||String(item.streamName||'').trim()||'Original';
      if(sourceOptions.some(other=>other!==item&&(other.streamQuality||'')===(item.streamQuality||''))){const language=languageOf({language:item.audioLanguage});label+=' · '+(language?trackLabel({language},index,'Audio'):'language unavailable');}
      return label;
    }
    // File qualities and alternate verified streams are presented separately
    // from adaptive HLS picture quality. No server is advertised as available
    // until the backend has provided a usable playback URL.
    function updateServers() {
      const scan=find('find-4k');if(scan)scan.disabled=serverChanging||!mediaId||managed||remoteMode.enabled;
      const list=find('server-list');if(!list)return;
      list.replaceChildren();
      if(!sourceOptions.length) {
        const note=document.createElement('span');note.className='svPlayerMenuHint';
        note.textContent='No servers discovered yet.';list.append(note);return;
      }
      for(const [index,item] of sourceOptions.entries()) {
        const active=item.playbackUrl===source;
        const button=document.createElement('button');
        button.type='button';button.className='svPlayerServerChoice';
        button.dataset.playerServerIndex=String(index);button.dataset.active=String(active);
        button.setAttribute('aria-pressed',String(active));
        button.disabled=active||serverChanging;
        const label=document.createElement('span');label.className='svPlayerServerName';
        label.textContent=String(item.streamName||'Server '+(index+1)).slice(0,65);
        const meta=document.createElement('small');
        meta.textContent=[pictureQuality(item.streamQuality),item.audioLanguage,active?'Playing':'Switch'].filter(Boolean).join(' · ')||'Available';
        button.append(label,meta);list.append(button);
      }
    }
    async function loadProviders() {
      const select=find('server-provider'),message=find('server-message');if(!select||providersLoaded)return;
      providersLoaded=true;
      try {
        const data=await requestJson('/api/nuvio/providers',7000);
        const rows=Array.isArray(data.providers)?data.providers.filter(item=>item.installed&&item.selected):[];
        select.replaceChildren();
        const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Select another provider';select.append(placeholder);
        for(const row of rows) {
          if(!/^[a-z0-9-]{2,35}$/.test(row.id))continue;
          const item=document.createElement('option');item.value=row.id;item.textContent=String(row.name||row.id).slice(0,65);select.append(item);
        }
        select.disabled=rows.length===0;
        if(message)message.textContent=rows.length?'Try an alternate source; only a verified match will replace your movie.':'No additional providers configured.';
      }catch {
        providersLoaded=false;
        if(message)message.textContent='Could not load providers. Reopen this menu to retry.';
      }
    }
    async function changeProvider(provider) {
      if(serverChanging||destroyed||suspended||!provider||!mediaId||managed||remoteMode.enabled)return;
      if(!/^[a-z0-9-]{2,35}$/.test(provider))return;
      const status=find('server-message'),button=find('server-try');
      const position=Math.max(0,number(video.currentTime,0)),shouldPlay=pendingPlay||!video.paused;
      serverChanging=true;if(button)button.disabled=true;
      if(status)status.textContent='Checking '+provider+'…';
      updateServers();
      try {
        const query=new URLSearchParams({provider});
        if(mediaType==='tv') {query.set('season',app.dataset.playerSeason||'1');query.set('episode',app.dataset.playerEpisode||'1');}
        const payload=await requestJson('/api/player/server/'+encodeURIComponent(mediaType)+'/'+encodeURIComponent(mediaId)+'?'+query,['4khdhub','uhdmovies','moviesdrive','showbox'].includes(provider)?50000:15000);
        const next=chooseSource(payload);
        if(payload.status!=='ok'||!next)throw new Error('unavailable');
        sourceData={...payload};sourceOptions=prepareSources(payload,next);
        sourceSnapshotKey=snapshotKey(payload,next,mediaId,mediaType);
        const choice=sourceOptions.find(item=>item.playbackUrl===next);
        const applied=await attachSource(next,dataForSource(choice||{playbackUrl:next}),{position,shouldPlay});
        if(!applied)throw new Error('unavailable');
        if(status)status.textContent='Connected to '+provider+'.';
        closeMenu(find('servers'));
      }catch(error) {
        const message=error?.httpStatus===400?'The server request was rejected. Please reload the player.':
          error?.httpStatus===404?'No verified stream was found on this server for this title.':
          error?.httpStatus===504||error?.message==='timeout'?'The server took too long to respond.':
          'This provider could not return a playable stream.';
        if(status)status.textContent=message;
        showToast(message);
      }finally{serverChanging=false;if(button)button.disabled=!find('server-provider')?.value;updateServers();}
    }
    async function find4k() {
      if(serverChanging||destroyed||suspended||!mediaId||managed||remoteMode.enabled)return;
      const status=find('server-message'),button=find('find-4k');
      const position=Math.max(0,number(video.currentTime,0)),shouldPlay=pendingPlay||!video.paused;
      serverChanging=true;if(button)button.disabled=true;
      if(status)status.textContent='Searching other providers for verified 4K (2160p)…';
      updateServers();
      try {
        const query=new URLSearchParams();
        if(mediaType==='tv'){query.set('season',app.dataset.playerSeason||'1');query.set('episode',app.dataset.playerEpisode||'1');}
        const suffix=query.size?'?'+query.toString():'';
        const payload=await requestJson('/api/player/find-4k/'+encodeURIComponent(mediaType)+'/'+encodeURIComponent(mediaId)+suffix,60000);
        const next=chooseSource(payload);
        if(payload.status!=='ok'||payload.fourKMatch!==true||!next)throw new Error('unavailable');
        sourceData={...payload};sourceOptions=prepareSources(payload,next);
        sourceSnapshotKey=snapshotKey(payload,next,mediaId,mediaType);
        const choice=sourceOptions.find(item=>item.playbackUrl===next);
        const applied=await attachSource(next,dataForSource(choice||{playbackUrl:next}),{position,shouldPlay});
        if(!applied)throw new Error('unavailable');
        if(status)status.textContent='Connected to a 4K-labeled stream.';
        closeMenu(find('servers'));
      } catch(error) {
        const message=error?.httpStatus===404?'No verified 4K source was found for this title. Your current source is unchanged.':
          error?.httpStatus===504||error?.message==='timeout'?'The 4K search timed out. Try again later.':
          'The 4K search could not complete. Try again later.';
        if(status)status.textContent=message;
        showToast(message);
      } finally {serverChanging=false;updateServers();}
    }
    function prepareSources(data,next) {
      const seen=new Set(),sources=[];
      for(const item of Array.isArray(data.playbackSources)?data.playbackSources:[]){const playbackUrl=safeUrl(item?.playbackUrl);if(!playbackUrl||seen.has(playbackUrl))continue;seen.add(playbackUrl);sources.push({...item,playbackUrl});}
      if(!seen.has(next))sources.unshift({playbackUrl:next,streamType:data.streamType,streamMode:data.streamMode,streamQuality:data.streamQuality,streamCodec:data.streamCodec,streamName:data.streamName,audioLanguage:data.audioLanguage||'',selected:true});
      return sources;
    }
    function resetSourceOptions() {
      sourceOptions=[];sourceSnapshotKey='';activeSourceData=null;audioOptions=[];captionOptions=[];captionActive='-1';updateServers();
      for(const [name,label] of [['quality','Original'],['audio','Language unavailable'],['captions','Unavailable']]){const select=find(name);if(!select)continue;const option=document.createElement('option');option.value='-1';option.textContent=label;select.replaceChildren(option);select.disabled=true;}
    }
    function dataForSource(item) {
      const root=sourceData||{},subtitles=[...(Array.isArray(item?.subtitles)?item.subtitles:[]),...(Array.isArray(root.subtitles)?root.subtitles:Array.isArray(root.captions)?root.captions:[])];
      return {...root,...item,subtitles};
    }
    function snapshotKey(data,url,id,type) {
      return JSON.stringify([url,id,type,type==='tv'?(data.season||app.dataset.playerSeason||1):'',type==='tv'?(data.episode||app.dataset.playerEpisode||1):'',data.requestId||'']);
    }
    function mediaKey(data,id=mediaId,type=mediaType) {
      return JSON.stringify([id,type,type==='tv'?(data.season||app.dataset.playerSeason||1):'',type==='tv'?(data.episode||app.dataset.playerEpisode||1):'']);
    }
    async function switchSource(index) {
      const choice=sourceOptions[index];if(destroyed||suspended||!sourceData||!choice||choice.playbackUrl===source)return false;
      const snapshot=getState(),position=playable?snapshot.currentTime:Math.max(resumeAt,snapshot.currentTime),shouldPlay=pendingPlay||!snapshot.paused;
      stallRepairs=0;repairPosition=0;
      return attachSource(choice.playbackUrl,dataForSource(choice),{position,shouldPlay});
    }
    function languageOf(track) {
      const language=String(track?.language||track?.lang||'').trim().toLowerCase().replaceAll('_','-');
      const aliases={eng:'en',fre:'fr',fra:'fr',ger:'de',deu:'de',spa:'es',ita:'it',por:'pt',jpn:'ja',kor:'ko',chi:'zh',zho:'zh',rus:'ru',hin:'hi',ara:'ar',und:''};
      const [base,...region]=language.split('-');return [aliases[base]??base,...region].filter(Boolean).join('-');
    }
    function preferredAudioIndex(tracks,language=languageOf) {
      if(!audioPreference)return -1;const exact=tracks.findIndex(track=>language(track)===audioPreference);
      return exact>=0?exact:tracks.findIndex(track=>language(track).split('-')[0]===audioPreference.split('-')[0]);
    }
    function trackLabel(track,index,noun) {
      const label=track?.label||track?.name||track?.labels?.[0]?.text;if(label)return String(label);
      const language=languageOf(track);if(language){try{return new Intl.DisplayNames(['en'],{type:'language'}).of(language)||language;}catch{return language;}}
      return noun+' '+(index+1)+' · language unavailable';
    }
    function observeTrackLists(token=generation) {
      const current=video,guard=fn=>()=>{if(alive(token)&&video===current)fn();};
      if(current.audioTracks?.addEventListener&&observedAudio!==current.audioTracks){observedAudio=current.audioTracks;for(const name of ['addtrack','removetrack'])listen(observedAudio,name,guard(()=>updateAudio({prefer:true})),mediaListeners);listen(observedAudio,'change',guard(()=>{if(!applyingAudio)updateAudio();}),mediaListeners);}
      if(current.textTracks?.addEventListener&&observedText!==current.textTracks){observedText=current.textTracks;for(const name of ['addtrack','removetrack'])listen(observedText,name,guard(()=>updateCaptions({prefer:true})),mediaListeners);listen(observedText,'change',guard(()=>{if(!applyingCaptions)updateCaptions({follow:true});}),mediaListeners);}
    }
    function applyAudio(index) {
      const choice=audioOptions[index];if(!choice)return;
      applyingAudio=true;
      try {
        if(choice.kind==='hls')hls.audioTrack=choice.index;
        else if(choice.kind==='dash')dash.setCurrentTrack(choice.track);
        else if(choice.kind==='source')switchSource(choice.index);
        else for(const item of audioOptions)item.track.enabled=item===choice;
      } finally {applyingAudio=false;}
    }
    function updateAudio({prefer=false}={}) {
      observeTrackLists();const select=find('audio');if(!select)return;
      let tracks=[],kind='native',current=-1;
      try {
        if(hls?.audioTracks?.length){tracks=Array.from(hls.audioTracks);kind='hls';current=hls.audioTrack;}
        else if(dash){tracks=dash.getTracksFor('audio')||[];kind='dash';const active=dash.getCurrentTrackFor?.('audio');current=tracks.findIndex(track=>track===active||active&&track.id!=null&&track.id===active.id);}
        else {tracks=Array.from(video.audioTracks||[]);current=tracks.findIndex(track=>track.enabled);}
      }catch{}
      if(!tracks.length){
        const languages=new Set();tracks=sourceOptions.flatMap((item,index)=>{const language=languageOf({language:item.audioLanguage});if(!language||languages.has(language))return [];languages.add(language);return [{language,sourceIndex:index}];});kind='source';current=tracks.findIndex(track=>track.language===languageOf({language:activeSourceData?.audioLanguage}));
        if(!tracks.length&&activeSourceData?.audioLanguage){tracks=[{language:activeSourceData.audioLanguage,sourceIndex:sourceOptions.findIndex(item=>item.playbackUrl===source)}];current=0;}
        if(current<0&&activeSourceData){tracks.unshift({language:'',sourceIndex:sourceOptions.findIndex(item=>item.playbackUrl===source)});current=0;}
      }
      audioOptions=tracks.map((track,index)=>({track,index:kind==='source'?track.sourceIndex:index,kind}));
      if(prefer&&audioPreference&&kind!=='source'){const preferred=preferredAudioIndex(tracks);if(preferred>=0&&preferred!==current){try{applyAudio(preferred);current=preferred;}catch{}}}
      select.replaceChildren();
      if(!tracks.length){const option=document.createElement('option');option.value='-1';option.textContent='Language unavailable';select.append(option);}
      else tracks.forEach((track,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=trackLabel(track,index,'Audio');select.append(option);});
      select.disabled=tracks.length<2;select.value=String(current<0&&tracks.length?0:current);
    }
    function applyCaption(value) {
      const choice=captionOptions.find(item=>item.value===String(value));applyingCaptions=true;
      try {
        if(hls?.subtitleTracks?.length){const selected=choice?.kind==='hls'?choice.index:-1;hls.subtitleTrack=selected;hls.subtitleDisplay=selected>=0;}
        if(dash)dash.setTextTrack?.(choice?.kind==='dash'?choice.index:-1);
        if(choice?.kind!=='hls'&&choice?.kind!=='dash')for(const track of Array.from(video.textTracks||[]))track.mode=choice?.track===track?'showing':'disabled';
        for(const item of captionOptions)if(item.kind==='external'&&item.track)item.track.mode=item===choice?'showing':'disabled';
        captionActive=choice?.value||'-1';
      } finally {applyingCaptions=false;}
    }
    function updateCaptions({prefer=false,follow=false}={}) {
      observeTrackLists();const select=find('captions'),nodes=Array.from(video.querySelectorAll('track[data-player-external-caption]'));
      const externalTracks=nodes.map(node=>node.track).filter(Boolean);let tracks=[],kind='native';
      try {
        if(hls?.subtitleTracks?.length){tracks=Array.from(hls.subtitleTracks);kind='hls';}
        else if(dash){tracks=dash.getTracksFor('text')||[];kind='dash';}
        else tracks=Array.from(video.textTracks||[]).filter(track=>!externalTracks.includes(track)&&(!track.kind||['subtitles','captions'].includes(track.kind)));
      }catch{}
      captionOptions=tracks.map((track,index)=>({track,index,kind,value:String(index),key:kind+':'+languageOf(track)+':'+trackLabel(track,index,'Captions'),language:languageOf(track),label:trackLabel(track,index,'Captions')}));
      nodes.forEach((node,index)=>{if(node.dataset.playerCaptionFailed)return;captionOptions.push({track:node.track,kind:'external',value:'external:'+index,key:node.src,language:languageOf({language:node.srclang}),label:node.label||'Captions '+(index+1)});});
      if(prefer){
        const preferred=captionPreference&&(captionOptions.find(item=>item.key===captionPreference.key)||captionOptions.find(item=>item.language===captionPreference.language&&item.label===captionPreference.label)||captionOptions.find(item=>item.language&&item.language===captionPreference.language));
        try{applyCaption(preferred?.value||'-1');}catch{}
      }else if(follow){
        let active=captionOptions.find(item=>item.track?.mode==='showing');
        if(hls&&hls.subtitleDisplay!==false&&hls.subtitleTrack>=0)active=captionOptions.find(item=>item.kind==='hls'&&item.index===hls.subtitleTrack)||active;
        if(dash){try{const current=dash.getCurrentTrackFor?.('text');if(dash.isTextEnabled?.()!==false&&current)active=captionOptions.find(item=>item.kind==='dash'&&(item.track===current||item.track.id!=null&&item.track.id===current.id))||active;}catch{}}
        captionActive=active?.value||'-1';captionPreference=active?{key:active.key,language:active.language,label:active.label}:null;
      }
      if(!captionOptions.some(item=>item.value===captionActive))captionActive='-1';
      select.replaceChildren();const off=document.createElement('option');off.value='-1';off.textContent=captionOptions.length?'Off':'Unavailable';select.append(off);
      for(const item of captionOptions){const option=document.createElement('option');option.value=item.value;option.textContent=item.label;select.append(option);}select.disabled=!captionOptions.length;select.value=captionActive;
    }
    function addCaptions(data) {
      const tracks=Array.isArray(data.subtitles)?data.subtitles:Array.isArray(data.captions)?data.captions:[];
      const seen=new Set(),token=generation,current=video;
      for(const [index,item] of tracks.entries()){const url=safeUrl(item.url||item.src||item.file);if(!url||seen.has(url))continue;seen.add(url);const track=document.createElement('track');track.dataset.playerExternalCaption='true';track.kind=item.kind==='captions'?'captions':'subtitles';track.src=url;track.srclang=String(item.language||item.lang||'');track.label=String(item.label||item.name||item.language||'Captions '+(index+1));
        listen(track,'load',()=>{if(alive(token)&&video===current)updateCaptions({prefer:true});},mediaListeners);
        listen(track,'error',()=>{if(!alive(token)||video!==current)return;track.dataset.playerCaptionFailed='true';if(track.track)track.track.mode='disabled';updateCaptions({prefer:true});showToast('Those captions could not load. Choose another caption track.');},mediaListeners);video.append(track);}
      updateCaptions({prefer:true});
    }
    function applyResume() {
      if(resumeAt>0&&video.readyState>=1){
        const bounds=range();if(!bounds||personalResume>0&&bounds.live)return;
        const target=personalResume>0&&resumeAt>=bounds.end?bounds.start:Math.max(bounds.start,Math.min(bounds.end,resumeAt));
        try {video.currentTime=target;lastTime=number(video.currentTime,0);resumeAt=0;personalResume=0;}catch{}
      }
    }
    function bindMedia(token) {
      const current=video,guard=fn=>event=>{if(alive(token)&&video===current)fn(event);};
      const fitPicture=()=>{
        const width=current.videoWidth,height=current.videoHeight;
        if(width>0&&height>0)app.style.setProperty('--player-aspect',String(width/height));
      };
      listen(current,'loadedmetadata',guard(()=>{fitPicture();applyResume();updateTime();updateCaptions({prefer:true});updateAudio({prefer:true});}),mediaListeners);
      listen(current,'resize',guard(fitPicture),mediaListeners);
      listen(current,'durationchange',guard(()=>{applyResume();updateTime();}),mediaListeners);
      const canPlay=guard(()=>{
        if(current.readyState<2)return;const first=!playable;playable=true;applyResume();if(first||current.paused)stopWatchdog();
        setStatus('ready');rememberServer();if(first)dispatch('ready',getState());
        if(pendingPlay){pendingPlay=false;play({remote:true});}else if(!current.paused)watchProgress();
      });
      listen(current,'canplay',canPlay,mediaListeners);listen(current,'playing',canPlay,mediaListeners);
      listen(current,'play',guard(()=>{hasPlayed=true;updateControls();if(playable)watchProgress();emitState();}),mediaListeners);
      listen(current,'pause',guard(()=>{savePlayback(true);if(playable)stopWatchdog();if(playable&&phase!=='ended')setStatus('ready');else updateControls();emitState();}),mediaListeners);
      listen(current,'ended',guard(()=>{savePlayback(true,true);stopWatchdog();try{current.pause();}catch{}setStatus('ended');}),mediaListeners);
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
      listen(current,'seeked',guard(()=>{if(playable&&current.readyState>=2){setStatus('ready');if(current.paused)stopWatchdog();else watchProgress();}savePlayback(true);updateTime();emitState();}),mediaListeners);
      listen(current,'timeupdate',guard(()=>{
        const time=number(current.currentTime,0),advance=time-lastTime;
        if(Math.abs(advance)>.1){
          lastTime=time;
          if(stallRepairs&&time-repairPosition>=30){stallRepairs=0;repairPosition=0;}
          if(!current.paused||phase==='buffering')watchProgress({renew:true});
          if(playable&&!current.paused&&!current.seeking&&advance>.1&&phase==='buffering')setStatus('ready');
        }
        savePlayback();updateTime();emitState();
      }),mediaListeners);
      listen(current,'progress',guard(()=>{const end=bufferedEnd();if(end>lastBuffer+.1){lastBuffer=end;if(stallTimer)watchProgress({renew:true});}updateTime();}),mediaListeners);
      listen(current,'volumechange',guard(updateControls),mediaListeners);
      listen(current,'ratechange',guard(()=>{find('speed').value=String(current.playbackRate);emitState();}),mediaListeners);
      listen(current,'error',guard(()=>{
        const code=current.error?.code;if(code===1)return;
        if(code===2&&playable&&sourceData&&!current.paused){
          recoverStall('The '+mediaName()+' connection was interrupted.');return;
        }
        mediaFailure(code===3||code===4?'This browser could not play the '+mediaName()+'’s format. Try another browser, or retry playback.':'The '+mediaName()+' connection was interrupted. Check your connection, then try again.');
      }),mediaListeners);
      observeTrackLists(token);
    }
    async function loadSource(data,{resumeAt:position=0,restoreSource=''}={}) {
      if(destroyed||suspended)return false;
      if(data?.status==='loading'){
        const nextId=String(data.movieId||data.mediaId||mediaId),nextType=data.type==='tv'?'tv':data.type==='movie'?'movie':mediaType;
        const key=String(data.jobId||nextId+':'+nextType);if(phase==='loading'&&loadingKey===key)return false;
        cancelResolver();teardownMedia({replace:true});source='';sourceData=null;resetSourceOptions();loadingKey=key;mediaId=nextId;mediaType=nextType;setStatus('loading');
        const deadline=deadlineForSnapshot(data,Date.now()+config.resolve);watchProgress({delay:Math.min(config.resolve,Math.max(1,deadline-Date.now()))});return false;
      }
      if(['error','disabled','idle'].includes(data?.status)){mediaId=String(data.movieId||data.mediaId||mediaId);mediaType=data.type==='tv'?'tv':data.type==='movie'?'movie':mediaType;fail(discoveryMessage(data),data?.code);return false;}
      const next=chooseSource(data);
      if(!next){fail('The '+mediaName()+' is unavailable right now. Try again in a moment.');return false;}
      const nextId=String(data.movieId||data.mediaId||mediaId),nextType=data.type==='tv'?'tv':data.type==='movie'?'movie':mediaType;
      const key=snapshotKey(data,next,nextId,nextType);
      if(key===sourceSnapshotKey&&sourceData&&phase!=='error'){
        if(position>0)seek(position,{remote:true});return true;
      }
      sourceData={...data};sourceSnapshotKey=key;sourceOptions=prepareSources(data,next);mediaId=nextId;mediaType=nextType;loadingKey='';
      stallRepairs=0;repairPosition=0;
      const preferred=failedPreferenceMedia===mediaKey(data,nextId,nextType)?null:sourceOptions[preferredAudioIndex(sourceOptions,item=>languageOf({language:item.audioLanguage}))];
      const choice=sourceOptions.find(item=>item.playbackUrl===restoreSource)||preferred||sourceOptions.find(item=>item.playbackUrl===next);return attachSource(choice.playbackUrl,dataForSource(choice),{position});
    }
    async function attachSource(next,data,{position=0,shouldPlay=false}={}) {
      cancelResolver();teardownMedia({replace:true});source=next;activeSourceData=data;
      resumeAt=Math.max(0,number(position,0));lastTime=0;lastBuffer=0;hlsRecovery={network:0,media:0};
      pendingPlay=shouldPlay;
      const token=generation;setStatus('loading');bindMedia(token);addCaptions(data);updateQuality();updateAudio();watchProgress();
      const kind=mediaKind(next,data);
      try {
        if(kind==='hls'){
          const nativeHls=video.canPlayType('application/vnd.apple.mpegurl');
          const useNative=()=>{video.src=next;video.load();return true;};
          // Chromium's tentative native HLS path can hand fMP4 playlists to its
          // file demuxer. Prefer MSE for "maybe"; retain confident native HLS.
          if(nativeHls==='probably')return useNative();
          let Hls;
          try {Hls=await loadLibrary('hls');}
          catch(error){if(!alive(token))return false;if(nativeHls)return useNative();throw error;}
          if(!alive(token))return false;
          if(!Hls.isSupported()){if(nativeHls)return useNative();throw new Error('unsupported');}
          hls=new Hls({enableWorker:true,maxBufferLength:30,manifestLoadingTimeOut:config.request,manifestLoadingMaxRetry:1,levelLoadingTimeOut:config.request,levelLoadingMaxRetry:1,fragLoadingTimeOut:config.request,fragLoadingMaxRetry:1});
          const instance=hls,subscribe=(name,fn)=>{if(!name)return;const callback=(event,payload)=>{if(alive(token)&&hls===instance)fn(payload||{});};instance.on(name,callback);libraryListeners.push(()=>instance.off?.(name,callback));};
          subscribe(Hls.Events.MANIFEST_PARSED,()=>{updateQuality();updateCaptions({prefer:true});updateAudio({prefer:true});});subscribe(Hls.Events.LEVEL_SWITCHED,updateQuality);subscribe(Hls.Events.SUBTITLE_TRACKS_UPDATED,()=>updateCaptions({prefer:true}));subscribe(Hls.Events.SUBTITLE_TRACK_SWITCH,()=>{if(!applyingCaptions)updateCaptions({follow:true});});
          subscribe(Hls.Events.AUDIO_TRACKS_UPDATED,()=>updateAudio({prefer:true}));subscribe(Hls.Events.AUDIO_TRACK_SWITCHED,()=>{if(!applyingAudio)updateAudio();});
          subscribe(Hls.Events.ERROR,error=>{
            if(!error.fatal)return;
            if(error.type===Hls.ErrorTypes.MEDIA_ERROR&&hlsRecovery.media++===0){setStatus('buffering');instance.recoverMediaError();watchProgress();return;}
            if(error.type===Hls.ErrorTypes.NETWORK_ERROR&&hlsRecovery.network++===0){setStatus('buffering');instance.startLoad();watchProgress();return;}
            mediaFailure(error.type===Hls.ErrorTypes.MEDIA_ERROR?'This browser could not play the '+mediaName()+'’s format. Try another browser, or retry playback.':'The '+mediaName()+' connection was interrupted. Check your connection, then try again.');
          });
          instance.loadSource(next);instance.attachMedia(video);
        }else if(kind==='dash'){
          const library=await loadLibrary('dash');if(!alive(token))return false;
          dash=library.MediaPlayer().create();const instance=dash,events=library.MediaPlayer.events||{};
          const subscribe=(name,fn)=>{if(!name)return;const callback=event=>{if(alive(token)&&dash===instance)fn(event);};instance.on(name,callback);libraryListeners.push(()=>instance.off?.(name,callback));};
          subscribe(events.STREAM_INITIALIZED,()=>{updateQuality();updateCaptions({prefer:true});updateAudio({prefer:true});});subscribe(events.TEXT_TRACKS_ADDED,()=>updateCaptions({prefer:true}));subscribe(events.TRACK_CHANGE_RENDERED,()=>{if(!applyingAudio)updateAudio();if(!applyingCaptions)updateCaptions({follow:true});});subscribe(events.ERROR,()=>mediaFailure('The '+mediaName()+' could not load. Check your connection, then retry playback.'));
          instance.initialize(video,next,false);
        }else {video.src=next;video.load();}
        return true;
      } catch(error) {
        if(alive(token))mediaFailure(error.message==='unsupported'?'This browser does not support this '+mediaName()+' format. Try another browser.':'Playback could not load. Check your connection or browser blockers, then try again.');return false;
      }
    }
    function requestJson(url,timeout) {
      return new Promise((resolve,reject)=>{
        const controller=new AbortController();let settled=false,timer=0;
        const finish=(error,data)=>{if(settled)return;settled=true;clearTimeout(timer);tasks.delete(task);if(error)reject(error);else resolve(data);};
        const task={category:'resolver',cancel:()=>{controller.abort();finish(new Error('cancelled'));}};tasks.add(task);
        timer=setTimeout(()=>{controller.abort();finish(new Error('timeout'));},Math.max(1,timeout));
        Promise.resolve().then(()=>fetch(url,{signal:controller.signal,cache:'no-store',headers:{Accept:'application/json'}})).then(async response=>{
          if(!response.ok){const error=new Error('response');error.httpStatus=response.status;throw error;}const data=await response.json();finish(null,data);
        }).catch(error=>finish(error));
      });
    }
    function waitPoll(delay) {
      return new Promise(resolve=>{let timer=0;const done=value=>{clearTimeout(timer);tasks.delete(task);resolve(value);};const task={category:'resolver',cancel:()=>done(false)};tasks.add(task);timer=setTimeout(()=>done(true),delay);});
    }
    async function resolve({retry=false}={}) {
      if(destroyed||suspended)return false;
      if(managed||remoteMode.enabled){if(retry&&!locked())dispatch('retry',{mediaId,type:mediaType});return false;}
      cancelResolver();teardownMedia({replace:true});source='';sourceData=null;resetSourceOptions();loadingKey='';delete app.dataset.playerFailureCode;setStatus('loading');
      const token=resolverGeneration;lookupDeadline=Date.now()+config.resolve;let first=true,transportFailures=0,busyCount=0,providerRetries=0;
      const query=new URLSearchParams();if(mediaType==='tv'){query.set('season',app.dataset.playerSeason||'1');query.set('episode',app.dataset.playerEpisode||'1');}if(app.dataset.playerProvider)query.set('provider',app.dataset.playerProvider);
      const endpoint='/api/proxy-video-wait/'+encodeURIComponent(mediaType)+'/'+encodeURIComponent(mediaId);
      const preferred=readRememberedServer(),entry=mediaKey({});
      if(preferred&&localContinuity()&&!continuityTried.has(entry)){
        continuityTried.add(entry);
        try{
          const requestQuery=new URLSearchParams(query);requestQuery.set('provider',preferred);
          const data=await requestJson('/api/player/server/'+encodeURIComponent(mediaType)+'/'+encodeURIComponent(mediaId)+'?'+requestQuery,Math.min(10000,config.request,Math.max(1,lookupDeadline-Date.now())));
          if(destroyed||suspended||token!==resolverGeneration||!app.isConnected||entry!==mediaKey({}))return false;
          if(localContinuity()&&continuityEnabled()&&['ok','ready'].includes(data?.status)&&matchesEpisode(data)&&chooseSource(data))return loadSource(data,{resumeAt:retry?Math.max(retryResume,personalResume):personalResume});
        }catch{if(destroyed||suspended||token!==resolverGeneration||!app.isConnected)return false;}
      }
      while(!destroyed&&!suspended&&app.isConnected&&token===resolverGeneration){
        if(Date.now()>=lookupDeadline){fail('The '+mediaName()+' took too long to become available. Try again in a moment.');return false;}
        const requestQuery=new URLSearchParams(query);if(retry&&first)requestQuery.set('retry','1');first=false;
        try {
          // Leave room for transport and response parsing around the server wait.
          // Slow fallback lookups must not repeatedly lose their long-poll response.
          const waitMs=Math.max(0,Math.min(6000,Math.floor(config.request/2),lookupDeadline-Date.now()-1000));
          if(waitMs>0)requestQuery.set('wait',String(Math.floor(waitMs)));
          const queryText=requestQuery.toString();
          const data=await requestJson(endpoint+(queryText?'?'+queryText:''),Math.min(config.request,lookupDeadline-Date.now()));
          if(destroyed||suspended||token!==resolverGeneration||!app.isConnected)return false;
          transportFailures=0;
          if(data?.status==='ok'||data?.status==='ready')return loadSource(data,{resumeAt:retry?Math.max(retryResume,personalResume):personalResume});
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
      catch(error){if(!alive(token)||intent!==transportIntent)return false;if(error?.name==='NotAllowedError'){unlockRemote=remote;find('unlock').querySelector('span').textContent=remoteMode.enabled&&remote?'Join playback':'Play '+mediaName();find('unlock').hidden=false;stopWatchdog();setStatus('ready');}else if(error?.name!=='AbortError')mediaFailure('Playback could not begin. Try again in a moment.');return false;}
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
      // A party owns this page after joining, including in-place episode changes
      // and leaving the room. A new solo page owns personal progress again.
      if(enabled||manual){savePlayback(true);soloTracking=false;if(personalResume>0)resumeAt=0;personalResume=0;}
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
      if(destroyed)return;cancelResolver();teardownMedia();cancelTasks();clearListeners(listeners);destroyed=true;glass?.destroy();glass=null;instances.delete(app);sourceData=null;resetSourceOptions();video.controls=true;controls.hidden=true;emitState();
    }
    const api=Object.freeze({loadSource,resolve,retry:()=>resolve({retry:true}),getState,play,pause,seek,setRemoteMode,destroy});
    instances.set(app,api);
    listen(document,'swifly:studio-change',event=>{if(event.detail?.effective)applyAppearance(event.detail.effective);});
    listen(window,'swifly:library-change',readRememberedServer);
    for(const query of [transparencyQuery,motionQuery]){
      const changed=()=>applyAppearance(appearance);
      if(query?.addEventListener)listen(query,'change',changed);
      else if(query?.addListener){query.addListener(changed);listeners.push(()=>query.removeListener(changed));}
    }
    listen(app,'swiflyplayer:tv-controls',tvControls);
    listen(find('play'),'click',()=>getState().paused?play():pause());
    listen(find('backward'),'click',()=>seek(number(video.currentTime,0)-10));listen(find('forward'),'click',()=>seek(number(video.currentTime,0)+10));
    listen(find('seek'),'input',event=>{if(locked())return;scrubbing=true;scrubTime=Number(event.target.value);updateTime();updateVisibility({reveal:true});});
    listen(find('seek'),'change',event=>{const value=Number(event.target.value);scrubbing=false;seek(value);updateTime();updateVisibility({reveal:true});});
    listen(find('seek'),'pointercancel',()=>{scrubbing=false;updateTime();updateVisibility({reveal:true});});
    listen(find('seek'),'blur',()=>{if(!scrubbing)return;scrubbing=false;seek(Number(find('seek').value));updateTime();updateVisibility({reveal:true});});
    listen(find('retry'),'click',()=>{if(!locked())resolve({retry:true});});
    listen(find('settings-close'),'click',()=>{closeMenu(find('settings'));find('settings').querySelector('summary').focus();});
    listen(find('servers-close'),'click',()=>{closeMenu(find('servers'));find('servers').querySelector('summary').focus();});
    listen(find('servers'),'toggle',()=>{if(find('servers')?.open)loadProviders();});
    listen(find('server-list'),'click',event=>{
      const option=event.target.closest?.('[data-player-server-index]');if(!option||serverChanging)return;
      const index=Number(option.dataset.playerServerIndex);
      if(!Number.isSafeInteger(index)||index<0)return;
      switchSource(index).then(ok=>{if(ok)closeMenu(find('servers'));else showToast('That stream is not available.');});
    });
    listen(find('server-provider'),'change',event=>{const b=find('server-try');if(b)b.disabled=!event.target.value||serverChanging;});
    listen(find('server-try'),'click',()=>changeProvider(find('server-provider')?.value));
    listen(find('find-4k'),'click',find4k);
    listen(find('volume-close'),'click',()=>{closeMenu(find('volume-menu'));find('volume-menu').querySelector('summary').focus();});
    listen(find('sync'),'click',()=>{dispatch('sync',getState());closeMenu(find('settings'));find('settings').querySelector('summary').focus();});
    listen(find('unlock'),'click',()=>play({remote:unlockRemote}));
    listen(find('volume'),'input',event=>{video.volume=Math.max(0,Math.min(1,Number(event.target.value)));video.muted=video.volume===0;updateControls();});
    listen(find('mute'),'click',()=>{video.muted=!video.muted;updateControls();});
    listen(find('speed'),'change',event=>{if(remoteMode.enabled)return;video.playbackRate=Number(event.target.value);});
    listen(find('audio'),'change',event=>{const index=Number(event.target.value),choice=audioOptions[index];if(!choice)return;try{applyAudio(index);audioPreference=languageOf(choice.track);try{localStorage.setItem('swifly.player.audioLanguage',audioPreference);}catch{}updateAudio();}catch{showToast('That audio track is unavailable.');}});
    listen(find('quality'),'change',event=>{const value=String(event.target.value);if(value.startsWith('source:')){switchSource(Number(value.slice(7)));return;}const quality=Number(value);try{if(hls)hls.currentLevel=quality;if(dash){dash.updateSettings({streaming:{abr:{autoSwitchBitrate:{video:quality<0}}}});if(quality>=0)dash.setQualityFor('video',quality,true);}}catch{showToast('That picture quality is unavailable.');}});
    listen(find('captions'),'change',event=>{const selected=String(event.target.value),choice=captionOptions.find(item=>item.value===selected);try{applyCaption(selected);captionPreference=choice?{key:choice.key,language:choice.language,label:choice.label}:null;updateCaptions();}catch{showToast('These captions are unavailable.');}});
    listen(find('fullscreen'),'click',fullscreen);listen(find('pip'),'click',()=>{pictureInPicture();closeMenu(find('settings'));find('settings').querySelector('summary').focus();});listen(app,'keydown',event=>{if(!event.defaultPrevented)updateVisibility({reveal:true});keyboard(event);});
    listen(stage,'pointermove',()=>updateVisibility({reveal:true}));listen(stage,'pointerdown',()=>updateVisibility({reveal:true}));
    listen(controls,'pointerenter',event=>{if(event.pointerType==='touch')return;controlsHovered=true;updateVisibility({reveal:true});});
    const leaveControls=()=>{controlsHovered=false;updateVisibility();};
    listen(controls,'pointerleave',leaveControls);listen(controls,'pointercancel',leaveControls);
    listen(stage,'focusin',event=>{if(controls.contains(event.target))tvLastFocus=event.target;updateVisibility({reveal:true});});listen(stage,'focusout',()=>{const token=generation;queueMicrotask(()=>{if(alive(token))updateVisibility();});});
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
    listen(document,'visibilitychange',()=>{if(document.hidden)savePlayback(true);syncGlass();});
    listen(window,'pagehide',event=>{
      savePlayback(true);
      if(!event.persisted){destroy();return;}const snapshot=getState(),data=sourceData,copy=find('status-copy').textContent,title=find('status-title').textContent;suspended=true;cancelResolver();teardownMedia();sourceData=null;source='';suspendState={snapshot,data,copy,title};
    });
    let suspendState=null;
    listen(window,'pageshow',event=>{
      if(!event.persisted||destroyed||!suspended)return;suspended=false;const cached=suspendState;suspendState=null;
      if(cached?.snapshot.status==='error'){setStatus('error',cached.title,cached.copy);return;}
      if(cached?.data){const loading=loadSource(cached.data,{resumeAt:cached.snapshot.currentTime,restoreSource:cached.snapshot.source}),token=generation;loading.then(ok=>{if(ok&&alive(token)&&!cached.snapshot.paused)play({remote:true});});if(managed)dispatch('resume',getState());}
      else if(!managed)resolve();else {setStatus('waiting');dispatch('resume',getState());}
    });
    applyAppearance(window.SwiflyAppearance);
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
