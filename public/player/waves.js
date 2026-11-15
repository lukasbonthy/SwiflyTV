/* Pixel ripples with a tiny, throttled movie-color sample. Playback is untouched. */
(() => {
  'use strict';
  const root=document.querySelector('.svPlayerPage'),backdrop=root?.querySelector('[data-player-waves]');
  if(!backdrop)return;
  const canvas=backdrop.querySelector('canvas');
  let context;
  try{context=canvas.getContext('2d',{alpha:false});}catch{return;}
  if(!context)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),mobile=matchMedia('(max-width: 700px), (pointer: coarse)');
  const contrast=matchMedia('(forced-colors: active)'),transparency=matchMedia('(prefers-reduced-transparency: reduce)');
  const cleanups=[],palette=Array.from({length:20},(_,i)=>{const value=Math.round((28+i*11.8)/252*156);return `rgb(${value} ${value} ${value})`;});
  const sampleWidth=24,sampleHeight=14,identity=[root.dataset.playerType,root.dataset.playerId,root.dataset.playerTitle].filter(Boolean).join(':');
  let identityHash=0;for(const char of identity)identityHash=(identityHash*31+char.charCodeAt(0))>>>0;
  const seed=identity?[[184,142,110],[122,156,210],[169,132,202],[203,133,152]][identityHash%4]:[156,156,156];
  let fallback=Array.from({length:6},()=>seed.slice()),lastColorful=null,lastFrameDark=true,artKey='';
  const colors=Array.from({length:6},()=>[156,156,156]),targets=Array.from({length:6},()=>[156,156,156]);
  let tint=Array.from({length:6},()=>palette),sampleCanvas=null,sampleContext=null,sampleVideo=null,sampleSource='',blockedSource=false,lastSample=-Infinity,lastVideoTime=-1;
  let appearance=window.SwiflyAppearance||{},cells=new Float32Array(0),step=8,frame=0,clock=0,last=0,painted=0;
  let running=false,inView=true,suspended=false,nativeFullscreen=false,destroyed=false,started=false;
  const bursts=[];
  function listen(target,name,handler,options){target.addEventListener(name,handler,options);cleanups.push(()=>target.removeEventListener(name,handler,options));}
  function resetColors(){for(let i=0;i<6;i++)for(let c=0;c<3;c++)colors[i][c]=targets[i][c]=fallback[i][c];tint=colors.map(color=>palette.map((_,level)=>{const light=(28+level*11.8)/252;return `rgb(${Math.round(color[0]*light)} ${Math.round(color[1]*light)} ${Math.round(color[2]*light)})`;}));}
  function setTargets(next){for(let i=0;i<6;i++)for(let c=0;c<3;c++)targets[i][c]=next[i][c];}
  function framePalette(data){
    const sums=Array.from({length:6},()=>[0,0,0,0]),total=[0,0,0,0];
    for(let y=0;y<sampleHeight;y++)for(let x=0;x<sampleWidth;x++){
      const offset=(y*sampleWidth+x)*4,r=data[offset],g=data[offset+1],b=data[offset+2];
      if(data[offset+3]<128||.2126*r+.7152*g+.0722*b<18)continue;
      const sum=sums[Math.min(2,Math.floor(x/sampleWidth*3))+(y<sampleHeight/2?0:3)];
      for(const bucket of [sum,total]){bucket[0]+=r;bucket[1]+=g;bucket[2]+=b;bucket[3]++;}
    }
    if(!total[3])return null;
    const normalize=sum=>{const peak=Math.max(sum[0],sum[1],sum[2])/sum[3],gain=Math.min(6,228/peak);return sum.slice(0,3).map(value=>value/sum[3]*gain);};
    const whole=normalize(total);
    // Every region includes the whole picture. Black borders cannot hide a
    // colorful subject that happens to be in the center of the film.
    return sums.map(sum=>sum[3]?normalize(sum).map((value,c)=>value*.78+whole[c]*.22):whole.slice());
  }
  function artworkFallback(){
    const art=root.querySelector('.svPlayerAmbient img');
    if(!art?.complete||!art.naturalWidth||art.crossOrigin!=='anonymous')return false;
    const key=art.currentSrc||art.src;if(!key||key===artKey)return false;artKey=key;
    try{const field=document.createElement('canvas');field.width=sampleWidth;field.height=sampleHeight;const paint=field.getContext('2d',{willReadFrequently:true});if(!paint)return false;paint.drawImage(art,0,0,sampleWidth,sampleHeight);const next=framePalette(paint.getImageData(0,0,sampleWidth,sampleHeight).data);if(next){fallback=next;return true;}}catch{}
    return false;
  }
  function blendColors(elapsed){
    const mix=1-Math.exp(-elapsed/100);let changed=false;
    for(let i=0;i<6;i++)for(let c=0;c<3;c++){const delta=targets[i][c]-colors[i][c];if(!delta)continue;colors[i][c]=Math.abs(delta)<.1?targets[i][c]:colors[i][c]+delta*mix;changed=true;}
    if(changed)tint=colors.map(color=>palette.map((_,level)=>{const light=(28+level*11.8)/252;return `rgb(${Math.round(color[0]*light)} ${Math.round(color[1]*light)} ${Math.round(color[2]*light)})`;}));
  }
  function sample(now){
    const video=root.querySelector('[data-player-video]');
    if(!video)return;
    const source=video.currentSrc||video.src||'';
    if(video!==sampleVideo||source!==sampleSource){
      sampleVideo=video;sampleSource=source;blockedSource=false;lastVideoTime=-1;
      if(sampleCanvas)sampleCanvas.width=sampleWidth;
      lastColorful=null;lastFrameDark=true;resetColors();
    }
    if(artworkFallback()&&(lastFrameDark||blockedSource))setTargets(lastColorful||fallback);
    if(video.readyState<2||!video.videoWidth||!video.videoHeight||now-lastSample<(mobile.matches?250:125)||blockedSource||video.currentTime===lastVideoTime)return;
    lastSample=now;lastVideoTime=video.currentTime;
    try{
      if(!sampleCanvas){sampleCanvas=document.createElement('canvas');sampleCanvas.width=sampleWidth;sampleCanvas.height=sampleHeight;sampleContext=sampleCanvas.getContext('2d',{willReadFrequently:true});}
      if(!sampleContext)return;
      sampleContext.drawImage(video,0,0,sampleWidth,sampleHeight);
      const next=framePalette(sampleContext.getImageData(0,0,sampleWidth,sampleHeight).data);
      if(next){lastFrameDark=false;setTargets(next);if(next.some(color=>Math.max(...color)-Math.min(...color)>18))lastColorful=next;}
      else{lastFrameDark=true;setTargets(lastColorful||fallback);}
    }catch(error){
      if(error?.name==='SecurityError'){blockedSource=true;lastColorful=null;lastFrameDark=true;resetColors();}
      // A protected source uses artwork/metadata color without altering playback.
    }
  }
  function burst(){const wasRunning=running;started=true;bursts.push(clock);if(bursts.length>3)bursts.shift();sync();if(wasRunning||!running)draw();}
  function draw(){
    context.fillStyle='#000';context.fillRect(0,0,canvas.width,canvas.height);
    if(!started)return;
    while(bursts.length&&clock-bursts[0]>=.95)bursts.shift();
    const impulses=bursts.map(start=>{const age=clock-start;return [age*.95,(1-age/.95)*1.4];});
    const travel=clock*.15+.46*(1-Math.exp(-clock*4)),phase=travel%.68,sin=Math.sin(clock*.21),cos=Math.cos(clock*.21);
    for(let i=0;i<cells.length;i+=7){
      const radius=cells[i+2]+.024*(cells[i+3]*cos+cells[i+4]*sin);
      let distance=Math.abs(radius-phase);
      // The first emission has no preceding ring at the viewport edges.
      if(travel>=.68)distance=Math.min(distance,Math.abs(radius-phase-.68));
      let light=Math.max(0,1-distance/.065);
      for(const [radiusAt,strength]of impulses)light=Math.max(light,Math.max(0,1-Math.abs(radius-radiusAt)/.075)*strength);
      light=Math.min(1,light);
      light=light*light*cells[i+5];
      if(light<.014)continue;
      const level=Math.min(19,Math.floor(light*20)),size=Math.max(1,step*(.16+.72*Math.sqrt(light)));
      context.fillStyle=tint[cells[i+6]][level];
      context.fillRect(Math.round(cells[i]-size/2),Math.round(cells[i+1]-size/2),Math.ceil(size),Math.ceil(size));
    }
  }
  function resize(){
    const bounds=backdrop.getBoundingClientRect();
    if(!bounds.width||!bounds.height)return;
    const ratio=Math.min(1,1280/bounds.width,900/bounds.height);
    canvas.width=Math.max(1,Math.floor(bounds.width*ratio));canvas.height=Math.max(1,Math.floor(bounds.height*ratio));
    step=Math.max(4,Math.round((mobile.matches?10:9)*ratio));
    const columns=Math.ceil(canvas.width/step),rows=Math.ceil(canvas.height/step);
    const film=root.querySelector('[data-player-stage]')?.getBoundingClientRect();
    const originX=film?.width?(film.left+film.width/2-bounds.left)*ratio:canvas.width/2;
    const originY=film?.height?(film.top+film.height/2-bounds.top)*ratio:canvas.height/2;
    cells=new Float32Array(columns*rows*7);
    let index=0;
    for(let y=step/2;y<canvas.height+step/2;y+=step)for(let x=step/2;x<canvas.width+step/2;x+=step){
      const nx=(x-originX)/canvas.width,ny=(y-originY)/canvas.height,angle=Math.atan2(ny,nx);
      const texture=Math.sin(nx*23+ny*15)*Math.sin(ny*17-nx*9);
      cells[index++]=x;cells[index++]=y;
      cells[index++]=Math.hypot(nx,ny)+.012*Math.sin(angle*5)+.009*texture;
      cells[index++]=Math.sin(angle*3);cells[index++]=Math.cos(angle*3);
      cells[index++]=.83+.17*texture;
      cells[index++]=Math.min(2,Math.floor(x/canvas.width*3))+(y<canvas.height/2?0:3);
    }
    draw();
  }
  function tick(now){
    frame=0;
    if(!root.isConnected){destroy();return;}
    if(!running)return;
    if(last)clock+=Math.min(64,now-last)/1000;
    last=now;
    if(now-painted>=(mobile.matches?1000/30:1000/60)-1){sample(now);blendColors(painted?Math.min(100,now-painted):16);draw();painted=now;}
    frame=requestAnimationFrame(tick);
  }
  function sync(){
    if(destroyed)return;
    const off=contrast.matches||transparency.matches||appearance.highContrast===true||appearance.reduceTransparency===true||
      ['xbox','minimal'].includes(appearance.performancePreset)||root.dataset.playerContrast==='high'||
      document.body.dataset.stHighContrast==='true'||document.documentElement.dataset.svTv==='true'||document.documentElement.dataset.svXbox==='true';
    const still=['loading','reveal'].includes(document.documentElement.dataset.svArtworkState)||suspended||nativeFullscreen||document.hidden||!!document.fullscreenElement||!inView||reduced.matches||appearance.reduceMotion===true||
      appearance.auroraMotion==='still'||root.dataset.playerMotion==='reduce'||document.body.classList.contains('reduceMotion');
    backdrop.hidden=off;
    backdrop.dataset.waveState=off?'off':!started?'idle':still?'still':'live';
    const next=started&&!off&&!still;
    if(next===running)return;
    running=next;last=0;
    if(frame){cancelAnimationFrame(frame);frame=0;}
    if(running){if(!cells.length)resize();else draw();frame=requestAnimationFrame(tick);}
  }
  function resume(){if(suspended){suspended=false;sync();}}
  function destroy(){
    if(destroyed)return;destroyed=true;running=false;
    if(frame)cancelAnimationFrame(frame);
    viewport?.disconnect();size?.disconnect();settings.disconnect();bodySettings.disconnect();documentSettings.disconnect();
    for(const remove of cleanups)remove();
  }
  const settings=new MutationObserver(sync),bodySettings=new MutationObserver(sync),documentSettings=new MutationObserver(sync);
  settings.observe(root,{attributes:true,attributeFilter:['data-player-motion','data-player-contrast']});
  bodySettings.observe(document.body,{attributes:true,attributeFilter:['class','data-st-high-contrast']});
  documentSettings.observe(document.documentElement,{attributes:true,attributeFilter:['data-sv-tv','data-sv-xbox','data-sv-artwork-state']});
  const viewport=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;sync();}):null;
  // Observe the movie page, which stays visible when its decorative layer is disabled.
  viewport?.observe(root);
  const size=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
  size?.observe(backdrop);
  const film=root.querySelector('[data-player-stage]');if(film)size?.observe(film);
  for(const query of [reduced,mobile,contrast,transparency])listen(query,'change',()=>{resize();sync();});
  listen(root,'swiflyplayer:play-intent',burst);
  listen(root,'swiflyplayer:resume',resume);
  listen(root,'swiflyplayer:state',event=>{if(event.detail?.ready)resume();});
  listen(document,'visibilitychange',sync);
  listen(document,'fullscreenchange',sync);
  listen(root,'webkitbeginfullscreen',()=>{nativeFullscreen=true;sync();},true);
  listen(root,'webkitendfullscreen',()=>{nativeFullscreen=false;sync();},true);
  listen(document,'swifly:studio-change',event=>{if(event.detail?.effective){appearance=event.detail.effective;sync();}});
  listen(window,'pagehide',event=>{suspended=true;sync();if(!event.persisted)destroy();});
  listen(window,'pageshow',event=>{
    // The guarded player restores cached media only after access verification.
    // Its resume/ready event, rather than pageshow alone, releases this work.
    if(!event.persisted||typeof window.SwiflyKids?.revalidatePlayer!=='function')suspended=false;
    sync();
  });
  if(!size)listen(window,'resize',resize);
  resetColors();resize();sync();
})();
