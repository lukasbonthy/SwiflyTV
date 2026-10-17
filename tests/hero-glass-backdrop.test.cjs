const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { loadServer } = require('./ui-helpers.cjs');
const asset = name => fs.readFileSync(path.join(__dirname, '../public', name), 'utf8');
const available = fs.existsSync(chromium.executablePath()) || fs.existsSync(chromium.executablePath().replace(/chromium-(\d+)\/chrome-linux\/chrome$/, 'chromium_headless_shell-$1/chrome-linux/headless_shell'));

async function pixelDifference(page, first, second) {
  return page.evaluate(async ({ first, second }) => {
    const decode = async source => {
      const image = new Image(); image.src = 'data:image/png;base64,' + source; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const a = await decode(first), b = await decode(second); let sum = 0, count = 0;
    for (let index = 0; index < a.length; index += 4) for (let channel = 0; channel < 3; channel++) {
      sum += Math.abs(a[index + channel] - b[index + channel]); count++;
    }
    return sum / count;
  }, { first, second });
}

for (const width of [360, 1024]) for (const native of [false, true]) {
  test(`${width}px ${native ? 'native' : 'refractive'} real hero buttons filter artwork after their entrance finishes`, { skip: !available && 'Chromium is not installed' }, async () => {
    const api = loadServer(), browser = await chromium.launch({ headless: true });
    try {
      const hero = { id: 1236045, title: 'Animals', backdrop_path: '/test.jpg', poster_path: '/poster.jpg', release_date: '2026-01-01', vote_average: 7.2, overview: 'When the son of a mayoral candidate is kidnapped, his parents have a few hours to find the ransom payment.' };
      api.setTmdb(async () => ({ results: [hero] }));
      let html; await api.homePage({}, { send(value) { html = value; } });
      html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<link\b[^>]*href="([^\"]+)"[^>]*>/g, (_tag, url) => url.startsWith('/assets/') ? '<style>' + asset(url.slice(8).split('?')[0]) + '</style>' : '');
      const page = await browser.newPage({ viewport: { width, height: width === 360 ? 650 : 900 }, colorScheme: 'dark', ...(native ? { userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15' } : {}) });
      await page.route('**/*', route => route.fulfill({ status: 200, body: '' })); await page.setContent(html);
      // Use a textured photograph substitute, retaining the real hero hierarchy,
      // styles and entrance animations that previously blocked the backdrop.
      await page.addStyleTag({ content: 'body.svCleanShell .dsHeroBg{background-image:repeating-linear-gradient(31deg,#ddd 0 8px,#222 8px 16px)!important}.dsHeroActions>:is(a,button){transition:none!important}' });
      for (const name of ['liquid-glass/liquid-glass.js', 'liquid-glass/surfaces.js']) await page.addScriptTag({ content: asset(name) });
      await page.waitForFunction(() => document.querySelectorAll('.dsHeroActions .svNavMatchedLens').length === 3);
      if (!native) await page.waitForFunction(() => [...document.querySelectorAll('.dsHeroActions .svNavMatchedLens')].every(pane => pane.dataset.swiflyRenderer === 'svg'));
      await page.waitForTimeout(1100);
      const controls = page.locator('.dsHeroActions > :is(a,button)'); assert.equal(await controls.count(), 3);
      for (let index = 0; index < 3; index++) {
        const control = controls.nth(index), pane = control.locator('.svNavMatchedLens');
        const first = (await control.screenshot()).toString('base64');
        await pane.evaluate((node, native) => {
          if (native) node.style.setProperty('backdrop-filter', 'none', 'important');
          else node.querySelectorAll('feDisplacementMap').forEach(map => map.setAttribute('scale', '0'));
        }, native);
        const second = (await control.screenshot()).toString('base64');
        const difference = await pixelDifference(page, first, second);
        assert(difference > 1.2, `${await control.innerText()} must visibly filter the artwork, not an empty ancestor layer (RGB delta ${difference.toFixed(2)})`);
      }
      assert.equal(await page.locator('.dsHeroActions').evaluate(node => getComputedStyle(node).filter), 'none', 'a completed entrance must release its backdrop boundary');
      assert.equal(await page.locator('.dsHeroActions').evaluate(node => getComputedStyle(node).animationName), 'svGlassSafeRise', 'the existing glass-safe entrance must remain');
    } finally { await browser.close(); await new Promise(resolve => api.io.close(resolve)); }
  });
}
