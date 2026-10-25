'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const express = require('express');
const {Server} = require('socket.io');
const {chromium} = require('playwright-core');
const {createStudy} = require('../lib/study');
const {studyMarkup} = require('../ui/study');
const executablePath = process.env.SWIFLY_TEST_BROWSER_EXECUTABLE_PATH;
const available = fs.existsSync(executablePath || chromium.executablePath());
let browser, server, io, study, origin;

test.before(async () => {
  if (!available) return;
  const app = express();server = http.createServer(app);io = new Server(server);
  study = createStudy({io, authorizeSocket: socket => /(?:^|;\s*)study_test=ok(?:;|$)/.test(socket.handshake.headers.cookie || ''), iceServers: [{urls: 'stun:127.0.0.1:9'}]});
  app.use('/api/study', study.router);
  app.use('/assets/study', express.static(path.resolve(__dirname, '../public/study')));
  app.get('/assets/studio/config.js', (_req, res) => res.sendFile(path.resolve(__dirname, '../public/studio/config.js')));
  app.get(['/study', '/study/room/:slug'], (req, res) => res.send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/study/study.css"><style>body{margin:0;background:#090b0f;font-family:Arial,sans-serif}.svStudy{padding-top:44px}</style></head><body>${studyMarkup({room: req.params.slug || ''})}<script>window.SwiflyAccount={ready:Promise.resolve({user:{id:'verified-browser-test'}}),user:{id:'verified-browser-test'}};</script><script src="/assets/studio/config.js"></script><script src="/socket.io/socket.io.js"></script><script src="/assets/study/study.js"></script></body></html>`));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({headless: true, executablePath, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--allow-loopback-in-peer-connection']});
});
test.after(async () => {await browser?.close();study?.close();if (io) await new Promise(resolve => io.close(resolve));});
async function page(viewport = {width: 1440, height: 1080}) {
  const context = await browser.newContext({viewport, permissions: ['camera', 'microphone']});
  await context.addCookies([{name: 'study_test', value: 'ok', url: origin}]);
  await context.addInitScript(() => {
    localStorage.setItem('swiflytv.activeProfile', JSON.stringify({id: 'main'}));
    window.__captures = 0;window.__peerConnections = [];
    window.__audioContexts = [];const OriginalAudio = window.AudioContext;
    window.AudioContext = class extends OriginalAudio {constructor(...args) {super(...args);window.__audioContexts.push(this);}};
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (...args) => {window.__captures++;return capture(...args);};
    const Original = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends Original {constructor(...args) {super(...args);window.__peerConnections.push(this);}};
  });
  const page = await context.newPage(), errors = [];page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/study');await page.waitForFunction(() => window.SwiflyStudy?.controller && document.querySelectorAll('[data-study-track]').length === 19);
  await page.waitForFunction(() => document.querySelector('[data-study-connection]').dataset.connected === 'true');
  return {page, context, errors};
}
async function screenshot(page, name) {if (!process.env.SWIFLY_STUDY_SCREENSHOT_DIR) return;fs.mkdirSync(process.env.SWIFLY_STUDY_SCREENSHOT_DIR, {recursive: true});await page.screenshot({path: path.join(process.env.SWIFLY_STUDY_SCREENSHOT_DIR, name + '.png'), fullPage: true});}

test('Native Study fits desktop, 320px and TV, and keyboard tabs keep the panel focus order', {skip: !available}, async () => {
  for (const [name, viewport] of [['desktop', {width: 1440, height: 1080}], ['mobile', {width: 320, height: 800}], ['tv', {width: 1920, height: 1080}]]) {
    const f = await page(viewport);
    try {
      assert(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ' has horizontal overflow');
      assert.equal(await f.page.evaluate(() => window.__captures), 0);
      await screenshot(f.page, 'study-' + name);
      await f.page.locator('[data-study-tab="scenes"]').focus();await f.page.keyboard.press('ArrowRight');
      assert.equal(await f.page.locator('[data-study-tab="music"]').getAttribute('aria-selected'), 'true');
      assert(await f.page.locator('#study-panel-music').isVisible());
      await f.page.locator('[data-study-search]').fill('Morning Coffee');assert.equal(await f.page.locator('[data-study-track]').count(), 1);
      await f.page.locator('[data-study-search]').fill('');await f.page.locator('[data-study-play]').click();await f.page.waitForFunction(() => document.querySelector('[data-study-play]').getAttribute('aria-pressed') === 'true');
      await f.page.locator('[data-study-favorite]').click();await f.page.locator('[data-study-station]').selectOption('favorites');assert.equal(await f.page.locator('[data-study-track]').count(), 1);
      await f.page.locator('[data-study-tab="focus"]').click();await f.page.locator('[data-study-task-input]').fill('Read one chapter');await f.page.locator('[data-study-task-input]').press('Enter');assert.match(await f.page.locator('[data-study-tasks]').textContent(), /Read one chapter/);
      await f.page.reload();await f.page.waitForFunction(() => document.querySelectorAll('[data-study-track]').length > 0);await f.page.locator('[data-study-tab="focus"]').click();assert.match(await f.page.locator('[data-study-tasks]').textContent(), /Read one chapter/);
      assert.deepEqual(f.errors, []);
    } finally {await f.context.close();}
  }
});

test('Two real WebRTC peers join presence-only, explicitly opt into media, receive RTP and release devices on leave', {skip: !available, timeout: 45000}, async () => {
  const a = await page(), b = await page();
  try {
    for (const [f, name] of [[a, 'Ava'], [b, 'Bo']]) {await f.page.locator('[data-study-tab="rooms"]').click();await f.page.locator('[data-study-name]').fill(name);await f.page.locator('[data-study-join="focus-1"]').click();await f.page.waitForFunction(() => !document.querySelector('[data-study-call]').hidden);}
    await a.page.waitForFunction(() => document.querySelectorAll('.studyVideoTile').length === 2);
    assert.equal(await a.page.evaluate(() => window.__captures), 0);assert.equal(await b.page.evaluate(() => window.__captures), 0);
    await a.page.locator('[data-study-device="camera"]').click();await a.page.locator('[data-study-device="microphone"]').click();
    try {await b.page.waitForFunction(() => [...document.querySelectorAll('.studyVideoTile video')].some(video => !video.muted && video.dataset.live === 'true' && video.videoWidth > 0), null, {timeout: 12000});}
    catch (error) {const inspect = f => f.page.evaluate(() => ({status: document.querySelector('[data-study-status]').textContent, captures: window.__captures, peers: window.__peerConnections.map(pc => ({state: pc.connectionState, ice: pc.iceConnectionState, gathering: pc.iceGatheringState, signaling: pc.signalingState, local: pc.localDescription?.type, remote: pc.remoteDescription?.type, transceivers: pc.getTransceivers().map(transceiver => ({kind: transceiver.receiver.track.kind, direction: transceiver.currentDirection}))})), videos: [...document.querySelectorAll('.studyVideoTile video')].map(video => ({muted: video.muted, paused: video.paused, live: video.dataset.live, width: video.videoWidth}))}));throw new Error(error.message + '\n' + JSON.stringify(await Promise.all([inspect(a), inspect(b)])));}
    await b.page.waitForFunction(async () => {
      for (const pc of window.__peerConnections) {const stats = await pc.getStats();let audio = false, video = false;stats.forEach(row => {if (row.type === 'inbound-rtp' && row.bytesReceived > 0) {if (row.kind === 'audio') audio = true;if (row.kind === 'video') video = true;}});if (audio && video) return true;}return false;
    });
    await b.page.locator('[data-study-device="camera"]').click();await b.page.locator('[data-study-device="microphone"]').click();
    await a.page.waitForFunction(async () => {for (const pc of window.__peerConnections) {const stats = await pc.getStats();let audio = false, video = false;stats.forEach(row => {if (row.type === 'inbound-rtp' && row.bytesReceived > 0) {if (row.kind === 'audio') audio = true;if (row.kind === 'video') video = true;}});if (audio && video) return true;}return false;});
    assert(await a.page.evaluate(() => [...document.querySelectorAll('.studyVideoTile video')].filter(video => video.getAttribute('aria-label') === 'Your muted local preview').every(video => video.muted)));
    assert(await b.page.evaluate(() => [...document.querySelectorAll('.studyVideoTile video')].some(video => video.srcObject?.getAudioTracks().length && !video.muted)));
    await screenshot(a.page, 'study-room');
    await a.page.evaluate(() => {window.__localTracks = [...document.querySelectorAll('.studyVideoTile video')].find(video => video.muted)?.srcObject?.getTracks() || [];});
    await a.page.locator('[data-study-leave]').click();await b.page.waitForFunction(() => document.querySelectorAll('.studyVideoTile').length === 1);
    assert(await a.page.evaluate(() => window.__localTracks.every(track => track.readyState === 'ended')));
    assert(await a.page.evaluate(() => window.__peerConnections.every(pc => pc.connectionState === 'closed')));
    assert.deepEqual([...a.errors, ...b.errors], []);
  } finally {await a.context.close();await b.context.close();}
});

test('A saved ambient mix stays silent until explicit start and closes on profile suspension', {skip: !available}, async () => {
  const f = await page();
  try {
    await f.page.locator('[data-study-tab="sound"]').click();await f.page.locator('[data-study-ambient]').click();await f.page.waitForFunction(() => window.__audioContexts.some(context => context.state === 'running'));
    await f.page.reload();await f.page.waitForFunction(() => document.querySelectorAll('[data-study-track]').length === 19);
    assert.equal(await f.page.evaluate(() => window.__audioContexts.length), 0);
    await f.page.locator('[data-study-tab="sound"]').click();assert.equal(await f.page.locator('[data-study-ambient]').getAttribute('aria-pressed'), 'false');
    await f.page.locator('[data-study-ambient]').click();await f.page.waitForFunction(() => window.__audioContexts.some(context => context.state === 'running'));
    assert.equal(await f.page.locator('[data-study-ambient]').getAttribute('aria-pressed'), 'true');
    await f.page.evaluate(() => document.dispatchEvent(new Event('swifly:account-suspended')));
    await f.page.waitForFunction(() => window.__audioContexts.every(context => context.state === 'closed'));assert.deepEqual(f.errors, []);
  } finally {await f.context.close();}
});

test('Study applies low-power surfaces and real reduced motion, with reversible focus view and safe small-screen layouts', {skip: !available}, async () => {
  const f = await page({width: 320, height: 800});
  try {
    await f.page.evaluate(() => {window.SwiflyAppearance = {reduceMotion: true, reduceTransparency: true, largeTargets: true, highContrast: true};document.dispatchEvent(new CustomEvent('swifly:studio-change', {detail: {effective: window.SwiflyAppearance}}));});
    assert(await f.page.evaluate(() => document.querySelector('[data-study-video]').paused));
    assert.equal(await f.page.locator('.studyTimer').evaluate(element => getComputedStyle(element).backdropFilter), 'none');
    assert.equal(await f.page.locator('[data-study-rain]').evaluate(element => getComputedStyle(element).display), 'none');
    await f.page.locator('[data-study-tab="sound"]').click();
    for (const layout of ['scenic', 'focus', 'balanced']) {await f.page.locator('select[data-study-layout]').selectOption(layout);assert(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));}
    await f.page.locator('[data-study-immersive]').click();assert(await f.page.locator('[data-study-root]').evaluate(element => element.classList.contains('studyFocusView')));await f.page.keyboard.press('Escape');assert.equal(await f.page.locator('[data-study-immersive]').getAttribute('aria-pressed'), 'false');assert(await f.page.locator('.studyWorkspace').isVisible());
    await screenshot(f.page, 'study-mobile-low-power');assert.deepEqual(f.errors, []);
  } finally {await f.context.close();}
});
