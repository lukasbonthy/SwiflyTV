'use strict';
const express=require('express');const cheerio=require('cheerio');
const rateLimit=require('express-rate-limit');
const {parseRecommendationQuery,genreIds,matchesConstraints,genreNames,normalize,genreDefinitions}=require('./recommendation-query');
const {matchesTitle,closestTitles}=require('./recommendation-title');
const storyTopics=require('../public/discovery/topics.json');
const fail=(status,message)=>Object.assign(Error(message),{status});
const plain=value=>{const text=String(value||'').slice(0,20000);return cheerio.load(text).text().replace(/\s+/g,' ').trim();};
function catalogUrl(value){try{const url=new URL(String(value||''));if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port||!(/(^|\.)archive\.org$/.test(url.hostname)||url.hostname==='librivox.org'))return '';url.protocol='https:';return url.href;}catch{return '';}}
function bookRow(b,detail=false){
 if(!/^\d{1,10}$/.test(String(b?.id||''))||!b.title)return null;
 const authors=Array.isArray(b.authors)?b.authors:[],sections=Array.isArray(b.sections)?b.sections:[];
 let poster=catalogUrl(b.coverart_thumbnail)||catalogUrl(b.coverart_jpg);
 if(!poster){try{const source=new URL(catalogUrl(b.url_iarchive));const id=/^\/details\/([a-zA-Z0-9._-]{1,150})\/?$/.exec(source.pathname)?.[1];if((source.hostname==='archive.org'||source.hostname==='www.archive.org')&&id)poster='https://archive.org/services/img/'+id;}catch{}}
 return {id:String(b.id),type:'book',title:plain(b.title).slice(0,200),author:authors.map(a=>[a.first_name,a.last_name].filter(Boolean).join(' ')).join(', ').slice(0,240)||'LibriVox volunteers',language:String(b.language||''),description:plain(b.description).slice(0,5000),duration:String(b.totaltime||''),poster,href:'/audiobooks?book='+b.id,
  ...(detail?{chapters:sections.slice(0,500).filter(s=>catalogUrl(s.listen_url)).map((s,i)=>({id:String(s.id||i+1),number:Number(s.section_number)||i+1,title:plain(s.title||'Chapter '+(i+1)),url:catalogUrl(s.listen_url),duration:Math.max(0,Number(s.playtime)||0)})).sort((a,b)=>a.number-b.number)}:{})};
}
function screenRow(v,fallback='movie'){
 const type=v?.media_type||fallback;if(!['movie','tv','person'].includes(type)||v?.adult||!Number.isSafeInteger(Number(v?.id))||Number(v.id)<1)return null;
 const title=v.title||v.name;if(!title)return null;
 const poster=v.poster_path||v.profile_path;
 return {id:String(v.id),type,title:String(title).slice(0,200),aliases:[v.original_title,v.original_name].filter(n=>typeof n==='string').map(n=>n.slice(0,200)),year:String(v.release_date||v.first_air_date||'').slice(0,4),overview:String(v.overview||'').slice(0,1800),poster:typeof poster==='string'&&/^\/[A-Za-z0-9_.-]+$/.test(poster)?'https://image.tmdb.org/t/p/w342'+poster:'',href:'/'+(type==='person'?'person':type)+'/'+v.id,rating:Number(v.vote_average)||0,votes:Math.max(0,Number(v.vote_count)||0),language:String(v.original_language||''),runtime:Math.max(0,Number(v.runtime)||0),genres:Array.isArray(v.genre_ids)?v.genre_ids:[]};
}
function createDiscovery({tmdb,fetch:fetcher=global.fetch,now=Date.now,metadataTimeoutMs=6000}={}){
 const router=express.Router(),cache=new Map(),pending=new Map();
 router.use(rateLimit({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false,message:{message:'Give the catalog a moment, then try again.'}}));
 async function cached(key,fn,ttl=300000){const hit=cache.get(key);if(hit&&now()-hit.at<ttl)return hit.value;if(pending.has(key))return pending.get(key);const job=Promise.resolve().then(fn).then(value=>{cache.delete(key);cache.set(key,{value,at:now()});if(cache.size>180)cache.delete(cache.keys().next().value);return value;}).finally(()=>pending.delete(key));pending.set(key,job);return job;}
 async function json(url){const response=await fetcher(url,{signal:AbortSignal.timeout(12000),headers:{Accept:'application/json','User-Agent':'SwiflyTV/2.0 (LibriVox audiobook catalog)'}});if(!response.ok)throw fail(503,'The audiobook catalog is busy. Please try again shortly.');if(Number(response.headers?.get?.('content-length'))>6000000)throw fail(502,'The catalog response was too large. Please try another title.');return response.json();}
 async function books(q='',page=1,id=''){
  const params=new URLSearchParams({format:'json',extended:'1',coverart:'1',limit:id?'1':'24',...(id?{id}:{sort_order:'desc',offset:String((page-1)*24),...(q?{title:q}:{})})});
  return cached('books:'+params,async()=>{const data=await json('https://librivox.org/api/feed/audiobooks/?'+params);if(!Array.isArray(data.books))throw fail(502,'The audiobook catalog returned an unreadable response. Please try again.');return data.books.map(b=>bookRow(b,!!id)).filter(Boolean);},id?3600000:600000);
 }
 async function filterTvExclusions(candidates,query){
  const unsupportedTvExclusions=query.unwanted.filter(g=>!g[3]);
  const unsupportedTvPreferences=query.wanted.filter(g=>!g[3]);
  if(unsupportedTvExclusions.length||unsupportedTvPreferences.length){
   // TV has no horror/romance/thriller genre IDs. Read series keyword metadata
   // instead of dropping the preference or excluding every sci-fi/fantasy show.
   const shows=candidates.filter(row=>row.type==='tv').slice(0,24),verified=new Map(),controller=new AbortController();let cursor=0,unavailable=0;
   const deadline=setTimeout(()=>controller.abort(),Math.max(10,Math.min(6000,metadataTimeoutMs)));
   const budget=new Promise((resolve,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('metadata timeout')),{once:true}));
   const inspect=async()=>{while(cursor<shows.length){const row=shows[cursor++];if(query.either&&!unsupportedTvExclusions.length&&genreIds(query.wanted,'tv').some(id=>row.genres.includes(id))){verified.set(row.id,row);continue;}if(controller.signal.aborted){unavailable++;continue;}try{
    const data=await Promise.race([cached('series-keywords:'+row.id,async()=>{const value=await Promise.race([tmdb('/tv/'+row.id+'/keywords',{},undefined,controller.signal),budget]);if(value.__error||!Array.isArray(value.results))throw Error('keywords unavailable');return value;},3600000),budget]);
    const tags=data.results.map(v=>String(v.name||'')).join(', '),matches=g=>g[1].test(tags)||g[1].test(row.overview);
    const tvGenreMatches=unsupportedTvPreferences.filter(matches).map(g=>g[0]),checked={...row,tvGenreMatches,genreNames:[...new Set([...(row.genreNames||[]),...tvGenreMatches])]};
    if(!unsupportedTvExclusions.some(matches)&&matchesConstraints(checked,query))verified.set(row.id,checked);
   }catch{unavailable++;}}};
   try{await Promise.all(Array.from({length:Math.min(4,shows.length)},()=>inspect()));}finally{clearTimeout(deadline);}
   candidates=candidates.map(row=>row.type!=='tv'?row:verified.get(row.id)).filter(Boolean);
   if(!candidates.length&&unavailable)throw fail(503,'We could not verify your genre preferences for these series. Please try again.');
  }
  return candidates;
 }
 async function filterRuntime(candidates,query){
  if(!query.runtimeMax)return candidates;
  const rows=candidates.slice(0,32),kept=new Map(),controller=new AbortController();let cursor=0,unavailable=0;
  const timer=setTimeout(()=>controller.abort(),Math.max(10,Math.min(6000,metadataTimeoutMs)));
  const budget=new Promise((resolve,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('runtime timeout')),{once:true}));
  async function inspect(){while(cursor<rows.length){let row=rows[cursor++];try{
   if(!row.runtime){const data=await Promise.race([cached('runtime:'+row.type+':'+row.id,async()=>{const value=await Promise.race([tmdb('/'+row.type+'/'+row.id,{},undefined,controller.signal),budget]);if(!value||value.__error)throw Error('runtime unavailable');const minutes=row.type==='tv'?(value.episode_run_time?.[0]||value.last_episode_to_air?.runtime):value.runtime;if(!(Number(minutes)>0))throw Error('runtime unavailable');return Number(minutes);},3600000),budget]);row={...row,runtime:data};}
   if(matchesConstraints(row,query,{allowUnknownTvGenres:true}))kept.set(row.type+':'+row.id,row);
  }catch{unavailable++;}}}
  try{await Promise.all(Array.from({length:Math.min(4,rows.length)},inspect));}finally{clearTimeout(timer);}
  if(!kept.size&&unavailable)throw fail(503,'We could not verify the running time. Please try again or remove the time limit.');
  return rows.map(r=>kept.get(r.type+':'+r.id)).filter(Boolean);
 }
 async function personCredits(preference){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(10,Math.min(6000,metadataTimeoutMs)));
  const budget=new Promise((resolve,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('person timeout')),{once:true}));
  const request=(key,path,params={})=>Promise.race([cached(key,async()=>{const value=await Promise.race([tmdb(path,params,undefined,controller.signal),budget]);if(!value||value.__error)throw Error('person unavailable');return value;},3600000),budget]);
  try{
   const found=await request('person-search:'+normalize(preference.name),'/search/person',{query:preference.name,include_adult:'false'});
   if(!Array.isArray(found.results))throw Error('person unavailable');
   let people=found.results.filter(p=>!p.adult&&Number.isSafeInteger(Number(p.id))&&Number(p.id)>0&&normalize(p.name)===normalize(preference.name));
   if(people.length>1){
    // TMDB can have sparse duplicate names even for Christopher Nolan. Prefer
    // a uniquely established record; never just take the first search result.
    const established=people.filter(p=>Array.isArray(p.known_for)&&p.known_for.some(v=>!v.adult&&['movie','tv'].includes(v.media_type)&&Number(v.vote_count)>=100));
    if(established.length===1)people=established;
   }
   if(people.length!==1)return{notFound:!people.length,message:people.length?'More than one person has that name. Open People to choose the one you mean.':'We could not verify the person “'+preference.name+'”. Try their full name.'};
   const data=await request('person-credits:'+people[0].id,'/person/'+people[0].id+'/combined_credits');
   const raw=preference.role==='director'?data.crew:data.cast;if(!Array.isArray(raw))throw Error('credits unavailable');
   const credits=raw.filter(r=>preference.role!=='director'||r.job==='Director').map(r=>screenRow(r,'movie')).filter(r=>r&&r.type!=='person');
   return{name:people[0].name,credits,keys:new Set(credits.map(r=>r.type+':'+r.id))};
  }catch{return{message:'We could not verify these credits. Please try again.'};}finally{clearTimeout(timer);}
 }
 const handle=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 router.get('/search',handle(async(req,res)=>{
  const q=String(req.query.q||'').trim().slice(0,120),type=String(req.query.type||'screen'),page=Math.max(1,Math.min(500,parseInt(req.query.page,10)||1)),browse=req.query.browse==='1';
  if(!q&&!browse)return res.json({results:[],page,totalPages:0,totalResults:0});
  if(type==='book')return res.json({results:await books(q,page),page});
  const endpoint=['movie','tv','person'].includes(type)?type:'multi';
  const path=q?'/search/'+endpoint:endpoint==='person'?'/person/popular':'/trending/'+(endpoint==='multi'?'all':endpoint)+'/week';
  const data=await cached('search:'+path+':'+q+':'+page,async()=>{const value=await tmdb(path,{...(q?{query:q}:{}),page:String(page),include_adult:'false'});if(value.__error||!Array.isArray(value.results))throw fail(503,'Search is unavailable for a moment. Please try again.');return value;});
  const rows=data.results.map(v=>screenRow(v,endpoint==='multi'?'movie':endpoint)).filter(v=>v&&(type==='screen'?v.type!=='person':endpoint==='multi'||v.type===type));
  res.json({results:rows.slice(0,20),page,totalPages:Math.max(0,Math.min(500,Number(data.total_pages)||1)),totalResults:Math.max(0,Number(data.total_results)||rows.length)});
 }));
 router.get('/books',handle(async(req,res)=>{const page=Math.max(1,Math.min(200,parseInt(req.query.page,10)||1));res.json({books:await books(String(req.query.q||'').trim().slice(0,120),page),page});}));
 router.get('/books/:id',handle(async(req,res)=>{if(!/^\d{1,10}$/.test(req.params.id))throw fail(400,'Choose a valid audiobook.');const book=(await books('',1,req.params.id)).find(b=>b.id===req.params.id);if(!book)throw fail(404,'This audiobook is no longer in the catalog.');res.json({book});}));
 router.get('/candidates',handle(async(req,res)=>{
  const parse=value=>String(value||'').split(',').filter(v=>/^(movie|tv):[1-9]\d{0,9}$/.test(v));
  const seeds=parse(req.query.seeds).slice(0,3),exclude=new Set(parse(req.query.exclude).slice(0,200));
  let query=parseRecommendationQuery(req.query.q,req.query.type);
  if(query.personError)return res.json({mode:'mood',candidates:[],references:[],filters:[],message:query.personError});
  let people=await Promise.all(query.people.map(personCredits));
  if(people.some((person,i)=>person.notFound&&!query.people[i].required)){
   query=parseRecommendationQuery(req.query.q,req.query.type,{ignorePersonHints:true});people=await Promise.all(query.people.map(personCredits));
  }
  const unavailable=people.find(p=>p.message);if(unavailable)return res.json({mode:'mood',candidates:[],references:[],filters:[],message:unavailable.message});
  const personAllows=row=>people.every(p=>p.keys.has(row.type+':'+row.id));
  const person=people.length?{credits:people[0].credits.filter(personAllows)}:null;let type=query.type;
  const topics=[...new Map([...String(req.query.topics||'').split(',').slice(0,2).map(id=>storyTopics.find(t=>t.id===id)),...query.themes.map(term=>storyTopics.find(t=>normalize(t.keyword)===normalize(term)))].filter(Boolean).map(t=>[t.id,t])).values()].slice(0,2);
  const topicGenres=topics.map(t=>genreDefinitions.find(g=>g[0]===t.genre)).filter(Boolean);
  // Inferred topics guide retrieval. Only the person's explicit words are
  // mandatory filters; an approximate genre label must not erase good stories.
  query.themes=[...new Set([...query.themes,...topics.map(t=>t.keyword).filter(Boolean),...(type!=='movie'?query.wanted.filter(g=>!g[3]).map(g=>g[0]):[])])].slice(0,2);
  let candidateSources=0,candidateAttempts=0,successfulSearches=0;
  const request=async(path,params={})=>{
   const args={include_adult:'false',...params};if(!path.startsWith('/search/'))candidateAttempts++;
   const key='candidates:'+path+'?'+new URLSearchParams(Object.entries(args).sort(([a],[b])=>a.localeCompare(b)));
   try{const data=await cached(key,async()=>{const value=await tmdb(path,args);if(value.__error||!Array.isArray(value.results))throw Error('catalog unavailable');return value;});if(!path.startsWith('/search/'))candidateSources++;else successfulSearches++;return data.results;}catch{return [];}
  };
  const literal=query.prompt.length<=100?query.prompt.replace(/^(?:please\s+)?(?:find|show me|search for|i want(?: to watch)?|looking for)\s+/i,'').trim():'';
  const titleQueries=[...new Set([literal,query.title].filter(Boolean))].slice(0,2);
  const [titlePools,...keywordRows]=await Promise.all([
   Promise.all(titleQueries.map(title=>request('/search/multi',{query:title}))),
   ...query.themes.map(term=>request('/search/keyword',{query:term}))
  ]);
  let named=titlePools.flat().map(v=>screenRow(v,'movie')).filter(v=>v&&['movie','tv'].includes(v.type));
  if(!named.some(v=>matchesTitle(v,query.title)||literal&&matchesTitle(v,literal))&&(query.titleLike||query.similar)&&query.title.length>=7){
   const words=query.title.split(/\s+/),retry=words.length>1?words.slice(0,-1).join(' '):query.title.slice(0,Math.max(4,Math.floor(query.title.length*.65)));
   if(retry&&!titleQueries.includes(retry))named.push(...(await request('/search/multi',{query:retry})).map(v=>screenRow(v,'movie')).filter(v=>v&&v.type!=='person'));
  }
  // Let actual catalog titles disambiguate names such as Some Like It Hot.
  const selectedType=['movie','tv'].includes(req.query.type)?req.query.type:'mix';
  const eligibleNamed=named.filter(v=>selectedType==='mix'||v.type===selectedType);
  const literalExact=literal&&eligibleNamed.find(v=>matchesTitle(v,literal));
  const exact=literalExact||named.find(v=>matchesTitle(v,query.title)&&(query.similar||type==='mix'||v.type===type));
  const correctionChoices=!exact&&(query.titleLike||query.similar)?closestTitles(query.similar?named:eligibleNamed,query.title):[];
  const corrected=correctionChoices[0]||null;
  const prefix=!exact&&!corrected&&query.titleLike&&normalize(query.title).length>=5?eligibleNamed.find(v=>normalize(v.title).startsWith(normalize(query.title)+' ')):null;
  const chosen=exact||corrected||prefix;
  const reference=query.similar&&!literalExact?(chosen||named.find(v=>normalize(v.title).includes(normalize(query.title)))):null;
  const filters=[...people.map((p,i)=>(query.people[i].role==='director'?'Directed by ':'Starring ')+p.name),...(query.type==='mix'?[]:[query.type==='tv'?'Series':'Movies']),...query.wanted.map(g=>g[0]),...query.unwanted.map(g=>'No '+g[0]),...(query.start?[query.start===query.end?String(query.start):query.start+'–'+query.end]:[]),...(query.language?[query.languageName]:[]),...(query.runtimeMax?['Up to '+query.runtimeMax+' min'+(query.type==='tv'?' per episode':'')]:[])];
  if(chosen&&!reference){
   // Words in the title itself are not genre instructions. Explicit suffixes
   // remain constraints, and remakes are filtered before choosing a version.
   const constraints=literalExact?{...query,type:selectedType,wanted:[],unwanted:[],start:null,end:null,runtimeMax:null,language:''}:query;
   const rows=new Map();
   const versions=named.filter(v=>prefix?normalize(v.title).startsWith(normalize(query.title)+' '):corrected?correctionChoices.some(c=>matchesTitle(v,c.title)):matchesTitle(v,chosen.title));
   if(corrected)versions.sort((a,b)=>correctionChoices.findIndex(c=>matchesTitle(a,c.title))-correctionChoices.findIndex(c=>matchesTitle(b,c.title)));
   for(const item of versions){const row={...item,match:'title',source:'title',genreNames:genreNames(item.genres,item.type)},key=row.type+':'+row.id;if(personAllows(row)&&!exclude.has(key)&&matchesConstraints(row,constraints,{allowUnknownRuntime:true,allowUnknownTvGenres:true}))rows.set(key,row);}
   const candidates=await filterTvExclusions(await filterRuntime([...rows.values()].slice(0,6),constraints),constraints);
   return res.json({mode:'title',candidates,references:[],filters:literalExact&&!person?[]:filters,...(corrected?{correction:{query:query.title,title:candidates[0]?.title||corrected.title}}:{}),...(!candidates.length?{message:'This title is outside your current filters or already watched.'}:{})});
  }
  if((query.similar&&!reference)||(query.explicitTitle&&!chosen)){if(!successfulSearches)throw fail(503,'Title search is temporarily unavailable. Please try again.');return res.json({mode:query.explicitTitle&&!query.similar?'title':'mood',candidates:[],references:[],filters,message:'We could not find the title “'+query.title+'”. Check its spelling or try another name.'});}
  // Explicit genres and themes already have a reliable catalog filter; don't
  // make them wait for an approximate AI topic inference before searching.
  if(req.query.plan==='1'&&!reference&&!query.broad&&!query.themes.length)return res.json({mode:'plan',semanticQuery:query.semanticQuery||query.prompt,candidates:[],references:[],filters});
  if(reference&&type==='mix'){type=reference.type;query.type=type;}
  if(reference)exclude.add(reference.type+':'+reference.id);
  const keywords=keywordRows.map((rows,i)=>rows.find(v=>normalize(v.name)===normalize(query.themes[i]))).filter(v=>Number.isSafeInteger(Number(v?.id))&&Number(v.id)>0).map(v=>Number(v.id));
  const sources=person?[Promise.resolve(person.credits.map(row=>({...row,source:'credits'})))]:[];
  const crossMedium=reference&&type!==reference.type;
  if(crossMedium&&!query.wanted.length){query.wanted=genreDefinitions.filter(g=>reference.genres.includes(g[reference.type==='tv'?3:2]));query.either=true;}
  const pool=(rows,kind,source,offset=0)=>rows.map((v,i)=>{const row=screenRow(v,kind);return row?{...row,source,catalogRank:offset+i+1}:null;});
  if(reference&&!crossMedium){
   for(const [endpoint,page]of [['recommendations','1'],['recommendations','2'],['similar','1']])sources.push(request('/'+reference.type+'/'+reference.id+'/'+endpoint,{page}).then(rows=>pool(rows,reference.type,'reference',endpoint==='similar'?40:(Number(page)-1)*20)));
  }else if(!reference){
   // Topic exemplars retrieve real neighboring stories even when a keyword is
   // absent from TMDB. No invented title can become a candidate.
   const topicSeeds=await Promise.all(topics.filter(t=>t.seed).map(async topic=>{
    const rows=await request('/search/multi',{query:topic.seed});
    return rows.map(v=>screenRow(v,'movie')).find(v=>v&&v.type!=='person'&&normalize(v.title)===normalize(topic.seed));
   }));
   for(const seed of topicSeeds.filter(Boolean)){
    sources.push(Promise.resolve([{...seed,source:'topic',catalogRank:1}]));
    sources.push(request('/'+seed.type+'/'+seed.id+'/recommendations').then(rows=>pool(rows,seed.type,'topic')));
   }
   if(!person&&req.query.planned==='1'&&!query.wanted.length&&!query.themes.length&&!topicGenres.length&&!topicSeeds.some(Boolean))return res.json({mode:'mood',candidates:[],references:[],filters,message:'Try a specific story detail, a title you love, or a genre so we can find a close match.'});
   if(!person&&!topics.length&&!query.themes.length)for(const seed of seeds){const kind=seed.split(':')[0];sources.push(request('/'+seed.replace(':','/')+'/recommendations').then(rows=>pool(rows,kind,'taste')));}
  }
  for(const kind of person?[]:reference&&!crossMedium&&!query.themes.length&&!query.wanted.length?[]:type==='mix'?['movie','tv']:[type]){
   if(!query.prompt){for(const path of ['/'+kind+'/popular','/trending/'+kind+'/week'])sources.push(request(path).then(rows=>rows.map(v=>screenRow(v,kind))));continue;}
   const wanted=genreIds(query.wanted.length?query.wanted:topicGenres.filter(g=>!query.unwanted.includes(g)),kind),without=genreIds(query.unwanted,kind),dates=kind==='tv'?'first_air_date':'primary_release_date';
   const ids=kind==='tv'&&query.either&&query.wanted.some(g=>!g[3])?[]:wanted;
   const params={sort_by:'popularity.desc','vote_count.gte':'30',...(ids.length?{with_genres:ids.join(query.either||!query.wanted.length?'|':',')}:{}) ,...(without.length?{without_genres:without.join(',')}:{}) ,...(query.start?{[dates+'.gte']:query.start+'-01-01',[dates+'.lte']:query.end+'-12-31'}:{[dates+'.lte']:new Date(now()).toISOString().slice(0,10)}),...(query.language?{with_original_language:query.language}:{}),...(query.runtimeMax?{'with_runtime.lte':String(query.runtimeMax)}:{})};
   // Keep themed and genre-only pools separate, so an obscure keyword does not erase all matches.
   if(keywords.length)for(const page of [1,2])sources.push(request('/discover/'+kind,{...params,with_keywords:keywords.join('|'),page:String(page)}).then(rows=>pool(rows,kind,'topic')));
   // A resolved story topic must not be drowned out by unrelated popular rows.
   // Explicit genre filters provide grounded backup candidates when a very
   // specific keyword search has no matches. The local ranker still rejects
   // entries with poor story relevance.
   if(query.wanted.length||topicGenres.length||(!topics.some(t=>t.seed||t.keyword)&&!query.themes.length))for(const page of [1,2])sources.push(request('/discover/'+kind,{...params,page:String(page)}).then(rows=>pool(rows,kind,'genre')));
  }
  const pools=await Promise.all(sources),unique=new Map();
  // Interleave sources: personal recommendations can no longer be lost behind 80 trending rows.
  for(let i=0;i<Math.max(0,...pools.map(rows=>rows.length));i++)for(const rows of pools){
   const row=rows[i],key=row&&row.type+':'+row.id;
   if(!row||!personAllows(row)||!['movie','tv'].includes(row.type)||!row.overview||exclude.has(key)||!matchesConstraints(row,query,{allowUnknownRuntime:true,allowUnknownTvGenres:true}))continue;
   const existing=unique.get(key);
   if(!existing)unique.set(key,{...row,genreNames:genreNames(row.genres,row.type)});
   else if(row.source==='reference'&&existing.source==='reference')existing.catalogRank=Math.min(existing.catalogRank,row.catalogRank);
  }
  let candidates=[...unique.values()].slice(0,80);
  candidates=await filterTvExclusions(await filterRuntime(candidates,query),query);
  if(!candidates.length&&(!person&&!candidateSources&&(candidateAttempts>0||!successfulSearches)))throw fail(503,'There are no titles to recommend right now. Please try again shortly.');
  const preferenceQuery=reference?query.semanticQuery.replace(/\b(?:something|movies?|films?|shows?|series|tv|similar to|like|along the lines of|reminds? me of|but|with|and)\b/gi,' ').replace(/\s+/g,' ').trim():'';
  res.json({mode:reference?'similar':'mood',semanticQuery:reference?reference.overview+(preferenceQuery?' '+preferenceQuery:''):query.semanticQuery||query.prompt,candidates,references:reference?[reference]:[],filters,ranking:{broad:query.broad,type:query.type,preferenceQuery,referenceQueries:reference?[reference.title+'. '+reference.overview]:[],topicDescriptions:topics.map(t=>t.description)},...(!candidates.length?{message:'No close matches found. Try a broader mood or fewer filters.'}:{})});
 }));
 router.use((e,req,res,next)=>{if(res.headersSent)return next(e);res.status(e.status||503).json({message:e.status?e.message:'The catalog is temporarily unavailable. Please try again.'});});
 return {router,books};
}
module.exports={createDiscovery,bookRow,screenRow,catalogUrl};
