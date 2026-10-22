/* Search stays idle until opened; stale requests are aborted and ignored. */
(() => {
 'use strict';
 function boot(){
  const toggle=document.getElementById('svNavSearchToggle'),popup=document.getElementById('svNavSearchPopup'),input=document.getElementById('svNavSearchInput');if(!toggle||!popup||!input||toggle.dataset.bound)return;toggle.dataset.bound='true';
  const results=popup.querySelector('[data-search-results]'),status=popup.querySelector('[data-search-status]'),recents=popup.querySelector('[data-search-recents]');
  if(popup.classList.contains('svDiscoverySearch'))document.body.append(popup);
  let type='screen',timer=0,controller=null,epoch=0,selection=-1;
  const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  function recent(){try{return JSON.parse(localStorage.getItem('swiflytv.searchRecents')||'[]').filter(q=>typeof q==='string').slice(0,6);}catch{return [];}}
  function remember(q){if(!q)return;try{localStorage.setItem('swiflytv.searchRecents',JSON.stringify([q,...recent().filter(v=>v!==q)].slice(0,6)));}catch{}}
  function paintRecent(){if(!recents)return;recents.replaceChildren();if(input.value.trim())return;const values=recent();recents.append(node('span','svSearchLabel',values.length?'Recent searches':'Try a title'));const list=node('div','svSearchRecentList');for(const q of values.length?values:['Barbie','Spider-Man','Project Hail Mary']){const b=node('button','',q);b.type='button';b.addEventListener('click',()=>{input.value=q;search(true);input.focus();});list.append(b);}if(values.length){const clear=node('button','svSearchClear','Clear history');clear.type='button';clear.addEventListener('click',()=>{try{localStorage.removeItem('swiflytv.searchRecents');}catch{}paintRecent();input.focus();});list.append(clear);}recents.append(list);}
  function cancel(){clearTimeout(timer);controller?.abort();controller=null;++epoch;}
  function close(restore=true){cancel();popup.hidden=true;toggle.setAttribute('aria-expanded','false');selection=-1;if(restore)toggle.focus();}
  function open(){popup.hidden=false;toggle.setAttribute('aria-expanded','true');paintRecent();input.focus();if(input.value.trim().length>=2)search(true);}
  function search(immediate=false){
   cancel();selection=-1;const q=input.value.trim(),token=epoch;results?.replaceChildren();paintRecent();if(!status)return;if(q.length<2){status.textContent=q?'Keep typing…':'';return;}status.textContent='Finding your next favorite…';
   const run=async()=>{controller=new AbortController();try{const response=await fetch('/api/discovery/search?'+new URLSearchParams({q,type}),{signal:controller.signal,headers:{Accept:'application/json'}});const body=await response.json();if(!response.ok)throw Error(body.message||'Search is unavailable. Please try again.');if(token!==epoch||popup.hidden)return;results.replaceChildren();for(const item of body.results||[]){const a=node('a','svSearchResult');a.href=item.href;a.dataset.searchResult='';if(item.poster){const image=node('img');image.src=item.poster;image.alt='';image.loading='lazy';image.decoding='async';a.append(image);}else a.append(node('span','svSearchPosterFallback',item.type==='person'?'◉':item.type==='book'?'Aa':'▶'));const copy=node('span','svSearchResultCopy');copy.append(node('strong','',item.title),node('small','',[item.type==='tv'?'Series':item.type==='book'?'Audiobook':item.type==='person'?'Person':'Movie',item.year||item.author].filter(Boolean).join(' · ')));a.append(copy,node('span','svSearchResultArrow','↗'));a.addEventListener('click',()=>remember(q));results.append(a);}status.textContent=results.children.length?'':type==='book'?'No books found. Try a shorter title.':'No results yet. Try another title or a different category.';}
    catch(e){if(token===epoch&&!popup.hidden&&e.name!=='AbortError')status.textContent=e.message||'Search is unavailable. Please try again.';}};
   if(immediate)run();else timer=setTimeout(run,220);
  }
  toggle.addEventListener('click',()=>popup.hidden?open():close());input.addEventListener('input',()=>search());popup.querySelector('[data-search-close]')?.addEventListener('click',()=>close());
  for(const b of popup.querySelectorAll('[data-search-type]'))b.addEventListener('click',()=>{type=b.dataset.searchType;for(const c of popup.querySelectorAll('[data-search-type]'))c.setAttribute('aria-pressed',String(c===b));search(true);input.focus();});
  popup.addEventListener('submit',e=>{remember(input.value.trim());if(type==='book'){e.preventDefault();location.assign('/audiobooks?q='+encodeURIComponent(input.value.trim()));}});
  // Suggestions can replace their own target before this click reaches document.
  document.addEventListener('click',e=>{if(!popup.hidden&&!e.composedPath().includes(popup)&&!toggle.contains(e.target))close(false);});
  document.addEventListener('keydown',e=>{
   if(e.key==='Escape'&&!popup.hidden){e.preventDefault();close();return;}
   if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();popup.hidden?open():close();return;}
   if(popup.hidden||!['ArrowDown','ArrowUp'].includes(e.key)||e.altKey||e.ctrlKey||e.metaKey)return;
   const items=[...popup.querySelectorAll('[data-search-result]')];if(!items.length)return;e.preventDefault();selection=(selection+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[selection].focus();items[selection].scrollIntoView?.({block:'nearest'});
  });
  popup.addEventListener('focusout',()=>{setTimeout(()=>{if(!popup.contains(document.activeElement)&&document.activeElement!==toggle)close(false);},0);});
  window.addEventListener('pagehide',()=>close(false));paintRecent();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();


/* Compact account navigation. Keep the original destinations and handlers. */
(() => {
 'use strict';
 function bootProfileSheet(){
  const menu=document.querySelector('.dsProfileMenu');
  const panel=menu?.querySelector('.dsProfileDropdown');
  if(!panel||panel.dataset.svMobileSheetReady)return;
  panel.dataset.svMobileSheetReady='true';

  panel.classList.add('svAccountCompact');
  const groups=[];
  for(const [title,hrefs]of [
   ['Your library',['/continue-watching','/my-list','/liked']],
   ['Watch together',['/friends','/friends?tab=home','/social?tab=watchrooms']],
   ['Discover more',['/recommendations','/audiobooks','/browse-by-languages','/kids']]
  ]){
   const links=hrefs.map(href=>[...panel.querySelectorAll('a[href]')].find(a=>a.getAttribute('href')===href)).filter(Boolean);if(!links.length)continue;
   const group=document.createElement('details'),summary=document.createElement('summary'),contents=document.createElement('div');group.className='svAccountGroup';contents.className='svAccountGroupLinks';
   const glyphBox=document.createElement('span');glyphBox.setAttribute('aria-hidden','true');glyphBox.innerHTML=links[0].querySelector(':scope > span')?.innerHTML||'';summary.append(glyphBox,document.createTextNode(title));group.append(summary,contents);panel.insertBefore(group,links[0]);contents.append(...links);groups.push(group);
  }
  const syncTv=()=>{for(const group of groups)group.open=document.documentElement.dataset.svTv==='true';};syncTv();
  new MutationObserver(syncTv).observe(document.documentElement,{attributes:true,attributeFilter:['data-sv-tv']});
  for(const utility of panel.querySelectorAll(':scope > .svTvMenuToggle,:scope > .svMobileStudioLink'))panel.insertBefore(utility,panel.querySelector('.dsDropdownLogout'));
  const close=document.createElement('button');
  close.type='button';
  close.className='svAccountMenuClose';
  close.setAttribute('aria-label','Close account menu');
  close.textContent='×';
  close.addEventListener('click',()=>{
   menu.removeAttribute('open');
   menu.querySelector('summary')?.focus();
  });
  panel.append(close);
  menu.addEventListener('toggle',()=>{if(menu.open)panel.scrollTop=0;else if(document.documentElement.dataset.svTv!=='true')for(const group of groups)group.open=false;});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootProfileSheet,{once:true});
 else bootProfileSheet();
})();
