'use strict';
// Keep the API's request validation independent of upstream discovery.
// The manual-server route must never reject valid numeric TMDB IDs.
function serverSelection(input, allowedProviders) {
  const type=String(input?.type||'').toLowerCase();
  const id=String(input?.id||'');
  const season=String(input?.season??'1');
  const episode=String(input?.episode??'1');
  const provider=String(input?.provider||'').trim().toLowerCase();
  const allowed=Array.isArray(allowedProviders)?allowedProviders:[];
  if(!['movie','tv'].includes(type)||!/^[1-9]\d{0,9}$/.test(id)||
     (type==='tv'&&(!/^[1-9]\d{0,3}$/.test(season)||!/^[1-9]\d{0,3}$/.test(episode)))||
     !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(provider)||!allowed.includes(provider))return null;
  return {type,id,season,episode,provider};
}
module.exports={serverSelection};
