'use strict';
// Rebuild only when topics.json or the shipped MiniLM model changes.
const fs = require('node:fs/promises');
const path = require('node:path');
async function main() {
 const {pipeline, env} = await import('@huggingface/transformers');
 const root = path.resolve(__dirname, '..');
 env.allowRemoteModels = false;
 env.localModelPath = path.join(root, '.swifly-models/');
 const topics = JSON.parse(await fs.readFile(path.join(root, 'public/discovery/topics.json'), 'utf8'));
 const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {dtype:'q8'});
 const vectors = (await extractor(topics.map(t=>t.description), {pooling:'mean',normalize:true})).tolist();
 await fs.writeFile(path.join(root, 'public/discovery/topic-vectors.json'), JSON.stringify({model:'Xenova/all-MiniLM-L6-v2',topics:topics.map((t,i)=>({id:t.id,vector:vectors[i].map(v=>Math.round(v*100000)/100000)}))})+'\n');
 await extractor.dispose();
 console.log('Built semantic catalog routes for '+topics.length+' story topics.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
