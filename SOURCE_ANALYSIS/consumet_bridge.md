# Consumet bridge

Integrated uploaded `api.consumet.org-main.zip` source pattern using server-side `@consumet/extensions`.

Debug: `/api/local/consumet-debug?tmdb=11836&type=movie`

- `anime/9anime` providers=['NineAnime'] methods=['fetchAnimeInfo', 'fetchEpisodeServers', 'fetchEpisodeSources', 'search']
- `anime/anify` providers=['Anify'] methods=['fetchAnimeInfo', 'fetchEpisodeSources', 'search']
- `anime/animefox` providers=['AnimeFox'] methods=['fetchAnimeInfo', 'fetchEpisodeSources', 'search']
- `anime/animepahe` providers=['AnimePahe'] methods=['fetchAnimeInfo', 'fetchEpisodeSources', 'search']
- `anime/anix` providers=['Anix'] methods=['fetchAnimeInfo', 'fetchEpisodeServers', 'fetchEpisodeSources', 'search']
- `anime/bilibili` providers=['Bilibili'] methods=['fetchAnimeInfo', 'fetchEpisodeSources', 'search']
- `anime/crunchyroll` providers=[] methods=['fetchAnimeInfo', 'fetchEpisodeSources', 'search']
- `anime/gogoanime` providers=['Gogoanime'] methods=['fetchAnimeInfo', 'fetchEpisodeServers', 'fetchEpisodeSources', 'fetchRecentMovies', 'fetchTopAiring', 'search']
- `anime/index` providers=[] methods=[]
- `anime/marin` providers=['Marin'] methods=['fetchAnimeInfo', 'fetchEpisodeSources', 'search']
- `anime/zoro` providers=['Zoro'] methods=['fetchAnimeInfo', 'fetchEpisodeSources', 'fetchTopAiring', 'search']
- `meta/anilist-manga` providers=['Anilist', 'Anilist', 'Anilist', 'Anilist', 'Anilist'] methods=['search']
- `meta/anilist` providers=['Anilist', 'Anilist', 'NineAnime', 'Anilist'] methods=['fetchAnimeInfo', 'fetchEpisodeServers', 'fetchEpisodeSources', 'fetchTrending', 'search']
- `meta/index` providers=[] methods=[]
- `meta/mal` providers=['Myanimelist', 'Myanimelist', 'Myanimelist', 'Myanimelist', 'Myanimelist'] methods=['fetchAnimeInfo', 'fetchEpisodeSources', 'search']
- `meta/tmdb` providers=['TMDB', 'TMDB', 'TMDB', 'TMDB', 'TMDB', 'TMDB'] methods=['fetchEpisodeSources', 'fetchMediaInfo', 'fetchTrending', 'search']
- `movies/dramacool` providers=['DramaCool'] methods=['fetchEpisodeSources', 'fetchMediaInfo', 'fetchRecentMovies', 'fetchRecentTvShows', 'search']
- `movies/flixhq` providers=['FlixHQ'] methods=['fetchEpisodeServers', 'fetchEpisodeSources', 'fetchMediaInfo', 'fetchRecentMovies', 'fetchRecentTvShows', 'fetchTrending', 'search']
- `movies/fmovies` providers=['Fmovies'] methods=['fetchEpisodeSources', 'fetchMediaInfo', 'search']
- `movies/goku` providers=['Goku'] methods=['fetchEpisodeServers', 'fetchEpisodeSources', 'fetchMediaInfo', 'fetchRecentMovies', 'fetchRecentTvShows', 'fetchTrending', 'search']
- `movies/index` providers=[] methods=[]
- `movies/movieshd` providers=['MovieHdWatch'] methods=['fetchEpisodeServers', 'fetchEpisodeSources', 'fetchMediaInfo', 'fetchRecentMovies', 'fetchRecentTvShows', 'fetchTrending', 'search']
- `movies/sflix` providers=['SFlix'] methods=['fetchEpisodeServers', 'fetchEpisodeSources', 'fetchMediaInfo', 'fetchRecentMovies', 'fetchRecentTvShows', 'fetchTrending', 'search']
- `movies/viewasian` providers=['ViewAsian'] methods=['fetchEpisodeSources', 'fetchMediaInfo', 'search']
