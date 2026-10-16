/* Bounded geometry for live Chromium backdrop filters; native frost elsewhere. */
(() => {
  'use strict';
  if (window.SwiflyLiquidGlass) return;
  const NS = 'http://www.w3.org/2000/svg';
  const mounted = new WeakMap(), live = new Map();
  const transparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
  const pending = new Set();
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
  function lensTexture(width, height, radius) {
    // A rounded surface bends toward its local normal. A pane-wide linear
    // gradient instead drags the picture diagonally and misses the corners.
    // These bounded textures contain geometry only, never page/image pixels.
    const ratio=Math.min(1,640/width,240/height),tw=Math.max(1,Math.min(640,Math.ceil(width*ratio))),th=Math.max(1,Math.min(240,Math.ceil(height*ratio)));
    const make=()=>{const canvas=document.createElement('canvas');canvas.width=tw;canvas.height=th;return canvas;};
    const displacement=make(),dc=displacement.getContext('2d');
    if(!dc)return null;
    const vector=dc.createImageData(tw,th);
    const r=Math.max(1,Math.min(radius,width/2,height/2)),edge=Math.min(18,Math.max(5,Math.min(width,height)*.22));
    const scale=edge*2.6,thickness=edge*4.6;
    for(let y=0;y<th;y++)for(let x=0;x<tw;x++) {
      const px=(x+.5)*width/tw-width/2,py=(y+.5)*height/th-height/2;
      const qx=Math.abs(px)-(width/2-r),qy=Math.abs(py)-(height/2-r);
      const ox=Math.max(0,qx),oy=Math.max(0,qy),length=Math.hypot(ox,oy);
      const distance=r-length-Math.min(Math.max(qx,qy),0);
      let nx=0,ny=0,shift=0;
      if(distance>=0 && distance<edge) {
        if(length>0){nx=ox/length*Math.sign(px);ny=oy/length*Math.sign(py);}
        else if(qx>qy)nx=Math.sign(px);else ny=Math.sign(py);
        const t=distance/edge,cap=Math.sqrt(Math.max(.0001,1-(1-t)**2));
        const angle=Math.atan((1-t)/cap);
        // Snell refraction through a curved cap; it settles to zero as the
        // surface becomes flat, preserving the artwork's position in center.
        shift=thickness*cap*Math.tan(angle-Math.asin(Math.sin(angle)/1.45));
      }
      const offset=(y*tw+x)*4;
      vector.data[offset]=Math.round(255*(.5-nx*shift/scale));
      vector.data[offset+1]=Math.round(255*(.5-ny*shift/scale));
      vector.data[offset+2]=128;vector.data[offset+3]=255;
    }
    dc.putImageData(vector,0,0);
    return {map:displacement.toDataURL(),scale,edge};
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
      channelOffsets:[0, 1, 2],
      saturation:numeric(element, 'glassSaturation', 1.05),
      tint:numeric(element, 'glassTint', .62), ...options
    };
    const filterId = 'swifly-liquid-filter-' + (++nextId), ua = navigator.userAgent;
    const isAppleTouch = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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
    function createGraph(texture) {
      svg = svgElement('svg', {class:'svLiquidPane__filters', 'aria-hidden':'true', focusable:'false'});
      const defs = svgElement('defs');
      const filter = svgElement('filter', {id:filterId, x:'0%', y:'0%', width:'100%', height:'100%', 'color-interpolation-filters':'sRGB'});
      map = svgElement('feImage', {href:texture.map,x:0, y:0, width:'100%', height:'100%', preserveAspectRatio:'none', result:'map'});
      filter.append(map);
      ['r', 'g', 'b'].forEach((channel, index) => {
        // The vector field owns the direction and settles to neutral in the
        // flat center. Keep dispersion proportional to this bounded rim;
        // Even sharp text behind the lens keeps subpixel color separation.
        const scale=-texture.scale*(config.distortionScale+config.channelOffsets[index])/180;
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
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return () => renderer('blur');
      }
      const radius = parseFloat(computed.borderTopLeftRadius) || 20;
      const key = [width, height, radius].join(':');
      const texture=key!==dimensions || svg&&!element.contains(svg)?lensTexture(width,height,radius):null;
      return () => {
        if (svg && !element.contains(svg)) removeGraph();
        if (key === dimensions) {renderer('svg'); return;}
        if (!texture) {removeGraph();renderer('blur');return;}
        if (!svg) createGraph(texture);
        else {
          map.setAttribute('href',texture.map);
          svg.querySelectorAll('feDisplacementMap').forEach((node,index)=>node.setAttribute('scale',-texture.scale*(config.distortionScale+config.channelOffsets[index])/180));
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
