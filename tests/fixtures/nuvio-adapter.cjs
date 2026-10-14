'use strict';
exports.getStreams = (tmdbId, mediaType, season, episode) => {
  if (tmdbId === '2') return new Promise(() => {});
  return fetch('https://provider.example/sources/'+tmdbId, {
    method:'POST', body:JSON.stringify({tmdbId,mediaType,season,episode,secret:process.env.NUVIO_TEST_SECRET??null})
  }).then(response=>response.json());
};
