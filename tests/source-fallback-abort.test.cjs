const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8'),start=source.indexOf('async function fetchProxyVideoSourceRaw(')>=0?source.indexOf('async function fetchProxyVideoSourceRaw('):source.indexOf('async function fetchProxyVideoSource(');
const raw=source.slice(start,source.indexOf('const configuredSourceDeadline',start)>=0?source.indexOf('const configuredSourceDeadline',start):source.indexOf('async function fetchMoviePlaceholderSource(',start));
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fixture(fetch){const timers=new Map();let serial=0;const context={AbortController,URL,fetch,fetchApiProviderSource:async()=>({status:'error'}),apiIsYouTubeUrl:()=>false,apiIsAllowedMediaExtensionUrl:()=>true,hlsProxyEnabled:()=>false,registerHlsProxySource:()=>({enabled:false}),process:{env:{MOVIE_PROXY_VIDEO_PROVIDER_BASE_URL:'https://resolver.example/movie',MOVIE_PROXY_VIDEO_FALLBACK_BASE_URLS:'https://fallback.example/movie',MOVIE_PROXY_VIDEO_RETRIES:'1'}},setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id)};vm.runInNewContext(raw+'\nglobalThis.resolveRaw = typeof fetchProxyVideoSourceRaw === "function" ? fetchProxyVideoSourceRaw : fetchProxyVideoSource;',context);return {run:context.resolveRaw,timers};}
test('The legacy resolver keeps its timer active while a response body is pending',async()=>{
 let finishBody;const f=fixture(async()=>({ok:true,text:()=>new Promise(resolve=>finishBody=resolve),json:()=>new Promise(resolve=>finishBody=resolve)}));
 const work=f.run({type:'movie',id:'101'});await flush();assert.equal(f.timers.size,1);
 finishBody('{"ok":true,"stream":{"url":"https://media.example/movie.mp4","type":"mp4"}}');await work;assert.equal(f.timers.size,0);
});
test('Outer cancellation aborts body consumption and starts no next fallback',async()=>{
 const outer=new AbortController();let requests=0,signal;
 const f=fixture(async(_url,options)=>{requests++;signal=options.signal;return {ok:true,text:()=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})),json:()=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))};});
 const observed=f.run({type:'movie',id:'101',signal:outer.signal}).then(value=>({value}),error=>({error}));await flush();const reason=Error('cancelled');outer.abort(reason);await flush();assert.equal(signal.aborted,true);assert.equal(requests,1);assert.equal((await observed).error,reason);assert.equal(f.timers.size,0);
});
test('An already cancelled source job starts no provider or fallback fetch',async()=>{
 let requests=0;const f=fixture(async()=>{requests++;throw Error('must not fetch');}),controller=new AbortController();controller.abort();await assert.rejects(f.run({type:'movie',id:'101',signal:controller.signal}));assert.equal(requests,0);assert.equal(f.timers.size,0);
});
