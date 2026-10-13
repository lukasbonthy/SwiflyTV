const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

function runtimeModule() {
  let runtime;
  assert.doesNotThrow(() => { runtime = require('../lib/browser-runtime.js'); }, 'browser runtime module is available');
  return runtime;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function browser() {
  const result = new EventEmitter();
  let connected = true;
  result.isConnected = () => connected;
  result.markDisconnected = () => { connected = false; };
  result.disconnect = () => { connected = false; result.emit('disconnected'); };
  return result;
}

function executable(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'swifly-browser-runtime-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'chromium');
  fs.writeFileSync(filename, 'test executable');
  return filename;
}

const flush = async () => { for (let turn = 0; turn < 8; turn += 1) await Promise.resolve(); };

test('browser environment preserves every explicitly supplied cache value on every platform', () => {
  const { configureBrowserEnvironment } = runtimeModule();
  for (const platform of ['win32', 'linux', 'darwin']) {
    for (const value of ['0', 0, '', undefined, '/custom/cache', 'C:\\Users\\Private\\browser-cache']) {
      const env = { PLAYWRIGHT_BROWSERS_PATH: value };
      configureBrowserEnvironment({ env, platform, existsSync: () => true });
      assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, value, `${platform} preserves an explicit cache setting`);
      assert.equal(Object.hasOwn(env, 'PLAYWRIGHT_BROWSERS_PATH'), true);
    }
  }
});

test('browser environment uses the Docker browser cache only when it exists on Linux', () => {
  const { configureBrowserEnvironment } = runtimeModule();
  const env = {};
  configureBrowserEnvironment({ env, platform: 'linux', existsSync: value => value === '/ms-playwright' });
  assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, '/ms-playwright');
});

test('browser environment leaves native Playwright cache selection intact without the Docker cache', () => {
  const { configureBrowserEnvironment } = runtimeModule();
  for (const platform of ['win32', 'linux', 'darwin']) {
    const env = {};
    configureBrowserEnvironment({ env, platform, existsSync: () => false });
    assert.equal(Object.hasOwn(env, 'PLAYWRIGHT_BROWSERS_PATH'), false);
  }
  const windows = {};
  configureBrowserEnvironment({ env: windows, platform: 'win32', existsSync: () => true });
  assert.equal(Object.hasOwn(windows, 'PLAYWRIGHT_BROWSERS_PATH'), false, 'a Linux cache is never forced on Windows');
});

test('unreadable Docker cache does not break native cache selection', () => {
  const { configureBrowserEnvironment } = runtimeModule();
  const env = {};
  assert.doesNotThrow(() => configureBrowserEnvironment({ env, platform: 'linux', existsSync() { throw new Error('private mount'); } }));
  assert.equal(Object.hasOwn(env, 'PLAYWRIGHT_BROWSERS_PATH'), false);
});

test('readiness inspection is lazy and cannot expose environment values or start Chromium', () => {
  const { createBrowserRuntime } = runtimeModule();
  let loads = 0;
  const runtime = createBrowserRuntime({
    env: { PLAYWRIGHT_BROWSERS_PATH: 'C:\\Users\\PRIVATE\\cache', REMOTE_BROWSER_WS_URL: 'wss://private.example/?token=SECRET' },
    platform: 'win32', existsSync: () => false,
    loadChromium() { loads += 1; throw new Error('loader must stay lazy'); }
  });
  assert.equal(runtime.getStatus().status, 'idle');
  assert.equal(runtime.getStatus().ready, false);
  assert.equal(loads, 0);
  assert.doesNotMatch(JSON.stringify(runtime.getStatus()), /PRIVATE|private\.example|SECRET|cache|wss:/);
});

test('concurrent discovery shares one browser startup with a Playwright launch deadline', async t => {
  const { createBrowserRuntime } = runtimeModule();
  const registered = executable(t), pending = deferred(), engine = browser();
  let launches = 0, options;
  const runtime = createBrowserRuntime({ env: {}, platform: 'linux', loadChromium: () => ({
    executablePath: () => registered,
    launch(value) { launches += 1; options = value; return pending.promise; }
  }) });
  const first = runtime.getBrowser();
  assert.equal(runtime.getBrowser(), first, 'callers await the same startup promise');
  assert.equal(runtime.getStatus().status, 'starting');
  await flush();
  assert.equal(launches, 1);
  assert.equal(options.timeout, 15000);
  assert.equal(options.headless, true);
  assert.equal(options.executablePath, registered);
  assert.deepEqual(options.args, ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required']);
  pending.resolve(engine);
  assert.equal(await first, engine);
  assert.equal(runtime.getStatus().status, 'ready');
  assert.equal(runtime.getStatus().ready, true);
  assert.equal(await runtime.getBrowser(), engine);
  assert.equal(launches, 1, 'connected browser reuse does not launch again');
});

test('explicit executable priority wins over the registered and system browser', async () => {
  const { createBrowserRuntime } = runtimeModule();
  const paths = ['/configured/stream', '/configured/filmu', '/configured/remote', '/configured/playwright'];
  let options;
  const runtime = createBrowserRuntime({
    env: { STREAMPROVIDER_BROWSER_EXECUTABLE_PATH: paths[0], FILMU_BROWSER_EXECUTABLE_PATH: paths[1], REMOTE_BROWSER_EXECUTABLE_PATH: paths[2], PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: paths[3] },
    platform: 'linux', existsSync: value => paths.includes(value) || value === '/usr/bin/chromium',
    loadChromium: () => ({ executablePath() { throw new Error('an explicit path does not need the registry'); }, launch(value) { options = value; return browser(); } })
  });
  await runtime.getBrowser();
  assert.equal(options.executablePath, paths[0]);
});

test('providers can retain their existing executable environment priority', async () => {
  const { createBrowserRuntime } = runtimeModule();
  let selected;
  const runtime = createBrowserRuntime({
    env: { VIDSRC_BROWSER_EXECUTABLE_PATH: '/vidsrc/chromium', STREAMPROVIDER_BROWSER_EXECUTABLE_PATH: '/stream/chromium' },
    executableEnvKeys: ['VIDSRC_BROWSER_EXECUTABLE_PATH', 'REMOTE_BROWSER_EXECUTABLE_PATH'],
    platform: 'linux', existsSync: () => true,
    loadChromium: () => ({ launch(options) { selected = options.executablePath; return browser(); } })
  });
  await runtime.getBrowser();
  assert.equal(selected, '/vidsrc/chromium');
});

test('invalid explicit executable fails safely instead of silently using another browser', async () => {
  const { createBrowserRuntime } = runtimeModule();
  const secretPath = 'C:\\Users\\PRIVATE\\missing-browser.exe';
  let launches = 0;
  const runtime = createBrowserRuntime({
    env: { PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: secretPath }, platform: 'win32',
    existsSync: value => value !== secretPath,
    loadChromium: () => ({ executablePath: () => 'C:\\available\\chrome.exe', launch() { launches += 1; return browser(); } })
  });
  await assert.rejects(runtime.getBrowser(), error => {
    assert.equal(error.code, 'browser_unavailable');
    assert.equal(error.reason, 'configured_executable_missing');
    assert.match(error.message, /configured browser executable/i);
    assert.match(error.message, /npm run install:browser/);
    assert.doesNotMatch(error.message, /PRIVATE|missing-browser/);
    return true;
  });
  assert.equal(launches, 0);
  assert.equal(runtime.getStatus().status, 'unavailable');
  assert.equal(runtime.getStatus().code, 'browser_unavailable');
  assert.doesNotMatch(JSON.stringify(runtime.getStatus()), /PRIVATE|missing-browser/);
});

test('registered Playwright executable is preferred to a system browser', async t => {
  const { createBrowserRuntime } = runtimeModule();
  const registered = executable(t);
  let selected;
  const runtime = createBrowserRuntime({
    env: {}, platform: 'linux', existsSync: value => value === '/usr/bin/chromium' || fs.existsSync(value),
    loadChromium: () => ({ executablePath: () => registered, launch(options) { selected = options.executablePath; return browser(); } })
  });
  await runtime.getBrowser();
  assert.equal(selected, registered);
});

test('missing registered Playwright browser falls back to a supported Linux system browser', async () => {
  const { createBrowserRuntime } = runtimeModule();
  let selected;
  const runtime = createBrowserRuntime({
    env: {}, platform: 'linux', existsSync: value => value === '/usr/bin/google-chrome-stable',
    loadChromium: () => ({ executablePath: () => '/missing/version/chromium', launch(options) { selected = options.executablePath; return browser(); } })
  });
  await runtime.getBrowser();
  assert.equal(selected, '/usr/bin/google-chrome-stable');
});

test('Windows browser fallback covers Chrome and Edge in supported install locations', async () => {
  const { createBrowserRuntime } = runtimeModule();
  const cases = [
    [{}, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'],
    [{ ProgramFiles: 'D:\\Apps' }, 'D:\\Apps\\Microsoft\\Edge\\Application\\msedge.exe'],
    [{ 'ProgramFiles(x86)': 'D:\\Apps32' }, 'D:\\Apps32\\Google\\Chrome\\Application\\chrome.exe'],
    [{ LOCALAPPDATA: 'C:\\Users\\PRIVATE\\AppData\\Local' }, 'C:\\Users\\PRIVATE\\AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe']
  ];
  for (const [env, expected] of cases) {
    let selected;
    const runtime = createBrowserRuntime({
      env, platform: 'win32', existsSync: value => value === expected,
      loadChromium: () => ({ executablePath: () => 'C:\\missing\\chromium.exe', launch(options) { selected = options.executablePath; return browser(); } })
    });
    await runtime.getBrowser();
    assert.equal(selected, expected);
    assert.doesNotMatch(JSON.stringify(runtime.getStatus()), /PRIVATE|Users|chrome\.exe|msedge\.exe/);
  }
});

test('missing browser reports actionable Docker guidance without package or user paths', async () => {
  const { createBrowserRuntime } = runtimeModule();
  let launches = 0;
  const runtime = createBrowserRuntime({
    env: {}, platform: 'linux', existsSync: () => false,
    loadChromium: () => ({ executablePath: () => '/home/PRIVATE/cache/chromium', launch() { launches += 1; return browser(); } })
  });
  await assert.rejects(runtime.getBrowser(), error => {
    assert.equal(error.code, 'browser_unavailable');
    assert.equal(error.reason, 'executable_missing');
    assert.match(error.message, /Dockerfile/);
    assert.match(error.message, /npm run install:browser/);
    assert.doesNotMatch(error.message, /PRIVATE|\/home|chromium\//);
    return true;
  });
  assert.equal(launches, 0);
  assert.equal(runtime.getStatus().ready, false);
});

test('browser disconnect releases the cached browser for a later launch', async t => {
  const { createBrowserRuntime } = runtimeModule();
  const registered = executable(t), engines = [browser(), browser()];
  let launches = 0;
  const runtime = createBrowserRuntime({ env: {}, platform: 'linux', loadChromium: () => ({ executablePath: () => registered, launch: () => engines[launches++] }) });
  assert.equal(await runtime.getBrowser(), engines[0]);
  engines[0].disconnect();
  assert.equal(runtime.getStatus().ready, false);
  assert.equal(runtime.getStatus().status, 'idle');
  assert.equal(await runtime.getBrowser(), engines[1]);
  assert.equal(launches, 2);
});

test('disconnected cached browser is replaced even when its disconnect event is late', async t => {
  const { createBrowserRuntime } = runtimeModule();
  const registered = executable(t), engines = [browser(), browser()];
  let launches = 0;
  const runtime = createBrowserRuntime({ env: {}, platform: 'linux', loadChromium: () => ({ executablePath: () => registered, launch: () => engines[launches++] }) });
  await runtime.getBrowser();
  engines[0].markDisconnected();
  assert.equal(runtime.getStatus().ready, false);
  assert.equal(await runtime.getBrowser(), engines[1]);
  engines[0].emit('disconnected');
  assert.equal(runtime.getStatus().ready, true, 'an old browser event cannot clear the replacement');
  assert.equal(await runtime.getBrowser(), engines[1]);
  assert.equal(launches, 2);
});

test('browser adapters without isConnected remain compatible with cached reuse', async t => {
  const { createBrowserRuntime } = runtimeModule();
  const registered = executable(t), engine = new EventEmitter();
  let launches = 0;
  const runtime = createBrowserRuntime({ env: {}, platform: 'linux', loadChromium: () => ({ executablePath: () => registered, launch() { launches += 1; return engine; } }) });
  assert.equal(await runtime.getBrowser(), engine);
  assert.equal(await runtime.getBrowser(), engine);
  assert.equal(runtime.getStatus().ready, true);
  assert.equal(launches, 1);
  engine.emit('disconnected');
  assert.equal(runtime.getStatus().ready, false);
});

test('a failed launch clears shared startup state and can succeed on a later retry', async t => {
  const { createBrowserRuntime } = runtimeModule();
  const registered = executable(t), failure = deferred(), engine = browser();
  let launches = 0;
  const runtime = createBrowserRuntime({ env: {}, platform: 'win32', loadChromium: () => ({
    executablePath: () => registered,
    launch() { launches += 1; return launches === 1 ? failure.promise : engine; }
  }) });
  const first = runtime.getBrowser();
  assert.equal(runtime.getBrowser(), first);
  failure.reject(new Error('launch failed at C:\\Users\\PRIVATE; websocket=wss://private.example/?token=SECRET'));
  await assert.rejects(first, error => {
    assert.equal(error.code, 'browser_unavailable');
    assert.equal(error.reason, 'launch_failed');
    assert.match(error.message, /npm run install:browser/);
    assert.doesNotMatch(error.message, /PRIVATE|SECRET|private\.example/);
    return true;
  });
  assert.doesNotMatch(JSON.stringify(runtime.getStatus()), /PRIVATE|SECRET|private\.example/);
  assert.equal(await runtime.getBrowser(), engine);
  assert.equal(runtime.getStatus().ready, true);
  assert.equal(runtime.getStatus().code, '');
  assert.equal(launches, 2);
});

test('missing Playwright package is a safe retryable browser failure', async t => {
  const { createBrowserRuntime } = runtimeModule();
  const registered = executable(t), engine = browser();
  let loads = 0;
  const runtime = createBrowserRuntime({ env: {}, platform: 'linux', loadChromium() {
    loads += 1;
    if (loads === 1) throw new Error('missing package at /home/PRIVATE with API_KEY=SECRET');
    return { executablePath: () => registered, launch: () => engine };
  } });
  await assert.rejects(runtime.getBrowser(), error => {
    assert.equal(error.code, 'browser_unavailable');
    assert.equal(error.reason, 'package_unavailable');
    assert.doesNotMatch(error.message, /PRIVATE|API_KEY|SECRET/);
    return true;
  });
  assert.equal(await runtime.getBrowser(), engine);
  assert.equal(loads, 2);
});

test('startup that returns a disconnected browser fails and does not poison the next attempt', async t => {
  const { createBrowserRuntime } = runtimeModule();
  const registered = executable(t), dead = browser(), live = browser();
  dead.markDisconnected();
  let launches = 0;
  const runtime = createBrowserRuntime({ env: {}, platform: 'linux', loadChromium: () => ({ executablePath: () => registered, launch: () => ++launches === 1 ? dead : live }) });
  await assert.rejects(runtime.getBrowser(), { code: 'browser_unavailable' });
  assert.equal(runtime.getStatus().ready, false);
  assert.equal(await runtime.getBrowser(), live);
  assert.equal(launches, 2);
});

test('request cancellation cannot free the shared launch before Chromium startup settles', async t => {
  const { createBrowserRuntime } = runtimeModule();
  const registered = executable(t), pending = deferred(), controller = new AbortController(), engine = browser();
  let launches = 0, settled = false;
  const runtime = createBrowserRuntime({ env: {}, platform: 'linux', loadChromium: () => ({ executablePath: () => registered, launch() { launches += 1; return pending.promise; } }) });
  const first = runtime.getBrowser({ signal: controller.signal });
  first.then(() => { settled = true; }, () => { settled = true; });
  controller.abort();
  await flush();
  assert.equal(settled, false);
  assert.equal(runtime.getBrowser(), first);
  assert.equal(runtime.getStatus().status, 'starting');
  assert.equal(launches, 1);
  pending.resolve(engine);
  assert.equal(await first, engine);
});

test('correcting a missing explicit executable permits retry without recreating the runtime', async t => {
  const { createBrowserRuntime } = runtimeModule();
  const registered = executable(t), env = { STREAMPROVIDER_BROWSER_EXECUTABLE_PATH: '/missing/PRIVATE/chromium' };
  const engine = browser();
  const runtime = createBrowserRuntime({ env, platform: 'linux', loadChromium: () => ({ executablePath: () => registered, launch: () => engine }) });
  await assert.rejects(runtime.getBrowser(), { code: 'browser_unavailable' });
  env.STREAMPROVIDER_BROWSER_EXECUTABLE_PATH = registered;
  assert.equal(await runtime.getBrowser(), engine);
  assert.equal(runtime.getStatus().ready, true);
});
