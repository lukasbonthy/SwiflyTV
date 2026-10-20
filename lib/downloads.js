'use strict';
// Download only media files explicitly placed in an operator-controlled
// directory. Streaming embeds, third-party URLs and proxy sessions are never
// converted into downloads; the site must have distribution rights to a file.
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const formats = ['.mp4','.m4v','.webm','.mkv'];
function fileStem(type,id,season,episode) {
  if (!/^[1-9][0-9]{0,11}$/.test(String(id))) return '';
  if (type === 'movie') return path.join('movie',String(id));
  if (type !== 'tv' || !/^[1-9][0-9]{0,3}$/.test(String(season)) ||
      !/^[1-9][0-9]{0,3}$/.test(String(episode))) return '';
  return path.join('tv',String(id),'S'+String(season).padStart(2,'0')+'E'+String(episode).padStart(2,'0'));
}
function createDownloadRouter({root=process.env.SWIFLY_DOWNLOAD_ROOT}={}) {
  const router=express.Router();
  async function locate(req) {
    const stem=fileStem(req.params.type,req.params.id,req.query.s,req.query.e);
    if(!stem||!root)return null;
    let dir;
    try {dir=await fs.promises.realpath(path.resolve(root));}
    catch{return null;}
    for(const ext of formats) {
      const expected=path.join(dir,stem+ext);
      try {
        const file=await fs.promises.realpath(expected);
        const relative=path.relative(dir,file);
        if(!relative||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))continue;
        const stat=await fs.promises.stat(file);
        if(stat.isFile())return {file,ext,stem};
      } catch {}
    }
    return null;
  }
  router.all('/:type/:id', async (req,res) => {
    if(!['GET','HEAD'].includes(req.method))return res.status(405).end();
    if(!['movie','tv'].includes(req.params.type))return res.status(404).end();
    const found=await locate(req);
    res.set('Cache-Control','private, no-store');
    res.set('X-Content-Type-Options','nosniff');
    if(!found)return res.status(404).json({error:'download_unavailable',message:'No licensed download file is available for this title.'});
    const name=found.stem.replace(/[\\/]/g,'-')+found.ext;
    // HEAD lets the front end check availability without buffering the media.
    if(req.method==='HEAD')return res.status(200).set('Content-Disposition','attachment; filename="'+name+'"').end();
    return res.download(found.file,name,{dotfiles:'deny'},error=>{
      if(error && !res.headersSent)res.status(error.status||500).json({error:'download_failed'});
    });
  });
  return router;
}
module.exports={createDownloadRouter,fileStem};
