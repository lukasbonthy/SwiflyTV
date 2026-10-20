'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const express=require('express');
const {createDownloadRouter,fileStem}=require('../lib/downloads');

test('Only explicit movie and numbered episodes map to local media paths',()=>{
 assert.equal(fileStem('movie','101'),'movie/101');
 assert.equal(fileStem('tv','101',2,8),path.join('tv','101','S02E08'));
 assert.equal(fileStem('tv','101',2,''),'');
 for(const id of ['../../etc/passwd','-1','0','one','123/1'])assert.equal(fileStem('movie',id),'');
 assert.equal(fileStem('tv','101','../../evil',8),'');
});
test('Licensed movie/episode files download with real bytes and attachments; unavailable titles return 404',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'swifly-download-'));
 const outside=fs.mkdtempSync(path.join(os.tmpdir(),'swifly-outside-'));
 const app=express();app.use('/api/download',createDownloadRouter({root}));
 const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
 const base='http://127.0.0.1:'+server.address().port+'/api/download';
 try {
  fs.mkdirSync(path.join(root,'movie'),{recursive:true});
  fs.mkdirSync(path.join(root,'tv','101'),{recursive:true});
  fs.writeFileSync(path.join(root,'movie','101.mp4'),Buffer.from('authorized-movie-test'));
  fs.writeFileSync(path.join(root,'tv','101','S01E03.mp4'),Buffer.from('authorized-episode-test'));
  const head=await fetch(base+'/movie/101',{method:'HEAD'});
  assert.equal(head.status,200);assert.match(head.headers.get('content-disposition')||'',/attachment/);
  const movie=await fetch(base+'/movie/101');assert.equal(movie.status,200);
  assert.equal(await movie.text(),'authorized-movie-test');
  assert.match(movie.headers.get('content-disposition')||'',/movie-101.mp4/);
  const episode=await fetch(base+'/tv/101?s=1&e=3');assert.equal(await episode.text(),'authorized-episode-test');
  const missing=await fetch(base+'/tv/101?s=1&e=4',{method:'HEAD'});assert.equal(missing.status,404);
  const invalid=await fetch(base+'/movie/%2e%2e%2fsecret');assert.equal(invalid.status,404);
  fs.writeFileSync(path.join(outside,'stolen.mp4'),'outside-data');
  try{fs.symlinkSync(path.join(outside,'stolen.mp4'),path.join(root,'movie','102.mp4'));}catch{}
  const escape=await fetch(base+'/movie/102');assert.equal(escape.status,404,'Never follow an in-root symlink to files outside the licensed directory');
 }finally{server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});fs.rmSync(outside,{recursive:true,force:true});}
});
