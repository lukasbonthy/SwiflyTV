/* Free BGE semantic inference, isolated from scrolling/UI. */
import {pipeline,env} from '/assets/vendor/transformers-3.8.1/transformers.min.js';
import './relevance.js?v=2';
import './model-config.js?v=2';
const {rankCandidates,expandQuery,selectStoryTopics}=globalThis.SwiflyRelevance;
const config=globalThis.SwiflyModelConfig;
env.allowLocalModels=true;
env.allowRemoteModels=false;
env.localModelPath='/assets/ai-models/'+config.assetVersion+'/';
env.useBrowserCache=true;
env.backends.onnx.wasm.numThreads=1;
env.backends.onnx.wasm.proxy=false;
env.backends.onnx.wasm.wasmPaths='/assets/vendor/transformers-3.8.1/wasm/';
let extractor=null;
const embeddings=new Map();
const queries=new Map();
let topicVectors=null;
const progress=message=>self.postMessage({kind:'progress',message});
self.addEventListener('message',async event=>{
 try{
  const query=String(event.data?.query||'').slice(0,1600),planning=event.data?.kind==='plan',candidates=Array.isArray(event.data?.candidates)?event.data.candidates.slice(0,80):[],context=event.data?.context||{};
  if(!query||(!planning&&!candidates.length))throw Error('Choose a mood and try again.');
  if(!extractor){progress('Preparing AI search. The first download is about 35 MB; it is saved for next time…');extractor=await pipeline('feature-extraction',config.id,{dtype:config.dtype,device:'wasm',progress_callback:info=>{if(info.status==='progress'&&info.progress&&String(info.file).includes('onnx'))progress(`Downloading the AI model… ${Math.round(info.progress)}%`);}});}
  progress('Understanding your request…');
  const embed=async(text,isQuery=true)=>{const key=(isQuery?'query:':'doc:')+text;if(!queries.has(key))queries.set(key,(await extractor((isQuery?config.queryPrefix:'')+text,{pooling:config.pooling,normalize:true})).tolist()[0]);return queries.get(key);};
  const rankingQuery=String(context.preferenceQuery||query).slice(0,1600);
  const target=await embed(planning?query:expandQuery(rankingQuery));
  const referenceVectors=[];if(!planning)for(const text of (context.referenceQueries||[]).slice(0,2))referenceVectors.push(await embed(String(text).slice(0,1400),false));
  while(queries.size>12)queries.delete(queries.keys().next().value);
  if(planning){
   if(!topicVectors){
    const response=await fetch('/assets/discovery/topic-vectors-'+config.assetVersion+'.json?v='+config.topicsHash);if(!response.ok)throw Error('Search understanding is unavailable. Please try again.');
    const data=await response.json();
    if(data.model!==config.id||data.revision!==config.revision||data.pooling!==config.pooling||data.queryPrefix!==config.queryPrefix||data.dimensions!==config.dimensions||!Array.isArray(data.topics)||!data.topics.length||data.topics.some(t=>!t.id||!Array.isArray(t.vectors)||!t.vectors.length||t.vectors.some(v=>!Array.isArray(v)||v.length!==config.dimensions||v.some(n=>!Number.isFinite(n)))))throw Error('Search understanding needs to refresh. Reload this page and try again.');
    topicVectors=data.topics;
   }
   self.postMessage({kind:'planned',topics:selectStoryTopics(topicVectors,target,config.planning)});return;
  }
  const texts=candidates.map(m=>`${m.title}. ${Array.isArray(m.genreNames)?m.genreNames.join(', ')+'. ':''}${String(m.overview||'').slice(0,1000)}`);
  for(let i=0;i<texts.length;i+=4){const missing=texts.slice(i,i+4).filter(t=>!embeddings.has(t));if(missing.length){const batch=(await extractor(missing,{pooling:config.pooling,normalize:true})).tolist();missing.forEach((t,j)=>embeddings.set(t,batch[j]));}progress(`Matching the stories… ${Math.min(i+4,texts.length)} of ${texts.length}`);}
  const scores=candidates.map((m,i)=>{
   const vector=embeddings.get(texts[i]),similarity=target.reduce((sum,v,j)=>sum+v*vector[j],0);
   if(!referenceVectors.length)return similarity;
   const related=referenceVectors.reduce((sum,ref)=>sum+ref.reduce((s,v,j)=>s+v*vector[j],0),0)/referenceVectors.length;
   return context.preferenceQuery?related*.55+similarity*.45:related;
  });
  const results=rankCandidates(candidates,scores,rankingQuery,{...context,calibration:config.calibration});
  while(embeddings.size>240)embeddings.delete(embeddings.keys().next().value);
  self.postMessage({kind:'done',results});
 }catch(e){self.postMessage({kind:'error',message:e.message||'The recommendation model could not finish. Please try again.'});}
});
