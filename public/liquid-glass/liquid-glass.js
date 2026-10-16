/* Bounded geometry for live Chromium backdrop filters; native frost elsewhere. */
(() => {
  'use strict';
  if (window.SwiflyLiquidGlass) return;
  const NS = 'http://www.w3.org/2000/svg';
  const mounted = new WeakMap(), live = new Map();
  const transparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
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
    const texture=Object.freeze({map:'data:image/svg+xml,'+encodeURIComponent(geometry)});
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
      else for (const [host, entry] of live) if ([...changed].some(node => node === host || node.contains(host))) entry.sync();
    });
    preferences.observe(document.body, {attributes:true, attributeFilter:['data-st-glass','style','class','open','hidden'], childList:true, subtree:true});
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
      channelOffsets:[0, 10, 20],
      saturation:numeric(element, 'glassSaturation', 1),
      lensBlur:numeric(element, 'glassLensBlur', 7),
      tint:numeric(element, 'glassTint', .2),
      fitControl:false, ...options
    };
    const filterId = 'swifly-liquid-filter-' + (++nextId), ua = navigator.userAgent;
    const isAppleTouch = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    // Navigation and controls share one optical field. A wider shoulder on
    // the mobile bar keeps its larger rounded silhouette equally soft.
    if(element.closest('.mobileNav'))config.lensBlur=11;
    const svgCapable = !isAppleTouch && /Chrome|Chromium|Edg|OPR/.test(ua) && typeof CSS !== 'undefined' && CSS.supports('backdrop-filter', 'url(#' + filterId + ')');
    const previousRenderer = element.dataset.swiflyRenderer;
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
    // The 180px navigation displacement is too large for 44-90px buttons:
    // its samples run outside a narrow lens and flatten the refracted scene.
    // Scale BOTH displacement and channel separation for compact controls,
    // but leave the wide navbar's existing filter completely unchanged.
    function displacementScales(width) {
      const ratio = config.fitControl ? Math.min(1, Math.max(.09, width / 450)) : 1;
      return config.channelOffsets.map(offset =>
        Math.round((config.distortionScale + offset) * ratio * 100) / 100);
    }
    function createGraph(texture, scales) {
      svg = svgElement('svg', {class:'svLiquidPane__filters', 'aria-hidden':'true', focusable:'false'});
      const defs = svgElement('defs');
      const filter = svgElement('filter', {id:filterId, x:'0%', y:'0%', width:'100%', height:'100%', 'color-interpolation-filters':'sRGB'});
      map = svgElement('feImage', {href:texture.map,x:0, y:0, width:'100%', height:'100%', preserveAspectRatio:'none', result:'map'});
      filter.append(map);
      ['r', 'g', 'b'].forEach((channel, index) => {
        // Separate the three channels through the same softened lens field.
        const scale=scales[index];
        filter.append(svgElement('feDisplacementMap', {in:'SourceGraphic', in2:'map', scale, xChannelSelector:'R', yChannelSelector:'G', result:'displaced-' + channel}));
        const matrix = Array(20).fill(0); matrix[index * 5 + index] = 1; matrix[18] = 1;
        filter.append(svgElement('feColorMatrix', {in:'displaced-' + channel, type:'matrix', values:matrix.join(' '), result:channel}));
      });
      filter.append(svgElement('feBlend', {in:'r', in2:'g', mode:'screen', result:'rg'}), svgElement('feBlend', {in:'rg', in2:'b', mode:'screen', result:'rgb'}), svgElement('feGaussianBlur', {in:'rgb', stdDeviation:config.displace}));
      defs.append(filter); svg.append(defs); element.append(svg);
      element.style.setProperty('--sv-glass-filter', 'url(#' + filterId + ')');
    }
    function prepareMap() {
      if (!allowed()) return;
      const bounds = boxOf(element), {width, height} = bounds;
      if (width <= 0 || height <= 0) return () => renderer('blur');
      const computed = styleOf(element);
      for (let node = element; node; node = node.parentElement) {
        const style = node === element ? computed : styleOf(node);
        // Opacity entrances keep their layout geometry. Prepare the lens now:
        // the first class/style mutation can arrive at opacity 0 and CSS does
        // not emit another mutation when the fade becomes visible.
        if (style.display === 'none' || style.visibility === 'hidden') return () => renderer('blur');
      }
      const radius = parseFloat(computed.borderTopLeftRadius) || 20;
      const styledBlur=parseFloat(computed.getPropertyValue('--sv-glass-lens-blur'));
      const blur=Number.isFinite(styledBlur)?styledBlur:config.lensBlur;
      const key = [width, height, radius, blur].join(':');
      const texture=key!==dimensions || svg&&!element.contains(svg)?lensTexture(width,height,radius,blur):null;
      const scales=displacementScales(width);
      return () => {
        if (svg && !element.contains(svg)) removeGraph();
        if (key === dimensions) {renderer('svg'); return;}
        if (!texture) {removeGraph();renderer('blur');return;}
        if (!svg) createGraph(texture,scales);
        else {
          map.setAttribute('href',texture.map);
          svg.querySelectorAll('feDisplacementMap').forEach((node,index)=>node.setAttribute('scale',scales[index]));
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
        mounted.delete(element); live.delete(element); unwatch();
      }
    };
    mounted.set(element, controller); live.set(element, {controller, sync, schedule:scheduleMap}); watch(); sync();
    return controller;
  }
  window.SwiflyLiquidGlass = Object.freeze({mount,createTexture:lensTexture});
  document.querySelectorAll('[data-swifly-glass]').forEach(element => mount(element));
})();
