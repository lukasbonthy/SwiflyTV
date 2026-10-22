'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
async function ranked(rows,scores){
 const messages=[],vectors=new Map(rows.map((r,i)=>[r.title+'. '+r.overview,[scores[i],Math.sqrt(1-scores[i]**2)]]));let listener;
 const extractor=async input=>({tolist:()=>typeof input==='string'?[[1,0]]:input.map(t=>vectors.get(t)||[0,1])});
 const scope={env:{backends:{onnx:{wasm:{}}}},pipeline:async()=>extractor,fetch:async()=>({ok:true,json:async()=>({topics:[]})}),self:{postMessage:m=>messages.push(m),addEventListener:(_name,fn)=>{listener=fn;}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/discovery/model-worker.js'),'utf8').replace(/^import .*;$/m,''),scope);
 await listener({data:{query:'a story about space',candidates:rows}});return messages.find(m=>m.kind==='done')?.results;
}
test('AI results omit weak unrelated stories instead of padding the grid',async()=>{
 const rows=Array.from({length:14},(_,i)=>({id:String(i),title:'Story '+i,overview:'Plot '+i,source:'genre'}));
 const result=await ranked(rows,[.72,.63,...Array(12).fill(.12)]);assert.deepEqual(Array.from(result||[],m=>m.id),['0','1']);
});
test('AI returns no matches when every candidate is unrelated to the request',async()=>{
 const result=await ranked([{title:'Random story',overview:'A different plot',source:'genre'}],[.12]);assert.equal(result?.length,0);
});
test('related catalog order helps rank equally relevant stories without bypassing relevance',async()=>{
 const rows=[{title:'Obscure distant match',overview:'A related plot',source:'reference',catalogRank:20,rating:7},{title:'Close catalog neighbor',overview:'A related plot',source:'reference',catalogRank:1,rating:8}];
 const result=await ranked(rows,[.58,.56]);assert.equal(result?.[0]?.title,'Close catalog neighbor');
});
