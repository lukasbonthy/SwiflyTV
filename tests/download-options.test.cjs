
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {downloadOptionsMarkup}=require('../ui/download-page');
const client=fs.readFileSync(path.join(__dirname,'..','public','clean','download-page.js'),'utf8');
const media='/api/media-file-proxy/7084d5b43df663cd74a870bb/video.mp4';
const media2='/api/media-file-proxy/ab84d5b43df663cd74a870bb/video.mp4';
async function fixture(t,opts,fetcher){
 const html=downloadOptionsMarkup({id:'101',title:'Hope',poster:'https://image.tmdb.org/t/p/w342/poster.jpg',
   backdrop:'https://image.tmdb.org/t/p/w1280/backdrop.jpg',...opts});
 const dom=new JSDOM(html,{url:'https://swiflytv-1.onrender.com/download/'+(opts.type||'movie')+'/101',
   runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 dom.window.fetch=fetcher;
 dom.window.eval(client);
 const done=()=>dom.window.document.querySelector('[data-sv-download-choices]')?.getAttribute('aria-busy')==='false';
 for(let i=0;i<40&&!done();i++)await new Promise(resolve=>setTimeout(resolve,10));
 assert(done(),'Download checks should resolve');
 return dom.window.document;
}
function head(ok,length=1234567){
 return {ok,headers:{get:key=>({['content-disposition']:'attachment; filename="movie.mp4"',
    ['content-type']:'video/mp4',['content-length']:String(length)})[key?.toLowerCase()]||null}};
}
test('Options page lists complete MP4 sources with source, size, quality and real links',async t=>{
 const requests=[];
 const d=await fixture(t,{type:'movie'},async (url,options={})=>{
  const u=new URL(url,'https://swiflytv-1.onrender.com');requests.push({url:u.href,method:options.method});
  if(u.pathname==='/api/download/movie/101')return {ok:false,headers:{get:()=>null}};
  if(u.pathname==='/api/proxy-video-wait/movie/101')return {ok:true,json:async()=>({
    status:'ready',playbackUrl:media,streamQuality:'1080p',streamName:'Cine Src',
    playbackSources:[{playbackUrl:media2,streamQuality:'720p',streamName:'Backup'}]
  })};
  if([media,media2].includes(u.pathname))return head(true);
  throw Error('Unexpected '+u.href);
 });
 assert.equal(d.querySelector('[data-sv-download-count]').textContent,'2');
 const cards=d.querySelectorAll('.svDownloadOption');
 assert.equal(cards.length,2);
 assert.match(cards[0].textContent,/1080p/);
 assert.match(cards[0].textContent,/1\.2 MB/);
 assert.match(cards[1].textContent,/720p/);
 assert.equal(cards[0].querySelector('a.svDownloadOptionAction').getAttribute('href'),
   'https://swiflytv-1.onrender.com'+media+'?download=1');
 assert(requests.some(item=>item.method==='HEAD'&&item.url.includes('download=1')));
});
test('Empty state correctly says no compatible downloads and shows retry',async t=>{
 const d=await fixture(t,{type:'movie'},async (url)=>{
  const u=new URL(url,'https://swiflytv-1.onrender.com');
  if(u.pathname==='/api/download/movie/101')return {ok:false,headers:{get:()=>null}};
  if(u.pathname==='/api/proxy-video-wait/movie/101')return {ok:true,json:async()=>({
    status:'ready',playbackUrl:'/api/hls-proxy/signed/master.m3u8'})};
  throw Error('Unexpected '+u.pathname);
 });
 assert.equal(d.querySelector('[data-sv-download-count]').textContent,'0');
 assert.match(d.querySelector('.svDownloadEmpty strong').textContent,/No downloads available/);
 assert.equal(d.querySelectorAll('a.svDownloadOptionAction').length,0);
 assert.equal(d.querySelector('[data-sv-download-refresh]').hidden,false);
});
test('TV options look up the exact season and episode and escape source labels',async t=>{
 let lookedUp='';
 const d=await fixture(t,{type:'tv',season:2,episode:8,episodeTitle:'After Hours'},async (url)=>{
  const u=new URL(url,'https://swiflytv-1.onrender.com');
  if(u.pathname==='/api/download/tv/101')return {ok:false,headers:{get:()=>null}};
  if(u.pathname==='/api/proxy-video-wait/tv/101'){lookedUp=u.search;return {ok:true,json:async()=>({
    status:'ready',playbackUrl:media,streamQuality:'1080p',streamName:'<img onerror=bad>'})};}
  if(u.pathname===media)return head(true);
  throw Error('Unexpected '+u.pathname);
 });
 assert.match(lookedUp,/season=2/);
 assert.match(lookedUp,/episode=8/);
 assert.match(d.querySelector('.svDownloadEpisodeLabel').textContent,/Season 2.*Episode 8/);
 assert.equal(d.querySelectorAll('.svDownloadOptionBody img').length,0);
 assert.match(d.querySelector('.svDownloadOptionMeta').textContent,/<img onerror=bad>/);
});

test('Download choices use a bounded range probe after a HEAD failure and display total file size',async t=>{
 const requests=[];
 const d=await fixture(t,{type:'movie'},async (url,options={})=>{
  const u=new URL(url,'https://swiflytv-1.onrender.com'),method=options.method||'GET';
  requests.push({path:u.pathname,method,range:options.headers?.Range});
  if(u.pathname==='/api/download/movie/101')return {ok:false,status:404,headers:{get:()=>null}};
  if(u.pathname==='/api/proxy-video-wait/movie/101')return {ok:true,json:async()=>({status:'ready',playbackUrl:media})};
  if(u.pathname===media&&method==='HEAD')return {ok:false,status:405,headers:{get:()=>null}};
  if(u.pathname===media&&method==='GET')return {ok:true,status:206,headers:{get:key=>({
   'content-disposition':'attachment; filename="sample.mp4"','content-type':'video/mp4',
   'content-length':'1','content-range':'bytes 0-0/3670016'
  })[key?.toLowerCase()]||null}};
  throw Error('Unexpected '+url);
 });
 assert.equal(d.querySelectorAll('.svDownloadOption').length,1);
 assert.match(d.querySelector('.svDownloadOptionMeta').textContent,/3\.5 MB/);
 assert(requests.some(r=>r.path===media&&r.method==='GET'&&r.range==='bytes=0-0'));
});

test('the download page discovers verified MP4 downloadUrl even when primary playback is a direct URL',async t=>{
 const actual='/api/media-file-proxy/1234567890abcdef12345678/video.mp4';
 const requests=[];
 const d=await fixture(t,{type:'movie'},async (url,options={})=>{
  const u=new URL(url,'https://swiflytv-1.onrender.com');requests.push(u.pathname);
  if(u.pathname==='/api/download/movie/101')return {ok:false,headers:{get:()=>null}};
  if(u.pathname==='/api/proxy-video-wait/movie/101')return {ok:true,json:async()=>({
   status:'ready',playbackUrl:'https://media.example/movie.mp4',downloadUrl:actual,playbackSources:[
    {playbackUrl:'https://media.example/movie.mp4',downloadUrl:actual,streamQuality:'1080p'}
   ]
  })};
  if(u.pathname===actual)return head(true);
  throw Error('Unexpected request: '+u.href);
 });
 assert.equal(d.querySelectorAll('.svDownloadOption').length,1,'do not duplicate the primary entry');
 assert(d.querySelector('.svDownloadOptionAction').href.endsWith(actual+'?download=1'));
 assert(requests.includes(actual));
});
test('stream-only playback reports an accurate reason instead of appearing stuck or broken',async t=>{
 const d=await fixture(t,{type:'movie'},async url=>{
  const u=new URL(url,'https://swiflytv-1.onrender.com');
  if(u.pathname==='/api/download/movie/101')return {ok:false,headers:{get:()=>null}};
  if(u.pathname==='/api/proxy-video-wait/movie/101')return {ok:true,json:async()=>({
    status:'ready',playbackUrl:'/api/hls-proxy/12345678/master.m3u8'
  })};
  throw Error('Unexpected request '+u.href);
 });
 assert.match(d.querySelector('.svDownloadEmpty').textContent,/HLS\/DASH/);
 assert.equal(d.querySelectorAll('.svDownloadOption').length,0);
});

test('An HLS-only playback winner can find a separately verified MP4 without fabricating a playlist download',async t=>{
 const requests=[];
 const file='/api/media-file-proxy/0123456789abcdef01234567/video.mp4';
 const d=await fixture(t,{type:'movie'},async(url,options={})=>{
   const u=new URL(url,'https://swiflytv-1.onrender.com');requests.push(u.pathname);
   if(u.pathname==='/api/download/movie/101')return {ok:false,status:404,headers:{get:()=>null}};
   if(u.pathname==='/api/proxy-video-wait/movie/101')return {ok:true,json:async()=>({
     status:'ready',playbackUrl:'/api/hls-proxy/01234567/master.m3u8'
   })};
   if(u.pathname==='/api/download-source/movie/101')return {ok:true,json:async()=>({
     status:'ready',downloadUrl:file,streamName:'Verified alternate',streamQuality:'720p'
   })};
   if(u.pathname===file&&options.method==='HEAD')return head(true,10485760);
   throw Error('Unexpected '+url);
 });
 assert.equal(d.querySelectorAll('.svDownloadOption').length,1);
 assert.match(d.querySelector('.svDownloadOption').textContent,/Verified alternate/);
 assert.equal(d.querySelector('.svDownloadOptionAction').href,'https://swiflytv-1.onrender.com'+file+'?download=1');
 assert(requests.includes('/api/download-source/movie/101'));
});
