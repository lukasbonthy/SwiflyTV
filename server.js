const express = require('express');
const { chromium } = require('playwright');
const {
  extractUrlsFromText,
  parseFoundUrl,
  looksUseful,
  repairBrokenProtocol,
  addHttpsToBareUrl
} = require('./src/extractor');

const app = express();
const PORT = process.env.PORT || 3000;

const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 6 * 60 * 60 * 1000);
const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS || 3500);
const SCRIPT_TIMEOUT_MS = Number(process.env.SCRIPT_TIMEOUT_MS || 2500);
const MAX_ASSETS_TO_SCAN = Number(process.env.MAX_ASSETS_TO_SCAN || 35);
const BROWSER_WAIT_MS = Number(process.env.BROWSER_WAIT_MS || 6000);
const ENABLE_BROWSER_FALLBACK = process.env.ENABLE_BROWSER_FALLBACK !== '0';
const RESPONSE_BODY_LIMIT_BYTES = Number(process.env.RESPONSE_BODY_LIMIT_BYTES || 2 * 1024 * 1024);

const cache = new Map();
const pending = new Map();

let browserPromise = null;
let contextPromise = null;

app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ ok: false, error: message, ...extra });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function firstProxyVideoOnly(items) {
  const seen = new Set();

  for (const item of items.filter(Boolean)) {
    if (item.type !== 'proxy-video') continue;

    const working = item.workingUrl || item.encodedProxyUrl || item.url || '';
    const useful = looksUseful(working) || looksUseful(item.decodedVideoUrl || '');

    if (!useful) continue;

    const key = [item.type, working, item.decodedVideoUrl || ''].join('|');
    if (seen.has(key)) continue;

    seen.add(key);
    return item;
  }

  return null;
}

function addFoundFromText(found, text, source, baseUrl) {
  if (!text) return null;

  const items = extractUrlsFromText(text, source, baseUrl);
  found.push(...items);

  return firstProxyVideoOnly(found);
}

function getHeaders(baseUrl) {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,text/javascript,application/javascript,application/json,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: baseUrl,
    Origin: new URL(baseUrl).origin
  };
}

async function fetchText(url, baseUrl, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: getHeaders(baseUrl)
    });

    const contentType = response.headers.get('content-type') || '';

    if (
      !contentType.includes('text') &&
      !contentType.includes('javascript') &&
      !contentType.includes('json') &&
      !contentType.includes('html') &&
      !contentType.includes('xml') &&
      !contentType.includes('mpegurl')
    ) {
      return '';
    }

    return await response.text().catch(() => '');
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

function uniquePush(set, url) {
  if (!url) return;

  try {
    const clean = addHttpsToBareUrl(repairBrokenProtocol(String(url).trim()));
    if (clean) set.add(clean);
  } catch {}
}

function extractAssetUrls(html, baseUrl) {
  const urls = new Set();

  const patterns = [
    /<script[^>]+src=["']([^"']+)["']/gi,
    /<iframe[^>]+src=["']([^"']+)["']/gi,
    /<source[^>]+src=["']([^"']+)["']/gi,
    /<(?:link|a)[^>]+href=["']([^"']+)["']/gi,
    /["']([^"']+\.(?:js|json|m3u8)(?:\?[^"']*)?)["']/gi,
    /["'](\/[^"']*(?:proxy|video|embed|player|movie|api)[^"']*)["']/gi
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const raw = match[1];

      try {
        const absolute = new URL(raw, baseUrl).toString();
        uniquePush(urls, absolute);
      } catch {}
    }
  }

  return [...urls].slice(0, MAX_ASSETS_TO_SCAN);
}

async function mapLimit(items, limit, mapper) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = items[index++];
      results.push(await mapper(current).catch(() => null));
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function staticResolve(movieId, targetUrl) {
  const found = [];

  const html = await fetchText(targetUrl, targetUrl, HTTP_TIMEOUT_MS);
  let first = addFoundFromText(found, html, 'static-html', targetUrl);

  if (first) {
    return {
      ok: true,
      movieId,
      sourceUrl: targetUrl,
      result: first,
      mode: 'static-html'
    };
  }

  const assets = extractAssetUrls(html, targetUrl);

  await mapLimit(assets, 8, async (assetUrl) => {
    if (firstProxyVideoOnly(found)) return;

    const parsedDirect = parseFoundUrl(assetUrl, 'static-asset-url', targetUrl);
    if (parsedDirect) found.push(parsedDirect);

    if (firstProxyVideoOnly(found)) return;

    const text = await fetchText(assetUrl, targetUrl, SCRIPT_TIMEOUT_MS);
    addFoundFromText(found, text, 'static-asset-body', assetUrl);

    if (text) {
      const nestedAssets = extractAssetUrls(text, assetUrl).slice(0, 8);

      for (const nested of nestedAssets) {
        if (firstProxyVideoOnly(found)) break;

        const nestedText = await fetchText(nested, targetUrl, SCRIPT_TIMEOUT_MS);
        addFoundFromText(found, nestedText, 'static-nested-asset', nested);
      }
    }
  });

  first = firstProxyVideoOnly(found);

  if (first) {
    return {
      ok: true,
      movieId,
      sourceUrl: targetUrl,
      result: first,
      mode: 'static-assets'
    };
  }

  return {
    ok: false,
    movieId,
    sourceUrl: targetUrl,
    result: null,
    mode: 'static-none'
  };
}

function shouldReadResponseBody(url, contentType, headers = {}) {
  const lowerUrl = String(url || '').toLowerCase();
  const lowerType = String(contentType || '').toLowerCase();
  const contentLength = Number(headers['content-length'] || 0);

  if (contentLength && contentLength > RESPONSE_BODY_LIMIT_BYTES) return false;

  return (
    lowerType.includes('text/') ||
    lowerType.includes('json') ||
    lowerType.includes('javascript') ||
    lowerType.includes('xml') ||
    lowerType.includes('mpegurl') ||
    lowerUrl.endsWith('.js') ||
    lowerUrl.includes('.js?') ||
    lowerUrl.endsWith('.json') ||
    lowerUrl.includes('.json?') ||
    lowerUrl.endsWith('.m3u8') ||
    lowerUrl.includes('.m3u8?')
  );
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--no-first-run',
          '--no-default-browser-check',
          '--autoplay-policy=no-user-gesture-required'
        ]
      })
      .then((browser) => {
        browser.on('disconnected', () => {
          browserPromise = null;
          contextPromise = null;
        });

        return browser;
      })
      .catch((error) => {
        browserPromise = null;
        contextPromise = null;
        throw error;
      });
  }

  const browser = await browserPromise;

  if (!browser.isConnected()) {
    browserPromise = null;
    contextPromise = null;
    return getBrowser();
  }

  return browser;
}

async function getSharedContext() {
  if (!contextPromise) {
    contextPromise = getBrowser()
      .then((browser) =>
        browser.newContext({
          viewport: { width: 1280, height: 720 },
          javaScriptEnabled: true,
          bypassCSP: true,
          ignoreHTTPSErrors: true,
          serviceWorkers: 'block',
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          extraHTTPHeaders: {
            'Accept-Language': 'en-US,en;q=0.9'
          }
        })
      )
      .catch((error) => {
        contextPromise = null;
        throw error;
      });
  }

  return contextPromise;
}

async function dumpFrames(page, found, targetUrl) {
  for (const frame of page.frames()) {
    const frameUrl = frame.url();
    const base = frameUrl && frameUrl !== 'about:blank' ? frameUrl : targetUrl;

    const html = await frame.content().catch(() => '');
    addFoundFromText(found, html, 'browser-frame', base);

    const storageText = await frame
      .evaluate(() => {
        const rows = [];

        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            rows.push(`localStorage:${key}=${localStorage.getItem(key)}`);
          }
        } catch {}

        try {
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            rows.push(`sessionStorage:${key}=${sessionStorage.getItem(key)}`);
          }
        } catch {}

        return rows.join('\n');
      })
      .catch(() => '');

    addFoundFromText(found, storageText, 'browser-storage', base);

    if (firstProxyVideoOnly(found)) return;
  }
}

async function browserFallback(movieId, targetUrl) {
  const found = [];
  const responseTasks = new Set();

  let page;

  try {
    const context = await getSharedContext();
    page = await context.newPage();

    page.setDefaultNavigationTimeout(14000);
    page.setDefaultTimeout(5000);

    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = request.url();
      const type = request.resourceType();

      if (looksUseful(url)) {
        const item = parseFoundUrl(url, 'browser-route', targetUrl);
        if (item) found.push({ ...item, method: request.method(), resourceType: type });
      }

      // Safe blocking only. Do not block media/script/xhr/fetch.
      if (type === 'image' || type === 'font') {
        return route.abort().catch(() => {});
      }

      return route.continue().catch(() => {});
    });

    await page.addInitScript(() => {
      try {
        const oldFetch = window.fetch;

        window.fetch = function (...args) {
          try {
            console.info('[resolver-fetch]', String(args[0] && (args[0].url || args[0])));
          } catch {}

          return oldFetch.apply(this, args);
        };
      } catch {}

      try {
        const oldOpen = XMLHttpRequest.prototype.open;

        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
          try {
            console.info('[resolver-xhr]', String(url));
          } catch {}

          return oldOpen.call(this, method, url, ...rest);
        };
      } catch {}
    });

    page.on('console', (msg) => {
      addFoundFromText(found, msg.text(), 'browser-console', targetUrl);
    });

    page.on('request', (request) => {
      const url = request.url();

      if (looksUseful(url)) {
        const item = parseFoundUrl(url, 'browser-request', targetUrl);
        if (item) found.push({ ...item, method: request.method(), resourceType: request.resourceType() });
      }

      const postData = request.postData();

      if (postData && looksUseful(postData)) {
        addFoundFromText(found, postData, 'browser-post-data', targetUrl);
      }
    });

    page.on('response', (response) => {
      const task = (async () => {
        const url = response.url();
        const headers = response.headers();
        const contentType = headers['content-type'] || '';

        if (
          looksUseful(url) ||
          String(contentType).includes('video') ||
          String(contentType).includes('mpegurl')
        ) {
          const item = parseFoundUrl(url, 'browser-response', targetUrl);
          if (item) found.push({ ...item, status: response.status(), contentType });
        }

        if (firstProxyVideoOnly(found)) return;

        if (shouldReadResponseBody(url, contentType, headers)) {
          const text = await response.text().catch(() => '');
          addFoundFromText(found, text, 'browser-response-body', url);
        }
      })()
        .catch(() => {})
        .finally(() => responseTasks.delete(task));

      responseTasks.add(task);
    });

    await page
      .goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 14000
      })
      .catch(() => null);

    await dumpFrames(page, found, targetUrl).catch(() => {});

    let first = firstProxyVideoOnly(found);

    if (first) {
      return {
        ok: true,
        movieId,
        sourceUrl: targetUrl,
        result: first,
        mode: 'browser-frame'
      };
    }

    await page.mouse.click(640, 360).catch(() => {});
    await page.keyboard.press('Space').catch(() => {});

    const end = Date.now() + BROWSER_WAIT_MS;

    while (Date.now() < end) {
      first = firstProxyVideoOnly(found);

      if (first) {
        return {
          ok: true,
          movieId,
          sourceUrl: targetUrl,
          result: first,
          mode: 'browser-network'
        };
      }

      await dumpFrames(page, found, targetUrl).catch(() => {});

      first = firstProxyVideoOnly(found);

      if (first) {
        return {
          ok: true,
          movieId,
          sourceUrl: targetUrl,
          result: first,
          mode: 'browser-dump'
        };
      }

      await Promise.race([
        Promise.allSettled([...responseTasks]),
        sleep(350)
      ]).catch(() => {});
    }

    first = firstProxyVideoOnly(found);

    return {
      ok: Boolean(first),
      movieId,
      sourceUrl: targetUrl,
      result: first,
      mode: 'browser-final'
    };
  } finally {
    await page?.close().catch(() => {});
  }
}

function cached(movieId) {
  const item = cache.get(movieId);

  if (!item) return null;

  if (Date.now() - item.savedAt > CACHE_TTL_MS) {
    cache.delete(movieId);
    return null;
  }

  return item.data;
}

async function resolveMovie(movieId) {
  const targetUrl = `https://embed.filmu.in/movie/${encodeURIComponent(movieId)}`;

  const staticResult = await staticResolve(movieId, targetUrl);

  if (staticResult.ok && staticResult.result) {
    return staticResult;
  }

  if (!ENABLE_BROWSER_FALLBACK) {
    return staticResult;
  }

  return browserFallback(movieId, targetUrl);
}

async function resolveMovieCached(movieId, refresh = false) {
  if (!refresh) {
    const hit = cached(movieId);

    if (hit) {
      return { ...hit, cached: true };
    }
  }

  if (pending.has(movieId)) return pending.get(movieId);

  const job = resolveMovie(movieId)
    .then((data) => {
      if (data.ok && data.result) {
        cache.set(movieId, {
          savedAt: Date.now(),
          data
        });
      }

      return { ...data, cached: false };
    })
    .finally(() => pending.delete(movieId));

  pending.set(movieId, job);
  return job;
}

app.get('/', (_req, res) => {
  res
    .type('text/plain')
    .send('MovieResolver API\n\nUse: GET /movie/{number}\nExample: /movie/1726\nRefresh: /movie/1726?refresh=1\n');
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.get('/movie/:id', async (req, res) => {
  const movieId = String(req.params.id || '').trim();

  if (!/^\d+$/.test(movieId)) {
    return jsonError(res, 400, 'Movie id must be a number. Example: /movie/1726');
  }

  const startedAt = Date.now();

  try {
    const scan = await resolveMovieCached(movieId, req.query.refresh === '1');

    if (!scan.ok || !scan.result) {
      return jsonError(res, 404, 'No proxy-video URL found.', {
        movieId,
        sourceUrl: scan.sourceUrl,
        cached: Boolean(scan.cached),
        ms: Date.now() - startedAt,
        mode: scan.mode || null
      });
    }

    return res.json({
      ok: true,
      movieId,
      cached: Boolean(scan.cached),
      ms: Date.now() - startedAt,
      mode: scan.mode || null,
      sourceUrl: scan.sourceUrl,
      proxyVideo: scan.result.workingUrl || scan.result.encodedProxyUrl || scan.result.url,
      encodedProxyUrl: scan.result.encodedProxyUrl || scan.result.workingUrl || scan.result.url,
      decodedVideoUrl: scan.result.decodedVideoUrl || null,
      referer: scan.result.referer || null,
      origin: scan.result.origin || null,
      foundIn: scan.result.source || null
    });
  } catch (error) {
    return jsonError(res, 500, error.message || 'Scan failed.', {
      ms: Date.now() - startedAt
    });
  }
});

app.use((req, res) => {
  jsonError(res, 404, 'Route not found. Use /movie/{number}.');
});

const server = app.listen(PORT, () => {
  console.log(`MovieResolver API running on port ${PORT}`);

  getSharedContext()
    .then(() => console.log('Chromium fallback warmed up'))
    .catch((error) => console.error('Chromium warmup failed:', error.message));
});

async function shutdown() {
  server.close(() => {});

  try {
    const browser = browserPromise ? await browserPromise.catch(() => null) : null;
    await browser?.close().catch(() => {});
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
