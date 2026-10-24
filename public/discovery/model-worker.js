/* Freely available MiniLM semantic inference, isolated from scrolling/UI. */
import {pipeline,env} from '/assets/vendor/transformers-3.8.1/transformers.min.js';
import './relevance.js?v=1';
const {rankCandidates,expandQuery}=globalThis.SwiflyRelevance;
env.allowLocalModels=true;
env.allowRemoteModels=false;
env.localModelPath='/assets/ai-models/v1/';
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
  if(!extractor){progress('Downloading MiniLM AI. Your first request takes a little longer…');extractor=await pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2',{dtype:'q8',device:'wasm',progress_callback:info=>{if(info.status==='progress'&&info.progress&&String(info.file).includes('onnx'))progress(`Downloading the AI model… ${Math.round(info.progress)}%`);}});}
  progress('Understanding your request…');
  const embed=async text=>{if(!queries.has(text))queries.set(text,(await extractor(text,{pooling:'mean',normalize:true})).tolist()[0]);return queries.get(text);};
  const rankingQuery=String(context.preferenceQuery||query).slice(0,1600);
  const target=await embed(planning?query:expandQuery(rankingQuery));
  const referenceVectors=[];if(!planning)for(const text of (context.referenceQueries||[]).slice(0,2))referenceVectors.push(await embed(String(text).slice(0,1400)));
  while(queries.size>12)queries.delete(queries.keys().next().value);
  if(planning){
   if(!topicVectors){const response=await fetch('/assets/discovery/topic-vectors.json?v=1');if(!response.ok)throw Error('Search understanding is unavailable. Please try again.');topicVectors=(await response.json()).topics;}
   const closest=topicVectors.map(t=>({id:t.id,score:t.vector.reduce((sum,v,i)=>sum+v*target[i],0)})).sort((a,b)=>b.score-a.score);
   self.postMessage({kind:'planned',topics:closest[0]?.score>=.38?[closest[0].id]:[]});return;
  }
  const texts=candidates.map(m=>`${m.title}. ${Array.isArray(m.genreNames)?m.genreNames.join(', ')+'. ':''}${String(m.overview||'').slice(0,1000)}`);
  for(let i=0;i<texts.length;i+=4){const missing=texts.slice(i,i+4).filter(t=>!embeddings.has(t));if(missing.length){const batch=(await extractor(missing,{pooling:'mean',normalize:true})).tolist();missing.forEach((t,j)=>embeddings.set(t,batch[j]));}progress(`Matching the stories… ${Math.min(i+4,texts.length)} of ${texts.length}`);}
  const scores=candidates.map((m,i)=>{
   const vector=embeddings.get(texts[i]),similarity=target.reduce((sum,v,j)=>sum+v*vector[j],0);
   if(!referenceVectors.length)return similarity;
   const related=referenceVectors.reduce((sum,ref)=>sum+ref.reduce((s,v,j)=>s+v*vector[j],0),0)/referenceVectors.length;
   return context.preferenceQuery?related*.55+similarity*.45:related;
  });
  const results=rankCandidates(candidates,scores,rankingQuery,context);
  while(embeddings.size>240)embeddings.delete(embeddings.keys().next().value);
  self.postMessage({kind:'done',results});
 }catch(e){self.postMessage({kind:'error',message:e.message||'The recommendation model could not finish. Please try again.'});}
});
