'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const config=require('../public/discovery/model-config'),cases=require('../tests/fixtures/story-routes.cjs');
async function main(){
 const {pipeline,env}=await import('@huggingface/transformers');env.allowRemoteModels=false;env.localModelPath=path.resolve(__dirname,'../.swifly-models')+'/';
 let listener,loaded;const messages=[],scope={env:{backends:{onnx:{wasm:{}}}},console,URL,Map,Set,SwiflyRelevance:require('../public/discovery/relevance'),SwiflyModelConfig:config,fetch:async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(__dirname,'../public/discovery/topic-vectors-'+config.assetVersion+'.json'),'utf8'))}),self:{postMessage:m=>messages.push(m),addEventListener:(_,fn)=>listener=fn}};scope.globalThis=scope;
 scope.pipeline=async(task,model,options)=>loaded=await pipeline(task,model,{...options,device:'cpu',session_options:{intra_op_num_threads:2,inter_op_num_threads:1}});
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/discovery/model-worker.js'),'utf8').replace(/^import .*;$/gm,''),scope);
 const results=[];for(const c of cases){messages.length=0;await listener({data:{kind:'plan',query:c.query}});const done=messages.find(m=>m.kind==='planned');if(!done)throw Error(JSON.stringify(messages));const hit=done.topics.includes(c.expected);results.push({...c,topics:Array.from(done.topics),hit});console.log((hit?'PASS':'MISS')+' '+c.query+' → '+done.topics.join(', '));}
 await loaded?.dispose();console.log(JSON.stringify({scope:'20 development route checks',passed:results.filter(r=>r.hit).length,total:results.length}));
 if(process.argv.includes('--assert')&&results.some(r=>!r.hit))throw Error('A grounded story route is unreachable.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
