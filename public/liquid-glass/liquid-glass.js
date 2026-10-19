/* Bounded geometry for live Chromium backdrop filters; native frost elsewhere. */
(() => {
  'use strict';
  if (window.SwiflyLiquidGlass) return;
  const NS = 'http://www.w3.org/2000/svg';
  const mounted = new WeakMap(), live = new Map();
  const transparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
  const xbox = document.documentElement.dataset.svXbox === 'true';
  const pending = new Set(), textures = new Map();
  let nextId = 0, preferences, frame = 0, boxes = new WeakMap(), styles = new WeakMap();
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
  const boxOf = node => {
    if (!boxes.has(node)) boxes.set(node, node.getBoundingClientRect());
    return boxes.get(node);
  };
  const styleOf = node => {
    if (!styles.has(node)) styles.set(node, getComputedStyle(node));
    return styles.get(node);
  };
  function flush() {
    frame = 0; boxes = new WeakMap(); styles = new WeakMap();
    const work = [...pending]; pending.clear();
    // Read all pane geometry before any filter is written. Page artwork stays
    // entirely in the browser's live backdrop, without a copied scene.
    const commits = work.map(prepare => prepare()).filter(Boolean);
    for (const commit of commits) commit();
  }
  function queue(prepare) {
    pending.add(prepare);
    if (!frame) frame = requestAnimationFrame(flush);
  }
  function cancel(prepare) {
    pending.delete(prepare);
    if (!pending.size && frame) {cancelAnimationFrame(frame); frame = 0;}
  }
  function lensTexture(width, height, radius, blur = 7) {
    if (![width,height,radius,blur].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    const r=Math.max(0,Math.min(radius,width/2,height/2)),softness=Math.max(0,Math.min(blur,24));
    const key=[width,height,r,softness].join(':');
    if(textures.has(key)) {const texture=textures.get(key);textures.delete(key);textures.set(key,texture);return texture;}
    // Crossed color fields curve into a softened neutral interior. This map
    // describes the lens only: the browser refracts the actual live backdrop.
    // A vector image has constant complexity at every pane size, avoiding a
    // per-pixel JavaScript loop or a captured copy of the page/video.
    const inset=Math.min(width,height)*.035;
    const rect=`width="${width}" height="${height}" rx="${r}"`;
    const geometry=`<svg xmlns="${NS}" viewBox="0 0 ${width} ${height}"><defs>
      <linearGradient id="horizontal" x1="1" y1="0" x2="0" y2="0"><stop stop-color="transparent"/><stop offset="1" stop-color="#f00"/></linearGradient>
      <linearGradient id="vertical" x1="0" y1="0" x2="0" y2="1"><stop stop-color="transparent"/><stop offset="1" stop-color="#00f"/></linearGradient>
      </defs><rect width="${width}" height="${height}" fill="#000"/>
      <rect ${rect} fill="url(#horizontal)"/><rect ${rect} fill="url(#vertical)" style="mix-blend-mode:screen"/>
      <rect x="${inset}" y="${inset}" width="${width-2*inset}" height="${height-2*inset}" rx="${r}" fill="rgb(50% 50% 50% / .93)" style="filter:blur(${softness}px)"/></svg>`;
    const texture={map:'data:image/svg+xml,'+encodeURIComponent(geometry),ready:true,promise:null};
    // Chromium can resolve a backdrop filter before feImage has rasterized.
    // Decode this exact vector URI once, shared by every same-sized pane.
    if (typeof Image === 'function' && typeof Image.prototype.decode === 'function') {
      const image=new Image();
      texture.ready=false;
      image.src=texture.map;
      texture.promise=image.decode().catch(()=>{}).then(()=>{texture.ready=true;});
    }
    textures.set(key,texture);
    if(textures.size>48)textures.delete(textures.keys().next().value);
    return texture;
  }
  function watch() {
    if (preferences) return;
    preferences = new MutationObserver(changes => {
      let preferenceChanged = false, removed = false;
      const changed = new Set();
      for (const change of changes) {
        if (change.target instanceof Element && change.target.closest('.svLiquidPane__filters')) continue;
        if (change.type === 'attributes') {
          if (change.target === document.body && change.attributeName === 'data-st-glass') preferenceChanged = true;
          // Pane-owned style writes only configure the filter. A host resize
          // has its own observer; ancestor visibility can change independently.
          if (change.attributeName !== 'style' || !live.has(change.target)) changed.add(change.target);
        } else {
          if ([...change.removedNodes].some(node => node instanceof HTMLElement)) removed = true;
          for (const node of change.addedNodes) if (node instanceof HTMLElement) changed.add(node);
        }
      }
      if (removed) for (const [host, entry] of live) if (!host.isConnected) entry.controller.destroy();
      if (preferenceChanged) syncAll();
      else if (changed.size) {
        // Resolve changes locally instead of testing every live lens against
        // every changed node (quadratic when a catalog updates many controls).
        const affected = new Set();
        for (const node of changed) {
          for (let parent = node; parent; parent = parent.parentElement) {
            const entry = live.get(parent);
            if (entry) affected.add(entry);
          }
          if (node instanceof Element) {
            node.querySelectorAll('.svLiquidPane,[data-swifly-renderer]').forEach(host => {
              const entry = live.get(host);
              if (entry) affected.add(entry);
            });
          }
        }
        for (const entry of affected) entry.sync();
      }
    });
    // On Xbox, card focus, scroll and transition class/style churn does not
    // require rebuilding live optics: Intersection/ResizeObservers already
    // track visibility and actual geometry changes.
    preferences.observe(document.body, {attributes:true, attributeFilter:xbox?['data-st-glass','open','hidden']:['data-st-glass','style','class','open','hidden'], childList:true, subtree:true});
    document.addEventListener('visibilitychange', syncAll);
    window.addEventListener('resize', resizeAll, {passive:true});
    transparency.addEventListener('change', syncAll);
  }
  function unwatch() {
    if (live.size) return;
    preferences?.disconnect(); preferences = null;
    document.removeEventListener('visibilitychange', syncAll);
    window.removeEventListener('resize', resizeAll);
    transparency.removeEventListener('change', syncAll);
  }
  function mount(element, options = {}) {
    if (!(element instanceof HTMLElement)) throw new TypeError('SwiflyLiquidGlass.mount expects an HTML element.');
    if (mounted.has(element)) return mounted.get(element);
    const config = {
      displace:numeric(element, 'glassDisplace', .5),
      distortionScale:numeric(element, 'glassDistortion', -180),
      saturation:numeric(element, 'glassSaturation', 1),
      lensBlur:numeric(element, 'glassLensBlur', 7),
      tint:numeric(element, 'glassTint', .2), ...options
    };
    const filterId = 'swifly-liquid-filter-' + (++nextId), ua = navigator.userAgent;
    const isAppleTouch = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    // Navigation and controls share one optical field. A wider shoulder on
    // the mobile bar keeps its larger rounded silhouette equally soft.
    if(element.closest('.mobileNav'))config.lensBlur=11;
    const svgCapable = !isAppleTouch && /Chrome|Chromium|Edg|OPR/.test(ua) && typeof CSS !== 'undefined' && CSS.supports('backdrop-filter', 'url(#' + filterId + ')');
    const previousRenderer = element.dataset.swiflyRenderer;
    const previousSupport = element.dataset.swiflyOpticSupport;
    if (svgCapable) element.dataset.swiflyOpticSupport = 'true';
    const previousProperties = ['--sv-glass-default-tint', '--sv-glass-saturation', '--sv-glass-radius', '--sv-glass-filter'].map(property => [property, element.style.getPropertyValue(property), element.style.getPropertyPriority(property)]);
    element.style.setProperty('--sv-glass-default-tint', config.tint);
    element.style.setProperty('--sv-glass-saturation', config.saturation);
    if (element.dataset.glassRadius) element.style.setProperty('--sv-glass-radius', numeric(element, 'glassRadius', 20) + 'px');
    let svg, map, observer, observing = false, dimensions = '', enabled = true, destroyed = false;
    const allowed = () => !destroyed && enabled && svgCapable && element.isConnected && !document.hidden && liquidPreference();
    function renderer(value) {if (element.dataset.swiflyRenderer !== value) element.dataset.swiflyRenderer = value;}
    function removeGraph() {
      svg?.remove(); svg = null; map = null; dimensions = '';
      element.style.removeProperty('--sv-glass-filter');
    }
    // The measured ShuttleTV material separates and recombines three color
    // samples. Keep its full lens depth, with one cached geometry field and
    // one graph per visible control; do not add a second painted reflection.
    function createGraph(texture, scale) {
      svg = svgElement('svg', {class:'svLiquidPane__filters', 'aria-hidden':'true', focusable:'false'});
      const defs = svgElement('defs');
      const filter = svgElement('filter', {id:filterId, x:'0%', y:'0%', width:'100%', height:'100%', 'color-interpolation-filters':'sRGB'});
      map = svgElement('feImage', {href:texture.map,x:0, y:0, width:'100%', height:'100%', preserveAspectRatio:'none', result:'map'});
      filter.append(map);
      const colors=['red','green','blue'];
      for(let channel=0;channel<colors.length;channel++){
        const color=colors[channel];
        filter.append(
          svgElement('feDisplacementMap',{in:'SourceGraphic',in2:'map',scale:scale+channel*10,xChannelSelector:'R',yChannelSelector:'G',result:'sample-'+color}),
          svgElement('feColorMatrix',{in:'sample-'+color,type:'matrix',values:Array.from({length:20},(_,index)=>index===channel*6||index===18?1:0).join(' '),result:color})
        );
      }
      filter.append(
        svgElement('feBlend',{in:'red',in2:'green',mode:'screen',result:'rg'}),
        svgElement('feBlend',{in:'rg',in2:'blue',mode:'screen',result:'refracted'}),
        svgElement('feGaussianBlur',{in:'refracted',stdDeviation:config.displace})
      );
      defs.append(filter); svg.append(defs); element.append(svg);
      element.style.setProperty('--sv-glass-filter', 'url(#' + filterId + ')');
    }
    function prepareMap() {
      if (!allowed()) return;
      // Transforms change visual bounds while the element enters, but not
      // layout dimensions. Use those for a stable lens displacement field.
      const bounds=boxOf(element);
      const width=element.offsetWidth || bounds.width;
      const height=element.offsetHeight || bounds.height;
      if (width <= 0 || height <= 0) return () => renderer('blur');
      const computed = styleOf(element);
      for (let node = element; node; node = node.parentElement) {
        const style = node === element ? computed : styleOf(node);
        // Opacity entrances keep their layout geometry. Prepare the lens now:
        // the first class/style mutation can arrive at opacity 0 and CSS does
        // not emit another mutation when the fade becomes visible.
        if (style.display === 'none' || style.visibility === 'hidden') return () => renderer('blur');
      }
      const parsedRadius=parseFloat(computed.borderTopLeftRadius);
      const radius=Number.isFinite(parsedRadius)?parsedRadius:20;
      const styledBlur=parseFloat(computed.getPropertyValue('--sv-glass-lens-blur'));
      const blur=Number.isFinite(styledBlur)?styledBlur:config.lensBlur;
      const scale=config.distortionScale;
      const key = [width, height, radius, blur].join(':');
      const texture=key!==dimensions || svg&&!element.contains(svg)?lensTexture(width,height,radius,blur):null;
      if (texture && !texture.ready) return () => {
        renderer('blur');
        // Stay in the coherent CSS glass tier while decoding; one wakeup,
        // no polling, extra timers, or per-frame bitmap generation.
        texture.promise.then(() => {if (allowed()) scheduleMap();});
      };
      return () => {
        if (svg && !element.contains(svg)) removeGraph();
        if (key === dimensions) {renderer('svg'); return;}
        if (!texture) {removeGraph();renderer('blur');return;}
        if (!svg) createGraph(texture,scale);
        else {
          map.setAttribute('href',texture.map);
          svg.querySelectorAll('feDisplacementMap').forEach((field,channel)=>field.setAttribute('scale',scale+channel*10));
        }
        dimensions = key;
        renderer('svg');
      };
    }
    function scheduleMap() {if (allowed()) queue(prepareMap);}
    function sync() {
      if (destroyed) return;
      if (!allowed()) {
        cancel(prepareMap);
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
      get supported() {return svgCapable;},
      get mode() {return svgCapable ? 'svg' : 'blur';},
      get enabled() {return enabled;}, setEnabled,
      refresh() {dimensions = ''; scheduleMap();},
      destroy() {
        if (destroyed) return; destroyed = true;
        observer?.disconnect(); cancel(prepareMap); removeGraph();
        for (const [property, value, priority] of previousProperties) {
          if (value) element.style.setProperty(property, value, priority); else element.style.removeProperty(property);
        }
        if (previousRenderer === undefined) delete element.dataset.swiflyRenderer;
        else element.dataset.swiflyRenderer = previousRenderer;
        if (previousSupport === undefined) delete element.dataset.swiflyOpticSupport;
        else element.dataset.swiflyOpticSupport = previousSupport;
        mounted.delete(element); live.delete(element); unwatch();
      }
    };
    mounted.set(element, controller); live.set(element, {controller, sync, schedule:scheduleMap}); watch(); sync();
    return controller;
  }
  window.SwiflyLiquidGlass = Object.freeze({mount,createTexture:lensTexture});
  document.querySelectorAll('[data-swifly-glass]').forEach(element => mount(element));
})();
