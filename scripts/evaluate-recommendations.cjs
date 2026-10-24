'use strict';
// Repeatable real-q8-model ranking evaluation against a fixed authored corpus.
// It measures candidate ranking, not live TMDB coverage or streaming availability.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {rows,cases,challenge}=require('../tests/fixtures/recommendation-quality.cjs');
const {hard,negative}=require('../tests/fixtures/recommendation-hard.cjs');
const config=require('../public/discovery/model-config');
async function main(){
 const {pipeline,env}=await import('@huggingface/transformers');
 env.allowRemoteModels=false;env.localModelPath=path.resolve(__dirname,'../.swifly-models')+'/';
 let listener,loaded;const messages=[];
 const scope={env:{backends:{onnx:{wasm:{}}}},console,URL,Map,Set,fetch:async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(__dirname,'../public/discovery/'+String(url).split('/').pop().split('?')[0]),'utf8'))}),self:{postMessage:m=>messages.push(m),addEventListener:(_,fn)=>listener=fn}};
 scope.globalThis=scope;scope.SwiflyModelConfig=config;
 const helper=path.join(__dirname,'../public/discovery/relevance.js');if(fs.existsSync(helper))scope.SwiflyRelevance=require(helper);
 scope.pipeline=async(task,model,options)=>loaded=await pipeline(task,model,{...options,device:'cpu',session_options:{intra_op_num_threads:2,inter_op_num_threads:1}});
 const refIndex=process.argv.indexOf('--ref'),ref=refIndex>=0?process.argv[refIndex+1]:'';
 if(ref&&!/^[a-f0-9]{7,40}$/.test(ref))throw Error('Use a commit SHA for --ref');
 const source=ref?require('node:child_process').execFileSync('git',['show',ref+':public/discovery/model-worker.js'],{encoding:'utf8'}):fs.readFileSync(path.join(__dirname,'../public/discovery/model-worker.js'),'utf8');
 if(ref)scope.SwiflyRelevance=require('node:vm').runInNewContext(require('node:child_process').execFileSync('git',['show',ref+':public/discovery/relevance.js'],{encoding:'utf8'})+';module.exports',{module:{exports:{}}});
 vm.runInNewContext(source.replace(/^import .*;$/gm,''),scope);
 const genres=require('../lib/recommendation-query');
 const candidates=rows.map(r=>({...r,genreNames:genres.genreNames(r.genres,r.type)}));
 const results=[];const start=Date.now();
 for(const c of [...cases,...(process.argv.includes('--challenge')?challenge:[]),...(process.argv.includes('--hard')?hard:[]),...(process.argv.includes('--negative')?negative:[])]){messages.length=0;await listener({data:{kind:'rank',query:c.query,candidates}});const done=messages.find(m=>m.kind==='done');if(!done)throw Error(JSON.stringify(messages));const titles=Array.from(done.results,m=>m.title),hit=c.expected.length?c.expected.some(t=>titles.slice(0,3).includes(t)):titles.length===0;results.push({query:c.query,expected:c.expected,top3:titles.slice(0,3),returned:titles.length,hit});console.log((hit?'PASS':'MISS')+' '+c.query+' → '+titles.slice(0,3).join(' | '));}
 const report={model:(ref?'Xenova/all-MiniLM-L6-v2':config.id)+' q8 (real CPU inference)',scope:'Ranking only, '+rows.length+' authored title descriptions; no live catalog claim',queries:results.filter(r=>r.expected.length).length,top1Hits:results.filter(r=>r.expected.includes(r.top3[0])).length,top3Hits:results.filter(r=>r.expected.length&&r.hit).length,negativeQueries:results.filter(r=>!r.expected.length).length,correctAbstentions:results.filter(r=>!r.expected.length&&r.hit).length,seconds:Math.round((Date.now()-start)/100)/10,results};
 const output=process.argv.slice(2).find((arg,i,args)=>!arg.startsWith('--')&&args[i-1]!=='--ref');
 if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({queries:report.queries,top1Hits:report.top1Hits,top3Hits:report.top3Hits,seconds:report.seconds,negativeQueries:report.negativeQueries,correctAbstentions:report.correctAbstentions}));await loaded?.dispose();
 if(process.argv.includes('--assert')&&(report.top1Hits/report.queries<.9||report.top3Hits/report.queries<.96||(report.negativeQueries&&report.correctAbstentions/report.negativeQueries<.5)))throw Error('Recommendation quality fell below the fixed evaluation floor.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
