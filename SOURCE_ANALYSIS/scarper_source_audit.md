# ScarperApi-zero non-adult source audit

Static audit generated from the uploaded source zip. Adult, hentai, PH, auth, key, dashboard, test, and YouTube-downloader routes are excluded.

## /api/4khdhub/details

- chars: 5899
- fields/tokens: `URL, downloadLinks, file, href, src, url`

## /api/4khdhub/gadget

- chars: 5874
- fields/tokens: `URL, url`

## /api/4khdhub

- chars: 2624
- fields/tokens: `href, src, url`

## /api/4khdhub/search

- chars: 3092
- fields/tokens: `href, src, url`

## /api/animepahe/details

- chars: 9219
- fields/tokens: `URL, downloadLinks, href, src, streamUrl, url`
- hardcoded URLs:
  - `https://animepahe.si${href}`
  - `https://animepahe.si/api?m=release&id=${session}&sort=episode_asc&page=${currentPage}`

## /api/animepahe

- chars: 2276
- fields/tokens: `URL, url`
- hardcoded URLs:
  - `https://animepahe.si/api?m=airing&page=${page}`

## /api/animepahe/search

- chars: 2194
- fields/tokens: `URL, url`
- hardcoded URLs:
  - `https://animepahe.si/api?m=search&q=${encodeURIComponent(query`

## /api/animepahe/stream

- chars: 4714
- fields/tokens: `URL, m3u8, url`

## /api/animesalt/details

- chars: 8021
- fields/tokens: `URL, href, src, url`

## /api/animesalt

- chars: 3376
- fields/tokens: `href, src, url`

## /api/animesalt/search

- chars: 3322
- fields/tokens: `href, src, url`

## /api/animesalt/stream

- chars: 3549
- fields/tokens: `URL, src, url`

## /api/castel

- chars: 24315
- fields/tokens: `URL, streams, url, videoUrl`
- hardcoded URLs:
  - `https://aesdec.nuvioapp.space/decrypt-castle`
  - `https://api.fstcy.com`
  - `https://api.themoviedb.org/3`

## /api/desiremovies/details

- chars: 2863
- fields/tokens: `URL, downloadLinks, href, src, url`

## /api/desiremovies/gyaniguru

- chars: 1795
- fields/tokens: `URL, downloadLinks, href, url`
- hardcoded URLs:
  - `https://desiremovies.gripe/`

## /api/desiremovies

- chars: 2374
- fields/tokens: `href, src, url`

## /api/desiremovies/search

- chars: 2779
- fields/tokens: `href, src, url`
- hardcoded URLs:
  - `https://desiremovies.gripe/kalamkaval-2025-web-hdrip/`

## /api/drive/details

- chars: 3945
- fields/tokens: `URL, downloadLinks, href, src, url`

## /api/drive/mdrive

- chars: 2523
- fields/tokens: `HubCloud, URL, href, hubcloud, url`

## /api/drive

- chars: 2363
- fields/tokens: `href, src, url`

## /api/drive/search

- chars: 2904
- fields/tokens: `url`

## /api/extractors/gdflix

- chars: 1584
- fields/tokens: `URL, gdflix, url`
- hardcoded URLs:
  - `https://scarperapi-extractor-7tr4.vercel.app/api/gdflix?url=${encodeURIComponent(url`

## /api/extractors/hubcloud

- chars: 1590
- fields/tokens: `URL, hubcloud, url`
- hardcoded URLs:
  - `https://scarperapi-extractor-7tr4.vercel.app/api/hubcloud?url=${encodeURIComponent(url`

## /api/extractors/streamtape

- chars: 0

## /api/extractors/xprime

- chars: 18282
- fields/tokens: `URL, XPrime, src, streams, url, xprime`
- hardcoded URLs:
  - `https://api.themoviedb.org/3`
  - `https://mznxiwqjdiq00239q.space`
  - `https://xprime.hunternisha55.workers.dev`
  - `https://xprime.su/watch/${tmdbId}`
  - `https://xprime.su/watch/${tmdbId}/${season}/${episode}`

## /api/hdhub4u/details

- chars: 4722
- fields/tokens: `URL, downloadLinks, href, src, url`

## /api/hdhub4u/extractor

- chars: 11472
- fields/tokens: `URL, href, src, url`

## /api/hdhub4u

- chars: 2194
- fields/tokens: `URL, href, src, url`

## /api/hdhub4u/search

- chars: 3147
- fields/tokens: `url`
- hardcoded URLs:
  - `https://new2.hdhub4u.fo`
  - `https://new2.hdhub4u.fo/`
  - `https://search.pingora.fyi/collections/post/documents/search?q=${formattedQuery}&query_by=post_title&page=${page}`

## /api/kmmovies/details

- chars: 6044
- fields/tokens: `URL, downloadLinks, file, href, src, url`

## /api/kmmovies/magiclinks

- chars: 3981
- fields/tokens: `File, URL, downloadLinks, file, href, url`
- hardcoded URLs:
  - `https://kmmovies.store/`
  - `https://net-cookie-kacj.vercel.app/api/redirect?url=${encodeURIComponent(link.url`

## /api/kmmovies

- chars: 3220
- fields/tokens: `URL, href, src, url`

## /api/kmmovies/search

- chars: 3067
- fields/tokens: `URL, href, src, url`

## /api/mod/details

- chars: 5030
- fields/tokens: `URL, downloadLinks, href, src, url`

## /api/mod/modpro

- chars: 5122
- fields/tokens: `URL, downloadLinks, href, serverLinks, techLinks, url`
- hardcoded URLs:
  - `https://moviesmod.build/`

## /api/mod

- chars: 2418
- fields/tokens: `href, src, url`

## /api/mod/search

- chars: 2163
- fields/tokens: `href, src, url`

## /api/movies4u/details

- chars: 5470
- fields/tokens: `URL, downloadLinks, href, src, url`

## /api/movies4u/m4ulinks

- chars: 4568
- fields/tokens: `URL, href, hubcloud, hubcloudLinks, url`

## /api/movies4u

- chars: 3432
- fields/tokens: `URL, href, src, url`

## /api/movies4u/search

- chars: 2851
- fields/tokens: `href, src, url`

## /api/netmirror/getpost

- chars: 3598
- fields/tokens: `URL, url`

## /api/netmirror

- chars: 6442
- fields/tokens: `URL, net22.cc, src, url`
- hardcoded URLs:
  - `https://net22.cc`

## /api/netmirror/search

- chars: 3537
- fields/tokens: `URL, net22.cc, url`
- hardcoded URLs:
  - `https://net22.cc`

## /api/netmirror/stream

- chars: 6912
- fields/tokens: `URL, file, net20.cc, net22.cc, net51.cc, net52.cc, playlist, sources, url`
- hardcoded URLs:
  - `https://net20.cc/`
  - `https://net22.cc/play.php`
  - `https://net51.cc`
  - `https://net51.cc/`
  - `https://net51.cc/playlist.php?id=${id}&tm=${currentTimestamp}&h=${encodeURIComponent(h`
  - `https://net52.cc/playlist.php?id=${id}&tm=${timestamp}&h=${encodeURIComponent(h`

## /api/search

- chars: 5478
- fields/tokens: `url`

## /api/themovie/det

- chars: 9305
- fields/tokens: `URL, playApiUrl, themoviebox, url`
- hardcoded URLs:
  - `https://themoviebox.org/`
  - `https://themoviebox.org/movies/${slug}?id=${id}&type=${parsedUrl.searchParams.get(`
  - `https://themoviebox.org/wefeed-h5api-bff/subject/play`

## /api/themovie

- chars: 2270
- fields/tokens: `URL, fullUrl, href, src`

## /api/themovie/search

- chars: 8547
- fields/tokens: `URL, fullUrl, href, src, url`

## /api/themovie/stream

- chars: 17695
- fields/tokens: `URL, src, themoviebox, url`
- hardcoded URLs:
  - `https://themoviebox.org/`
  - `https://themoviebox.org/movies/${slug}`
  - `https://themoviebox.org/moviesDetail/${slug}`
  - `https://themoviebox.org/wefeed-h5api-bff/subject/play`

## /api/tm

- chars: 5749
- fields/tokens: `URL, streamUrl, streams, url, vibuxer`
- hardcoded URLs:
  - `https://vibuxer.com/`
  - `https://vibuxer.com/e/${code.trim(`

## /api/uhdmovies/details

- chars: 7162
- fields/tokens: `URL, downloadLinks, file, href, src, url`

## /api/uhdmovies

- chars: 2234
- fields/tokens: `URL, href, src, url`

## /api/uhdmovies/search

- chars: 2873
- fields/tokens: `URL, href, src, url`

## /api/uhdmovies/tech

- chars: 9222
- fields/tokens: `URL, file, href, url, videoUrl`
- hardcoded URLs:
  - `https://${mainUrl}${path}`
  - `https://net-cookie-kacj.vercel.app/api/vlich?url=${encodeURIComponent(cdnInstantLink`

## /api/vega/details

- chars: 4450
- fields/tokens: `URL, downloadLinks, href, src, url`

## /api/vega/nextdrive

- chars: 1532
- fields/tokens: `URL, href, url, vcloudLinks`

## /api/vega

- chars: 1967
- fields/tokens: `href, src, url`

## /api/vega/search

- chars: 2567
- fields/tokens: `href, src, url`

## /api/vid

- chars: 18078
- fields/tokens: `VIDEASY, m3u8, mp4, sources, streams, url, videasy`
- hardcoded URLs:
  - `https://api.videasy.net/1movies/sources-with-title`
  - `https://api.videasy.net/cdn/sources-with-title`
  - `https://api.videasy.net/hdmovie/sources-with-title`
  - `https://api.videasy.net/m4uhd/sources-with-title`
  - `https://api.videasy.net/meine/sources-with-title`
  - `https://api.videasy.net/moviebox/sources-with-title`
  - `https://api.videasy.net/myflixerzupcloud/sources-with-title`
  - `https://api.videasy.net/onionplay/sources-with-title`
  - `https://api.videasy.net/superflix/sources-with-title`
  - `https://api.videasy.net/visioncine/sources-with-title`
  - `https://api2.videasy.net/cuevana-latino/sources-with-title`
  - `https://api2.videasy.net/cuevana-spanish/sources-with-title`
  - `https://api2.videasy.net/overflix/sources-with-title`
  - `https://api2.videasy.net/primewire/sources-with-title`
  - `https://enc-dec.app/api`
  - `https://image.tmdb.org/t/p/w1280${data.backdrop_path}`
  - `https://image.tmdb.org/t/p/w500${data.poster_path}`
  - `https://twilight-cake-defb.hunternisha55.workers.dev/3`
  - `https://videasy.net/`

## /api/zeefliz/details

- chars: 7022
- fields/tokens: `URL, downloadLinks, href, src, url`
- hardcoded URLs:
  - `https://www.youtube.com/watch?v=${trailerDiv.attr(`

## /api/zeefliz/nextdrive

- chars: 3515
- fields/tokens: `URL, href, url, zeeCloudLinks`

## /api/zeefliz

- chars: 2607
- fields/tokens: `href, src, url`

## /api/zeefliz/search

- chars: 3681
- fields/tokens: `href, src, url`

## /api/zinkmovies/details

- chars: 2064
- fields/tokens: `URL, downloadLinks, href, url`

## /api/zinkmovies

- chars: 5927
- fields/tokens: `href, src, url`

## /api/zinkmovies/search

- chars: 3245
- fields/tokens: `href, src, url`

## /api/zinkmovies/zinkcloud

- chars: 2718
- fields/tokens: `File, URL, ZinkCloud, file, href, hubCloudLinks, hubcloud, url, zinkcloud`

