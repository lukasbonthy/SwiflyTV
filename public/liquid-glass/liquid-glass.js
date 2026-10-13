/* v163: lazy navigation refraction, suspended while unused. */
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
  function watch() {
    if (preferences) return;
    preferences = new MutationObserver(changes => {
      let changed = false, removed = false;
      for (const change of changes) {
        if (change.type === 'attributes' && change.target === document.body) changed = true;
        if (change.type === 'childList' && [...change.removedNodes].some(node => node instanceof HTMLElement)) removed = true;
        if (change.type === 'childList') for (const node of change.addedNodes) if (node instanceof HTMLElement) {
          for (const [host, entry] of live) if (node === host || node.contains(host)) entry.sync();
        }
      }
      if (removed) for (const [host, entry] of live) if (!host.isConnected) entry.controller.destroy();
      if (changed) syncAll();
    });
    preferences.observe(document.body, {attributes:true, attributeFilter:['data-st-glass'], childList:true, subtree:true});
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
      borderWidth:.07, brightness:50, opacity:.93, displace:.5,
      distortionScale:-180, channelOffsets:[0, 10, 20], saturation:numeric(element, 'glassSaturation', 1),
      mapBlur:numeric(element, 'glassBlur', 7), tint:numeric(element, 'glassTint', .2),
      blend:element.dataset.glassBlend === 'difference' ? 'difference' : 'screen', ...options
    };
    const filterId = 'swifly-liquid-filter-' + (++nextId), ua = navigator.userAgent;
    const isAppleTouch = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const svgCapable = !isAppleTouch && /Chrome|Chromium|Edg|OPR/.test(ua) && typeof CSS !== 'undefined' && CSS.supports('backdrop-filter', 'url(#' + filterId + ')');
    const previousRenderer = element.dataset.swiflyRenderer;
    const previousProperties = ['--sv-glass-default-tint', '--sv-glass-saturation', '--sv-glass-radius', '--sv-glass-filter'].map(property => [property, element.style.getPropertyValue(property), element.style.getPropertyPriority(property)]);
    element.style.setProperty('--sv-glass-default-tint', config.tint);
    element.style.setProperty('--sv-glass-saturation', config.saturation);
    if (element.dataset.glassRadius) element.style.setProperty('--sv-glass-radius', numeric(element, 'glassRadius', 20) + 'px');
    let svg, map, observer, observing = false, frame = 0, dimensions = '', enabled = true, destroyed = false;
    const allowed = () => !destroyed && enabled && svgCapable && element.isConnected && !document.hidden && liquidPreference();
    function renderer(value) {if (element.dataset.swiflyRenderer !== value) element.dataset.swiflyRenderer = value;}
    function removeGraph() {
      svg?.remove(); svg = null; map = null; dimensions = '';
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
    function updateMap() {
      frame = 0;
      if (!allowed()) return;
      if (svg && !element.contains(svg)) removeGraph();
      const {width, height} = element.getBoundingClientRect();
      if (width <= 0 || height <= 0) {renderer('blur'); return;}
      const computed = getComputedStyle(element), radius = parseFloat(computed.borderTopLeftRadius) || 20;
      const configuredBlur = computed.getPropertyValue('--sv-glass-map-blur').trim();
      const blur = configuredBlur !== '' && Number.isFinite(Number(configuredBlur)) ? Number(configuredBlur) : config.mapBlur;
      const blend = computed.getPropertyValue('--sv-glass-blend').trim() === 'difference' ? 'difference' : config.blend;
      const key = [width, height, radius, blur, blend].join(':');
      if (key === dimensions) {renderer('svg'); return;}
      if (!svg) createGraph();
      dimensions = key;
      const inset = Math.min(width, height) * config.borderWidth * .5;
      const image = svgElement('svg', {viewBox:`0 0 ${width} ${height}`}), defs = svgElement('defs');
      for (const [id, attrs, color] of [
        ['x', {x1:'100%', y1:'0%', x2:'0%', y2:'0%'}, 'red'],
        ['y', {x1:'0%', y1:'0%', x2:'0%', y2:'100%'}, 'blue']
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
      renderer('svg');
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
      get supported() {return svgCapable;}, get enabled() {return enabled;}, setEnabled,
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
    mounted.set(element, controller); live.set(element, {controller, sync, schedule:scheduleMap}); watch(); sync();
    return controller;
  }
  window.SwiflyLiquidGlass = Object.freeze({mount});
  document.querySelectorAll('[data-swifly-glass]').forEach(element => mount(element));
})();
