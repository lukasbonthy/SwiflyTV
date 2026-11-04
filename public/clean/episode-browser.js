/* Actual season metadata, native episode view/order and safe spoiler hooks. */
(() => {
 'use strict';if(window.SwiflyEpisodes)return;
 const pending=new Map();let disposed=false;
 const find=(root,selector)=>[...(root.matches?.(selector)?[root]:[]),...root.querySelectorAll(selector)];
 const prefs=()=>window.SwiflyLibrary?.preferences?.()||{episodeView:'grid',episodeSort:'oldest'};
 const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 function sync(root=document){
  const p=prefs();for(const input of find(root,'[data-episode-view]'))input.value=p.episodeView||'grid';for(const input of find(root,'[data-episode-sort]'))input.value=p.episodeSort||'oldest';
  for(const list of find(root,'[data-episode-season] .dsEpisodeChips')){list.dataset.episodeView=p.episodeView||'grid';const items=[...list.children].filter(n=>n.matches('[data-library-episode]')),ordered=[...items].sort((a,b)=>(Number(a.dataset.libraryEpisode)-Number(b.dataset.libraryEpisode))*(p.episodeSort==='newest'?-1:1));for(let i=0;i<ordered.length;i++)if(list.children[i]!==ordered[i])list.insertBefore(ordered[i],list.children[i]||null);}
 }
 function render(panel,episodes){
  const list=panel.querySelector('.dsEpisodeChips');if(!list)return;const fragment=document.createDocumentFragment(),show=panel.dataset.episodeShow,season=panel.dataset.episodeSeason,today=new Date().toISOString().slice(0,10);
  for(const e of episodes){if(!Number.isSafeInteger(e.episode)||e.episode<1)continue;const card=make('div','svDetailEpisodeChoice svEpisodeBrowserCard');Object.assign(card.dataset,{libraryCard:'',libraryId:show,libraryType:'tv',librarySeason:season,libraryEpisode:String(e.episode)});const future=!!e.airDate&&e.airDate>today;
   const link=make(future?'div':'a','svDetailEpisodeTile');if(!future){link.href='/watch/tv/'+show+'?mode=movie&s='+season+'&e='+e.episode;link.setAttribute('aria-label','Play season '+season+', episode '+e.episode);}else link.setAttribute('aria-label','Season '+season+', episode '+e.episode+' airs '+e.airDate);
   if(/^https:\/\/image\.tmdb\.org\/t\/p\/w300\/[A-Za-z0-9_.-]+$/.test(e.still||'')){const image=make('img','svEpisodeBrowserStill');image.src=e.still;image.alt='';image.loading='lazy';image.decoding='async';image.dataset.librarySpoiler='';link.append(image);}
   const copy=make('span','svEpisodeBrowserCopy');copy.append(make('small','','EPISODE '+String(e.episode).padStart(2,'0')));const name=make('strong','',String(e.name||'Episode '+e.episode));name.dataset.librarySpoiler='';copy.append(name);const info=make('span','svEpisodeBrowserMeta',future?'Airs '+e.airDate:[e.airDate,Number(e.runtime)>0?e.runtime+' min':''].filter(Boolean).join(' · '));copy.append(info);if(e.overview){const plot=make('span','svEpisodeBrowserPlot',String(e.overview));plot.dataset.librarySpoiler='';copy.append(plot);}link.append(copy);card.append(link);
   if(!future){const download=make('a','svDetailEpisodeDownload','↓');download.href='/download/tv/'+show+'?s='+season+'&e='+e.episode;download.dataset.svDownload='';download.dataset.svDownloadType='episode';download.setAttribute('aria-label','Download season '+season+' episode '+e.episode);download.title='Download episode';card.append(download);}fragment.append(card);
  }
  list.replaceChildren(fragment);if(!list.children.length)list.append(make('p','','No episode metadata is available yet.'));sync(panel);window.SwiflyLibrary?.renderDecorations?.(panel);
 }
 async function load(panel){
  if(disposed||!panel.open||pending.has(panel)||panel.dataset.episodeLoaded==='true')return;
  const id=panel.dataset.episodeShow,s=panel.dataset.episodeSeason;if(!/^[1-9]\d{0,9}$/.test(id||'')||!/^[1-9]\d{0,3}$/.test(s||''))return;
  const controller=new AbortController();pending.set(panel,controller);panel.setAttribute('aria-busy','true');let status=panel.querySelector('[data-episode-status]');if(!status){status=make('p','svEpisodeBrowserStatus');status.dataset.episodeStatus='';status.setAttribute('role','status');panel.append(status);}status.textContent='Loading episode details…';const timer=setTimeout(()=>controller.abort(),8000);
  try{const response=await fetch('/api/library/episodes/tv/'+id+'/'+s,{signal:controller.signal}),data=await response.json();if(!response.ok||!Array.isArray(data.episodes))throw Error('Episode details could not load.');if(disposed||!panel.isConnected||pending.get(panel)!==controller)return;render(panel,data.episodes);panel.dataset.episodeLoaded='true';status.remove();}
  catch(error){if(!disposed&&panel.isConnected&&pending.get(panel)===controller){status.textContent='Episode details are unavailable. ';const retry=make('button','dsSecondaryBtn','Retry');retry.type='button';retry.dataset.episodeRetry='';status.append(retry);}}
  finally{clearTimeout(timer);if(pending.get(panel)===controller){pending.delete(panel);panel.removeAttribute('aria-busy');}}
 }
 function init(root=document){if(disposed)return;for(const panel of find(root,'[data-episode-season]'))if(panel.open)load(panel);sync(root);}
 // Artwork and SVG glass updates do not require a whole-page episode scan.
 const observer=new MutationObserver(records=>{
  if(disposed)return;
  const roots=new Set(),selector='[data-episode-season],[data-episode-view],[data-episode-sort]';
  for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&node.isConnected&&(node.matches(selector)||node.querySelector(selector)))roots.add(node);
  for(const root of roots)if(![...roots].some(parent=>parent!==root&&parent.contains(root)))init(root);
  if(records.some(record=>record.removedNodes.length))for(const [panel,controller]of pending)if(!panel.isConnected){pending.delete(panel);controller.abort();panel.removeAttribute('aria-busy');}
 });
 function boot(){init();observer.observe(document.body,{childList:true,subtree:true});}
 document.addEventListener('toggle',e=>{if(e.target.matches?.('[data-episode-season]')&&e.target.open)load(e.target);},true);
 document.addEventListener('change',e=>{if(e.target.matches?.('[data-episode-view],[data-episode-sort]')){window.SwiflyLibrary?.savePreferences?.({[e.target.matches('[data-episode-view]')?'episodeView':'episodeSort']:e.target.value});sync();}});
 document.addEventListener('click',e=>{if(e.target.closest?.('[data-episode-retry]'))load(e.target.closest('[data-episode-season]'));});
 window.addEventListener('swifly:library-change',()=>sync());window.addEventListener('pagehide',()=>{disposed=true;observer.disconnect();for(const [panel,controller]of pending){controller.abort();panel.removeAttribute('aria-busy');}pending.clear();});window.addEventListener('pageshow',e=>{if(e.persisted){disposed=false;boot();}});
 window.SwiflyEpisodes=Object.freeze({refresh:init});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
