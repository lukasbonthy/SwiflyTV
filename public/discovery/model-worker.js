/* Freely available MiniLM semantic inference, isolated from scrolling/UI. */
import {pipeline,env} from '/assets/vendor/transformers-3.8.1/transformers.min.js';
env.allowLocalModels=true;
env.allowRemoteModels=false;
env.localModelPath='/assets/ai-models/v1/';
env.useBrowserCache=true;
env.backends.onnx.wasm.numThreads=1;
env.backends.onnx.wasm.proxy=false;
env.backends.onnx.wasm.wasmPaths='/assets/vendor/transformers-3.8.1/wasm/';
let extractor=null;
const embeddings=new Map();
const progress=message=>self.postMessage({kind:'progress',message});
self.addEventListener('message',async event=>{
 try{
  const query=String(event.data?.query||'').slice(0,1600),candidates=Array.isArray(event.data?.candidates)?event.data.candidates.slice(0,80):[];
  if(!query||!candidates.length)throw Error('Choose a mood and try again.');
  if(!extractor){progress('Downloading MiniLM AI. Your first request takes a little longer…');extractor=await pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2',{dtype:'q8',device:'wasm',progress_callback:info=>{if(info.status==='progress'&&info.progress&&String(info.file).includes('onnx'))progress(`Downloading the AI model… ${Math.round(info.progress)}%`);}});}
  progress('Understanding the mood…');const target=(await extractor(query,{pooling:'mean',normalize:true})).tolist()[0];
  const texts=candidates.map(m=>`${m.title}. ${String(m.overview||'').slice(0,1000)}`);
  for(let i=0;i<texts.length;i+=4){const missing=texts.slice(i,i+4).filter(t=>!embeddings.has(t));if(missing.length){const batch=(await extractor(missing,{pooling:'mean',normalize:true})).tolist();missing.forEach((t,j)=>embeddings.set(t,batch[j]));}progress(`Matching the stories… ${Math.min(i+4,texts.length)} of ${texts.length}`);}
  const results=candidates.map((m,i)=>({...m,score:embeddings.get(texts[i]).reduce((sum,v,j)=>sum+v*target[j],0)})).sort((a,b)=>b.score-a.score).slice(0,12);
  while(embeddings.size>240)embeddings.delete(embeddings.keys().next().value);
  self.postMessage({kind:'done',results});
 }catch(e){self.postMessage({kind:'error',message:e.message||'The recommendation model could not finish. Please try again.'});}
});
