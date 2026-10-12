/* SwiflyTV v150. Locally hosted SVG refraction; no external library required. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const mounted = new WeakMap();
  let nextId = 0;
  const svgElement = (tag, attributes = {}) => {
    const node = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    return node;
  };
  const numeric = (element, key, fallback) => {
    const raw = element.dataset[key];
    return raw !== undefined && raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : fallback;
  };
  function mount(element, options = {}) {
    if (!(element instanceof HTMLElement)) throw new TypeError('SwiflyLiquidGlass.mount expects an HTML element.');
    if (mounted.has(element)) return mounted.get(element);
    const config = {
      borderWidth: .07, brightness: 50, opacity: .93, displace: .5,
      distortionScale: -180, channelOffsets: [0, 10, 20], saturation: 1,
      mapBlur: numeric(element, 'glassBlur', 7), tint: numeric(element, 'glassTint', .2),
      blend: element.dataset.glassBlend === 'difference' ? 'difference' : 'screen', ...options
    };
    const filterId = 'swifly-liquid-filter-' + (++nextId);
    const ua = navigator.userAgent;
    const isAppleTouch = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const svgCapable = !isAppleTouch && /Chrome|Chromium|Edg|OPR/.test(ua) && typeof CSS !== 'undefined' && CSS.supports('backdrop-filter', 'url(#' + filterId + ')');
    element.style.setProperty('--sv-glass-default-tint', config.tint);
    element.style.setProperty('--sv-glass-saturation', config.saturation);
    if (element.dataset.glassRadius) element.style.setProperty('--sv-glass-radius', numeric(element, 'glassRadius', 20) + 'px');
    let svg, map, observer, frame = 0, dimensions = '', enabled = true;
    function updateMap() {
      frame = 0;
      if (!map || !element.isConnected) return;
      const { width, height } = element.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const computed = getComputedStyle(element);
      const radius = parseFloat(computed.borderTopLeftRadius) || 20;
      const configuredBlur = computed.getPropertyValue('--sv-glass-map-blur').trim();
      const blur = configuredBlur !== '' && Number.isFinite(Number(configuredBlur)) ? Number(configuredBlur) : config.mapBlur;
      const blend = computed.getPropertyValue('--sv-glass-blend').trim() === 'difference' ? 'difference' : config.blend;
      const key = [width, height, radius, blur, blend].join(':');
      if (key === dimensions) return;
      dimensions = key;
      const inset = Math.min(width, height) * config.borderWidth * .5;
      const image = svgElement('svg', { viewBox: `0 0 ${width} ${height}` });
      const defs = svgElement('defs');
      for (const [id, attrs, color] of [
        ['x', { x1: '100%', y1: '0%', x2: '0%', y2: '0%' }, 'red'],
        ['y', { x1: '0%', y1: '0%', x2: '0%', y2: '100%' }, 'blue']
      ]) {
        const gradient = svgElement('linearGradient', { id, ...attrs });
        gradient.append(svgElement('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0 }), svgElement('stop', { offset: '100%', 'stop-color': color }));
        defs.append(gradient);
      }
      image.append(defs, svgElement('rect', { width, height, fill: 'black' }),
        svgElement('rect', { width, height, rx: radius, fill: 'url(#x)' }),
        svgElement('rect', { width, height, rx: radius, fill: 'url(#y)', style: `mix-blend-mode:${blend}` }),
        svgElement('rect', { x: inset, y: inset, width: Math.max(0, width - 2 * inset), height: Math.max(0, height - 2 * inset), rx: radius, fill: `hsl(0 0% ${config.brightness}% / ${config.opacity})`, style: `filter:blur(${blur}px)` }));
      map.setAttribute('href', 'data:image/svg+xml,' + encodeURIComponent(new XMLSerializer().serializeToString(image)));
    }
    function scheduleMap() { if (!frame) frame = requestAnimationFrame(updateMap); }
    function setEnabled(value) { enabled = Boolean(value); element.dataset.swiflyRenderer = enabled && svgCapable ? 'svg' : 'blur'; }
    if (svgCapable) {
      svg = svgElement('svg', { class: 'svLiquidPane__filters', 'aria-hidden': 'true', focusable: 'false' });
      const defs = svgElement('defs');
      const filter = svgElement('filter', { id: filterId, x: '0%', y: '0%', width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' });
      map = svgElement('feImage', { x: 0, y: 0, width: '100%', height: '100%', preserveAspectRatio: 'none', result: 'map' });
      filter.append(map);
      ['r', 'g', 'b'].forEach((channel, index) => {
        filter.append(svgElement('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: config.distortionScale + config.channelOffsets[index], xChannelSelector: 'R', yChannelSelector: 'G', result: 'displaced-' + channel }));
        const matrix = Array(20).fill(0); matrix[index * 5 + index] = 1; matrix[18] = 1;
        filter.append(svgElement('feColorMatrix', { in: 'displaced-' + channel, type: 'matrix', values: matrix.join(' '), result: channel }));
      });
      filter.append(svgElement('feBlend', { in: 'r', in2: 'g', mode: 'screen', result: 'rg' }), svgElement('feBlend', { in: 'rg', in2: 'b', mode: 'screen', result: 'rgb' }), svgElement('feGaussianBlur', { in: 'rgb', stdDeviation: config.displace }));
      defs.append(filter); svg.append(defs); element.prepend(svg);
      element.style.setProperty('--sv-glass-filter', 'url(#' + filterId + ')');
      if (typeof ResizeObserver === 'function') { observer = new ResizeObserver(scheduleMap); observer.observe(element); }
      updateMap(); window.addEventListener('resize', scheduleMap, { passive: true });
    }
    setEnabled(true);
    const controller = {
      get supported() { return svgCapable; }, get enabled() { return enabled; }, setEnabled,
      refresh() { dimensions = ''; scheduleMap(); },
      destroy() { observer?.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', scheduleMap); svg?.remove(); element.style.removeProperty('--sv-glass-filter'); delete element.dataset.swiflyRenderer; mounted.delete(element); }
    };
    mounted.set(element, controller); return controller;
  }
  window.SwiflyLiquidGlass = Object.freeze({ mount });
  document.querySelectorAll('[data-swifly-glass]').forEach(element => mount(element));
})();
