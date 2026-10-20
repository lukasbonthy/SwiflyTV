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
