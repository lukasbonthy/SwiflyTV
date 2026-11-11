/* Home features: two prepared photographs, two baked glows, finite motion. */
(() => {
  'use strict';
  if (window.SwiflyFeatured) return;
  const hero=document.querySelector('[data-sv-featured]');
  if (!hero) return;
  let slides;try {slides=JSON.parse(hero.querySelector('[data-sv-featured-data]').textContent);}catch (_) {return;}
  if (!Array.isArray(slides) || !slides.length) return;
  const root=document.documentElement,copy=hero.querySelector('.dsHeroContent'),art=hero.querySelector('.dsHeroArt');
  const spill=hero.nextElementSibling?.querySelector('.svHeroSpill');
  if (!copy || !art || !spill) return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),controls=hero.querySelector('[data-sv-featured-controls]');
  const play=copy.querySelector('[data-play-id]'),details=copy.querySelector('.dsHeroActions > a:not([data-play-id]):not([data-resume-action])'),watch=copy.querySelector('[data-watch-id]');
  if (!play || !details || !watch) return;
  const cache=new Map(),glowCache=new Map(),listeners=[],running=new Set();
  const backgrounds=[art.querySelector('.dsHeroBg'),document.createElement('div')];
  backgrounds[1].className='dsHeroBg';backgrounds[1].hidden=true;art.append(backgrounds[1]);
  const glows=[document.createElement('div'),document.createElement('div')];
  for (const glow of glows) {glow.dataset.svFeaturedGlow='';glow.setAttribute('aria-hidden','true');glow.style.opacity='0';spill.append(glow);}
  backgrounds[0].dataset.svFeaturedActive='true';backgrounds[0].dataset.svFeaturedId=String(slides[0].id);
  let index=0,slot=0,desired=0,desiredManual=false,serial=0,motionSerial=0,autoCandidate=1,preparation=null,timer=0,scrollTimer=0;
  let moving=false,visible=true,paused=false,keyboard=false,suspended=false,disposed=false,ghost=null,pointer=null;
  let initialReady=false,progress=null;
  const quiet=()=>reduced.matches || document.body.classList.contains('reduceMotion') || root.dataset.svTv==='true' || root.dataset.svXbox==='true';
  const blocked=()=>disposed || suspended || document.hidden || !visible || paused || keyboard || quiet() || moving || !!preparation ||
    root.dataset.svScrollGlass==='soft' || !!scrollTimer || !!document.querySelector('dialog[open]');
  const listen=(node,event,fn,options)=>{node.addEventListener(event,fn,options);listeners.push(()=>node.removeEventListener(event,fn,options));};
  function stopDwell() {
    clearTimeout(timer);timer=0;progress?.cancel();progress=null;
  }
  function schedule() {
    if(slides.length<2 || blocked()){stopDwell();return;}
    // Observers can notify more than once for a single change. Keep one
    // clock for both the visible fill and advancement until it is blocked.
    if(timer)return;
    const fill=controls?.querySelector('[data-sv-featured-go="'+index+'"] [data-sv-featured-progress]');
    if(typeof fill?.animate==='function') {
      progress=fill.animate([{transform:'scaleX(0)'},{transform:'scaleX(1)'}],{duration:8000,easing:'linear',fill:'both'});
      progress.finished.catch(()=>{});
    }
    timer=setTimeout(()=>{stopDwell();if(!blocked())select(autoCandidate%slides.length,false);},8000);
  }
  function motionState(value) {
    if(value)root.dataset.svFeaturedMotion='true';
    else {delete root.dataset.svFeaturedMotion;document.dispatchEvent(new Event('swifly:scroll-glass-end'));}
  }
  function loadImage(src,signal,timeout=6500) {
    return new Promise(resolve=>{
      if(signal.aborted || !src){resolve(null);return;}
      const image=new Image();let done=false;
      const finish=value=>{if(done)return;done=true;clearTimeout(deadline);image.onload=null;image.onerror=null;signal.removeEventListener('abort',abort);resolve(value);};
      const abort=()=>{finish(null);image.src='';};
      const deadline=setTimeout(()=>{finish(null);image.src='';},timeout);
      image.decoding='async';image.crossOrigin='anonymous';
      image.onload=()=>Promise.resolve(image.decode?.()).catch(()=>{}).then(()=>finish(image.naturalWidth>0?image:null));
      image.onerror=()=>finish(null);signal.addEventListener('abort',abort,{once:true});image.src=src;
    });
  }
  // Bake the soft field once at 64x36. Three separable box passes approximate
  // a Gaussian; no full-screen CSS blur or canvas work runs during a slide.
  function bakeGlow(image) {
    try {
      const canvas=document.createElement('canvas');canvas.width=64;canvas.height=36;
      const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return '';
      context.drawImage(image,0,0,64,36);
      const pixels=context.getImageData(0,0,64,36);let data=new Float32Array(pixels.data);
      for(let pass=0;pass<3;pass++) for(const horizontal of [true,false]) {
        const out=new Float32Array(data.length),radius=5;
        for(let y=0;y<36;y++)for(let x=0;x<64;x++)for(let channel=0;channel<3;channel++) {
          let sum=0;for(let offset=-radius;offset<=radius;offset++) {
            const sx=horizontal?Math.max(0,Math.min(63,x+offset)):x,sy=horizontal?y:Math.max(0,Math.min(35,y+offset));
            sum+=data[(sy*64+sx)*4+channel];
          }
          out[(y*64+x)*4+channel]=sum/(2*radius+1);
        }
        data=out;
      }
      for(let i=0;i<data.length;i+=4) {
        const mean=(data[i]+data[i+1]+data[i+2])/3;
        for(let c=0;c<3;c++)pixels.data[i+c]=Math.max(0,Math.min(255,mean+(data[i+c]-mean)*1.35));
        pixels.data[i+3]=255;
      }
      context.putImageData(pixels,0,0);return 'url("'+canvas.toDataURL('image/png')+'")';
    }catch (_) {return '';}
  }
  function optionalPalette(src,signal) {
    return new Promise(resolve=>{
      if(signal.aborted || !window.SwiflyHeroPalette?.sample){resolve(null);return;}
      let done=false;
      const finish=palette=>{if(done)return;done=true;clearTimeout(timeout);signal.removeEventListener('abort',abort);resolve(palette);};
      const abort=()=>finish(null),timeout=setTimeout(abort,800);
      signal.addEventListener('abort',abort,{once:true});
      Promise.resolve(window.SwiflyHeroPalette.sample(src)).then(finish,()=>finish(null));
    });
  }
  async function prepare(target,signal,glowOnly=false) {
    const slide=slides[target],src=root.dataset.svXbox==='true' || innerWidth<=860?slide.mobileArt:innerWidth>=1600?slide.largeArt:slide.art;
    const key=slide.id+':'+src;
    if(!glowOnly && cache.has(key)){const ready=cache.get(key);cache.delete(key);cache.set(key,ready);return ready;}
    const [image,logo]=await Promise.all([
      loadImage(glowOnly?slide.palette:src,signal),
      !glowOnly && slide.logo?loadImage(slide.logo,signal,1200):null
    ]);if(!image || signal.aborted)return null;
    let glow=glowCache.get(slide.palette) || bakeGlow(image);
    if(!glow && window.SwiflyHeroPalette?.sample) {
      // Optional palette preparation is bounded by the same cancelable load;
      // a tainted/unavailable canvas must not strand an otherwise ready film.
      const palette=await optionalPalette(slide.palette,signal);
      if(palette)glow='radial-gradient(ellipse at 25% 40%,rgb('+palette.primary+'),transparent 80%),radial-gradient(ellipse at 75% 50%,rgb('+palette.secondary+'),#090b12 90%)';
    }
    if(signal.aborted)return null;
    // Pixel reads can be prohibited by the image host. A neutral prepared
    // field is safer than stretching a recognizable unblurred poster.
    glow=glow || 'radial-gradient(ellipse at 50% 40%,#31445b,transparent 80%)';
    // Keep only two display preparations, but retain the at-most-five tiny
    // textures so wrapping the carousel never repeats synchronous encoding.
    glowCache.set(slide.palette,glow);
    const ready={src,glow,logo};if(!glowOnly){cache.set(key,ready);while(cache.size>2)cache.delete(cache.keys().next().value);}
    return ready;
  }
  function paint(target,ready,targetSlot) {
    const bg=backgrounds[targetSlot],glow=glows[targetSlot],slide=slides[target];
    const url=value=>'url("'+value+'")';bg.style.backgroundImage=url(slide.art);
    bg.style.setProperty('--sv-art-mobile',url(slide.mobileArt));bg.style.setProperty('--sv-art-large',url(slide.largeArt));bg.style.setProperty('--sv-xbox-art',url(slide.mobileArt));
    bg.dataset.svFeaturedId=String(slide.id);glow.dataset.svFeaturedId=String(slide.id);
    glow.style.backgroundImage=ready.glow;
  }
  function updateCopy(slide,ready) {
    const title=copy.querySelector('h1'),text=title.querySelector('.dsHeroTitleText');
    if(text)text.textContent=slide.title;else title.textContent=slide.title;
    title.classList.remove('hasLogo');title.querySelector('.dsHeroLogo')?.remove();
    if(ready.logo) {
      const image=ready.logo;image.className='dsHeroLogo';image.alt='';
      image.width=image.naturalWidth;image.height=image.naturalHeight;
      title.append(image);title.classList.add('hasLogo');
    }
    const meta=copy.querySelector('.dsHeroMeta');meta.replaceChildren();
    if(Number(slide.rating)>0){const rating=document.createElement('b');rating.textContent='★ '+slide.rating;meta.append(rating);}
    for(const value of slide.metadata){const span=document.createElement('span');span.textContent=value;meta.append(span);}
    copy.querySelector(':scope > p').textContent=slide.overview;
    play.href='/watch/movie/'+slide.id+'?mode=movie';details.href='/movie/'+slide.id;
    for(const [key,value]of Object.entries({id:slide.id,type:'movie',title:slide.title,poster:slide.poster,backdrop:slide.backdrop,rating:slide.rating,year:slide.year})) {
      const suffix=key[0].toUpperCase()+key.slice(1);play.dataset['play'+suffix]=String(value);watch.dataset['watch'+suffix]=String(value);
    }
    watch.setAttribute('aria-label','Add '+slide.title+' to My List');
    window.syncLibraryButtons?.(hero);window.SwiflyContinue?.decorate?.(hero);window.SwiflyLibrary?.renderDecorations?.(hero);
    hero.dataset.svPaletteSrc=slide.palette;
    for(const button of hero.querySelectorAll('[data-sv-featured-go]')) {
      if(Number(button.dataset.svFeaturedGo)===index)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');
    }
    hero.dataset.svFeaturedIndex=String(index);
    pauseState();
  }
  function snapshot() {
    const box=copy.getBoundingClientRect(),heroBox=hero.getBoundingClientRect();
    const faces=[...copy.querySelectorAll('.dsHeroActions > :is(a,button)')].map(button=>{
      // The phone face is inset inside its larger touch target. Its pseudo
      // element remains on the inert copy after the optical pane is removed.
      if(getComputedStyle(button).getPropertyValue('--sv-featured-face').trim()==='slim')return {background:'transparent',shadow:'none',border:'0'};
      const pane=button.querySelector('.svLiquidPane'),style=getComputedStyle(pane && getComputedStyle(pane).display!=='none'?pane:button);return {background:style.backgroundColor,shadow:style.boxShadow,border:style.border};
    });
    const clone=copy.cloneNode(true);clone.dataset.svFeaturedGhost='';clone.setAttribute('aria-hidden','true');clone.setAttribute('inert','');
    // Retain only the presentation of Resume after removing its live action.
    if(clone.querySelector('[data-resume-action]'))clone.querySelector('.dsHeroActions')?.classList.add('svFeaturedResuming');
    clone.querySelectorAll('.svLiquidPane,svg.svLiquidPane__filters,filter').forEach(node=>node.remove());
    for(const node of [clone,...clone.querySelectorAll('*')])for(const attribute of [...node.attributes]) {
      if(attribute.name==='id' || /^(?:data-(?:play|watch|resume|library|swifly)-|href$|on)/.test(attribute.name))node.removeAttribute(attribute.name);
    }
    clone.querySelectorAll('.svGlassSurface,.svGlassControl').forEach(node=>node.classList.remove('svGlassSurface','svGlassControl','svNavMatchedOptic'));
    clone.querySelectorAll('a,button,[tabindex]').forEach(node=>node.setAttribute('tabindex','-1'));
    [...clone.querySelectorAll('.dsHeroActions > :is(a,button)')].forEach((button,i)=>{
      button.style.setProperty('background',faces[i].background,'important');button.style.setProperty('box-shadow',faces[i].shadow,'important');button.style.setProperty('border',faces[i].border,'important');
      button.style.setProperty('backdrop-filter','none','important');button.style.setProperty('-webkit-backdrop-filter','none','important');
    });
    clone.style.setProperty('position','absolute','important');clone.style.setProperty('left',(box.left-heroBox.left)+'px','important');clone.style.setProperty('top',(box.top-heroBox.top)+'px','important');
    clone.style.setProperty('width',box.width+'px','important');clone.style.setProperty('height',box.height+'px','important');clone.style.setProperty('margin','0','important');
    hero.append(clone);return clone;
  }
  function animate(node,frames,duration,easing) {
    const animation=node.animate(frames,{duration,easing,fill:'both'});running.add(animation);return animation.finished.catch(()=>{});
  }
  function finishMotion() {
    if(!moving)return;
    ++motionSerial;moving=false;for(const animation of running)animation.cancel();running.clear();ghost?.remove();ghost=null;
    backgrounds[1-slot].hidden=true;glows[1-slot].style.opacity='0';glows[slot].style.opacity='1';
    motionState(false);hero.dataset.svFeaturedState='idle';
    if(!disposed && !suspended && desired!==index)select(desired,desiredManual);else schedule();
  }
  async function select(target,manual=true) {
    target=((Number(target)||0)%slides.length+slides.length)%slides.length;
    if(disposed || suspended)return false;
    desired=target;desiredManual=manual;stopDwell();
    if(moving)return false;
    const generation=++serial;preparation?.abort();preparation=null;
    if(target===index){schedule();return true;}
    const controller=new AbortController();preparation=controller;
    const ready=await prepare(target,controller.signal);
    if(disposed || suspended || controller.signal.aborted || serial!==generation)return false;
    preparation=null;
    if(!ready || (!manual && blocked())){
      if(!ready && !manual){autoCandidate=(target+1)%slides.length;if(autoCandidate===index)autoCandidate=(autoCandidate+1)%slides.length;}
      desired=index;schedule();return false;
    }
    const oldSlot=slot,nextSlot=1-slot,direction=(target-index+slides.length)%slides.length===slides.length-1?-1:1;
    const immediate=quiet() || typeof copy.animate!=='function' || (window.CSS?.supports && !CSS.supports('translate','1px 0'));
    const width=hero.getBoundingClientRect().width || innerWidth;
    if(!immediate)ghost=snapshot();
    paint(target,ready,nextSlot);backgrounds[nextSlot].hidden=false;
    index=target;autoCandidate=(index+1)%slides.length;slot=nextSlot;updateCopy(slides[index],ready);
    for(let i=0;i<2;i++){backgrounds[i].dataset.svFeaturedActive=String(i===slot);glows[i].dataset.svFeaturedActive=String(i===slot);}
    if(manual){const status=hero.querySelector('[data-sv-featured-status]');if(status)status.textContent=slides[index].title+', '+(index+1)+' of '+slides.length;}
    if(immediate){backgrounds[oldSlot].hidden=true;glows[oldSlot].style.opacity='0';glows[slot].style.opacity='1';schedule();return true;}
    moving=true;const motionGeneration=++motionSerial;motionState(true);hero.dataset.svFeaturedState='moving';
    const easing='cubic-bezier(.25,.1,.25,1)',enter=direction*width+'px',exit=-direction*width+'px';
    const complete=Promise.all([
      // Individual translate composes with the existing !important hero
      // parallax transform rather than losing to it in the cascade.
      animate(backgrounds[oldSlot],[{translate:'0px 0px'},{translate:exit+' 0px'}],700,easing),
      animate(backgrounds[slot],[{translate:enter+' 0px'},{translate:'0px 0px'}],700,easing),
      animate(ghost,[{translate:'0px 0px'},{translate:exit+' 0px'}],700,easing),
      animate(copy,[{translate:enter+' 0px'},{translate:'0px 0px'}],700,easing),
      animate(glows[oldSlot],[{opacity:initialReady?1:0},{opacity:0}],1000,'ease'),
      animate(glows[slot],[{opacity:0},{opacity:1}],1000,'ease')
    ]);
    initialReady=true;complete.then(()=>{if(motionGeneration===motionSerial)finishMotion();});return true;
  }
  function pauseState() {
    for(const button of hero.querySelectorAll('[data-sv-featured-go]')) {
      const position=Number(button.dataset.svFeaturedGo),slide=slides[position];if(!slide)continue;
      const active=position===index;
      const label=active&&!quiet()?slide.title+'. '+(paused||keyboard?'Resume':'Pause')+' automatic rotation':'Show '+slide.title;
      button.setAttribute('aria-label',label);button.title=label;
      if(active)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');
    }
  }
  const playbackControl=node=>{const button=node.closest?.('[data-sv-featured-go]');return button&&Number(button.dataset.svFeaturedGo)===index&&!quiet();};
  if(controls)controls.hidden=false;
  hero.dataset.svFeaturedIndex='0';hero.dataset.svFeaturedState='idle';
  listen(hero,'click',event=>{
    const button=event.target.closest('[data-sv-featured-go],[data-sv-featured-next],[data-sv-featured-prev]');if(!button)return;
    if(playbackControl(button)){paused=!(paused||keyboard);keyboard=false;pauseState();schedule();return;}
    const base=preparation || moving?desired:index;
    select(button.hasAttribute('data-sv-featured-go')?Number(button.dataset.svFeaturedGo):base+(button.hasAttribute('data-sv-featured-next')?1:-1));
  });
  listen(hero,'keydown',event=>{if(playbackControl(event.target)&&['Enter',' '].includes(event.key))return;
    if(['Tab','ArrowLeft','ArrowRight','Enter',' '].includes(event.key)){keyboard=true;pauseState();schedule();}
    if(event.target.closest('[data-sv-featured-controls]') && ['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();select(desired+(event.key==='ArrowRight'?1:-1));}
  });
  listen(hero,'focusin',event=>{
    if(!playbackControl(event.target) && event.target.matches(':focus-visible')){keyboard=true;pauseState();schedule();}
  });
  listen(hero,'focusout',()=>schedule());
  listen(hero,'pointerdown',event=>{if(event.isPrimary!==false && !event.target.closest('a,button,input,summary'))pointer={id:event.pointerId,x:event.clientX,y:event.clientY};},{passive:true});
  listen(hero,'pointerup',event=>{const start=pointer;pointer=null;if(!start || start.id!==event.pointerId)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)*1.5)select(desired+(dx<0?1:-1));},{passive:true});
  listen(hero,'pointercancel',()=>{pointer=null;},{passive:true});
  listen(document,'scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{scrollTimer=0;schedule();},260);schedule();},{passive:true,capture:true});
  listen(document,'visibilitychange',()=>{if(document.hidden){++serial;preparation?.abort();preparation=null;desired=index;finishMotion();}schedule();});
  listen(reduced,'change',()=>{if(quiet()){desired=index;finishMotion();}pauseState();schedule();});
  listen(document,'swifly:studio-change',()=>{if(quiet()){desired=index;finishMotion();}pauseState();schedule();});
  const stateObserver=new MutationObserver(()=>{if(quiet()){desired=index;finishMotion();}pauseState();schedule();});
  stateObserver.observe(root,{attributes:true,attributeFilter:['data-sv-tv','data-sv-scroll-glass']});
  const dialogObserver=new MutationObserver(changes=>{
    if(changes.some(c=>c.attributeName==='open' || c.target===document.body || [...c.addedNodes,...c.removedNodes].some(node=>node.nodeType===1 && (node.localName==='dialog' || node.querySelector('dialog'))))){pauseState();schedule();}
  });
  dialogObserver.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','class']});
  const visibility=typeof IntersectionObserver==='function'?new IntersectionObserver(changes=>{
    visible=changes.some(change=>change.target===hero && change.isIntersecting);schedule();
  },{threshold:0}):null;visibility?.observe(hero);
  function suspend() {suspended=true;++serial;preparation?.abort();preparation=null;desired=index;finishMotion();stopDwell();clearTimeout(scrollTimer);scrollTimer=0;}
  listen(window,'pagehide',suspend);listen(window,'pageshow',()=>{suspended=false;schedule();});
  function destroy() {if(disposed)return;disposed=true;suspend();stateObserver.disconnect();dialogObserver.disconnect();visibility?.disconnect();listeners.forEach(remove=>remove());cache.clear();glowCache.clear();}
  window.SwiflyFeatured=Object.freeze({select,destroy});pauseState();
  const initialController=new AbortController(),generation=++serial;preparation=initialController;
  prepare(0,initialController.signal,true).then(ready=>{
    if(disposed || serial!==generation || initialController.signal.aborted)return;
    preparation=null;
    if(ready){paint(0,ready,0);glows[0].style.opacity='1';glows[0].dataset.svFeaturedActive='true';spill.dataset.svFeaturedPrepared='true';spill.querySelector(':scope > img')?.remove();initialReady=true;}
    schedule();
  });
})();
