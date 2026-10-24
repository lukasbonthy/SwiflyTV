"use strict";
// Regenerate versioned vectors without invalidating already open v1 pages.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const config=require('../public/discovery/model-config');
async function main(){
 const {pipeline,env}=await import('@huggingface/transformers'),root=path.resolve(__dirname,'..');
 env.allowRemoteModels=false;env.localModelPath=path.join(root,'.swifly-models/');
 const raw=await fs.readFile(path.join(root,'public/discovery/topics.json'),'utf8'),catalogHash=crypto.createHash('sha256').update(raw).digest('hex');
 const topics=JSON.parse(raw),extractor=await pipeline('feature-extraction',config.id,{dtype:config.dtype,device:'cpu',session_options:{intra_op_num_threads:2,inter_op_num_threads:1}});
 const rows=[];
 for(const topic of topics){
  const texts=[topic.description,...(topic.examples||[])],vectors=[];
  // q8 padding changes unrelated row embeddings: encode documents singly.
  for(const text of texts)vectors.push((await extractor(text,{pooling:config.pooling,normalize:true})).tolist()[0].map(v=>Math.round(v*100000)/100000));
  rows.push({id:topic.id,vectors});
 }
 const payload=JSON.stringify({model:config.id,revision:config.revision,pooling:config.pooling,queryPrefix:config.queryPrefix,dimensions:config.dimensions,catalogHash,topics:rows})+'\n';
 await fs.writeFile(path.join(root,'public/discovery/topic-vectors-'+config.assetVersion+'.json'),payload);
 const hash=crypto.createHash('sha256').update(payload).digest('hex').slice(0,16),file=path.join(root,'public/discovery/model-config.js');
 await fs.writeFile(file,(await fs.readFile(file,'utf8')).replace(/topicsHash:'[^']*'/,"topicsHash:'"+hash+"'"));
 await extractor.dispose();console.log('Built '+topics.length+' story routes; '+rows.reduce((n,r)=>n+r.vectors.length,0)+' vectors; '+hash);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
