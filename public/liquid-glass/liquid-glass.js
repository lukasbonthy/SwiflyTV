/* v196: rounded optical lensing and clear media glass for WebKit. */
(() => {
  'use strict';
  if (window.SwiflyLiquidGlass) return;
  const NS = 'http://www.w3.org/2000/svg';
  const mounted = new WeakMap(), live = new Map();
  const transparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
  const touch = window.matchMedia('(pointer: coarse)');
  let nextId = 0, preferences;
  const svgElement = (tag, attributes = {}) => {
    const node = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    return node;
  };
  const numeric = (element, key, fallback) => {
    const raw = element.dataset[key];
    return raw !== undefined && raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : fallback;
  };
  const liquidPreference = () => !transparency.matches && !['off', 'subtle'].includes(document.body.dataset.stGlass);
  const syncAll = () => {for (const entry of live.values()) entry.sync();};
  const resizeAll = () => {for (const entry of live.values()) entry.schedule();};
  const sceneChanged = event => {
    // Sampled IMG loads and paint events belong to the lens itself. Feeding
    // them back into capture would recreate loaded images every frame.
    if (event && insideOptics(event.target)) return;
    const source = event?.target instanceof HTMLElement ? event.target : null;
    for (const entry of live.values()) if (entry.webkit) entry.sample(source);
  };
  // Several lenses share one paint's measurements. No idle animation loop,
  // artwork readback or full-page DOM clones are needed.
  let sceneFrame = 0, sceneTimer = 0, lastSceneTime = -Infinity, boxes = new WeakMap(), styles = new WeakMap();
  const pendingScenes = new Set(), changedPaint = new Set();
  let wholeScene = false;
  function flushScenes() {
    sceneFrame = 0; lastSceneTime = performance.now(); boxes = new WeakMap(); styles = new WeakMap();
    const work = [...pendingScenes]; pendingScenes.clear();
    const sources = wholeScene ? null : [...changedPaint]; wholeScene = false; changedPaint.clear();
    // Measurements and detached SVG paint are complete before any lens writes
    // to the page. A later lens cannot force layout after an earlier commit.
    const commits = work.map(prepare => prepare(sources)).filter(Boolean);
    for (const commit of commits) commit();
  }
  function queueScene(prepare, sample = false, source = null) {
    pendingScenes.add(prepare);
    if (!sample || !source) wholeScene = true; else changedPaint.add(source);
    if (sceneFrame) return;
    // Native scrolling stays at display cadence; only the bounded SVG artwork
    // copy is sampled at most every 50ms on a coarse pointer. The trailing
    // timeout keeps the final position exact and never spins an idle RAF.
    const delay = sample && touch.matches ? Math.max(0,50-(performance.now()-lastSceneTime)) : 0;
    if (delay && sceneTimer) return;
    if (sceneTimer) {clearTimeout(sceneTimer); sceneTimer = 0;}
    if (delay) sceneTimer = setTimeout(() => {
      sceneTimer = 0;
      if (pendingScenes.size) sceneFrame = requestAnimationFrame(flushScenes);
    },delay);
    else sceneFrame = requestAnimationFrame(flushScenes);
  }
  function cancelScene(prepare) {
    pendingScenes.delete(prepare);
    if (!pendingScenes.size) {
      if (sceneFrame) {cancelAnimationFrame(sceneFrame); sceneFrame = 0;}
      if (sceneTimer) {clearTimeout(sceneTimer); sceneTimer = 0;}
      wholeScene = false; changedPaint.clear();
    }
  }
  const boxOf = node => {
    if (!boxes.has(node)) boxes.set(node, node.getBoundingClientRect());
    return boxes.get(node);
  };
  const styleOf = node => {
    if (!styles.has(node)) styles.set(node, getComputedStyle(node));
    return styles.get(node);
  };
  const insideOptics = node => (node instanceof Element ? node : node.parentElement)?.closest('.svLiquidPane, .svWebkitGlassOptics, .svLiquidPane__filters');
  const imageSizes = new Map();
  function imageSize(url, original) {
    if (original?.naturalWidth) return {width:original.naturalWidth,height:original.naturalHeight};
    if (!imageSizes.has(url)) {
      const size={width:0,height:0},image=new Image();imageSizes.set(url,size);
      image.onload=()=>{size.width=image.naturalWidth;size.height=image.naturalHeight;sceneChanged();};
      image.src=url;
    }
    return imageSizes.get(url);
  }
  function cssList(value) {
    const result=[];let start=0,depth=0,quote='';
    for(let i=0;i<value.length;i++) {
      const c=value[i];
      if(quote){if(c===quote && value[i-1]!=='\\')quote='';continue;}
      if(c==='"'||c==="'"){quote=c;continue;}
      if(c==='(')depth++;else if(c===')')depth--;else if(c===','&&!depth){result.push(value.slice(start,i).trim());start=i+1;}
    }
    result.push(value.slice(start).trim());return result;
  }
  function gradientStops(parts, length) {
    const stops=[];
    for(const part of parts) {
      const position=part.match(/^(.*?)\s+(-?[\d.]+)(%|px)(?:\s+(-?[\d.]+)(%|px))?$/);
      if(position){stops.push({color:position[1],offset:Number(position[2])/(position[3]==='%'?100:length)});if(position[4])stops.push({color:position[1],offset:Number(position[4])/(position[5]==='%'?100:length)});}
      else stops.push({color:part,offset:null});
    }
    if(stops.length<2)return [];
    stops[0].offset??=0;stops.at(-1).offset??=1;
    for(let i=1;i<stops.length;i++)if(stops[i].offset===null){let end=i;while(stops[end].offset===null)end++;const begin=stops[i-1].offset,step=(stops[end].offset-begin)/(end-i+1);for(let j=i;j<end;j++)stops[j].offset=begin+step*(j-i+1);i=end;}
    return stops;
  }
  function nativeRadial(value, rect, defs) {
    const match=value.match(/^radial-gradient\((.*)\)$/);if(!match)return null;
    const parts=cssList(match[1]);let header='';
    if(/\bat\b|ellipse|circle|closest-|farthest-|^[\d.]+(?:%|px)/.test(parts[0]))header=parts.shift();
    const location=header.match(/^(.*?)\bat\s+(.+)$/),shape=location?location[1]:header,positions=(location?location[2]:'50% 50%').trim().split(/\s+/);
    const coordinate=(text,size)=>text==='center'?size/2:text==='right'||text==='bottom'?size:text==='left'||text==='top'?0:text.endsWith('%')?parseFloat(text)*size/100:parseFloat(text)||0;
    const cx=coordinate(positions[0],rect.width),cy=coordinate(positions[1]||'50%',rect.height);
    const nearX=Math.min(Math.abs(cx),Math.abs(rect.width-cx)),nearY=Math.min(Math.abs(cy),Math.abs(rect.height-cy));
    const farX=Math.max(Math.abs(cx),Math.abs(rect.width-cx)),farY=Math.max(Math.abs(cy),Math.abs(rect.height-cy));
    const sizes=(shape||'').match(/[\d.]+(?:%|px)/g);
    let rx,ry;
    if(sizes){rx=coordinate(sizes[0],rect.width);ry=coordinate(sizes[1]||sizes[0],rect.height);}
    else if(shape?.includes('circle')) {
      rx=ry=shape.includes('closest-side')?Math.min(nearX,nearY):shape.includes('farthest-side')?Math.max(farX,farY):shape.includes('closest-corner')?Math.hypot(nearX,nearY):Math.hypot(farX,farY);
    } else {
      const closest=shape?.includes('closest-'),corner=!shape?.includes('side');
      rx=(closest?nearX:farX)*(corner?Math.SQRT2:1);ry=(closest?nearY:farY)*(corner?Math.SQRT2:1);
    }
    if(!rx||!ry)return null;
    const stops=gradientStops(parts,rx);if(!stops.length)return null;
    const gradient=svgElement('radialGradient',{id:'sv-scene-gradient-'+(++nextId),gradientUnits:'userSpaceOnUse',cx:0,cy:0,r:1,
      gradientTransform:'translate('+(rect.x+cx)+' '+(rect.y+cy)+') scale('+rx+' '+ry+')'});
    let previous=0;
    for(const stop of stops){const offset=Math.max(previous,Math.min(1,stop.offset));previous=offset;gradient.append(svgElement('stop',{offset,'stop-color':stop.color}));}
    defs.append(gradient);return 'url(#'+gradient.id+')';
  }
  function nativeGradient(value, rect, defs) {
    if(value.startsWith('radial-gradient('))return nativeRadial(value,rect,defs);
    const match=value.match(/^(repeating-)?linear-gradient\((.*)\)$/);if(!match)return null;
    const parts=cssList(match[2]);let angle=180;
    if(/deg$/.test(parts[0]))angle=parseFloat(parts.shift());
    else if(parts[0].startsWith('to ')) {
      const direction=parts.shift();angle=direction.includes('right')?(direction.includes('bottom')?135:direction.includes('top')?45:90):direction.includes('left')?(direction.includes('bottom')?225:direction.includes('top')?315:270):direction.includes('top')?0:180;
    }
    const radians=angle*Math.PI/180,dx=Math.sin(radians),dy=-Math.cos(radians);
    const length=Math.abs(rect.width*dx)+Math.abs(rect.height*dy)||1;
    const stops=gradientStops(parts,length);if(!stops.length)return null;
    const first=match[1]?stops[0].offset:0,last=match[1]?stops.at(-1).offset:1,span=last-first||1;
    const id='sv-scene-gradient-'+(++nextId),cx=rect.x+rect.width/2,cy=rect.y+rect.height/2;
    const gradient=svgElement('linearGradient',{id,gradientUnits:'userSpaceOnUse',
      x1:cx+dx*length*(first-.5),y1:cy+dy*length*(first-.5),
      x2:cx+dx*length*(last-.5),y2:cy+dy*length*(last-.5),spreadMethod:match[1]?'repeat':'pad'});
    let previous=0;
    for(const stop of stops){const offset=Math.max(previous,Math.min(1,(stop.offset-first)/span));previous=offset;gradient.append(svgElement('stop',{offset,'stop-color':stop.color}));}
    defs.append(gradient);return 'url(#'+id+')';
  }
  function fitArtwork(url, original, rect, fit, position) {
    const size=imageSize(url,original);
    if(!size.width || !size.height)return svgElement('image',{class:'svGlassArtwork',href:url,...rect,preserveAspectRatio:fit==='contain'?'xMidYMid meet':fit==='fill'?'none':'xMidYMid slice'});
    const factor=fit==='fill'?null:fit==='none'?1:fit==='contain'||fit==='scale-down'?Math.min(rect.width/size.width,rect.height/size.height,fit==='scale-down'?1:Infinity):Math.max(rect.width/size.width,rect.height/size.height);
    const width=factor===null?rect.width:size.width*factor,height=factor===null?rect.height:size.height*factor;
    const values=(position||'50% 50%').split(/\s+/),offset=(value,space)=>value?.endsWith('%')?space*parseFloat(value)/100:value==='left'||value==='top'?0:value==='right'||value==='bottom'?space:value==='center'?space/2:parseFloat(value)||0;
    return svgElement('image',{class:'svGlassArtwork',href:url,x:rect.x+offset(values[0],rect.width-width),y:rect.y+offset(values[1]||'50%',rect.height-height),width,height,preserveAspectRatio:'none'});
  }
  function nativeColorFilter(value, rect, defs) {
    if(!value||value==='none')return null;
    const filter=svgElement('filter',{id:'sv-scene-color-'+(++nextId),filterUnits:'userSpaceOnUse',x:rect.x-64,y:rect.y-64,width:rect.width+128,height:rect.height+128,'color-interpolation-filters':'sRGB'});
    for(const part of value.matchAll(/(brightness|contrast|saturate|grayscale|blur)\(([-\d.]+)(%|px)?\)/g)) {
      const type=part[1],amount=Number(part[2])/(part[3]==='%'?100:1);
      if(type==='brightness'||type==='contrast') {
        const transfer=svgElement('feComponentTransfer');
        for(const channel of ['R','G','B'])transfer.append(svgElement('feFunc'+channel,{type:'linear',slope:amount,intercept:type==='contrast'?.5*(1-amount):0}));
        filter.append(transfer);
      } else if(type==='blur')filter.append(svgElement('feGaussianBlur',{stdDeviation:amount}));
      else filter.append(svgElement('feColorMatrix',{type:'saturate',values:type==='grayscale'?1-amount:amount}));
    }
    if(!filter.childNodes.length)return null;
    defs.append(filter);return 'url(#'+filter.id+')';
  }
  function lensTexture(width, height, radius) {
    // A rounded surface bends toward its local normal. A pane-wide linear
    // gradient instead drags the picture diagonally and misses the corners.
    // These bounded textures contain geometry only, never page/image pixels.
    const ratio=Math.min(1,640/width,240/height),tw=Math.max(1,Math.min(640,Math.ceil(width*ratio))),th=Math.max(1,Math.min(240,Math.ceil(height*ratio)));
    const make=()=>{const canvas=document.createElement('canvas');canvas.width=tw;canvas.height=th;return canvas;};
    const displacement=make(),reflection=make();
    const dc=displacement.getContext('2d'),rc=reflection.getContext('2d');
    if(!dc||!rc)return null;
    const vector=dc.createImageData(tw,th),light=rc.createImageData(tw,th);
    const r=Math.max(1,Math.min(radius,width/2,height/2)),edge=Math.min(18,Math.max(5,Math.min(width,height)*.22));
    const scale=edge*2.6,thickness=edge*4.6;
    for(let y=0;y<th;y++)for(let x=0;x<tw;x++) {
      const px=(x+.5)*width/tw-width/2,py=(y+.5)*height/th-height/2;
      const qx=Math.abs(px)-(width/2-r),qy=Math.abs(py)-(height/2-r);
      const ox=Math.max(0,qx),oy=Math.max(0,qy),length=Math.hypot(ox,oy);
      const distance=r-length-Math.min(Math.max(qx,qy),0);
      let nx=0,ny=0,shift=0,illumination=0;
      if(distance>=0 && distance<edge) {
        if(length>0){nx=ox/length*Math.sign(px);ny=oy/length*Math.sign(py);}
        else if(qx>qy)nx=Math.sign(px);else ny=Math.sign(py);
        const t=distance/edge,cap=Math.sqrt(Math.max(.0001,1-(1-t)**2));
        const angle=Math.atan((1-t)/cap);
        // Snell refraction through a curved cap; it settles to zero as the
        // surface becomes flat, preserving the artwork's position in center.
        shift=thickness*cap*Math.tan(angle-Math.asin(Math.sin(angle)/1.45));
        const facing=nx*-.58+ny*-.815;
        const ridge=Math.exp(-Math.pow((distance-.8)/.65,2));
        const caustic=Math.exp(-Math.pow((distance-edge*.65)/(edge*.16),2));
        illumination=ridge*(.65*Math.max(0,facing)**4-.12*Math.max(0,-facing)**3)
          +caustic*.10*Math.max(0,-facing)**2;
      }
      const offset=(y*tw+x)*4;
      vector.data[offset]=Math.round(255*(.5-nx*shift/scale));
      vector.data[offset+1]=Math.round(255*(.5-ny*shift/scale));
      vector.data[offset+2]=128;vector.data[offset+3]=255;
      light.data[offset]=light.data[offset+1]=light.data[offset+2]=illumination>=0?255:0;
      light.data[offset+3]=Math.round(Math.min(1,Math.abs(illumination))*255);
    }
    dc.putImageData(vector,0,0);rc.putImageData(light,0,0);
    return {map:displacement.toDataURL(),reflection:reflection.toDataURL(),scale,edge};
  }
  function captureScene(host, bounds, padding) {
    const scene = svgElement('g'), left = bounds.left || 0, top = bounds.top || 0;
    const definitions=svgElement('defs');scene.append(definitions);
    const area = {left:left-padding, top:top-padding, right:left+bounds.width+padding, bottom:top+bounds.height+padding};
    const overlaps = rect => rect.width > 0 && rect.height > 0 &&
      rect.left < area.right && rect.left+rect.width > area.left &&
      rect.top < area.bottom && rect.top+rect.height > area.top;
    const boundaries = 'main > *, .dsRow, .svCatalogRow, .movieCard, .posterWrap, .dsWelcomeDiscovery';
    const sourceNode = node => node instanceof HTMLElement && node !== host && node !== host.parentElement &&
      !node.matches('script,style,link,svg,canvas,video,iframe,input,textarea,select,[hidden],.svLiquidPane,.svWebkitGlassOptics,[data-sv-liquid-nav],.dsWelcomeNav');
    const inBand = node => !node.matches(boundaries) || overlaps(boxOf(node));
    const paint = (node, rect, computed) => {
      const image = node.tagName === 'IMG' ? node.currentSrc || node.src : '';
      const background = computed.backgroundImage && computed.backgroundImage !== 'none' ||
        computed.backgroundColor && !['transparent','rgba(0, 0, 0, 0)'].includes(computed.backgroundColor);
      if (!image && !background) return null;
      const local={x:rect.left-left,y:rect.top-top,width:rect.width,height:rect.height},paint=svgElement('g');
      const crop=svgElement('clipPath',{id:'sv-scene-paint-clip-'+(++nextId),clipPathUnits:'userSpaceOnUse'});
      crop.append(svgElement('rect',{x:Math.max(local.x,-padding),y:Math.max(local.y,-padding),
        width:Math.min(local.x+local.width,bounds.width+padding)-Math.max(local.x,-padding),
        height:Math.min(local.y+local.height,bounds.height+padding)-Math.max(local.y,-padding)}));
      definitions.append(crop);
      const output=svgElement('g',{'clip-path':'url(#'+crop.id+')'});output.append(paint);
      if(computed.backgroundColor&&!['transparent','rgba(0, 0, 0, 0)'].includes(computed.backgroundColor))paint.append(svgElement('rect',{...local,fill:computed.backgroundColor}));
      const layers=cssList(computed.backgroundImage||'none'),positions=cssList(computed.backgroundPosition||'50% 50%'),sizes=cssList(computed.backgroundSize||'cover');
      for(let i=layers.length-1;i>=0;i--) {
        const layer=layers[i];
        const url=layer.match(/^url\(["']?(.*?)["']?\)$/);
        if(url)paint.append(fitArtwork(url[1],null,local,sizes[i%sizes.length]==='contain'?'contain':'cover',positions[i%positions.length]));
        else {const fill=nativeGradient(layer,local,definitions);if(fill)paint.append(svgElement('rect',{...local,fill}));}
      }
      if(image)paint.append(fitArtwork(image,node,local,computed.objectFit||'fill',computed.objectPosition));
      return output;
    };
    function pseudoLayer(node, rect, kind) {
      const computed=getComputedStyle(node,kind);
      if(computed.display==='none'||!computed.content||['none','normal'].includes(computed.content)||
        (computed.backgroundImage==='none'&&['transparent','rgba(0, 0, 0, 0)'].includes(computed.backgroundColor)))return null;
      const value=(text,size)=>text&&text!=='auto'?(text.endsWith('%')?parseFloat(text)*size/100:parseFloat(text)):null;
      const left=value(computed.left,rect.width),right=value(computed.right,rect.width),top=value(computed.top,rect.height),bottom=value(computed.bottom,rect.height);
      const width=value(computed.width,rect.width)??Math.max(0,rect.width-(left||0)-(right||0));
      const height=value(computed.height,rect.height)??Math.max(0,rect.height-(top||0)-(bottom||0));
      const box={left:rect.left+(left??(right!==null?rect.width-right-width:0)),top:rect.top+(top??(bottom!==null?rect.height-bottom-height:0)),width,height};
      return overlaps(box)?{computed,rect:box}:null;
    }
    function visit(node, parent) {
      if (!sourceNode(node) || !inBand(node)) return;
      const computed = styleOf(node);
      if (computed.display === 'none' || computed.visibility === 'hidden' || computed.opacity === '0') return;
      const rect = boxOf(node), intersects = overlaps(rect);
      const clips = ['hidden','clip','auto','scroll'].includes(computed.overflowX) ||
        ['hidden','clip','auto','scroll'].includes(computed.overflowY);
      if (!intersects && clips) return;
      const group = svgElement('g');
      if (computed.opacity && computed.opacity !== '1') group.setAttribute('opacity',computed.opacity);
      if (intersects) {
        // Text stays in the live native backdrop. Pulling a nearby paragraph
        // into a distorted HTML copy prints stray words over button labels.
        const layer = paint(node, rect, computed); if (layer) group.append(layer);
      }
      let children = group;
      if (clips && intersects) {
        const id = 'sv-scene-clip-' + (++nextId), clip = svgElement('clipPath',{id,clipPathUnits:'userSpaceOnUse'});
        clip.append(svgElement('rect',{x:rect.left-left,y:rect.top-top,width:rect.width,height:rect.height,rx:parseFloat(computed.borderTopLeftRadius)||0}));
        children = svgElement('g',{'clip-path':'url(#'+id+')'}); group.append(clip,children);
      }
      // Negative-z artwork belongs below ordinary content, including on the
      // hero where its bitmap is deliberately placed after the shade in DOM.
      // Reject bounded rows/cards before sorting. Resolving every offscreen
      // sibling's z-index first would undo the branch pruning below it.
      const ordered = [...node.children].filter(child => sourceNode(child) && inBand(child));
      ordered.sort((a,b) => (parseFloat(styleOf(a).zIndex)||0)-(parseFloat(styleOf(b).zIndex)||0));
      // The cinema glow is a CSS pseudo-element rather than another image.
      // Sample only known artwork containers, avoiding pseudo-style reads for
      // every card and label. Its z-order must match the live source stack.
      const pseudos=node.matches('.dsHero,.svDetailHero,.dsWelcomeHeroBg,.svHeroLightBridge')?
        ['::before','::after'].map(kind=>{const layer=pseudoLayer(node,rect,kind);return layer?{...layer,kind,z:parseFloat(layer.computed.zIndex)||0}:null;}).filter(Boolean):[];
      const sources=[...pseudos.filter(layer=>layer.kind==='::before'),...ordered.map(node=>({node,z:parseFloat(styleOf(node).zIndex)||0})),...pseudos.filter(layer=>layer.kind==='::after')];
      sources.sort((a,b)=>a.z-b.z);
      for(const source of sources) {
        if(source.node)visit(source.node,children);
        else {
          const layer=paint({tagName:''},source.rect,source.computed);if(!layer)continue;
          const filter=nativeColorFilter(source.computed.filter,{x:-padding,y:-padding,width:bounds.width+2*padding,height:bounds.height+2*padding},definitions);if(filter)layer.setAttribute('filter',filter);
          if(source.computed.opacity&&source.computed.opacity!=='1')layer.setAttribute('opacity',source.computed.opacity);
          const local={x:source.rect.left-left,y:source.rect.top-top,width:source.rect.width,height:source.rect.height};
          for(const value of cssList(source.computed.maskImage||source.computed.webkitMaskImage||'none')) {
            const fill=nativeGradient(value,local,definitions);if(!fill)continue;
            const mask=svgElement('mask',{id:'sv-scene-mask-'+(++nextId),maskUnits:'userSpaceOnUse',...local,style:'mask-type:alpha'});
            mask.append(svgElement('rect',{...local,fill}));definitions.append(mask);layer.setAttribute('mask','url(#'+mask.id+')');
          }
          children.append(layer);
        }
      }
      if (group.childNodes.length) {
        // CSS effects belong to the whole source element, including artwork
        // inside wrappers that have no background paint of their own.
        const filter=nativeColorFilter(computed.filter,{x:-padding,y:-padding,width:bounds.width+2*padding,height:bounds.height+2*padding},definitions);
        if(filter)group.setAttribute('filter',filter);
        const local={x:rect.left-left,y:rect.top-top,width:rect.width,height:rect.height};
        let layer=group;
        for(const value of cssList(computed.maskImage||computed.webkitMaskImage||'none')) {
          const fill=nativeGradient(value,local,definitions);if(!fill)continue;
          const mask=svgElement('mask',{id:'sv-scene-mask-'+(++nextId),maskUnits:'userSpaceOnUse',...local,style:'mask-type:alpha'});
          mask.append(svgElement('rect',{...local,fill}));definitions.append(mask);
          const wrapper=svgElement('g',{mask:'url(#'+mask.id+')'});wrapper.append(layer);layer=wrapper;
        }
        parent.append(layer);
      }
    }
    for (const node of document.body.children) visit(node,scene);
    return scene;
  }
  function watch() {
    if (preferences) return;
    preferences = new MutationObserver(changes => {
      let changed = false, removed = false;
      const backgroundSources = new Set();
      for (const change of changes) {
        if (insideOptics(change.target)) continue;
        // Captured scenes contain artwork, never text. Clocks and labels may
        // update frequently without rebuilding every navigation/action lens.
        if (change.type === 'characterData' || change.type === 'childList' &&
          ![...change.addedNodes,...change.removedNodes].some(node => node instanceof HTMLElement)) continue;
        backgroundSources.add(change.target);
        if (change.type === 'attributes' && change.target === document.body) changed = true;
        if (change.type === 'childList' && [...change.removedNodes].some(node => node instanceof HTMLElement)) removed = true;
        if (change.type === 'childList') for (const node of change.addedNodes) if (node instanceof HTMLElement) {
          for (const [host, entry] of live) if (node === host || node.contains(host)) entry.sync();
        }
      }
      if (removed) for (const [host, entry] of live) if (!host.isConnected) entry.controller.destroy();
      if (changed) syncAll();
      for (const target of backgroundSources) sceneChanged({target});
    });
    preferences.observe(document.body, {attributes:true, attributeFilter:['data-st-glass','style','class','src','srcset','open','hidden'], childList:true, characterData:true, subtree:true});
    document.addEventListener('visibilitychange', syncAll);
    window.addEventListener('resize', resizeAll, {passive:true});
    document.addEventListener('scroll', sceneChanged, {passive:true,capture:true});
    document.addEventListener('load', sceneChanged, true);
    document.addEventListener('transitionend',sceneChanged,true);
    document.addEventListener('animationend',sceneChanged,true);
    window.visualViewport?.addEventListener('resize',sceneChanged,{passive:true});
    window.visualViewport?.addEventListener('scroll',sceneChanged,{passive:true});
    transparency.addEventListener('change', syncAll);
    touch.addEventListener('change', syncAll);
  }
  function unwatch() {
    if (live.size) return;
    preferences?.disconnect(); preferences = null;
    document.removeEventListener('visibilitychange', syncAll);
    window.removeEventListener('resize', resizeAll);
    document.removeEventListener('scroll', sceneChanged, true);
    document.removeEventListener('load', sceneChanged, true);
    document.removeEventListener('transitionend',sceneChanged,true);
    document.removeEventListener('animationend',sceneChanged,true);
    window.visualViewport?.removeEventListener('resize',sceneChanged);
    window.visualViewport?.removeEventListener('scroll',sceneChanged);
    transparency.removeEventListener('change', syncAll);
    touch.removeEventListener('change', syncAll);
  }
  function mount(element, options = {}) {
    if (!(element instanceof HTMLElement)) throw new TypeError('SwiflyLiquidGlass.mount expects an HTML element.');
    if (mounted.has(element)) return mounted.get(element);
    const config = {
      // Only the navigation opts into the higher-definition edge lens; all
      // existing action buttons and panels keep their established defaults.
      borderWidth:numeric(element, 'glassBorderWidth', .07),
      brightness:50, opacity:numeric(element, 'glassMapOpacity', .93),
      displace:numeric(element, 'glassDisplace', .5),
      distortionScale:numeric(element, 'glassDistortion', -180),
      channelOffsets:[0, 10, 20],
      saturation:numeric(element, 'glassSaturation', 1),
      mapBlur:numeric(element, 'glassBlur', 7), tint:numeric(element, 'glassTint', .2),
      blend:element.dataset.glassBlend === 'difference' ? 'difference' : 'screen', ...options
    };
    const filterId = 'swifly-liquid-filter-' + (++nextId), ua = navigator.userAgent;
    const isAppleTouch = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const svgCapable = !isAppleTouch && /Chrome|Chromium|Edg|OPR/.test(ua) && typeof CSS !== 'undefined' && CSS.supports('backdrop-filter', 'url(#' + filterId + ')');
    // WebKit cannot use an SVG reference as a live backdrop filter. Its
    // independent inline SVG lens receives a bounded copy of actual page paint.
    const isWebKit = /AppleWebKit/.test(ua) && (isAppleTouch || !/Chrome|Chromium|Edg|OPR/.test(ua));
    const webkitSvgCapable = isWebKit && typeof CSS !== 'undefined' &&
      (CSS.supports('-webkit-backdrop-filter', 'blur(1px)') || CSS.supports('backdrop-filter', 'blur(1px)'));
    const previousRenderer = element.dataset.swiflyRenderer;
    const previousProperties = ['--sv-glass-default-tint', '--sv-glass-saturation', '--sv-glass-radius', '--sv-glass-filter'].map(property => [property, element.style.getPropertyValue(property), element.style.getPropertyPriority(property)]);
    element.style.setProperty('--sv-glass-default-tint', config.tint);
    element.style.setProperty('--sv-glass-saturation', config.saturation);
    if (element.dataset.glassRadius) element.style.setProperty('--sv-glass-radius', numeric(element, 'glassRadius', 20) + 'px');
    let svg, map, scene, observer, observing = false, dimensions = '', enabled = true, destroyed = false;
    const allowed = () => !destroyed && enabled && (svgCapable || webkitSvgCapable) && element.isConnected && !document.hidden && liquidPreference();
    function renderer(value) {if (element.dataset.swiflyRenderer !== value) element.dataset.swiflyRenderer = value;}
    function removeGraph() {
      svg?.remove(); svg = null; map = null; scene = null; dimensions = '';
      element.style.removeProperty('--sv-glass-filter');
    }
    function createGraph() {
      svg = svgElement('svg', {class:'svLiquidPane__filters', 'aria-hidden':'true', focusable:'false'});
      const defs = svgElement('defs');
      const filter = svgElement('filter', {id:filterId, x:'0%', y:'0%', width:'100%', height:'100%', 'color-interpolation-filters':'sRGB'});
      map = svgElement('feImage', {x:0, y:0, width:'100%', height:'100%', preserveAspectRatio:'none', result:'map'});
      filter.append(map);
      ['r', 'g', 'b'].forEach((channel, index) => {
        filter.append(svgElement('feDisplacementMap', {in:'SourceGraphic', in2:'map', scale:config.distortionScale + config.channelOffsets[index], xChannelSelector:'R', yChannelSelector:'G', result:'displaced-' + channel}));
        const matrix = Array(20).fill(0); matrix[index * 5 + index] = 1; matrix[18] = 1;
        filter.append(svgElement('feColorMatrix', {in:'displaced-' + channel, type:'matrix', values:matrix.join(' '), result:channel}));
      });
      filter.append(svgElement('feBlend', {in:'r', in2:'g', mode:'screen', result:'rg'}), svgElement('feBlend', {in:'rg', in2:'b', mode:'screen', result:'rgb'}), svgElement('feGaussianBlur', {in:'rgb', stdDeviation:config.displace}));
      defs.append(filter); svg.append(defs); element.append(svg);
      element.style.setProperty('--sv-glass-filter', 'url(#' + filterId + ')');
    }
    function createWebKitLens(width, height, radius) {
      // Safari renders SVG SourceGraphic filters correctly. Feed it page paint
      // rather than trying to filter a native backdrop (or just a white rim).
      // CSS clamps a pill's radius proportionally. SVG independently clamps
      // rx/ry, so an oversized CSS radius must be resolved before SVG clipping.
      radius=Math.max(0,Math.min(radius,width/2,height/2));
      const id = filterId + '-webkit';
      const defs = svgElement('defs');
      const texture=lensTexture(width,height,radius);
      const padding = 64, scale = texture?.scale || -Math.min(100,height*1.45,width*.45);
      const refract = svgElement('filter',{id:id+'-refract',filterUnits:'userSpaceOnUse',
        x:-padding,y:-padding,width:width+2*padding,height:height+2*padding,'color-interpolation-filters':'sRGB'});
      map = svgElement('feImage',{x:0,y:0,width,height,preserveAspectRatio:'none',result:'map'});
      if(texture)map.setAttribute('href',texture.map);
      refract.append(map);
      // WebKit renders reference filters in software. One full-color pass
      // gives real refraction without tripling the sampled artwork raster work.
      refract.append(svgElement('feDisplacementMap',{in:'SourceGraphic',in2:'map',scale,
        xChannelSelector:'R',yChannelSelector:'G',result:'refracted'}),
        svgElement('feGaussianBlur',{in:'refracted',stdDeviation:.28}));
      const clip = svgElement('clipPath',{id:id+'-clip',clipPathUnits:'userSpaceOnUse'});
      clip.append(svgElement('rect',{width,height,rx:radius}));
      const body=svgElement('filter',{id:id+'-body',filterUnits:'userSpaceOnUse',
        x:-padding,y:-padding,width:width+2*padding,height:height+2*padding,'color-interpolation-filters':'sRGB'});
      body.append(svgElement('feGaussianBlur',{in:'SourceGraphic',stdDeviation:Math.min(2.4,.65+Math.max(0,height-80)*.006),result:'soft'}),
        svgElement('feColorMatrix',{in:'soft',type:'saturate',values:1.025}));
      const feather = svgElement('filter',{id:id+'-feather'});
      feather.append(svgElement('feGaussianBlur',{stdDeviation:1.15}));
      const edge = texture?.edge || Math.min(20,Math.max(7,height*.2));
      const edgeMask = svgElement('mask',{id:id+'-edge',maskUnits:'userSpaceOnUse',x:0,y:0,width,height});
      edgeMask.append(svgElement('rect',{width,height,fill:'white'}),
        svgElement('rect',{x:edge,y:edge,width:Math.max(0,width-edge*2),height:Math.max(0,height-edge*2),rx:Math.max(0,radius-edge),fill:'black',filter:'url(#'+id+'-feather)'}));
      defs.append(refract,clip,body,feather,edgeMask);
      svg=svgElement('svg',{class:'svWebkitGlassOptics','aria-hidden':'true',focusable:'false',
        viewBox:'0 0 '+width+' '+height,preserveAspectRatio:'none'});
      scene=svgElement('g',{id:id+'-scene','data-sv-glass-scene':''});
      const sampled=svgElement('g',{filter:'url(#'+id+'-refract)'});sampled.append(scene);
      const edgeScene=svgElement('g',{'clip-path':'url(#'+id+'-clip)',mask:'url(#'+id+'-edge)'});edgeScene.append(sampled);
      // Render softness in SVG too, so the material does not depend on an
      // accelerated CSS backdrop compositing path being available.
      const bodyScene=svgElement('g',{'clip-path':'url(#'+id+'-clip)'});
      bodyScene.append(svgElement('use',{href:'#'+id+'-scene',filter:'url(#'+id+'-body)',opacity:.72}),
        svgElement('rect',{width,height,rx:radius,fill:'black',opacity:.075}));
      svg.append(defs,bodyScene,edgeScene);
      if(texture)svg.append(svgElement('image',{class:'svGlassReflection',href:texture.reflection,width,height,preserveAspectRatio:'none','clip-path':'url(#'+id+'-clip)'}));
      // A faint silhouette supplements the directional reflection on plain
      // backgrounds. No opaque bevel or pane-wide white sheen is stacked here.
      svg.append(svgElement('rect',{x:.5,y:.5,width:Math.max(0,width-1),height:Math.max(0,height-1),rx:radius,fill:'none',stroke:'white','stroke-opacity':.16,'stroke-width':.5}));
      element.append(svg);
    }
    function prepareMap(sources) {
      if (!allowed()) return;
      const bounds = boxOf(element), {width, height} = bounds;
      if (width <= 0 || height <= 0) return () => renderer('blur');
      // Rail reveals, image loads and paint mutations elsewhere on the page
      // do not alter this bounded lens. Filter them in the shared read phase.
      if (sources && !sources.some(source => {
        if (!source.isConnected || source.contains(element)) return true;
        const rect = boxOf(source);
        return rect.width > 0 && rect.height > 0 && rect.left < bounds.left+width+64 &&
          rect.right > bounds.left-64 && rect.top < bounds.top+height+64 && rect.bottom > bounds.top-64;
      })) return;
      const computed = styleOf(element);
      for (let node = element; node; node = node.parentElement) {
        const style = node === element ? computed : styleOf(node);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return () => renderer('blur');
      }
      const radius = parseFloat(computed.borderTopLeftRadius) || 20;
      const configuredBlur = computed.getPropertyValue('--sv-glass-map-blur').trim();
      const blur = configuredBlur !== '' && Number.isFinite(Number(configuredBlur)) ? Number(configuredBlur) : config.mapBlur;
      const blend = computed.getPropertyValue('--sv-glass-blend').trim() === 'difference' ? 'difference' : config.blend;
      const key = [width, height, radius, blur, blend].join(':');
      const captured = webkitSvgCapable ? captureScene(element,bounds,64) : null;
      return () => {
      if (svg && !element.contains(svg)) removeGraph();
      if (webkitSvgCapable && key === dimensions && scene) {
        scene.replaceChildren(captured);renderer('webkit-svg');return;
      }
      if (key === dimensions) {renderer('svg'); return;}
      if (webkitSvgCapable) {
        if (svg) removeGraph();
        createWebKitLens(width,height,radius);
        scene.replaceChildren(captured);
      } else if (!svg) createGraph();
      dimensions = key;
      if(webkitSvgCapable && map.hasAttribute('href')){renderer('webkit-svg');return;}
      const inset = Math.min(width, height) * config.borderWidth * .5;
      const image = svgElement('svg', {viewBox:`0 0 ${width} ${height}`}), defs = svgElement('defs');
      for (const [id, attrs, color] of [
        ['x', {x1:'100%', y1:'0%', x2:'0%', y2:'0%'}, 'red'],
        // feDisplacementMap reads G for vertical motion. Blue here left G=0,
        // creating a constant vertical shift instead of optical refraction.
        ['y', {x1:'0%', y1:'0%', x2:'0%', y2:'100%'}, 'lime']
      ]) {
        const gradient = svgElement('linearGradient', {id, ...attrs});
        gradient.append(svgElement('stop', {offset:'0%', 'stop-color':color, 'stop-opacity':0}), svgElement('stop', {offset:'100%', 'stop-color':color}));
        defs.append(gradient);
      }
      image.append(defs, svgElement('rect', {width, height, fill:'black'}),
        svgElement('rect', {width, height, rx:radius, fill:'url(#x)'}),
        svgElement('rect', {width, height, rx:radius, fill:'url(#y)', style:`mix-blend-mode:${blend}`}),
        svgElement('rect', {x:inset, y:inset, width:Math.max(0, width - 2 * inset), height:Math.max(0, height - 2 * inset), rx:radius, fill:`hsl(0 0% ${config.brightness}% / ${config.opacity})`, style:`filter:blur(${blur}px)`}));
      // The rounded WebKit texture is generated only when geometry changes;
      // Chromium retains its established live-backdrop SVG map.
      map.setAttribute('href', 'data:image/svg+xml,' + encodeURIComponent(new XMLSerializer().serializeToString(image)));
      renderer(webkitSvgCapable ? 'webkit-svg' : 'svg');
      };
    }
    function scheduleMap() {if (allowed()) queueScene(prepareMap);}
    function sampleMap(source) {if (allowed()) queueScene(prepareMap,true,source);}
    function sync() {
      if (destroyed) return;
      if (!allowed()) {
        cancelScene(prepareMap);
        if (observing) {observer.disconnect(); observing = false;}
        if (!liquidPreference()) removeGraph();
        renderer('blur'); return;
      }
      if (!observing && typeof ResizeObserver === 'function') {
        observer ||= new ResizeObserver(scheduleMap); observer.observe(element); observing = true;
      }
      scheduleMap();
    }
    function setEnabled(value) {enabled = Boolean(value); sync();}
    const controller = {
      get supported() {return svgCapable || webkitSvgCapable;},
      get mode() {return svgCapable ? 'svg' : webkitSvgCapable ? 'webkit-svg' : 'blur';},
      get enabled() {return enabled;}, setEnabled,
      refresh() {dimensions = ''; scheduleMap();},
      destroy() {
        if (destroyed) return; destroyed = true;
        observer?.disconnect(); cancelScene(prepareMap); removeGraph();
        for (const [property, value, priority] of previousProperties) {
          if (value) element.style.setProperty(property, value, priority); else element.style.removeProperty(property);
        }
        if (previousRenderer === undefined) delete element.dataset.swiflyRenderer;
        else element.dataset.swiflyRenderer = previousRenderer;
        mounted.delete(element); live.delete(element); unwatch();
      }
    };
    mounted.set(element, controller); live.set(element, {controller, sync, schedule:scheduleMap,sample:sampleMap,webkit:webkitSvgCapable}); watch(); sync();
    return controller;
  }
  window.SwiflyLiquidGlass = Object.freeze({mount});
  document.querySelectorAll('[data-swifly-glass]').forEach(element => mount(element));
})();
