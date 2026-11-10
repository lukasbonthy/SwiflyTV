'use strict';

function runtimeConfig(env=process.env){
  const render=Boolean(env.RENDER||env.RENDER_SERVICE_ID);
  return {
    react:env.SWIFLY_REACT!=='false',
    production:render||env.NODE_ENV==='production',
    host:env.HOST||(render?'0.0.0.0':'127.0.0.1'),
    port:env.PORT||(render?'10000':'4173'),
  };
}
module.exports={runtimeConfig};
