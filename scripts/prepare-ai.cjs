'use strict';
// Build-time assets only. The server never loads the model or runs inference.
const fs=require('node:fs/promises');const path=require('node:path');const axios=require('axios');const crypto=require('node:crypto');
const revision='751bff37182d3f1213fa05d7196b954e230abad9';
const root=path.join(__dirname,'..','.swifly-models','Xenova','all-MiniLM-L6-v2');
const files=['config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','onnx/model_quantized.onnx'];
async function main(){await fs.mkdir(root,{recursive:true});const manifest={model:'Xenova/all-MiniLM-L6-v2',revision,license:'Apache-2.0',source:'https://huggingface.co/Xenova/all-MiniLM-L6-v2',files:{}};
 for(const file of files){const target=path.join(root,file);let bytes;try{bytes=await fs.readFile(target);}catch{}
  if(!bytes){for(let attempt=0;attempt<3;attempt++){try{const response=await axios.get(`https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/${revision}/${file}`,{responseType:'arraybuffer',timeout:90000,maxContentLength:40000000,maxBodyLength:40000000});bytes=Buffer.from(response.data);break;}catch(e){if(attempt===2)throw e;}}
   await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target+'.tmp',bytes);await fs.rename(target+'.tmp',target);
  }
  if(file.endsWith('.json'))JSON.parse(bytes.toString());manifest.files[file]={bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};console.log('[ai assets]',file,bytes.length);
 }
 await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));await fs.writeFile(path.join(root,'NOTICE.txt'),'MiniLM sentence embeddings: Xenova/all-MiniLM-L6-v2, based on sentence-transformers/all-MiniLM-L6-v2. Apache License 2.0. Model revision '+revision+'. https://www.apache.org/licenses/LICENSE-2.0\n');
 await fs.copyFile(path.join(__dirname,'..','node_modules','@huggingface','transformers','LICENSE'),path.join(root,'LICENSE.txt'));
}
main().catch(e=>{console.error('[ai assets] preparation failed:',e.message);process.exitCode=1;});
