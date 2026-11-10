'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
process.chdir(root);
require('dotenv').config({path:path.join(root,'.env')});
const config=require('./runtime-config.cjs').runtimeConfig();
process.env.SWIFLY_REACT=String(config.react);
process.env.HOST=config.host;
process.env.PORT=config.port;
if(config.react&&!fs.existsSync(path.join(root,'dist/.vite/manifest.json'))){
  if(config.production){
    console.error('React production build is missing. Build it with npm run build before starting the server.');
    process.exit(1);
  }
  console.log('Building the React frontend...');
  const vite=path.join(path.dirname(require.resolve('vite/package.json')),'bin/vite.js');
  const result=spawnSync(process.execPath,[vite,'build','--config','vite.config.mjs'],{stdio:'inherit',cwd:root});
  if(result.status!==0)process.exit(result.status||1);
}
console.log('\nSwiflyTV v173 | '+(config.react?'React + Vite':'Original interface'));
console.log('Open http://'+process.env.HOST+':'+process.env.PORT+'\n');
if(!process.env.TMDB_API_KEY)console.log('Catalog needs TMDB_API_KEY in the server environment or local .env.\n');
require('../server.js');
