# Authorized SwiflyTV downloads

The movie, details, and episode interfaces now provide download actions. These
actions use **real attachment responses** for MP4/M4V/WEBM/MKV media that the
site operator has explicitly provided and is allowed to distribute. They do
not download VidSrc/VidLink/StreamProvider embeds, HLS fragments, or arbitrary
third-party links.

## Configuration

1. On the server, create a persistent directory for files you own or have
   permission to distribute.
2. Set `SWIFLY_DOWNLOAD_ROOT` to its absolute path.
3. Place authorized media in the following exact locations:

```text
<SWIFLY_DOWNLOAD_ROOT>/
  movie/
    101.mp4
    202.webm
  tv/
    101/
      S01E01.mp4
      S01E02.mp4
      S02E01.mkv
```

Numbers are TMDB title IDs, and episode files are grouped by season and
episode. Supported file extensions are `.mp4`, `.m4v`, `.webm`, `.mkv`.
The player and details panels show download links for movies and each listed
episode. On selection, they check availability with HEAD, then request a
Content-Disposition attachment without buffering the entire video in JS.

The downloads API inherits SwiflyTV's friends-only site gate when enabled.
Requests cannot select URLs or arbitrary filesystem paths. Files outside the
configured directory, including symlinks, cannot be downloaded.

A fresh Render instance has no licensed video files by default. Configure
persistent storage for files before expecting a title to download. Missing
files show an informative unavailable message rather than a broken stream.

Some browsers on consoles restrict saving files to local storage; desktop
browser download behavior should be verified separately.

## Downloading from existing MP4 playback sources

When a player already has a current MP4 proxy URL, the player Download action
uses that source with `?download=1`. Other movie/episode actions request the
matching source using `/api/proxy-video-wait/:type/:id`, and only show a
completed-file download when the resulting source is the existing same-origin
`/api/media-file-proxy/.../video.mp4` route. The proxy streams the file
without reading it all into memory and sets `Content-Disposition: attachment`.

Proxy IDs are ephemeral and expire; copied URLs are **not** permanent catalog
links. Some providers supply only HLS/DASH or restricted content, in which
case no MP4 download is offered. Browser and source terms still apply.
