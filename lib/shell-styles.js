'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');

// Keep the existing cascade, including its boundaries around route-specific
// styles. Compile every variant at startup so any instance can serve a cold
// asset request, without first receiving the corresponding HTML request.
const groups={
 core:['liquid-glass/liquid-glass.css','clean/clean.css','clean/library.css','connect/connect.css','clean/feed.css','clean/catalog-updates.css','clean/details.css','clean/motion.css','vendor/lenis/lenis.css','liquid-glass/surfaces.css','studio/studio.css','clean/usability.css','clean/aurora.css'],
 catalog:['clean/finish.css','clean/polish.css','clean/hero-fade.css','liquid-glass/controls.css','clean/experience.css','clean/cinema.css','clean/profiles.css'],
 player:['clean/hero-fade.css','liquid-glass/controls.css','clean/cinema.css','clean/profiles.css'],
 finish:['clean/performance.css','clean/mobile.css','clean/tv.css','clean/details-premium.css','clean/details-clarity.css','discovery/discovery.css','connect/feature-effects.css','clean/account-sheet.css','studio/experience.css','studio/themes.css','studio/theme-details.css','studio/wallpapers.css','player/tv-controls.css']
};
const assets=new Map(),bundles=new Map(),variants=new Map(),links=new Map();
function stylesheet(file){
 if(assets.has(file))return assets.get(file);
 const css=fs.readFileSync(path.join(__dirname,'../public',file),'utf8');
 // Match a complete quoted URL before considering an unquoted one: embedded
 // SVG data can itself contain parentheses, quotes and url(#filter) text.
 const rebased=css.replace(/url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s)]+))\s*\)/gi,(whole,double,single,bare)=>{
  const value=double??single??bare;
  if(!value||/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(value))return whole;
  const url=new URL(value,'https://styles.invalid/assets/'+file);
  return 'url("'+url.pathname+url.search+url.hash+'")';
 });
 const result='/* '+file+' */\n'+rebased;assets.set(file,result);return result;
}
for(const [name,files]of Object.entries(groups)){
 const css=files.map(stylesheet).join('\n');
 const hash=createHash('sha256').update(css).digest('hex').slice(0,20);
 const href='/assets/shell/'+name+'-'+hash+'.css';
 bundles.set(href,css);variants.set(name,css);links.set(name,'<link rel="stylesheet" href="'+href+'" />');
}
function shellStyleLink(name){
 const link=links.get(name);if(!link)throw new Error('Unknown shell style group: '+name);return link;
}
function readShellStyle(pathname){return bundles.get(pathname);}
function serveShellStyle(req,res,next){
 if(req.method!=='GET'&&req.method!=='HEAD')return next();
 const css=readShellStyle(req.path);
 if(css!==undefined)return res.type('css').set('Cache-Control','public, max-age=31536000, immutable').send(css);
 // Old HTML may reach a new instance during a rolling deploy. Match only
 // known variants and valid hashes; keep the page styled without caching a
 // different release's content under that old immutable URL.
 const previous=req.path.match(/^\/assets\/shell\/(core|catalog|player|finish)-[a-f0-9]{20}\.css$/);
 if(!previous)return next();
 res.type('css').set('Cache-Control','no-store').send(variants.get(previous[1]));
}
module.exports={shellStyleLink,readShellStyle,serveShellStyle};
