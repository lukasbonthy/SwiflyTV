"use strict";
// Build-time downloads. The server never loads models or runs inference.
const fs=require('node:fs/promises'),path=require('node:path'),axios=require('axios'),crypto=require('node:crypto');
const config=require('../public/discovery/model-config');
const files=['config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','onnx/model_quantized.onnx'];
const models=[config,{id:'Xenova/all-MiniLM-L6-v2',revision:'751bff37182d3f1213fa05d7196b954e230abad9',license:'Apache-2.0'}];
async function prepare(model){
 const root=path.join(__dirname,'..','.swifly-models',model.id),manifest={model:model.id,revision:model.revision,license:model.license,files:{}};
 await fs.mkdir(root,{recursive:true});
 for(const file of files){
  const target=path.join(root,file);let bytes;try{bytes=await fs.readFile(target);}catch{}
  if(bytes&&file.endsWith('.onnx')&&model.weightsSha256&&crypto.createHash('sha256').update(bytes).digest('hex')!==model.weightsSha256)bytes=null;
  if(!bytes){
   for(let attempt=0;attempt<3;attempt++){try{const response=await axios.get(`https://huggingface.co/${model.id}/resolve/${model.revision}/${file}`,{responseType:'arraybuffer',timeout:90000,maxContentLength:40000000,maxBodyLength:40000000});bytes=Buffer.from(response.data);break;}catch(e){if(attempt===2)throw e;}}
   if(file.endsWith('.onnx')&&model.weightsSha256&&crypto.createHash('sha256').update(bytes).digest('hex')!==model.weightsSha256)throw Error('Model checksum mismatch');
   await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target+'.tmp',bytes);await fs.rename(target+'.tmp',target);
  }
  if(file.endsWith('.json'))JSON.parse(bytes.toString());
  manifest.files[file]={bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};console.log('[ai assets]',model.id,file,bytes.length);
 }
 await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));
 await fs.writeFile(path.join(root,'NOTICE.txt'),model.id+'; '+model.license+'; pinned revision '+model.revision+'. https://huggingface.co/'+model.id+'\n');
 await fs.copyFile(model.license==='MIT'?path.join(__dirname,'../public/discovery/licenses/bge-MIT.txt'):path.join(__dirname,'../node_modules/@huggingface/transformers/LICENSE'),path.join(root,'LICENSE.txt'));
}
async function main(){for(const model of models)await prepare(model);}
main().catch(e=>{console.error('[ai assets] preparation failed:',e.message);process.exitCode=1;});
