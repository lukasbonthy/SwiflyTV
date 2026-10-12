const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const http = require('node:http');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '..');
const openWindows = new Set();
function source(name) {
  const file = name.includes('/') ? path.join(root, 'public', name) : path.join(root, 'public', 'clean', name);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}
function browser(markup = '', options = {}) {
  const dom = new JSDOM('<!doctype html><html><body class="svCleanShell">' + markup + '</body></html>', {url: 'http://localhost:3000' + (options.path || '/'), pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: new VirtualConsole()});
  const w = dom.window, frames = new Map(), media = new Map();
  openWindows.add(w);
  let id = 0;
  w.requestAnimationFrame = fn => {frames.set(++id, fn); return id;};
  w.cancelAnimationFrame = frame => frames.delete(frame);
  w.flush = time => {const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn(time));};
  w.frameCount = () => frames.size;
  w.matchMedia = query => {
    if (!media.has(query)) media.set(query, {matches: query.includes('reduced-motion') ? !!options.reduced : query.includes('pointer: fine'), addEventListener(_name, fn) {this.listener = fn;}, removeEventListener() {}});
    return media.get(query);
  };
  w.reduceMotion = value => {const m = w.matchMedia('(prefers-reduced-motion: reduce)'); m.matches = value; m.listener?.({matches: value});};
  w.IntersectionObserver = class {observe() {} unobserve() {} disconnect() {}};
  w.ResizeObserver = class {observe() {} disconnect() {}};
  const page = w.document.documentElement;
  Object.defineProperty(w.document, 'scrollingElement', {value: page});
  Object.defineProperty(page, 'scrollHeight', {value: 3200, configurable: true});
  Object.defineProperty(page, 'clientHeight', {value: 800, configurable: true});
  Object.defineProperty(page, 'scrollWidth', {value: 1200, configurable: true});
  Object.defineProperty(page, 'clientWidth', {value: 1200, configurable: true});
  Object.defineProperty(w, 'scrollY', {get: () => page.scrollTop});
  Object.defineProperty(w, 'scrollX', {get: () => page.scrollLeft});
  w.scrollTo = arg => {page.scrollTop = Math.max(0, Math.min(2400, arg.top ?? page.scrollTop)); page.scrollLeft = arg.left ?? page.scrollLeft;};
  w.HTMLElement.prototype.scrollTo = function (arg) {this.scrollTop = arg.top ?? this.scrollTop; this.scrollLeft = arg.left ?? this.scrollLeft;};
  w.HTMLDialogElement.prototype.showModal = function () {this.open = true;};
  w.HTMLDialogElement.prototype.close = function () {this.open = false; this.dispatchEvent(new w.Event('close'));};
  w.boot = name => {w.eval(source(name)); w.document.dispatchEvent(new w.Event('DOMContentLoaded'));};
  return {dom, window: w, page, finish() {w.SwiflyMotion?.destroy?.(); openWindows.delete(w); dom.window.close();}};
}
function loadServer() {
  process.env.SWIFLY_NO_ENV_MODE = 'false';
  process.env.CONSUMET_ENABLED = 'false';
  process.env.FILMU_ENABLED = 'false';
  const filename = path.join(root, 'server.js');
  const m = new Module(filename, module); m.filename = filename; m.paths = Module._nodeModulePaths(root);
  const listen = http.Server.prototype.listen, interval = global.setInterval;
  http.Server.prototype.listen = function () {return this;};
  global.setInterval = (...args) => interval(...args).unref();
  try {m._compile(fs.readFileSync(filename, 'utf8') + '\nmodule.exports = {detailPage, homePage, pageShell, setTmdb(fn) {tmdb = fn;}};\n', filename);}
  finally {http.Server.prototype.listen = listen; global.setInterval = interval;}
  return m.exports;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function cleanup() {for (const window of openWindows) window.close(); openWindows.clear();}
module.exports = {source, browser, loadServer, tick, cleanup};
