# StreamProvider m3u8 port

Ported the uploaded StreamProvider-main direct provider behavior into server.js:

- Hexa: `https://hexa.su/watch/movie/{tmdb}` / `https://hexa.su/watch/tv/{tmdb}/{season}/{episode}`
- Cinezo: `https://www.cinezo.net/watch/movie/{tmdb}` / `https://www.cinezo.net/watch/tv/{tmdb}?season={season}&episode={episode}`
- SFlix movie fallback: TMDB title -> search -> watch page -> network .m3u8 capture

Only `.m3u8` requests are accepted.
