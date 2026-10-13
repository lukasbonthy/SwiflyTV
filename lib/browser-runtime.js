'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EXECUTABLE_ENV_KEYS = [
  'STREAMPROVIDER_BROWSER_EXECUTABLE_PATH',
  'FILMU_BROWSER_EXECUTABLE_PATH',
  'REMOTE_BROWSER_EXECUTABLE_PATH',
  'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'
];
const LAUNCH_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'];

class BrowserUnavailableError extends Error {
  constructor(reason, platform) {
    const configured = reason === 'configured_executable_missing' ? 'Check the configured browser executable setting. ' : '';
    const guidance = platform === 'linux'
      ? 'Run npm run install:browser or deploy using the project Dockerfile, then restart the app.'
      : 'Run npm run install:browser, then restart the app.';
    super(`Source discovery browser is unavailable. ${configured}${guidance}`);
    this.code = 'browser_unavailable';
    this.reason = reason;
  }
}

function existsSafely(existsSync, filename) {
  if (typeof filename !== 'string' || !filename) return false;
  try { return Boolean(existsSync(filename)); }
  catch { return false; }
}

/** Apply the Docker cache default before loading Playwright's browser registry. */
function configureBrowserEnvironment({ env = process.env, platform = process.platform, existsSync = fs.existsSync } = {}) {
  if (!Object.hasOwn(env, 'PLAYWRIGHT_BROWSERS_PATH') && platform === 'linux' && existsSafely(existsSync, '/ms-playwright')) {
    env.PLAYWRIGHT_BROWSERS_PATH = '/ms-playwright';
  }
  return env;
}

function systemExecutables(env, platform) {
  if (platform === 'linux') {
    return ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome'];
  }
  if (platform !== 'win32') return [];
  const roots = [...new Set([
    env.ProgramFiles || env.PROGRAMFILES || 'C:\\Program Files',
    env.ProgramW6432 || env.PROGRAMW6432,
    env['ProgramFiles(x86)'] || env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
    env.LOCALAPPDATA || env.LocalAppData
  ].filter(value => typeof value === 'string' && value))];
  return [
    ...roots.map(root => path.win32.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe')),
    ...roots.map(root => path.win32.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
  ];
}

function connected(browser) {
  if (!browser || typeof browser !== 'object') return false;
  try { return typeof browser.isConnected !== 'function' || Boolean(browser.isConnected()); }
  catch { return false; }
}

/**
 * Share one local Chromium startup across requests. Playwright owns its launch
 * timeout; a request abort must not detach an unresolved startup from its slot.
 * Readiness inspection only reports cached state and never starts the browser.
 */
function createBrowserRuntime({
  loadChromium,
  env = process.env,
  platform = process.platform,
  existsSync = fs.existsSync,
  executableEnvKeys = EXECUTABLE_ENV_KEYS,
  launchTimeoutMs = 15000
} = {}) {
  if (typeof loadChromium !== 'function') throw new TypeError('A Chromium loader is required.');
  if (!Number.isSafeInteger(launchTimeoutMs) || launchTimeoutMs < 1) throw new TypeError('Browser launch timeout must be a positive integer.');
  configureBrowserEnvironment({ env, platform, existsSync });
  let cachedBrowser = null;
  let pendingLaunch = null;
  let lastFailure = null;

  function executableFor(chromium) {
    for (const key of executableEnvKeys) {
      const value = typeof env[key] === 'string' ? env[key].trim() : '';
      if (!value) continue;
      if (!existsSafely(existsSync, value)) throw new BrowserUnavailableError('configured_executable_missing', platform);
      return value;
    }
    let registered = '';
    try { registered = chromium.executablePath(); } catch {}
    if (existsSafely(existsSync, registered)) return registered;
    for (const candidate of systemExecutables(env, platform)) {
      if (existsSafely(existsSync, candidate)) return candidate;
    }
    throw new BrowserUnavailableError('executable_missing', platform);
  }

  function getBrowser() {
    if (cachedBrowser && !connected(cachedBrowser)) cachedBrowser = null;
    if (cachedBrowser) return Promise.resolve(cachedBrowser);
    if (pendingLaunch) return pendingLaunch;

    const flight = Promise.resolve().then(async () => {
      let chromium;
      try { chromium = await loadChromium(); }
      catch { throw new BrowserUnavailableError('package_unavailable', platform); }
      if (!chromium || typeof chromium.launch !== 'function') throw new BrowserUnavailableError('package_unavailable', platform);
      const executablePath = executableFor(chromium);
      let launched;
      try {
        launched = await chromium.launch({ headless: true, executablePath, timeout: launchTimeoutMs, args: [...LAUNCH_ARGS] });
      } catch { throw new BrowserUnavailableError('launch_failed', platform); }
      if (!connected(launched)) throw new BrowserUnavailableError('launch_failed', platform);
      cachedBrowser = launched;
      lastFailure = null;
      if (typeof launched.on === 'function') {
        launched.on('disconnected', () => {
          // A delayed event from the previous browser cannot evict a replacement.
          if (cachedBrowser === launched) cachedBrowser = null;
        });
      }
      return launched;
    }).catch(error => {
      lastFailure = error instanceof BrowserUnavailableError ? error : new BrowserUnavailableError('launch_failed', platform);
      throw lastFailure;
    }).finally(() => {
      if (pendingLaunch === flight) pendingLaunch = null;
    });
    pendingLaunch = flight;
    return flight;
  }

  function getStatus() {
    const ready = connected(cachedBrowser);
    const status = ready ? 'ready' : pendingLaunch ? 'starting' : lastFailure ? 'unavailable' : 'idle';
    const message = status === 'unavailable' ? lastFailure.message : {
      ready: 'Source discovery browser is ready.',
      starting: 'Source discovery browser is starting.',
      idle: 'Source discovery browser has not started.'
    }[status];
    return Object.freeze({ status, ready, code: status === 'unavailable' ? 'browser_unavailable' : '', reason: status === 'unavailable' ? lastFailure.reason : '', message });
  }

  return { getBrowser, getStatus };
}

module.exports = { configureBrowserEnvironment, createBrowserRuntime };
