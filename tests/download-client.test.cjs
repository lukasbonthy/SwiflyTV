'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const script=fs.readFileSync(path.join(__dirname,'..','public','clean','download.js'),'utf8');
const proxy='/api/media-file-proxy/7084d5b43df663cd74a870bb/video.mp4';
const attachment={get:name=>name.toLowerCase()==='content-disposition'?'attachment; filename="movie.mp4"':null};
function fixture(t,html,fetcher){
 const dom=new JSDOM(html,{url:'https://swiflytv-1.onrender.com/',runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 const window=dom.window,downloads=[];
 window.fetch=fetcher;
 window.HTMLAnchorElement.prototype.click=function(){downloads.push(this.href);};
 window.eval(script);
 return {window,downloads};
}
async function clickAndDrain(window,selector){
 const link=window.document.querySelector(selector);
 link.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));
 await new Promise(resolve=>setTimeout(resolve,25));
}
test('Movie button resolves a fresh temporary MP4 source and streams its download response',async t=>{
 const requests=[];
 const {window,downloads}=fixture(t,'<a href="/api/download/movie/101" data-sv-download data-sv-download-type="movie">Download</a>',async (url,options={})=>{
  const resource=new URL(url,window.location.href);requests.push({url:resource.pathname+resource.search,method:options.method||'GET'});
  if(resource.pathname==='/api/download/movie/101')return {ok:false,status:404,headers:{get:()=>null}};
  if(resource.pathname==='/api/proxy-video-wait/movie/101')return {ok:true,json:async()=>({status:'ready',playbackUrl:proxy})};
  if(resource.pathname===proxy&&resource.searchParams.get('download')==='1')return {ok:true,headers:attachment};
  throw Error('Unexpected request: '+url);
 });
 await clickAndDrain(window,'a[data-sv-download]');
 assert.deepEqual(downloads,['https://swiflytv-1.onrender.com'+proxy+'?download=1']);
 assert(requests.some(x=>x.url.startsWith('/api/proxy-video-wait/movie/101?')),'A fresh source is requested rather than reusing an expired copied link');
});
test('A loaded episode downloads its own current proxy without another source lookup',async t=>{
 let lookup=0;
 const {window,downloads}=fixture(t,
  '<section class="svPlayerPage" data-player-root data-player-season="2" data-player-episode="8"></section><a href="/api/download/tv/101?s=2&e=8" data-sv-download data-sv-download-type="episode">Download</a>',
  async (url,options={})=>{
   const parsed=new URL(url,window.location.href);
   if(parsed.pathname.includes('proxy-video-wait'))lookup++;
   assert.equal(parsed.pathname,proxy);
   assert.equal(options.method,'HEAD');
   return {ok:true,headers:attachment};
  });
 window.SwiflyPlayer={getState:()=>({mediaId:'101',type:'tv',source:proxy})};
 await clickAndDrain(window,'a[data-sv-download]');
 assert.deepEqual(downloads,['https://swiflytv-1.onrender.com'+proxy+'?download=1']);
 assert.equal(lookup,0);
});
test('HLS streams are not falsely advertised as downloadable MP4 files',async t=>{
 const {window,downloads}=fixture(t,'<a href="/api/download/movie/101" data-sv-download>Download</a>',async (url)=>{
  const path=new URL(url,window.location.href).pathname;
  if(path==='/api/download/movie/101')return {ok:false,status:404,headers:{get:()=>null}};
  if(path==='/api/proxy-video-wait/movie/101')return {ok:true,json:async()=>({status:'ready',playbackUrl:'/api/hls-proxy/id/master.m3u8'})};
  throw Error('Unexpected request');
 });
 await clickAndDrain(window,'a[data-sv-download]');
 assert.equal(downloads.length,0,'The button cannot download an HLS master as a fake MP4');
 assert.match(window.document.querySelector('.svDownloadToast')?.textContent||'',/not currently available/);
});

test('A verified MP4 remains downloadable when its origin rejects HEAD but supports a one-byte GET',async t=>{
 const requests=[];
 const {window,downloads}=fixture(t,'<a href="/api/download/movie/101" data-sv-download>Download</a>',async (url,options={})=>{
  const u=new URL(url,window.location.href),method=options.method||'GET';
  requests.push({path:u.pathname,method,range:options.headers?.Range});
  if(u.pathname==='/api/download/movie/101')return {ok:false,status:404,headers:{get:()=>null}};
  if(u.pathname==='/api/proxy-video-wait/movie/101')return {ok:true,json:async()=>({status:'ready',playbackUrl:proxy})};
  if(u.pathname===proxy&&method==='HEAD')return {ok:false,status:405,headers:{get:()=>null}};
  if(u.pathname===proxy&&method==='GET')return {ok:true,status:206,headers:attachment};
  throw Error('Unexpected request '+url);
 });
 await clickAndDrain(window,'a[data-sv-download]');
 assert.deepEqual(downloads,['https://swiflytv-1.onrender.com'+proxy+'?download=1']);
 assert(requests.some(r=>r.path===proxy&&r.method==='GET'&&r.range==='bytes=0-0'));
});
test('Download lookup tries another MP4 when the first verified source denies attachments',async t=>{
 const backup='/api/media-file-proxy/ab84d5b43df663cd74a870bb/video.mp4';
 const {window,downloads}=fixture(t,'<a href="/api/download/movie/101" data-sv-download>Download</a>',async(url,options={})=>{
  const u=new URL(url,window.location.href),method=options.method||'GET';
  if(u.pathname==='/api/download/movie/101')return {ok:false,status:404,headers:{get:()=>null}};
  if(u.pathname==='/api/proxy-video-wait/movie/101')return {ok:true,json:async()=>({status:'ready',playbackUrl:proxy,playbackSources:[{playbackUrl:backup}]})};
  if(u.pathname===proxy)return {ok:false,status:403,headers:{get:()=>null}};
  if(u.pathname===backup&&method==='HEAD')return {ok:true,status:200,headers:attachment};
  throw Error('Unexpected '+url);
 });
 await clickAndDrain(window,'a[data-sv-download]');
 assert.deepEqual(downloads,['https://swiflytv-1.onrender.com'+backup+'?download=1']);
});
