const express = require('express');
const { chromium } = require('playwright');
const { extractFirstProxyVideo } = require('./src/extractor');

const app = express();
const PORT = process.env.PORT || 3000;

// Lower numbers = faster. If a movie page is slow, raise these on Render env vars.
const SCAN_TIMEOUT_MS = Number(process.env.SCAN_TIMEOUT_MS || 12000);
const FAST_WAIT_MS = Number(process.env.FAST_WAIT_MS || 2200);
const CLICK_WAIT_MS = Number(process.env.CLICK_WAIT_MS || 650);
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 6 * 60 * 60 * 1000); // 6 hours

let browserPromise;
const cache = new Map();
const pending = new Map();

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ ok: false, error: message, ...extra });
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-extensions'
      ]
    });
  }
  return browserPromise;
}

function getCached(movieId) {
  const item = cache.get(movieId);
  if (!item) return null;
  if (Date.now() - item.savedAt > CACHE_TTL_MS) {
    cache.delete(movieId);
    return null;
  }
  return item.data;
}

function setCached(movieId, data) {
  if (data?.ok && data?.result?.workingEncodedProxyUrl) {
    cache.set(movieId, { savedAt: Date.now(), data });
  }
}

async function resolveMovieCached(movieId, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = getCached(movieId);
    if (cached) return { ...cached, cached: true };
  }

  if (pending.has(movieId)) return pending.get(movieId);

  const job = resolveMovie(movieId)
    .then((data) => {
      setCached(movieId, data);
      return { ...data, cached: false };
    })
    .finally(() => pending.delete(movieId));

  pending.set(movieId, job);
  return job;
}

async function resolveMovie(movieId) {
  const sourceUrl = `https://embed.filmu.in/movie/${encodeURIComponent(movieId)}`;
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1000, height: 700 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    ignoreHTTPSErrors: true,
    serviceWorkers: 'block'
  });

  const page = await context.newPage();
  page.setDefaultTimeout(2500);
  page.setDefaultNavigationTimeout(SCAN_TIMEOUT_MS);

  let firstResult = null;
  let resolveFound;
  const foundPromise = new Promise((resolve) => {
    resolveFound = resolve;
  });

  const checkText = (text, source = 'unknown') => {
    if (firstResult || !text) return false;
    const result = extractFirstProxyVideo(String(text));
    if (result) {
      firstResult = { ...result, foundIn: source };
      resolveFound(true);
      return true;
    }
    return false;
  };

  const waitForResult = (ms) =>
    Promise.race([
      foundPromise,
      new Promise((resolve) => setTimeout(() => resolve(false), ms))
    ]);

  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    const type = req.resourceType();

    checkText(url, `request:${type}`);

    // Saves a lot of time/RAM on Render. We only need URLs/scripts/XHR, not page assets.
    if (['image', 'font', 'stylesheet'].includes(type)) {
      return route.abort().catch(() => {});
    }

    // If the video request itself is the proxy URL, we already captured it above.
    // Abort media so Chromium does not waste time downloading MP4 bytes.
    if (type === 'media') {
      return route.abort().catch(() => {});
    }

    return route.continue().catch(() => {});
  });

  page.on('request', (request) => {
    checkText(request.url(), `request:${request.resourceType()}`);
  });

  page.on('response', async (response) => {
    if (firstResult) return;
    const url = response.url();
    checkText(url, 'response-url');
    if (firstResult) return;

    const requestType = response.request().resourceType();
    const contentType = (response.headers()['content-type'] || '').toLowerCase();
    const length = Number(response.headers()['content-length'] || 0);

    const looksText =
      ['document', 'script', 'xhr', 'fetch'].includes(requestType) ||
      contentType.includes('text') ||
      contentType.includes('json') ||
      contentType.includes('javascript');

    if (!looksText) return;
    if (length && length > 1_500_000) return;

    try {
      const body = await Promise.race([
        response.text(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('body timeout')), 1200))
      ]);
      checkText(body, `response-body:${requestType}`);
    } catch (_) {}
  });

  try {
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: SCAN_TIMEOUT_MS }).catch(() => {});

    // Most pages reveal the proxy URL right after scripts run.
    if (await waitForResult(FAST_WAIT_MS)) {
      return { ok: true, movieId, sourceUrl, result: firstResult };
    }

    try {
      checkText(await page.content(), 'page-html');
    } catch (_) {}
    if (firstResult) return { ok: true, movieId, sourceUrl, result: firstResult };

    // Click only the most likely controls, not every iframe/video. This is faster.
    const selectors = ['button', '[role="button"]', '.play', '#play', '[class*="play"]'];
    for (const selector of selectors) {
      if (firstResult) break;
      const handles = await page.$$(selector).catch(() => []);
      for (const handle of handles.slice(0, 3)) {
        if (firstResult) break;
        try {
          await handle.click({ timeout: 500, force: true });
          if (await waitForResult(CLICK_WAIT_MS)) break;
          checkText(await page.content(), `after-click:${selector}`);
        } catch (_) {}
      }
    }

    for (const frame of page.frames()) {
      if (firstResult) break;
      try {
        checkText(frame.url(), 'frame-url');
        checkText(await frame.content(), 'frame-html');
      } catch (_) {}
    }

    try {
      const storageDump = await page.evaluate(() => {
        const out = [];
        for (const store of [localStorage, sessionStorage]) {
          for (let i = 0; i < store.length; i++) {
            const k = store.key(i);
            out.push(`${k}=${store.getItem(k)}`);
          }
        }
        return out.join('\n');
      });
      checkText(storageDump, 'browser-storage');
    } catch (_) {}

    return {
      ok: Boolean(firstResult),
      movieId,
      sourceUrl,
      result: firstResult
    };
  } finally {
    await context.close().catch(() => {});
  }
}

app.get('/', (_req, res) => {
  res.type('text/plain').send(
    'MovieResolver API\n\nUse: GET /movie/{number}\nExample: /movie/1726\nRefresh cache: /movie/1726?refresh=1\nHealth: /healthz\n'
  );
});

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get('/movie/:id', async (req, res) => {
  const movieId = String(req.params.id || '').trim();

  if (!/^\d+$/.test(movieId)) {
    return jsonError(res, 400, 'Movie id must be a number. Example: /movie/1726');
  }

  try {
    const scan = await resolveMovieCached(movieId, req.query.refresh === '1');

    if (!scan.ok || !scan.result) {
      return jsonError(res, 404, 'No proxy-video URL found.', {
        movieId,
        sourceUrl: scan.sourceUrl,
        cached: Boolean(scan.cached)
      });
    }

    return res.json({
      ok: true,
      movieId,
      cached: Boolean(scan.cached),
      sourceUrl: scan.sourceUrl,
      proxyVideo: scan.result.workingEncodedProxyUrl,
      decodedVideoUrl: scan.result.decodedVideoUrl,
      referer: scan.result.referer || null,
      origin: scan.result.origin || null,
      foundIn: scan.result.foundIn
    });
  } catch (err) {
    return jsonError(res, 500, err.message || 'Scan failed.');
  }
});

app.use((req, res) => {
  jsonError(res, 404, 'Route not found. Use /movie/{number}.');
});

app.listen(PORT, () => {
  console.log(`MovieResolver API running on port ${PORT}`);
  // Warm Chromium once at startup so the first real request is faster.
  getBrowser().catch((err) => console.error('Browser warmup failed:', err.message));
});

process.on('SIGTERM', async () => {
  try {
    const browser = await browserPromise;
    await browser?.close();
  } catch (_) {}
  process.exit(0);
});
