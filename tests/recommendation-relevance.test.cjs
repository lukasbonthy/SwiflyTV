'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
async function ranked(rows,scores,query='a story about space',context={}){
 const messages=[],vectors=new Map(rows.map((r,i)=>[r.title+'. '+(r.genreNames?.length?r.genreNames.join(', ')+'. ':'')+r.overview,[scores[i],Math.sqrt(1-scores[i]**2)]]));let listener;
 const extractor=async input=>({tolist:()=>typeof input==='string'?[[1,0]]:input.map(t=>vectors.get(t)||[0,1])});
 const scope={env:{backends:{onnx:{wasm:{}}}},pipeline:async()=>extractor,fetch:async()=>({ok:true,json:async()=>({topics:[]})}),self:{postMessage:m=>messages.push(m),addEventListener:(_name,fn)=>{listener=fn;}}};
 scope.globalThis=scope;const helper=path.join(__dirname,'../public/discovery/relevance.js');if(fs.existsSync(helper))scope.SwiflyRelevance=require(helper);
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/discovery/model-worker.js'),'utf8').replace(/^import .*;$/gm,''),scope);
 await listener({data:{query,candidates:rows,context}});return messages.find(m=>m.kind==='done')?.results;
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
test('specific matching plot words rescue a good short-query match below the old fixed threshold',async()=>{
 const rows=[{title:'Repeating day',overview:'Two guests are trapped repeating the same day.',source:'topic'},{title:'Unrelated robbery',overview:'A criminal robs a bank.',source:'genre'}];
 const result=await ranked(rows,[.23,.22],'people trapped repeating yesterday');assert.equal(result?.[0]?.title,'Repeating day');assert.equal(result?.length,1);
});
test('a comforting request does not rank a frightening horror story as a comforting recommendation',async()=>{
 const rows=[{title:'A disturbing day',overview:'A family is terrorized by supernatural creatures.',genres:[27],genreNames:['horror']},{title:'An unlikely friendship',overview:'A warm funny uplifting friendship brings joy and kindness.',genres:[35,18],genreNames:['comedy','drama']}];
 const result=await ranked(rows,[.62,.4],'a comforting movie after a really exhausting day');assert.equal(result?.[0]?.title,'An unlikely friendship');assert(!result?.some(r=>r.title==='A disturbing day'));
});
test('verified broad genre requests do not require a plot similarity threshold',async()=>{
 const rows=[{title:'A comedy',overview:'An entertaining story.',genres:[35],genreNames:['comedy']},{title:'Another comedy',overview:'Friends have an unusual day.',genres:[35],genreNames:['comedy']}];
 const result=await ranked(rows,[.16,.17],'a funny movie',{broad:true});assert.equal(result?.length,2);
});
