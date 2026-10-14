'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const pending=new Map();let serial=0;

// The parent owns all network I/O, its address policy, and request cancellation.
globalThis.fetch=(input,options={})=>new Promise((resolve,reject)=> {
  const id=++serial,signal=options.signal;
  const abort=()=>{pending.delete(id);parentPort.postMessage({kind:'cancel',id});reject(signal.reason||new Error('Request aborted'));};
  if(signal?.aborted)return abort();
  signal?.addEventListener('abort',abort,{once:true});
  pending.set(id,{resolve,reject,cleanup:()=>signal?.removeEventListener('abort',abort)});
  parentPort.postMessage({kind:'fetch',id,url:String(input?.url||input),options:{method:options.method||'GET',headers:Object.fromEntries(new Headers(options.headers)),body:options.body==null?null:String(options.body),redirect:options.redirect||'follow'}});
});
parentPort.on('message',message=> {
  const task=pending.get(message.id);if(!task)return;
  pending.delete(message.id);task.cleanup();
  if(message.error)return task.reject(new Error('Upstream request failed'));
  const response=new Response([204,205,304].includes(message.status)?null:message.body,{status:message.status,headers:message.headers});
  Object.defineProperty(response,'url',{value:message.url});task.resolve(response);
});
Promise.resolve().then(()=> {
  const adapter=require(workerData.adapterPath);
  return adapter.getStreams(workerData.tmdbId,workerData.mediaType,workerData.season,workerData.episode);
}).then(streams=>parentPort.postMessage({kind:'result',streams:Array.isArray(streams)?streams.slice(0,24):[]}),()=>parentPort.postMessage({kind:'failed'}));
