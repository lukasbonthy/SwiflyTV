/* Full-page search: GET fallback, debounced requests and history-safe restoration. */
(() => {
 'use strict';
 const root=document.querySelector('[data-search-studio]');if(!root)return;
 const form=root.querySelector('[data-studio-search]'),input=form.elements.q,grid=root.querySelector('[data-studio-results]'),status=root.querySelector('[data-studio-status]'),heading=root.querySelector('#svStudioHeading'),empty=root.querySelector('[data-studio-empty]'),pages=root.querySelector('[data-studio-pagination]'),clear=form.querySelector('[data-studio-clear]');
 const mode=root.dataset.mode==='person'?'person':'screen',initialQuery=input.value,initialBrowse=!initialQuery?{cards:grid.innerHTML,pages:pages.innerHTML,heading:heading.textContent}:null;
 let timer=0,controller=null,epoch=0,disposed=false,resumePending=false,resumeEdit=false;
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const query=()=>input.value.trim().slice(0,120);
 const refinements=[...root.querySelectorAll('[data-search-filter]')];
 function filterParams(){const p=new URLSearchParams();for(const n of refinements)if(n.value&&n.value!=='all'&&n.value!=='0'&&n.value!=='relevance')p.set(n.name,n.value);return p;}
 function restoreFilters(){const p=new URLSearchParams(location.search);for(const n of refinements)n.value=p.get(n.name)||({media:'all',minRating:'0',sort:'relevance'}[n.name]||'');}
 function updateModes(){const q=query();clear.hidden=!q;for(const a of root.querySelectorAll('[data-search-mode]')){const u=new URL(a.href,location.href);q?u.searchParams.set('q',q):u.searchParams.delete('q');a.href=u.pathname+u.search;}}
 function cancel(){clearTimeout(timer);timer=0;controller?.abort();controller=null;epoch++;}
 function busy(value){form.setAttribute('aria-busy',String(value));grid.setAttribute('aria-busy',String(value));}
 function pageUrl(page=1){const p=filterParams();if(query())p.set('q',query());if(mode==='person')p.set('type','person');if(Number(page)>1)p.set('page',String(page));const suffix=p.toString();return '/search'+(suffix?'?'+suffix:'');}
 function metadata(button,prefix,row){for(const [key,value]of Object.entries({id:row.id,type:row.type,title:row.title,poster:row.poster||'',year:row.year||'',rating:row.rating||''}))button.setAttribute('data-'+prefix+'-'+key,String(value));}
 function paint(rows){
  grid.replaceChildren();
  for(const row of rows){
   if(!row||!/^\d+$/.test(String(row.id))||!['movie','tv','person'].includes(row.type))continue;
   const person=row.type==='person',href='/'+row.type+'/'+row.id,card=node('article','movieCard dsCard'),art=node('div','dsCardArtwork'),poster=node('a','posterWrap dsThumb');poster.href=href;poster.setAttribute('aria-label','Details for '+row.title);
   if(/^https:\/\/image\.tmdb\.org\//.test(row.poster||'')){const img=node('img');img.src=row.poster;img.alt=row.title+' poster';img.width=342;img.height=513;img.loading='lazy';img.decoding='async';poster.append(img);}else{const fallback=node('div','posterFallback');fallback.append(node('span','',String(row.title).slice(0,1)));poster.append(fallback);}
   art.append(poster);
   if(!person){const actions=node('div','dsCardQuickActions'),play=node('a','dsMiniBtn dsQuickPlay','▶'),watch=node('button','dsMiniBtn','＋'),like=node('button','dsMiniBtn dsHeartBtn','♡');play.href='/watch/'+row.type+'/'+row.id+'?mode=movie'+(row.type==='tv'?'&s=1&e=1':'');play.setAttribute('aria-label','Play '+row.title);watch.type=like.type='button';watch.setAttribute('aria-label','Add '+row.title+' to My List');like.setAttribute('aria-label','Like '+row.title);metadata(play,'play',row);metadata(watch,'watch',row);metadata(like,'like',row);actions.append(play,watch,like);art.append(actions);}
   const copy=node('div','dsCardInfo'),title=node('a','dsCardTitle',row.title),meta=node('div','dsCardMeta');title.href=href;meta.append(node('span','',row.year||''),node('span','',person?'Person':row.type==='tv'?'Series':'Movie'));copy.append(title,meta);card.append(art,copy);grid.append(card);
  }
  window.syncLibraryButtons?.(grid);empty.hidden=!!grid.children.length;
 }
 function pagination(page,total){pages.replaceChildren();if(total<=1)return;const nav=node('nav','pagination');nav.setAttribute('aria-label','Search result pages');for(const [number,label]of [[page-1,'← Previous'],[page+1,'Next →']])if(number>=1&&number<=total){const a=node('a','',label);a.href=pageUrl(number);nav.append(a);}pages.append(nav);}
 async function search({update=true,page=1,push=false}={}){
  cancel();const token=epoch,q=query(),n=Math.max(1,Math.min(500,Number(page)||1));updateModes();
  if(update)history[push?'pushState':'replaceState']({},'',pageUrl(n));
  heading.textContent=q?'Results for “'+q+'”':mode==='person'?'Popular people':'Trending this week';
  if(!q&&initialBrowse&&!filterParams().toString()){grid.innerHTML=initialBrowse.cards;pages.innerHTML=initialBrowse.pages;heading.textContent=initialBrowse.heading;empty.hidden=!!grid.children.length;status.textContent='';busy(false);window.syncLibraryButtons?.(grid);return;}
  controller=new AbortController();busy(true);status.textContent='Searching…';
  try{
   const params=new URLSearchParams({q,type:mode,page:String(n),...Object.fromEntries(filterParams()),...(!q?{browse:'1'}:{})}),response=await fetch('/api/discovery/search?'+params,{signal:controller.signal}),data=await response.json();
   if(token!==epoch||disposed)return;if(!response.ok)throw Error(data.message||'Search is unavailable. Please try again.');
   const rows=Array.isArray(data.results)?data.results:[];paint(rows);pagination(n,Math.min(500,Number(data.totalPages)||1));
   empty.textContent=q?'No matches found. Try another title or name.':'No titles available right now. Please try again.';status.textContent=rows.length?(data.totalResults?Number(data.totalResults).toLocaleString()+(data.filtered?' matches on this page':' results'):''):'No matches';
  }catch(error){if(token!==epoch||disposed||error.name==='AbortError')return;grid.replaceChildren();pages.replaceChildren();empty.hidden=true;status.textContent=error.message||'Search is unavailable. Please try again.';}
  finally{if(token===epoch&&!disposed)busy(false);}
 }
 for(const control of refinements)control.addEventListener('change',()=>{if(!disposed)search({push:true});});
 input.addEventListener('input',()=>{cancel();updateModes();timer=setTimeout(()=>{timer=0;search();},220);});
 form.addEventListener('submit',event=>{event.preventDefault();if(!disposed)search({push:true});});
 clear.addEventListener('click',()=>{input.value='';input.focus();search();});
 pages.addEventListener('click',event=>{const a=event.target.closest('a[href]');if(!a||event.button!==0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;event.preventDefault();search({page:new URL(a.href).searchParams.get('page'),push:true});});
 window.addEventListener('popstate',()=>{restoreFilters();input.value=new URLSearchParams(location.search).get('q')||'';search({update:false,page:new URLSearchParams(location.search).get('page')});});
 window.addEventListener('pagehide',()=>{resumeEdit=!!timer;resumePending=resumeEdit||form.getAttribute('aria-busy')==='true';disposed=true;cancel();});
 window.addEventListener('pageshow',event=>{if(!event.persisted)return;disposed=false;if(resumePending){resumePending=false;search({update:resumeEdit,page:resumeEdit?1:new URLSearchParams(location.search).get('page')});resumeEdit=false;}else busy(false);});
 updateModes();
})();
