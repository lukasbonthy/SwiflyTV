# Real media only patch

This build fixes the false-positive provider results shown by `/api/local/download-sites-debug`.

## Main fixes

- Do not embed `site.webmanifest` as HLS.
- Do not embed `xmlrpc.php`, `wp-comments-post.php`, `wp-login.php`, `sitemap.xml`, `.html`, `.css`, `.js`, `.json`, `.webmanifest`, `.apk`, or image files as video.
- Do not use Telegram demo videos, social/share URLs, analytics URLs, WordPress admin/support URLs, category pages, or adult mirror/category links as SwiflyTV sources.
- Only real browser-playable media extensions are treated as direct sources:
  `.m3u8`, `.mpd`, `.mp4`, `.m4v`, `.webm`, `.mkv`, `.mov`, `.avi`, `.flv`, `.ts`, `.m2ts`, `.mts`, `.m4s`, `.fmp4`.
- Extensionless HLS endpoints are only accepted when the source explicitly says HLS/m3u8 and the local HLS proxy exposes it as `/api/hls-proxy/<id>/master.m3u8`.
- Download-site providers now treat `m4uplay`, `m4ulinks`, `magiclinks`, `modpro`, `zinkcloud`, `nexdrive`, `cloud.unblockedgames`, `hubcloud`, `gdflix`, and similar URLs as intermediate extractor pages to follow, not as final embed URLs.

## Test routes

```txt
/api/local/download-sites-debug?tmdb=11836&type=movie
/api/local/super-source-debug?tmdb=11836&type=movie
/api/local/deep-url-dig?url=PASTE_INTERMEDIATE_URL
```

## Useful override env values from the debug output

Only set these if the source provider list does not already load them:

```env
PROVIDER_MOVIES4U_BASE_URL=https://new4.movies4u.style
PROVIDER_ZINKMOVIES_BASE_URL=https://new9.zinkmovies.biz
PROVIDER_KMMOVIES_BASE_URL=https://kmmovies.life
PROVIDER_MOVIESMOD_BASE_URL=https://moviesmod.farm
PROVIDER_UHDMOVIES_BASE_URL=https://uhdmovies.rodeo
PROVIDER_ZEEFLIZ_BASE_URL=https://zeefliz.beer
```

Do not set adult mirrors.
