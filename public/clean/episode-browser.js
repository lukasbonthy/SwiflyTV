/* Actual season metadata, native episode view/order and safe spoiler hooks. */
(() => {
 'use strict';if(window.SwiflyEpisodes)return;
 const pending=new Map(),pages=new WeakMap();let disposed=false;
 const find=(root,selector)=>[...(root.matches?.(selector)?[root]:[]),...root.querySelectorAll(selector)];
 const prefs=()=>window.SwiflyLibrary?.preferences?.()||{episodeView:'rows',episodeSort:'oldest'};
 const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 function seasonNavigation(root=document){
  const sections=new Set(find(root,'#episodes,[data-episode-browser]'));const owner=root.closest?.('#episodes,[data-episode-browser]');if(owner)sections.add(owner);
  for(const section of sections){
   const controls=section.querySelector('.svEpisodeBrowserControls'),seasons=[...section.querySelectorAll('[data-episode-season]')];if(!controls||!seasons.length)continue;
   let select=controls.querySelector('[data-episode-jump]');
   if(!select){const label=make('label','','Season');select=make('select');select.dataset.episodeJump='';select.setAttribute('aria-label','Choose season');label.className='svEpisodeSeasonSelect';label.replaceChildren(document.createTextNode('Season'),select);controls.prepend(label);}
   const keys=seasons.map(panel=>panel.dataset.episodeSeason).join(',');
   if(select.dataset.episodeSeasons!==keys){select.replaceChildren(...seasons.map(panel=>{const option=make('option','',panel.querySelector('.svSeasonIdentity strong,summary strong')?.textContent||'Season '+panel.dataset.episodeSeason);option.value=panel.dataset.episodeSeason;return option;}));select.dataset.episodeSeasons=keys;}
   const open=root.matches?.('[data-episode-season]')&&root.open?root:seasons.find(panel=>panel.open&&panel.dataset.episodeSeason===select.value)||seasons.find(panel=>panel.open);if(open)select.value=open.dataset.episodeSeason;
  }
 }
 function sync(root=document){
  const p=prefs();for(const input of find(root,'[data-episode-view]'))input.value=p.episodeView||'rows';for(const input of find(root,'[data-episode-sort]'))input.value=p.episodeSort||'oldest';
  for(const list of find(root,'[data-episode-season] .dsEpisodeChips')){list.dataset.episodeView=p.episodeView||'rows';const items=[...list.children].filter(n=>n.matches('[data-library-episode]')),ordered=[...items].sort((a,b)=>(Number(a.dataset.libraryEpisode)-Number(b.dataset.libraryEpisode))*(p.episodeSort==='newest'?-1:1));for(let i=0;i<ordered.length;i++)if(list.children[i]!==ordered[i])list.insertBefore(ordered[i],list.children[i]||null);}
  decorateProgress(root);
 }
 function decorateProgress(root){
  const library=window.SwiflyLibrary,history=library?.read?.()?.history||[];
  for(const panel of find(root,'[data-episode-season]')){
   const show=panel.dataset.episodeShow,season=panel.dataset.episodeSeason,item=episode=>({id:show,type:'tv',season,episode}),all=pages.get(panel)?.episodes||[],watched=all.filter(e=>library?.isWatched?.(item(e.episode))).length;
   let summary=panel.querySelector('[data-season-progress]');if(!summary&&all.length){summary=make('small','svSeasonProgress');summary.dataset.seasonProgress='';panel.querySelector('summary')?.append(summary);}if(summary)summary.textContent=watched+' of '+all.length+' watched';
   for(const card of panel.querySelectorAll('[data-library-episode]')){
    const episode=card.dataset.libraryEpisode,complete=Boolean(library?.isWatched?.(item(episode))),button=card.querySelector('[data-episode-watched]'),progress=history.find(row=>String(row.id)===show&&row.type==='tv'&&String(row.season)===season&&String(row.episode)===episode),percent=complete?100:progress?.duration>0?Math.min(100,Math.max(0,Math.round(100*progress.currentTime/progress.duration))):0;
    if(button){button.setAttribute('aria-pressed',String(complete));button.setAttribute('aria-label',(complete?'Mark unwatched':'Mark watched')+', episode '+episode);button.title=complete?'Watched':'Mark watched';button.textContent=complete?'✓':'○';button.hidden=!library?.isWatched;}
    let meter=card.querySelector('[data-episode-progress]');if(percent>0){if(!meter){meter=make('span','svEpisodeProgress');meter.dataset.episodeProgress='';meter.setAttribute('role','progressbar');meter.setAttribute('aria-label','Episode '+episode+' progress');meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');meter.append(make('i'));card.querySelector('.svEpisodeBrowserThumbnail')?.append(meter);}meter.setAttribute('aria-valuenow',String(percent));meter.firstChild.style.width=percent+'%';}else meter?.remove();
   }
  }
 }
 function render(panel,episodes,page=0){
  episodes=[...new Map(episodes.filter(e=>Number.isSafeInteger(e.episode)&&e.episode>0).map(e=>[e.episode,e])).values()];
  page=Math.max(0,Math.min(Math.floor(Math.max(0,episodes.length-1)/24),page));pages.set(panel,{episodes,page});
  const shown=[...episodes].sort((a,b)=>(a.episode-b.episode)*(prefs().episodeSort==='newest'?-1:1)).slice(page*24,page*24+24);
  const list=panel.querySelector('.dsEpisodeChips');if(!list)return;const fragment=document.createDocumentFragment(),show=panel.dataset.episodeShow,season=panel.dataset.episodeSeason,today=new Date().toISOString().slice(0,10),seen=new Set();
  list.setAttribute('role','list');list.setAttribute('aria-label','Season '+season+' episodes');
  for(const e of shown){if(!Number.isSafeInteger(e.episode)||e.episode<1||seen.has(e.episode))continue;seen.add(e.episode);const card=make('div','svDetailEpisodeChoice svEpisodeBrowserCard');card.setAttribute('role','listitem');Object.assign(card.dataset,{libraryCard:'',libraryId:show,libraryType:'tv',librarySeason:season,libraryEpisode:String(e.episode)});const date=/^\d{4}-\d{2}-\d{2}$/.test(e.airDate||'')?e.airDate:'',future=e.aired===false||!!date&&date>today;card.dataset.episodeAvailable=String(!future);
   const label='season '+season+', episode '+e.episode,link=make(future?'div':'a','svDetailEpisodeTile');if(!future){link.href='/watch/tv/'+show+'?mode=movie&s='+season+'&e='+e.episode;link.setAttribute('aria-label','Play '+label+': '+String(e.name||'Episode '+e.episode));}else link.setAttribute('aria-label','Season '+season+', episode '+e.episode+(date?' airs '+date+': ':': Coming soon. ')+String(e.name||''));
   const thumbnail=make('span','svEpisodeBrowserThumbnail');const fallback=()=>{const ordinal=make('span','svEpisodeThumbnailFallback',String(e.episode).padStart(2,'0'));ordinal.setAttribute('aria-hidden','true');thumbnail.prepend(ordinal);};
   if(/^https:\/\/image\.tmdb\.org\/t\/p\/w300\/[A-Za-z0-9_.-]+$/.test(e.still||'')){const image=make('img','svEpisodeBrowserStill');image.src=e.still;image.alt='';image.loading='lazy';image.decoding='async';image.width=300;image.height=169;image.dataset.librarySpoiler='';image.addEventListener('error',()=>{image.remove();fallback();},{once:true});thumbnail.append(image);}else fallback();
   const badge=make('span','svEpisodePlaybackBadge',future?'Coming soon':'▶');badge.setAttribute('aria-hidden','true');thumbnail.append(badge);if(Number(e.runtime)>0&&Number(e.runtime)<1440){const runtime=make('span','svEpisodeRuntime',Math.round(Number(e.runtime))+' min');runtime.setAttribute('aria-hidden','true');thumbnail.append(runtime);}link.append(thumbnail);
   const copy=make('span','svEpisodeBrowserCopy');copy.append(make('small','','EPISODE '+String(e.episode).padStart(2,'0')));const name=make('strong','',String(e.name||'Episode '+e.episode));name.dataset.librarySpoiler='';copy.append(name);const info=make('span','svEpisodeBrowserMeta',future?(date?'Airs '+date:'Release date to be announced'):[date,Number(e.runtime)>0?Math.round(Number(e.runtime))+' min':''].filter(Boolean).join(' · '));copy.append(info);if(e.overview){const plot=make('span','svEpisodeBrowserPlot',String(e.overview));plot.dataset.librarySpoiler='';copy.append(plot);}link.append(copy);card.append(link);
   if(!future){const actions=make('span','svEpisodeActions'),watched=make('button','svEpisodeWatched','○');watched.type='button';watched.dataset.episodeWatched='';const download=make('a','svDetailEpisodeDownload','↓');download.href='/download/tv/'+show+'?s='+season+'&e='+e.episode;download.dataset.svDownload='';download.dataset.svDownloadType='episode';download.setAttribute('aria-label','Download season '+season+' episode '+e.episode);download.title='Download episode';actions.append(watched,download);card.append(actions);}fragment.append(card);
  }
  list.replaceChildren(fragment);if(!list.children.length)list.append(make('p','','No episode metadata is available yet.'));
  panel.querySelector('[data-episode-pages]')?.remove();if(episodes.length>24){const nav=make('nav','svEpisodePages');nav.dataset.episodePages='';nav.setAttribute('aria-label','Episode pages');for(const [direction,label]of [[-1,'Previous'],[1,'Next']]){const button=make('button','',label);button.type='button';button.dataset.episodePage=String(page+direction);button.disabled=page+direction<0||(page+direction)*24>=episodes.length;nav.append(button);if(direction===-1)nav.append(make('span','',(page*24+1)+'–'+Math.min((page+1)*24,episodes.length)+' of '+episodes.length));}panel.append(nav);}
  sync(panel);window.SwiflyLibrary?.renderDecorations?.(panel);
 }
 async function load(panel){
  if(disposed||!panel.open||pending.has(panel)||panel.dataset.episodeLoaded==='true')return;
  const id=panel.dataset.episodeShow,s=panel.dataset.episodeSeason;if(!/^[1-9]\d{0,9}$/.test(id||'')||!/^[1-9]\d{0,3}$/.test(s||''))return;
  const controller=new AbortController();pending.set(panel,controller);panel.setAttribute('aria-busy','true');let status=panel.querySelector('[data-episode-status]');if(!status){status=make('p','svEpisodeBrowserStatus');status.dataset.episodeStatus='';status.setAttribute('role','status');panel.append(status);}status.textContent='Loading episode details…';const timer=setTimeout(()=>controller.abort(),8000);
  try{const response=await fetch('/api/library/episodes/tv/'+id+'/'+s,{signal:controller.signal}),data=await response.json();if(!response.ok||!Array.isArray(data.episodes))throw Error('Episode details could not load.');if(disposed||!panel.isConnected||pending.get(panel)!==controller)return;render(panel,data.episodes);panel.dataset.episodeLoaded='true';status.remove();}
  catch(error){if(!disposed&&panel.isConnected&&pending.get(panel)===controller){status.textContent='Episode details are unavailable. ';const retry=make('button','dsSecondaryBtn','Retry');retry.type='button';retry.dataset.episodeRetry='';status.append(retry);}}
  finally{clearTimeout(timer);if(pending.get(panel)===controller){pending.delete(panel);panel.removeAttribute('aria-busy');}}
 }
 function init(root=document){if(disposed)return;seasonNavigation(root);for(const panel of find(root,'[data-episode-season]'))if(panel.open)load(panel);sync(root);}
 // Artwork and SVG glass updates do not require a whole-page episode scan.
 const observer=new MutationObserver(records=>{
  if(disposed)return;
  const roots=new Set(),selector='[data-episode-season],[data-episode-view],[data-episode-sort]';
  for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&node.isConnected&&(node.matches(selector)||node.querySelector(selector)))roots.add(node);
  for(const root of roots)if(![...roots].some(parent=>parent!==root&&parent.contains(root)))init(root);
  if(records.some(record=>record.removedNodes.length))for(const [panel,controller]of pending)if(!panel.isConnected){pending.delete(panel);controller.abort();panel.removeAttribute('aria-busy');}
 });
 function boot(){init();observer.observe(document.body,{childList:true,subtree:true});}
 document.addEventListener('toggle',e=>{if(e.target.matches?.('[data-episode-season]')&&e.target.open){for(const other of e.target.closest('#episodes,[data-episode-browser]')?.querySelectorAll('[data-episode-season]')||[])if(other!==e.target)other.open=false;load(e.target);seasonNavigation(e.target);}},true);
 document.addEventListener('change',e=>{if(e.target.matches?.('[data-episode-jump]')){const section=e.target.closest('#episodes,[data-episode-browser]'),panel=[...(section?.querySelectorAll('[data-episode-season]')||[])].find(node=>node.dataset.episodeSeason===e.target.value);if(panel){for(const other of section.querySelectorAll('[data-episode-season]'))if(other!==panel)other.open=false;panel.open=true;load(panel);const summary=panel.querySelector('summary');if(summary){summary.tabIndex=0;summary.focus({preventScroll:true});summary.scrollIntoView?.({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches||document.body.classList.contains('reduceMotion')?'auto':'smooth'});}}return;}if(e.target.matches?.('[data-episode-view],[data-episode-sort]')){window.SwiflyLibrary?.savePreferences?.({[e.target.matches('[data-episode-view]')?'episodeView':'episodeSort']:e.target.value});if(e.target.matches('[data-episode-sort]'))for(const panel of document.querySelectorAll('[data-episode-season]')){const saved=pages.get(panel);if(saved)render(panel,saved.episodes,0);}sync();}});
 document.addEventListener('click',e=>{
  const retry=e.target.closest?.('[data-episode-retry]');if(retry)load(retry.closest('[data-episode-season]'));
  const page=e.target.closest?.('[data-episode-page]');if(page){const panel=page.closest('[data-episode-season]'),saved=pages.get(panel);if(saved){render(panel,saved.episodes,Number(page.dataset.episodePage));panel.querySelector('summary')?.focus({preventScroll:true});}}
  const watched=e.target.closest?.('[data-episode-watched]');if(watched){const card=watched.closest('[data-library-episode]'),item={id:card.dataset.libraryId,type:'tv',season:card.dataset.librarySeason,episode:card.dataset.libraryEpisode,title:document.querySelector('.svDetailTitle')?.textContent||document.title};if(window.SwiflyLibrary?.isWatched?.(item))window.SwiflyLibrary.removeWatched(item);else window.SwiflyLibrary?.markWatched?.(item);sync(card.closest('[data-episode-season]'));}
 });
 window.addEventListener('swifly:library-change',()=>sync());window.addEventListener('pagehide',()=>{disposed=true;observer.disconnect();for(const [panel,controller]of pending){controller.abort();panel.removeAttribute('aria-busy');}pending.clear();});window.addEventListener('pageshow',e=>{if(e.persisted){disposed=false;boot();}});
 window.SwiflyEpisodes=Object.freeze({refresh:init});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
