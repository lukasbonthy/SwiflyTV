/* Profile-scoped catalog feed. No private storage reads and no background poll. */
(() => {
 'use strict';
 if(window.SwiflyFeed)return;
 const one=selector=>document.querySelector(selector),all=selector=>[...document.querySelectorAll(selector)];
 const clean=value=>typeof value==='string'?value.slice(0,200):'';
 const identifier=value=>/^[1-9]\d{0,9}$/.test(String(value??''))?String(value):'';
 const library=()=>window.SwiflyLibrary;
 const context=()=>library()?.contextId?.()??library()?.profileId?.()??'';
 const empty=()=>({watchlist:[],watched:[],history:[],episodeRead:[],preferences:{}});
 const read=()=>{try{return library()?.active===false?empty():library()?.read?.()||empty();}catch{return empty();}};
 let epoch=0,request=null,shuffleRequest=null,ackFrame=0,returnFocus=null,suspended=false,destroyed=false,started=false;
 let snapshot=empty(),feed={shows:[],upcoming:[],episodes:[],results:[]},loading=false,inputKey='',loadedAt=0,currentContext='',episodeMessage='',recommendationMessage='';
 const removers=[],rendered=new WeakMap();
 const listen=(node,name,handler)=>{node?.addEventListener(name,handler);removers.push(()=>node?.removeEventListener(name,handler));};
 const node=(tag,className,value)=>{const element=document.createElement(tag);if(className)element.className=className;if(value!==undefined)element.textContent=value;return element;};
 const rows=name=>Array.isArray(snapshot[name])?snapshot[name]:[];
 const key=item=>['movie','tv'].includes(item?.type)&&identifier(item.id)?item.type+':'+item.id:'';
 function selections(){
  const seen=rows('history').concat(rows('watched')).filter(key).sort((a,b)=>(Date.parse(b.watchedAt)||0)-(Date.parse(a.watchedAt)||0)),saved=rows('watchlist').filter(key),titles=seen.concat(saved),unique=new Map();
  for(const item of titles)if(!unique.has(key(item)))unique.set(key(item),item);
  return {seeds:[...unique.keys()].slice(0,4),shows:[...unique.values()].filter(v=>v.type==='tv').map(v=>String(v.id)).slice(0,8),excluded:[...new Set(seen.map(key))].slice(0,300),watched:new Set(seen.map(key))};
 }
 async function api(path,controller){
  const timer=setTimeout(()=>controller.abort(new Error('The feed took too long. Please try again.')),12000);
  try{const response=await fetch('/api/feed'+path,{signal:controller.signal,headers:{Accept:'application/json'}}),data=await response.json();if(!response.ok)throw new Error(clean(data?.message)||'The feed is unavailable. Please try again.');return data;}
  finally{clearTimeout(timer);}
 }
 const prefs=()=>snapshot.preferences&&typeof snapshot.preferences==='object'?snapshot.preferences:{};
 const episodeSeen=episode=>rows('history').concat(rows('watched')).some(item=>key(item)==='tv:'+episode.showId&&(item.key===episode.id||item.season===episode.season&&item.episode===episode.episode));
 const episodes=()=>feed.episodes.filter(item=>!episodeSeen(item));
 const unread=()=>episodes().filter(item=>!snapshot.episodeRead?.includes(item.id));
 function safeMedia(raw){
  const id=identifier(raw?.id),type=raw?.type,title=clean(raw?.title);if(!id||!['movie','tv'].includes(type)||!title)return null;
  return {...raw,id,type,title,href:'/'+type+'/'+id,poster:typeof raw.poster==='string'&&/^https:\/\/image\.tmdb\.org\/t\/p\/w\d+\/[A-Za-z0-9_.-]+$/.test(raw.poster)?raw.poster:''};
 }
 function safeEpisode(raw){
  const showId=identifier(raw?.showId),season=raw?.season,episode=raw?.episode;
  if(!showId||!Number.isSafeInteger(season)||season<0||season>999||!Number.isSafeInteger(episode)||episode<1||episode>9999||raw.id!=='tv:'+showId+':'+season+':'+episode||!/^\d{4}-\d\d-\d\d$/.test(raw.airDate||''))return null;
  return {...raw,showId,showTitle:clean(raw.showTitle),name:clean(raw.name),href:'/watch/tv/'+showId+'?s='+season+'&e='+episode,detailsHref:'/tv/'+showId};
 }
 function dateLabel(value){try{return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'));}catch{return value;}}
 function episodeCard(episode,{notification=false}={}){
  const card=node('article','svFeedEpisode');card.dataset.feedEpisodeId=episode.id;
  const link=node('a','svFeedEpisodeLink');link.href=episode.href;
  Object.assign(link.dataset,{tvTitle:episode.showTitle,tvType:'tv',tvYear:episode.airDate.slice(0,4),tvFacts:'Season '+episode.season+' · Episode '+episode.episode+' · '+dateLabel(episode.airDate)});
  link.append(node('strong','',episode.showTitle),node('span','svFeedEpisodeNumber','Season '+episode.season+' · Episode '+episode.episode));
  if(episode.name&&!prefs().spoilerMode)link.append(node('span','svFeedEpisodeName',episode.name));
  const when=node('time','',dateLabel(episode.airDate));when.dateTime=episode.airDate;link.append(when);card.append(link);
  if(notification){const badge=node('span','svFeedEpisodeRead');badge.dataset.feedEpisodeRead='';card.append(badge);}
  return card;
 }
 function mediaCard(raw,{surprise=false}={}){
  const media=safeMedia(raw);if(!media)return null;
  const card=node('article','svFeedCard');card.dataset.mediaId=media.id;card.dataset.mediaType=media.type;
  const poster=node('a','svFeedPoster');poster.href=media.href;poster.setAttribute('aria-label','Details for '+media.title);Object.assign(poster.dataset,{tvTitle:media.title,tvType:media.type,tvYear:media.year||'',tvRating:media.rating||''});card.dataset.tvOverview=clean(media.overview);
  if(media.poster){const image=node('img');image.src=media.poster;image.alt='';image.loading='lazy';image.decoding='async';poster.append(image);}else poster.append(node('span','','Artwork unavailable'));
  const body=node('div','svFeedCardBody'),heading=node('h3'),title=node('a','',media.title);title.href=media.href;heading.append(title);body.append(heading);
  const facts=[media.type==='tv'?'Series':'Movie',/^\d{4}$/.test(media.year||'')?media.year:'',Number.isFinite(media.rating)&&media.rating>0&&media.rating<=10&&media.votes>0?'TMDB '+media.rating.toFixed(1):''].filter(Boolean);body.append(node('p','svFeedFacts',facts.join(' · ')));
  if(raw.because?.key){const watched=selections().watched.has(raw.because.key);body.append(node('p','svFeedReason','Because you '+(watched?'watched ':'saved ')+clean(raw.because.title)));}
  if(surprise){const actions=node('div','svFeedResultActions'),details=node('a','','Details'),play=node('a','','Play');details.href=media.href;play.href='/watch/'+media.type+'/'+media.id;play.dataset.playId=media.id;play.dataset.playType=media.type;actions.append(details,play);body.append(actions);}
  card.append(poster,body);return card;
 }
 function section(target,heading,message,items,kind){
  if(!target)return;target.classList.add('svFeedSection');target.dataset.feedEmpty=String(items.length===0);target.setAttribute('aria-busy',String(loading));
  const signature=JSON.stringify([heading,message,items,prefs().spoilerMode,selections().seeds]);if(rendered.get(target)===signature)return;rendered.set(target,signature);
  const head=node('div','svFeedSectionHead'),retry=node('button','svFeedRefresh','Refresh feed');retry.type='button';retry.dataset.feedRetry='';retry.disabled=loading;head.append(node('h2','',heading),retry);
  const status=node('p','svFeedHint',message);status.setAttribute('role','status');
  const list=node('div',kind==='episodes'?'svFeedUpcoming':'svFeedCards');
  for(const item of items){const card=kind==='episodes'?episodeCard(item):mediaCard(item);if(card)list.append(card);}
  target.replaceChildren(head,status,list);
 }
 function updateBell(){
  const count=unread().length,hidden=prefs().hideEpisodeBell===true;
  for(const bell of all('[data-feed-bell]')){bell.hidden=hidden;bell.disabled=library()?.active===false;bell.setAttribute('aria-label','New episodes'+(count?', '+count+' unread':''));}
  for(const badge of all('[data-feed-unread]')){badge.textContent=String(count);badge.hidden=count===0;}
  const toggle=one('[data-feed-hide-bell]');if(toggle){toggle.checked=hidden;toggle.disabled=!library()?.savePreferences;}
 }
 function queueAcknowledgement(){
  if(ackFrame||destroyed||suspended||document.hidden)return;
  const token=epoch,owner=context();ackFrame=requestAnimationFrame(()=>{
   ackFrame=0;const dialog=one('[data-feed-notifications]'),list=one('[data-feed-episode-list]');
   if(token!==epoch||owner!==context()||document.hidden||!dialog?.open||!dialog.getClientRects().length||getComputedStyle(dialog).visibility==='hidden'||!list)return;
   const visible=new Set(),panel=dialog.getBoundingClientRect(),scroll=list.getBoundingClientRect();
   for(const card of list.querySelectorAll('[data-feed-episode-id]')){const rect=card.getBoundingClientRect();if(rect.width>0&&rect.height>0&&rect.bottom>Math.max(0,panel.top,scroll.top)&&rect.top<Math.min(innerHeight,panel.bottom,scroll.bottom)&&rect.right>Math.max(0,panel.left)&&rect.left<Math.min(innerWidth,panel.right))visible.add(card.dataset.feedEpisodeId);}
   const ids=unread().map(item=>item.id).filter(id=>visible.has(id));
   if(ids.length&&library()?.acknowledgeEpisodes?.(ids)===false){const status=one('[data-feed-notification-status]');if(status)status.textContent='These episodes could not be marked read. Please try again.';}
  });
 }
 function renderNotifications(){
  const dialog=one('[data-feed-notifications]'),list=one('[data-feed-episode-list]');if(!dialog?.open||!list)return;
  const items=episodes(),signature=JSON.stringify([items,prefs().spoilerMode]);
  if(rendered.get(list)!==signature){rendered.set(list,signature);list.replaceChildren(...items.map(item=>episodeCard(item,{notification:true})));}
  const status=one('[data-feed-notification-status]');if(status)status.textContent=episodeMessage||(loading?'Checking your series…':items.length?'':'No new episodes from your library in the last 30 days.');
  for(const button of dialog.querySelectorAll('[data-feed-retry]'))button.disabled=loading;
  for(const card of list.querySelectorAll('[data-feed-episode-id]')){const read=snapshot.episodeRead?.includes(card.dataset.feedEpisodeId);card.dataset.feedRead=String(!!read);card.querySelector('[data-feed-episode-read]').textContent=read?'Seen':'New';}
  queueAcknowledgement();
 }
 function render(){
  const picks=selections();section(one('[data-feed-upcoming]'),'Upcoming episodes',episodeMessage||(loading?'Checking your series…':!picks.shows.length?'Save or watch a series to see upcoming episodes.':!feed.upcoming.length?'No upcoming episode dates have been announced for these series.':''),feed.upcoming,'episodes');
  section(one('[data-feed-recommended]'),'Recommended for you',recommendationMessage||(loading?'Finding related titles…':!picks.seeds.length?'Watch or save a title to get recommendations from your library.':!feed.results.length?'No related titles are available for these library picks yet.':''),feed.results,'media');
  updateBell();renderNotifications();
 }
 function reset(){
  epoch++;request?.abort();shuffleRequest?.abort();request=null;shuffleRequest=null;inputKey='';loadedAt=0;feed={shows:[],upcoming:[],episodes:[],results:[]};snapshot=read();currentContext=context();loading=false;episodeMessage='';recommendationMessage='';
  const result=one('[data-feed-surprise-result]'),status=one('[data-feed-surprise-status]');result?.replaceChildren();if(status)status.textContent='';
  const form=one('[data-feed-surprise-form]');if(form){form.setAttribute('aria-busy','false');form.querySelector('button[type="submit"]').disabled=false;}
  const dialog=one('[data-feed-notifications]');if(dialog?.open){returnFocus=null;dialog.close();}render();
 }
 async function refresh({force=false}={}){
  if(destroyed||suspended||document.hidden)return;
  if(context()!==currentContext)reset();snapshot=read();
  if(!library()||library().active===false){feed={shows:[],upcoming:[],episodes:[],results:[]};loading=false;episodeMessage='Your library is getting ready.';recommendationMessage=episodeMessage;render();return;}
  const picks=selections(),signature=JSON.stringify([context(),picks.shows,picks.seeds,picks.excluded]);
  if(!force&&signature===inputKey&&(request||Date.now()-loadedAt<300000)){render();return;}
  request?.abort();const controller=new AbortController(),token=++epoch,owner=context();request=controller;inputKey=signature;loading=true;episodeMessage='';recommendationMessage='';render();
  const params=new URLSearchParams({seeds:picks.seeds.join(','),exclude:picks.excluded.join(',')});
  const results=await Promise.allSettled([picks.shows.length?api('/episodes?shows='+picks.shows.join(','),controller):Promise.resolve({shows:[],upcoming:[],episodes:[]}),picks.seeds.length&&one('[data-feed-recommended]')?api('/recommendations?'+params,controller):Promise.resolve({results:[]})]);
  if(destroyed||suspended||token!==epoch||owner!==context())return;
  request=null;loading=false;loadedAt=Date.now();snapshot=read();
  const [episodeResult,recommendations]=results;
  if(episodeResult.status==='fulfilled'){const data=episodeResult.value;feed.shows=Array.isArray(data.shows)?data.shows:[];feed.upcoming=(Array.isArray(data.upcoming)?data.upcoming:[]).map(safeEpisode).filter(Boolean);feed.episodes=(Array.isArray(data.episodes)?data.episodes:[]).map(safeEpisode).filter(Boolean);episodeMessage=data.partial?'Some series could not be refreshed. Please try again.':'';}
  else{feed.shows=[];feed.upcoming=[];feed.episodes=[];episodeMessage=clean(episodeResult.reason?.message)||'Your series could not be refreshed. Please try again.';}
  if(recommendations.status==='fulfilled'){feed.results=(Array.isArray(recommendations.value.results)?recommendations.value.results:[]).map(safeMedia).filter(Boolean);recommendationMessage=clean(recommendations.value.message)||(recommendations.value.partial?'Some library picks could not be refreshed. Please try again.':'');}
  else{feed.results=[];recommendationMessage=clean(recommendations.reason?.message)||'Recommendations could not be refreshed. Please try again.';}
  render();
 }
 function openNotifications(trigger){
  const dialog=one('[data-feed-notifications]');if(!dialog)return;returnFocus=trigger?.nodeType===1?trigger:one('[data-feed-bell]');
  if(!dialog.open)dialog.showModal();snapshot=read();updateBell();renderNotifications();refresh();
 }
 async function surprise(event){
  event.preventDefault();if(destroyed||suspended||document.hidden)return;
  const form=event.currentTarget,status=one('[data-feed-surprise-status]'),result=one('[data-feed-surprise-result]');if(!form.reportValidity())return;
  const owner=context(),controller=new AbortController();shuffleRequest?.abort();shuffleRequest=controller;
  const params=new URLSearchParams();for(const name of ['type','minRating','genre','yearFrom','yearTo']){const value=form.elements.namedItem(name)?.value;if(value)params.set(name,value);}
  if(form.elements.namedItem('unseen')?.checked)params.set('exclude',selections().excluded.join(','));
  form.setAttribute('aria-busy','true');form.querySelector('button[type="submit"]').disabled=true;result.replaceChildren();status.textContent='Choosing something for you…';
  try{const data=await api('/surprise?'+params,controller);if(destroyed||suspended||owner!==context()||shuffleRequest!==controller)return;const card=data.result&&mediaCard(data.result,{surprise:true});if(card){result.append(card);status.textContent=data.partial?'One catalog is unavailable. This pick matches your filters.':'Your pick is ready. Open Details or press Play when you’re ready.';}else status.textContent=clean(data.message)||'No titles match these filters. Try a wider range.';}
  catch(error){if(!destroyed&&!suspended&&owner===context()&&shuffleRequest===controller)status.textContent=error.name==='AbortError'?'This pick was canceled. Press Surprise me to try again.':clean(error.message)||'A pick could not be loaded. Please try again.';}
  finally{if(shuffleRequest===controller){shuffleRequest=null;form.setAttribute('aria-busy','false');form.querySelector('button[type="submit"]').disabled=false;}}
 }
 function destroy(){if(destroyed)return;destroyed=true;epoch++;request?.abort();shuffleRequest?.abort();cancelAnimationFrame(ackFrame);for(const remove of removers.splice(0))remove();}
 function boot(){
  if(started)return;started=true;currentContext=context();snapshot=read();
  for(const bell of all('[data-feed-bell]'))listen(bell,'click',event=>openNotifications(event.currentTarget));
  listen(document,'click',event=>{const button=event.target.closest?.('[data-feed-retry]');if(!button)return;const scope=button.closest('[data-feed-upcoming],[data-feed-recommended],[data-feed-notifications]'),restore=document.activeElement===button;refresh({force:true}).finally(()=>{if(restore&&document.activeElement===document.body)scope?.querySelector('[data-feed-retry]')?.focus({preventScroll:true});});});
  const dialog=one('[data-feed-notifications]');listen(one('[data-feed-close]'),'click',()=>dialog.close());listen(dialog,'close',()=>{cancelAnimationFrame(ackFrame);ackFrame=0;const trigger=returnFocus;returnFocus=null;if(trigger?.isConnected&&!trigger.hidden)trigger.focus({preventScroll:true});});
  listen(one('[data-feed-episode-list]'),'scroll',queueAcknowledgement);listen(dialog,'scroll',queueAcknowledgement);
  listen(one('[data-feed-hide-bell]'),'change',event=>{if(library()?.savePreferences?.({hideEpisodeBell:event.currentTarget.checked})===false){event.currentTarget.checked=!event.currentTarget.checked;const status=one('[data-feed-notification-status]');if(status)status.textContent='This preference could not be saved. Please try again.';}else{snapshot=read();updateBell();}});
  listen(one('[data-feed-surprise-form]'),'submit',surprise);
  listen(window,'swifly:library-change',()=>{if(context()!==currentContext)reset();refresh();});
  for(const name of ['swifly:profile-changed','swifly:account-hydrated','swifly:account-suspended'])listen(document,name,()=>{reset();queueMicrotask(()=>refresh());});
  listen(document,'visibilitychange',()=>{if(document.hidden){epoch++;request?.abort();shuffleRequest?.abort();request=null;inputKey='';loading=false;cancelAnimationFrame(ackFrame);ackFrame=0;}else refresh();});
  listen(window,'pagehide',event=>{suspended=true;request?.abort();shuffleRequest?.abort();cancelAnimationFrame(ackFrame);ackFrame=0;if(!event.persisted)destroy();});
  listen(window,'pageshow',event=>{if(event.persisted){suspended=false;inputKey='';refresh({force:true});}});
  Promise.resolve(library()?.ready).then(()=>refresh()).catch(()=>{recommendationMessage='Your library is unavailable. Please try again.';render();});
 }
 window.SwiflyFeed=Object.freeze({refresh,openNotifications});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
