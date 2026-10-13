/* v194: Chromium backdrop displacement and scene-backed WebKit SVG lenses. */
(() => {
  'use strict';
  if (window.SwiflyLiquidGlass) return;
  const NS = 'http://www.w3.org/2000/svg';
  const mounted = new WeakMap(), live = new Map();
  const transparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
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
    for (const entry of live.values()) if (entry.webkit) entry.schedule();
  };
  // Several lenses share one paint's measurements. No idle animation loop,
  // canvas readback, image downloads or full-page DOM clones are needed.
  let sceneTime, boxes = new WeakMap(), styles = new WeakMap();
  const boxOf = node => {
    if (!boxes.has(node)) boxes.set(node, node.getBoundingClientRect());
    return boxes.get(node);
  };
  const styleOf = node => {
    if (!styles.has(node)) styles.set(node, getComputedStyle(node));
    return styles.get(node);
  };
  const insideOptics = node => (node instanceof Element ? node : node.parentElement)?.closest('.svLiquidPane, .svWebkitGlassOptics, .svLiquidPane__filters');
  function captureScene(host, bounds, padding) {
    const scene = svgElement('g'), left = bounds.left || 0, top = bounds.top || 0;
    const area = {left:left-padding, top:top-padding, right:left+bounds.width+padding, bottom:top+bounds.height+padding};
    const overlaps = rect => rect.width > 0 && rect.height > 0 &&
      rect.left < area.right && rect.left+rect.width > area.left &&
      rect.top < area.bottom && rect.top+rect.height > area.top;
    const paint = (node, rect, computed, text = '') => {
      const image = node.tagName === 'IMG' ? node.currentSrc || node.src : '';
      const background = computed.backgroundImage && computed.backgroundImage !== 'none' ||
        computed.backgroundColor && !['transparent','rgba(0, 0, 0, 0)'].includes(computed.backgroundColor);
      if (!image && !background && !text) return null;
      const cropLeft=Math.max(rect.left,area.left),cropTop=Math.max(rect.top,area.top);
      const cropWidth=Math.min(rect.left+rect.width,area.right)-cropLeft;
      const cropHeight=Math.min(rect.top+rect.height,area.bottom)-cropTop;
      const foreign = svgElement('foreignObject', {x:cropLeft-left, y:cropTop-top, width:cropWidth, height:cropHeight});
      foreign.style.overflow='hidden';
      const copy = document.createElementNS('http://www.w3.org/1999/xhtml', image ? 'img' : 'div');
      // WebKit's positioned HTML layers escape ancestor SVG filters. Keep the
      // crop as a flat, static foreignObject, using margins for alignment.
      // SVG clips the small viewport; masks/cover/typography retain source size.
      copy.style.cssText = 'display:block!important;position:static!important;margin:0!important;min-width:0!important;min-height:0!important;box-sizing:border-box!important;pointer-events:none!important;';
      copy.style.width=rect.width+'px';copy.style.height=rect.height+'px';
      copy.style.setProperty('margin-left',(rect.left-cropLeft)+'px','important');
      copy.style.setProperty('margin-top',(rect.top-cropTop)+'px','important');
      // Copy only paint and typography, never IDs, scripts, handlers, links,
      // form values, layout positioning or the original glass layers.
      for (const name of ['background-image','background-color','background-size','background-position','background-repeat','background-origin','background-clip','border-radius','filter','-webkit-mask-image','mask-image','-webkit-mask-composite','mask-composite','mask-size','mask-position','mask-repeat']) {
        const value = computed.getPropertyValue(name); if (value) copy.style.setProperty(name,value);
      }
      if (image) {
        copy.setAttribute('src', image); copy.setAttribute('alt','');
        copy.style.objectFit = computed.objectFit; copy.style.objectPosition = computed.objectPosition;
      } else if (text) {
        for (const name of ['font-family','font-size','font-weight','font-style','line-height','letter-spacing','word-spacing','color','text-align','text-transform','text-shadow','white-space','padding-top','padding-right','padding-bottom','padding-left']) {
          const value = computed.getPropertyValue(name); if (value) copy.style.setProperty(name,value);
        }
        copy.textContent = text;
      }
      foreign.append(copy); return foreign;
    };
    function visit(node, parent) {
      if (!(node instanceof HTMLElement) || node === host || node === host.parentElement ||
        node.matches('script,style,link,svg,canvas,video,iframe,input,textarea,select,[hidden],.svLiquidPane,.svWebkitGlassOptics,[data-sv-liquid-nav],.dsWelcomeNav')) return;
      const computed = styleOf(node);
      if (computed.display === 'none' || computed.visibility === 'hidden' || computed.opacity === '0') return;
      const rect = boxOf(node), intersects = overlaps(rect);
      // Page sections and poster cards own their geometry. Rows below the
      // sampled band must not cause hundreds of style/layout reads on scroll.
      if (!intersects && node.matches('main > *, .dsRow, .movieCard, .posterWrap, .dsWelcomeDiscovery')) return;
      const clips = ['hidden','clip','auto','scroll'].includes(computed.overflowX) ||
        ['hidden','clip','auto','scroll'].includes(computed.overflowY);
      if (!intersects && clips) return;
      const group = svgElement('g');
      if (computed.opacity && computed.opacity !== '1') group.setAttribute('opacity',computed.opacity);
      if (intersects) {
        const text = [...node.childNodes].filter(child => child.nodeType === 3).map(child => child.textContent).join('');
        const layer = paint(node, rect, computed, text.trim() ? text : ''); if (layer) group.append(layer);
      }
      let children = group;
      if (clips && intersects) {
        const id = 'sv-scene-clip-' + (++nextId), clip = svgElement('clipPath',{id,clipPathUnits:'userSpaceOnUse'});
        clip.append(svgElement('rect',{x:rect.left-left,y:rect.top-top,width:rect.width,height:rect.height,rx:parseFloat(computed.borderTopLeftRadius)||0}));
        children = svgElement('g',{'clip-path':'url(#'+id+')'}); group.append(clip,children);
      }
      // Negative-z artwork belongs below ordinary content, including on the
      // hero where its bitmap is deliberately placed after the shade in DOM.
      const ordered = [...node.children].filter(child => child instanceof HTMLElement);
      ordered.sort((a,b) => (parseFloat(styleOf(a).zIndex)||0)-(parseFloat(styleOf(b).zIndex)||0));
      for (const child of ordered) visit(child,children);
      if (group.childNodes.length) parent.append(group);
    }
    for (const node of document.body.children) visit(node,scene);
    return scene;
  }
  function watch() {
    if (preferences) return;
    preferences = new MutationObserver(changes => {
      let changed = false, removed = false, backgroundChanged = false;
      for (const change of changes) {
        if (insideOptics(change.target)) continue;
        backgroundChanged = true;
        if (change.type === 'attributes' && change.target === document.body) changed = true;
        if (change.type === 'childList' && [...change.removedNodes].some(node => node instanceof HTMLElement)) removed = true;
        if (change.type === 'childList') for (const node of change.addedNodes) if (node instanceof HTMLElement) {
          for (const [host, entry] of live) if (node === host || node.contains(host)) entry.sync();
        }
      }
      if (removed) for (const [host, entry] of live) if (!host.isConnected) entry.controller.destroy();
      if (changed) syncAll();
      if (backgroundChanged) sceneChanged();
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
    let svg, map, scene, observer, observing = false, frame = 0, dimensions = '', enabled = true, destroyed = false;
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
      const id = filterId + '-webkit';
      const grad = (suffix, attrs, stops) => {
        const g = svgElement('linearGradient', {id:id+'-'+suffix, ...attrs});
        stops.forEach(([offset,opacity]) => g.append(svgElement('stop',
          {offset,'stop-color':'white','stop-opacity':opacity})));
        return g;
      };
      const rim = grad('rim',{x1:'0%',y1:'0%',x2:'100%',y2:'100%'},
        [['0%',.8],['22%',.23],['53%',.055],['79%',.2],['100%',.67]]);
      const sheen = grad('sheen',{x1:'0%',y1:'0%',x2:'0%',y2:'100%'},
        [['0%',.2],['29%',.07],['65%',.01],['100%',.075]]);
      const glow = svgElement('radialGradient',{id:id+'-glow',cx:'13%',cy:'-35%',r:'99%'});
      glow.append(svgElement('stop',{offset:'0%','stop-color':'white','stop-opacity':'.20'}),
        svgElement('stop',{offset:'65%','stop-color':'white','stop-opacity':'.035'}),
        svgElement('stop',{offset:'100%','stop-color':'white','stop-opacity':'0'}));
      const opticalBend = svgElement('filter',{id:id+'-bend',x:'-10%',y:'-35%',width:'120%',height:'170%'});
      opticalBend.append(svgElement('feDisplacementMap',
        {in:'SourceGraphic',in2:'SourceGraphic',scale:1.7,xChannelSelector:'R',yChannelSelector:'G'}));
      const defs = svgElement('defs');
      defs.append(rim,sheen,glow,opticalBend);
      const padding = 64, scale = -Math.min(100,height*1.45,width*.45);
      const refract = svgElement('filter',{id:id+'-refract',filterUnits:'userSpaceOnUse',
        x:-padding,y:-padding,width:width+2*padding,height:height+2*padding,'color-interpolation-filters':'sRGB'});
      map = svgElement('feImage',{x:0,y:0,width,height,preserveAspectRatio:'none',result:'map'});
      refract.append(map);
      // WebKit renders reference filters in software. One full-color pass
      // gives real refraction without tripling the sampled HTML raster work.
      refract.append(svgElement('feDisplacementMap',{in:'SourceGraphic',in2:'map',scale,
        xChannelSelector:'R',yChannelSelector:'G',result:'refracted'}),
        svgElement('feGaussianBlur',{in:'refracted',stdDeviation:.55}));
      const clip = svgElement('clipPath',{id:id+'-clip',clipPathUnits:'userSpaceOnUse'});
      clip.append(svgElement('rect',{width,height,rx:radius}));
      const feather = svgElement('filter',{id:id+'-feather'});
      feather.append(svgElement('feGaussianBlur',{stdDeviation:2.2}));
      const edge = Math.min(20,Math.max(7,height*.2));
      const edgeMask = svgElement('mask',{id:id+'-edge',maskUnits:'userSpaceOnUse',x:0,y:0,width,height});
      edgeMask.append(svgElement('rect',{width,height,fill:'white'}),
        svgElement('rect',{x:edge,y:edge,width:Math.max(0,width-edge*2),height:Math.max(0,height-edge*2),rx:Math.max(0,radius-edge),fill:'black',filter:'url(#'+id+'-feather)'}));
      defs.append(refract,clip,feather,edgeMask);
      const inset = Math.max(.75,Math.min(width,height)*.016);
      const x=inset,y=inset,w=Math.max(0,width-2*inset),h=Math.max(0,height-2*inset);
      const r=Math.max(1,Math.min(radius,Math.min(w,h)/2));
      svg=svgElement('svg',{class:'svWebkitGlassOptics','aria-hidden':'true',focusable:'false',
        viewBox:'0 0 '+width+' '+height,preserveAspectRatio:'none'});
      scene=svgElement('g',{'data-sv-glass-scene':''});
      const sampled=svgElement('g',{filter:'url(#'+id+'-refract)'});sampled.append(scene);
      const edgeScene=svgElement('g',{'clip-path':'url(#'+id+'-clip)',mask:'url(#'+id+'-edge)'});edgeScene.append(sampled);
      svg.append(defs,edgeScene,
        svgElement('rect',{x,y,width:w,height:h,rx:r,fill:'url(#'+id+'-sheen)'}),
        svgElement('rect',{x,y,width:w,height:h,rx:r,fill:'url(#'+id+'-glow)'}),
        svgElement('rect',{x,y,width:w,height:h,rx:r,fill:'none',
          stroke:'url(#'+id+'-rim)','stroke-width':Math.min(1.8,Math.max(1.1,height*.026))}),
        svgElement('path',{d:'M '+(r+inset)+' '+(inset+.7)+' H '+Math.max(r+inset,width-r-inset),
          stroke:'white','stroke-opacity':'.23','stroke-width':'.75',
          fill:'none',filter:'url(#'+id+'-bend)'}));
      element.append(svg);
    }
    function updateMap(time) {
      frame = 0;
      if (!allowed()) return;
      if (time !== sceneTime) {sceneTime=time; boxes=new WeakMap();styles=new WeakMap();}
      if (svg && !element.contains(svg)) removeGraph();
      const bounds = element.getBoundingClientRect(), {width, height} = bounds;
      if (width <= 0 || height <= 0) {renderer('blur'); return;}
      const computed = getComputedStyle(element), radius = parseFloat(computed.borderTopLeftRadius) || 20;
      const configuredBlur = computed.getPropertyValue('--sv-glass-map-blur').trim();
      const blur = configuredBlur !== '' && Number.isFinite(Number(configuredBlur)) ? Number(configuredBlur) : config.mapBlur;
      const blend = computed.getPropertyValue('--sv-glass-blend').trim() === 'difference' ? 'difference' : config.blend;
      const key = [width, height, radius, blur, blend].join(':');
      if (webkitSvgCapable && key === dimensions && scene) {
        scene.replaceChildren(captureScene(element,bounds,64));renderer('webkit-svg');return;
      }
      if (key === dimensions) {renderer('svg'); return;}
      if (webkitSvgCapable) {
        if (svg) removeGraph();
        createWebKitLens(width,height,radius);
        scene.replaceChildren(captureScene(element,bounds,64));
      } else if (!svg) createGraph();
      dimensions = key;
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
      map.setAttribute('href', 'data:image/svg+xml,' + encodeURIComponent(new XMLSerializer().serializeToString(image)));
      renderer(webkitSvgCapable ? 'webkit-svg' : 'svg');
    }
    function scheduleMap() {if (allowed() && !frame) frame = requestAnimationFrame(updateMap);}
    function sync() {
      if (destroyed) return;
      if (!allowed()) {
        cancelAnimationFrame(frame); frame = 0;
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
        observer?.disconnect(); cancelAnimationFrame(frame); frame = 0; removeGraph();
        for (const [property, value, priority] of previousProperties) {
          if (value) element.style.setProperty(property, value, priority); else element.style.removeProperty(property);
        }
        if (previousRenderer === undefined) delete element.dataset.swiflyRenderer;
        else element.dataset.swiflyRenderer = previousRenderer;
        mounted.delete(element); live.delete(element); unwatch();
      }
    };
    mounted.set(element, controller); live.set(element, {controller, sync, schedule:scheduleMap,webkit:webkitSvgCapable}); watch(); sync();
    return controller;
  }
  window.SwiflyLiquidGlass = Object.freeze({mount});
  document.querySelectorAll('[data-swifly-glass]').forEach(element => mount(element));
})();
