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
  const cleanups=[],palette=Array.from({length:20},(_,i)=>`rgb(0 ${Math.round(28+i*11.8)} ${Math.round(9+i*2.8)})`);
  const colors=Array.from({length:6},()=>[0,252,65]);
  let tint=Array.from({length:6},()=>palette),sampleCanvas=null,sampleContext=null,sampleVideo=null,sampleSource='',blockedSource=false,lastSample=-Infinity,lastVideoTime=-1;
  let appearance=window.SwiflyAppearance||{},cells=new Float32Array(0),step=8,frame=0,clock=0,last=0,painted=0;
  let running=false,inView=true,suspended=false,nativeFullscreen=false,destroyed=false,started=false;
  const bursts=[];
  function listen(target,name,handler,options){target.addEventListener(name,handler,options);cleanups.push(()=>target.removeEventListener(name,handler,options));}
  function resetColors(){for(const color of colors)color.splice(0,3,0,252,65);tint=Array.from({length:6},()=>palette);}
  function sample(now){
    const video=root.querySelector('[data-player-video]');
    if(!video)return;
    const source=video.currentSrc||video.src||'';
    if(video!==sampleVideo||source!==sampleSource){
      sampleVideo=video;sampleSource=source;blockedSource=false;lastVideoTime=-1;
      if(sampleCanvas)sampleCanvas.width=12;
      resetColors();
    }
    if(video.readyState<2||!video.videoWidth||!video.videoHeight||now-lastSample<(mobile.matches?500:250)||blockedSource||video.currentTime===lastVideoTime)return;
    lastSample=now;lastVideoTime=video.currentTime;
    try{
      if(!sampleCanvas){sampleCanvas=document.createElement('canvas');sampleCanvas.width=12;sampleCanvas.height=8;sampleContext=sampleCanvas.getContext('2d',{willReadFrequently:true});}
      if(!sampleContext)return;
      sampleContext.drawImage(video,0,0,12,8);
      const data=sampleContext.getImageData(0,0,12,8).data,sums=Array.from({length:6},()=>[0,0,0,0]);
      for(let y=0;y<8;y++)for(let x=0;x<12;x++){
        const i=(y*12+x)*4,r=data[i],g=data[i+1],b=data[i+2];
        if(.2126*r+.7152*g+.0722*b<18)continue;
        const region=Math.min(2,Math.floor(x/4))+(y<4?0:3),sum=sums[region];sum[0]+=r;sum[1]+=g;sum[2]+=b;sum[3]++;
      }
      tint=sums.map((sum,index)=>{
        const peak=Math.max(sum[0],sum[1],sum[2]),target=sum[3]&&peak?[sum[0]/peak*228,sum[1]/peak*228,sum[2]/peak*228]:[0,252,65];
        const color=colors[index];for(let c=0;c<3;c++)color[c]+=(target[c]-color[c])*.32;
        return palette.map((_,level)=>{const light=(28+level*11.8)/252;return `rgb(${Math.round(color[0]*.88*light)} ${Math.round((color[1]*.88+252*.12)*light)} ${Math.round((color[2]*.88+65*.12)*light)})`;});
      });
    }catch(error){
      if(error?.name==='SecurityError'){blockedSource=true;resetColors();}
      // Keep the green field when a frame is unavailable or origin-protected.
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
      context.fillStyle=(cells[i+5]>.83?tint[cells[i+6]]:palette)[level];
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
    cells=new Float32Array(columns*rows*7);
    let index=0;
    for(let y=step/2;y<canvas.height+step/2;y+=step)for(let x=step/2;x<canvas.width+step/2;x+=step){
      const nx=x/canvas.width-.5,ny=y/canvas.height-.5,angle=Math.atan2(ny,nx);
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
    if(now-painted>=(mobile.matches?1000/30:1000/60)-1){sample(now);draw();painted=now;}
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
  viewport?.observe(backdrop);
  const size=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
  size?.observe(backdrop);
  for(const query of [reduced,mobile,contrast,transparency])listen(query,'change',()=>{resize();sync();});
  listen(root,'swiflyplayer:play-intent',burst);
  listen(document,'visibilitychange',sync);
  listen(document,'fullscreenchange',sync);
  listen(root,'webkitbeginfullscreen',()=>{nativeFullscreen=true;sync();},true);
  listen(root,'webkitendfullscreen',()=>{nativeFullscreen=false;sync();},true);
  listen(document,'swifly:studio-change',event=>{if(event.detail?.effective){appearance=event.detail.effective;sync();}});
  listen(window,'pagehide',event=>{suspended=true;sync();if(!event.persisted)destroy();});
  listen(window,'pageshow',()=>{suspended=false;sync();});
  if(!size)listen(window,'resize',resize);
  resize();sync();
})();
