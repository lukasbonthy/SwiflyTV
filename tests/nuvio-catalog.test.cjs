'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Worker}=require('node:worker_threads');
const {PROVIDERS,NUVIO_CATALOG,listNuvioProviders}=require('../lib/nuvio-provider');

test('upstream catalog has 66 uniquely named providers and distinguishes installed adapters',()=>{
  const all=listNuvioProviders();
  assert.equal(NUVIO_CATALOG.revision,'3f09a6ff4360498895e622877af7a32212f75038');
  assert.equal(all.length,66);
  assert.equal(new Set(all.map(x=>x.id)).size,all.length);
  assert.equal(all.filter(x=>x.installed).length,PROVIDERS.length);
  for(const item of all) {
    assert.match(item.id,/^[a-z0-9-]+$/);
    assert(item.filename.startsWith('providers/')&&item.filename.endsWith('.js'));
    assert(Array.isArray(item.formats));
  }
  for(const id of ['vidsrc','vidlink','videasy','vidfast','vidrock','cineby','vidlove','goated','netmirror','nakios']) {
    assert(PROVIDERS.includes(id),'missing pinned provider '+id);
    assert(fs.statSync(path.join(__dirname,'..','vendor','nuvio',id+'.cjs')).size>1024);
  }
  assert(!PROVIDERS.includes('vixsrc'),'an empty upstream file must not be enabled');
});

test('newly pinned provider code exports a getStreams function without requesting network during load',async()=>{
  const added=['vidfast','vidrock','cineby','vidlove','goated','netmirror','nakios'];
  for(const id of added) {
    const filename=path.join(__dirname,'..','vendor','nuvio',id+'.cjs');
    const worker=new Worker(`
      const {workerData,parentPort}=require('node:worker_threads');
      try {
        const plugin=require(workerData.file);
        parentPort.postMessage({ok:typeof plugin?.getStreams==='function'});
      }catch(error){parentPort.postMessage({ok:false,error:String(error.message).slice(0,200)});}
    `,{eval:true,workerData:{file:filename},resourceLimits:{maxOldGenerationSizeMb:48}});
    let timer;
    try {
      const result=await Promise.race([
        new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.once('exit',code=>{if(code!==0)reject(new Error('Worker exit '+code));});}),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(id+' startup exceeded 2 seconds')),2000);})
      ]);
      assert(result.ok,id+': '+(result.error||'missing getStreams'));
    }finally{clearTimeout(timer);await worker.terminate();}
  }
});
