# Kids integration and verification

The parent lock belongs to **this browser**, independently of profiles or an account. A parent password is hashed using scrypt (`N=2^17, r=8, p=1`, a random salt and a timing-safe comparison). The verifier, browser ID and lock state are authenticated/encrypted with AES-256-GCM inside a HttpOnly cookie. A separate authenticated/encrypted HttpOnly mode marker carries the same complete credential revision; missing, damaged or partially rolled-back credentials fail closed after restart. Parent mutations are serialized per browser before any asynchronous password hashing. Cookies are Secure over HTTPS, Path=/, SameSite=Lax; exact-origin and JSON checks protect mutations. Lax intentionally carries the lock on external top-level GET navigation. No password is put in a URL, page markup or browser storage.

Production requires a stable `SWIFLY_KIDS_SECRET` (preferred) or existing `SWIFLY_ACCESS_SECRET`, at least 24 bytes. A dedicated key can be configured without changing the site access key or account credentials. Without a stable production key, new setup is unavailable; an existing lock stays closed. Local development may keep a mode-0600 key in `.swifly-data/kids-signing-key`, or a configured persistent `SWIFLY_DATA_DIR`. Browser cookie removal/new browser sessions are outside a device-scoped lock; this is disclosed in the parent controls. Do not expose a reset endpoint to child profiles. Keep a parent password somewhere safe.

## Registration

At module imports: `const {createKids}=require('./lib/kids');`.

Immediately after `app.use(siteGate.protect)` and before Study/account/discovery/download/source routes:

```js
const kids=createKids({
  tmdb:(...args)=>tmdb(...args),
  secret:process.env.SWIFLY_KIDS_SECRET||process.env.SWIFLY_ACCESS_SECRET,
  onLock:deviceId=>{
    for(const namespace of [io.sockets,io.of('/study')])for(const socket of namespace.sockets.values())
      if(kids.deviceForHeader(socket.handshake.headers.cookie)===deviceId)socket.disconnect(true);
  }
});
app.use(kids.protect);
app.use('/api/kids',kids.router);
app.use('/assets/kids',express.static(path.join(__dirname,'public','kids'),{maxAge:'1d',dotfiles:'deny'}));
```

The server registers explicit native routes: `/kids`, `/kids/movies`, `/kids/tv`, `/kids/browse`, `/kids/search`, `/kids/title/:type/:id` and `/kids/watch/:type/:id`. `kidsCatalogPage`, `detailPage` and `watchPage` reuse the real catalog/cinema components with an explicit `kidsMode` option. The default adult renderer behavior is preserved. Every discovery/search/recommendation candidate is reduced to an ID and independently verified; conflicting IDs/types, adult flags, missing/conflicting certificates and failed metadata are rejected before rendering. Child pages are private and not cached.

The native child shell uses the shared CSS, navigation renderer, hero, React rails, cards, title and player. It omits adult resume/history, account/profile, feed/notification, social, download and Studio containers/controllers. Search is server rendered through `/kids/search`; no adult recent-search storage or async search controller is mounted. The shell applies only validated comfort preferences (font, motion, contrast, target/scale/focus and caption settings), plus device performance/TV settings, from existing preferences. Saved adult themes, wallpapers, row layouts and navigation changes are not applied.

`/assets/kids/guard.js?v=2` coordinates parent locking across tabs and rechecks restored players. `/assets/kids/kids.js?v=3` owns the password dialog. Kids CSS is part of the content-hashed shared finish bundle. Locked CSS preserves `[data-kids-shell]` navigation. Child details fetch at most one selected season's metadata and render at most24 initial episode tiles; other season summaries select their own safe SSR route. Season groups and the player's bounded episode window keep later seasons/episodes reachable. Child players always use movie playback and retain `/kids` return, season and episode paths.

Study's `authorizeSocket` should require both site-gate authorization and `kids.socketAllowed(socket)`. Default Socket.IO auth and every live packet should check the same method. On lock, the callback disconnects all existing namespaces for that browser. The guard seeds a stable encrypted browser ID on normal first-party page/API visits, so a pre-lock socket can be matched. Current-process records also invalidate a stale open/unconfigured credential after locking.

## Protected behavior

- The collection uses verified positive US G/PG movie ratings and TV-Y/TV-Y7/TV-G show ratings plus a family/animation/kids genre requirement. Adult/unrated/restricted genres and disallowed overview subjects stay out. Failed or unavailable metadata is rejected, never allowed by fallback.
- Locked `/movie/:id` and `/tv/:id` redirect safe titles into the dedicated checked Kids title view, preventing unrestricted related-title recommendations in general details. Unsafe titles go to the parent gate.
- Safe `/watch/movie|tv/:id` and known title-bound source/episode APIs are verified. Trailer/managed-room playback links are normalized into child movie playback. General discovery/search/person/language/profile/account/social/study/audiobook/download and provider debug APIs stay blocked while locked.
- Opaque HLS/file/subtitle proxy tokens are allowed only after they appear in a verified child title's source response for that browser. Tokens are bounded, expire after two hours and are not trusted via Referer. Grants clear on unlock and process restart. The player can reacquire a source after a deployment; no unrelated proxy token is accepted.
- Setup cannot replace an existing parent password. Unlock/password changes use the current password and are limited by browser and IP. Wrong/slow/unverifiable checks keep the lock in place.

## Checks

`node --test tests/kids-protection.test.cjs` covers certification, direct route/API protection, correct/wrong passwords, overwrite rejection, restart and corrupt/missing cookie failure, proxy grants, source origin handling, CSRF, socket stale-credential protection and guess limits.

`node --test tests/kids-native.test.cjs tests/kids-ui.test.cjs tests/kids-integration.test.cjs` checks real application-shell rendering, adversarial metadata, safe pagination/filters/search/recommendations, bounded seasons, safe player routes, preference isolation, cross-tab restoration and parent controls.

`SWIFLY_TEST_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium SWIFLY_KIDS_SCREENSHOT_DIR=<dir> node --test tests/kids-native-browser.test.cjs` checks the real application after React hydration at desktop, iPad, 390px, 320px and TV sizes, with distinct checked artwork fixtures, native navigation/rails, real second pages, SSR search/details/episodes, child player return, parent flow and cross-tab restoration. In hosted CI, omit the executable override to use its installed Chromium. Local Chromium launch is denied by this runtime's socket policy; do not mark these browser scenarios passed until hosted output confirms them.
