/* Profile library, durable watched history, folders and viewing preferences. */
(() => {
  'use strict';
  if (window.SwiflyLibrary) return;
  const compatibilityKey = 'swiflytv.library.__compat__';
  const preferencesDefault = Object.freeze({spoilerMode:false,hideWatched:false,hideEpisodeBell:false,autoSkipIntro:false,rememberLastServer:true,episodeView:'grid',episodeSort:'oldest'});
  const booleanPreferences = ['spoilerMode','hideWatched','hideEpisodeBell','autoSkipIntro','rememberLastServer'];
  const watchedLabels = new WeakMap(), spoilerLabels = new WeakMap();
  let verificationRequired = !!window.SwiflyAccount?.ready;
  let suspended = verificationRequired, publishing = false, started = false, frame = 0, lifecycle = 0, verificationEpoch = 0, resolveReady;
  const ready = new Promise(resolve => {resolveReady = resolve;});
  const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  const text = (value, limit = 200) => typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, limit) : '';
  const integer = (value, minimum = 1) => /^(?:0|[1-9]\d{0,9})$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) >= minimum ? Number(value) : null;
  const clock = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.min(43200, Number(value)) : 0;
  const iso = (value, fallback = '1970-01-01T00:00:00.000Z') => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallback;
  function json(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } }
  function stored(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
  const sameProfile = (a,b) => a && b && (a.id && b.id ? a.id === b.id : a.name && a.name === b.name);
  function profileId() {
    const selected = json('swiflytv.activeProfile', null), configured = json('swiflytv.profiles', []);
    let profiles = Array.isArray(configured) ? configured.filter(plain).map((value,index) => ({...value,id:value.id || 'legacy-' + index})) : [];
    if (!profiles.length) profiles = [{id:'main',name:'Main'},{id:'kids',name:'Kids'}];
    const index = selected ? profiles.findIndex(value => sameProfile(value, selected)) : 0;
    const active = profiles[index] || selected || profiles[0];
    return text(active?.id,100) || (index >= 0 ? 'legacy-' + index : active?.name ? 'name:' + text(active.name,80) : 'main');
  }
  function ownerId() { try { return localStorage.getItem('swiflytv.accountOwner') || 'guest'; } catch { return 'guest'; } }
  const contextId = () => JSON.stringify([ownerId(),profileId(),lifecycle,suspended]);
  function storageKey(owner = profileId()) {
    let suffix = text(owner,160);
    if (!/^[A-Za-z0-9_.:-]{1,100}$/.test(suffix) || suffix === '__compat__') {
      let hash = 2166136261;
      for (const character of suffix) hash = Math.imul(hash ^ character.codePointAt(0),16777619);
      suffix = 'profile-' + (hash >>> 0).toString(16);
    }
    return 'swiflytv.library.' + suffix;
  }
  function cleanPreferences(value, base = preferencesDefault) {
    const result = {...base};
    if (!plain(value)) return result;
    for (const name of booleanPreferences) if (typeof value[name] === 'boolean') result[name] = value[name];
    if (['grid','rows'].includes(value.episodeView)) result.episodeView = value.episodeView;
    if (['oldest','newest'].includes(value.episodeSort)) result.episodeSort = value.episodeSort;
    return result;
  }
  function media(value) {
    if (!plain(value) || !['movie','tv'].includes(value.type) || !integer(value.id)) return null;
    const id = String(Number(value.id)), type = value.type, titleKey = type + ':' + id;
    const season = type === 'tv' ? integer(value.season ?? value.s,0) : null;
    const episode = type === 'tv' ? integer(value.episode ?? value.e) : null;
    const exact = season !== null && episode !== null;
    const key = exact ? titleKey + ':' + season + ':' + episode : titleKey;
    return {key,titleKey,id,type,title:text(value.title || value.name) || 'Untitled',poster:text(value.poster || value.poster_path,500),backdrop:text(value.backdrop || value.backdrop_path,500),year:text(value.year,4),rating:text(value.rating,12),
      ...(exact ? {season,episode} : {}),...(value.savedAt ? {savedAt:iso(value.savedAt)} : {})};
  }
  const titleOnly = value => {const result = media(value);if (!result) return null;delete result.season;delete result.episode;result.key = result.titleKey;return result;};
  function unique(rows, normalize, limit) {
    const seen = new Set(), result = [];
    for (const value of Array.isArray(rows) ? rows : []) {
      const item = normalize(value);if (!item || seen.has(item.key)) continue;
      seen.add(item.key);result.push(item);if (result.length >= limit) break;
    }
    return result;
  }
  function watchedEntry(value) { const item = media(value);return item ? {...item,watchedAt:iso(value.watchedAt),...(value.source ? {source:text(value.source,30)} : {})} : null; }
  function historyEntry(value) { const item = media(value);return item ? {...item,currentTime:clock(value.currentTime),duration:clock(value.duration),completed:value.completed === true,watchedAt:iso(value.watchedAt)} : null; }
  const episodeId = value => /^tv:[1-9]\d{0,9}:(?:0|[1-9]\d{0,3}):[1-9]\d{0,3}$/.test(String(value));
  function empty() { return {version:1,watchlist:[],liked:[],watched:[],history:[],folders:[],episodeRead:[],preferences:{...preferencesDefault}}; }
  function normalize(value) {
    if (!plain(value) || value.version !== 1) return empty();
    const result = empty();
    result.watchlist = unique(value.watchlist,titleOnly,300);result.liked = unique(value.liked,titleOnly,300);
    result.watched = unique(value.watched,watchedEntry,1000).sort((a,b) => Date.parse(b.watchedAt)-Date.parse(a.watchedAt));
    result.history = unique(value.history,historyEntry,300).sort((a,b) => Date.parse(b.watchedAt)-Date.parse(a.watchedAt));
    result.preferences = cleanPreferences(value.preferences);
    result.episodeRead = [...new Set((Array.isArray(value.episodeRead) ? value.episodeRead : []).filter(episodeId))].slice(-500);
    const seen = new Set();
    for (const folder of Array.isArray(value.folders) ? value.folders : []) {
      if (!plain(folder) || !/^[A-Za-z0-9_-]{1,80}$/.test(folder.id || '') || seen.has(folder.id) || !text(folder.name,60).trim()) continue;
      seen.add(folder.id);result.folders.push({id:folder.id,name:text(folder.name,60).trim(),members:[...new Set((Array.isArray(folder.members) ? folder.members : []).filter(key => /^(movie|tv):[1-9]\d{0,9}$/.test(key)))].slice(0,300),createdAt:iso(folder.createdAt),updatedAt:iso(folder.updatedAt)});
      if (result.folders.length >= 50) break;
    }
    return result;
  }
  // Replay local changes since the last account revision onto a newer record.
  // A union cannot represent removals, and replacing the record loses imports.
  function reconcile(baseline, local, remote) {
    const before = normalize(baseline), after = normalize(local), result = normalize(remote);
    const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
    const members = (base, next, current) => [...new Set([...current.filter(value => !base.includes(value) || next.includes(value)),...next.filter(value => !base.includes(value))])];
    function fields(base, next, current) {
      const value = {...current};
      for (const [key,item] of Object.entries(next)) if (!equal(item,base?.[key])) value[key] = clone(item);
      return value;
    }
    function rows(name,key,merge = fields) {
      const base = new Map(before[name].map(item => [key(item),item])), next = new Map(after[name].map(item => [key(item),item])), current = new Map(result[name].map(item => [key(item),item])), changed = [];
      for (const id of base.keys()) if (!next.has(id)) current.delete(id);
      for (const [id,item] of next) {
        if (equal(item,base.get(id))) continue;
        current.set(id,merge(base.get(id),item,current.get(id) || item));changed.push(id);
      }
      result[name] = [...new Set([...changed,...current.keys()])].filter(id => current.has(id)).map(id => current.get(id));
    }
    rows('watchlist',item => item.key);rows('liked',item => item.key);
    for (const name of ['watched','history']) rows(name,item => item.key,(base,next,current) => {
      const value = fields(base,next,current);
      if (Date.parse(current.watchedAt) > Date.parse(value.watchedAt)) value.watchedAt = current.watchedAt;
      return value;
    });
    rows('folders',item => item.id,(base,next,current) => ({...fields(base,next,current),members:members(base?.members || [],next.members,current.members || [])}));
    result.episodeRead = members(before.episodeRead,after.episodeRead,result.episodeRead);
    result.preferences = fields(before.preferences,after.preferences,result.preferences);
    return normalize(result);
  }
  function ensure(owner = profileId()) {
    const raw = json(storageKey(owner),null);
    const state = raw ? normalize(raw) : empty(), compatibility = json(compatibilityKey,null);
    if (!compatibility?.owner) {
      let nativeOwner = raw ? owner : '';
      try {
        const nativeKey = !nativeOwner && Object.keys(localStorage).find(key => key !== compatibilityKey && /^swiflytv\.library\.[A-Za-z0-9_.:-]{1,100}$/.test(key) && json(key,null)?.version === 1);
        if (nativeKey) nativeOwner = nativeKey.slice('swiflytv.library.'.length);
      } catch {}
      // Existing native records mean the global arrays may already be another
      // profile's mirrors. Only a genuinely unmigrated library adopts them.
      if (!nativeOwner) {
        state.watchlist = unique(json('movieverse.watchlist',[]),titleOnly,300);
        state.liked = unique(json('movieverse.liked',[]),titleOnly,300);
      }
      stored(compatibilityKey,{version:1,owner:nativeOwner || owner});
    }
    if (!raw) stored(storageKey(owner),state);return state;
  }
  function read(owner = profileId()) { return clone(suspended ? empty() : ensure(owner)); }
  function mirror(state) {
    stored('movieverse.watchlist',state.watchlist);stored('movieverse.liked',state.liked);
    window.syncLibraryButtons?.();
  }
  function announce(detail) {
    publishing = true;
    try { window.dispatchEvent(new CustomEvent('swifly:library-change',{detail:{source:'library',profileId:profileId(),...detail}})); }
    finally { publishing = false; }
  }
  function write(state, owner, detail = {}, notify = true) {
    if (suspended) return false;
    const value = normalize(state);
    if (!stored(storageKey(owner),value)) return false;
    if (owner === profileId()) {mirror(value);renderDecorations();}
    if (notify) announce({profileId:owner,...detail});return true;
  }
  function syncLegacy() {
    if (suspended) return false;
    const owner = profileId(), state = ensure(owner);
    const watchlist = unique(json('movieverse.watchlist',[]),titleOnly,300), liked = unique(json('movieverse.liked',[]),titleOnly,300);
    if (JSON.stringify(watchlist) === JSON.stringify(state.watchlist) && JSON.stringify(liked) === JSON.stringify(state.liked)) return true;
    const changes = [];
    for (const [name,rows] of [['watchlist',watchlist],['liked',liked]]) {
      const before = new Map(state[name].map(item => [item.key,item])), after = new Map(rows.map(item => [item.key,item]));
      for (const [key,item] of after) if (!before.has(key)) changes.push({action:name,item,removed:false});
      for (const [key,item] of before) if (!after.has(key)) changes.push({action:name,item,removed:true});
    }
    state.watchlist = watchlist;state.liked = liked;
    if (!write(state,owner,{action:'legacy'},false)) return false;
    for (const detail of changes) announce({profileId:owner,...detail});return true;
  }
  function setList(name,value,present = true) {
    const item = titleOnly(value);if (!item || suspended) return false;
    const owner = profileId(), state = ensure(owner), previous = state[name].find(row => row.key === item.key);
    state[name] = state[name].filter(row => row.key !== item.key);
    if (present) state[name].unshift({...previous,...item,savedAt:previous?.savedAt || new Date().toISOString()});
    return write(state,owner,{action:name,item,removed:!present});
  }
  const setWatchlist = (value,present = true) => setList('watchlist',value,present);
  const setLiked = (value,present = true) => setList('liked',value,present);
  function markWatched(value, options = {}) {
    const item = media(value), owner = options.owner || profileId();if (!item || suspended) return false;
    const state = ensure(owner), at = iso(options.watchedAt || value.watchedAt,new Date().toISOString());
    const record = {...item,watchedAt:at,...(options.source ? {source:text(options.source,30)} : {})};
    state.watched = [record,...state.watched.filter(row => row.key !== item.key)];
    const previous = state.history.find(row => row.key === item.key) || {};
    state.history = [{...item,currentTime:clock(value.duration || previous.duration || value.currentTime),duration:clock(value.duration || previous.duration),completed:true,watchedAt:at},...state.history.filter(row => row.key !== item.key)];
    return write(state,owner,{source:options.source || 'library',action:'watched',item:record});
  }
  function remember(value, options = {}) {
    const item = media(value), owner = options.owner || profileId();if (!item || suspended) return false;
    if (value.completed === true || value.ended === true) return markWatched(value,options);
    const state = ensure(owner), record = {...item,currentTime:clock(value.currentTime),duration:clock(value.duration),completed:false,watchedAt:iso(options.watchedAt || value.watchedAt,new Date().toISOString())};
    state.history = [record,...state.history.filter(row => row.key !== item.key)];return write(state,owner,{action:'progress',item:record});
  }
  function removeWatched(value) {
    const key = typeof value === 'string' ? value : media(value)?.key;if (!key || suspended) return false;
    const owner = profileId(), state = ensure(owner), item = state.watched.find(row => row.key === key);if (!item) return false;
    state.watched = state.watched.filter(row => row.key !== key);
    state.history = state.history.filter(row => row.key !== key || !row.completed);
    return write(state,owner,{action:'watched',item,removed:true});
  }
  function isWatched(value, owner = profileId()) {
    const item = media(value);if (!item || suspended) return false;
    return ensure(owner).watched.some(row => row.key === item.key || row.key === item.titleKey);
  }
  const preferences = () => read().preferences;
  function savePreferences(patch) {
    if (suspended) return false;const owner = profileId(), state = ensure(owner);
    state.preferences = cleanPreferences(patch,state.preferences);return write(state,owner,{action:'preferences'});
  }
  function folderName(name,state,exclude = '') {
    const value = typeof name === 'string' ? name.trim().slice(0,60) : '';
    if (!value) throw Error('Enter a folder name.');
    if (state.folders.some(folder => folder.id !== exclude && folder.name.toLocaleLowerCase() === value.toLocaleLowerCase())) throw Error('A folder with that name already exists.');
    return value;
  }
  function createFolder(name) {
    if (suspended) return false;const owner = profileId(), state = ensure(owner);
    if (state.folders.length >= 50) throw Error('You can keep up to 50 folders.');
    const timestamp = new Date().toISOString(), folder = {id:window.crypto?.randomUUID?.() || 'folder-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10),name:folderName(name,state),members:[],createdAt:timestamp,updatedAt:timestamp};
    state.folders.push(folder);return write(state,owner,{action:'folder'}) ? clone(folder) : false;
  }
  function renameFolder(id,name) {
    if (suspended) return false;const owner = profileId(), state = ensure(owner), folder = state.folders.find(value => value.id === id);if (!folder) return false;
    folder.name = folderName(name,state,id);folder.updatedAt = new Date().toISOString();return write(state,owner,{action:'folder'});
  }
  function deleteFolder(id) {
    if (suspended) return false;const owner = profileId(), state = ensure(owner);if (!state.folders.some(value => value.id === id)) return false;
    state.folders = state.folders.filter(value => value.id !== id);return write(state,owner,{action:'folder'});
  }
  function setFolderMember(id,value,present = true) {
    if (suspended) return false;
    const owner = profileId(), state = ensure(owner), folder = state.folders.find(row => row.id === id);
    const key = typeof value === 'string' && /^(movie|tv):[1-9]\d{0,9}$/.test(value) ? value : titleOnly(value)?.key;
    if (!folder || !key || suspended) return false;
    folder.members = folder.members.filter(member => member !== key);if (present) folder.members.push(key);
    folder.updatedAt = new Date().toISOString();return write(state,owner,{action:'folder'});
  }
  function acknowledgeEpisodes(ids) {
    if (!Array.isArray(ids) || suspended) return false;
    const owner = profileId(), state = ensure(owner);state.episodeRead = [...new Set([...state.episodeRead,...ids.filter(episodeId)])].slice(-500);
    return write(state,owner,{action:'episodes-read'});
  }
  const episodeIsRead = id => read().episodeRead.includes(String(id));
  function resumeHref(value) {
    const item = media(value);if (!item) return '';
    const params = new URLSearchParams({mode:'movie'});
    if (item.type === 'tv') {params.set('s',String(item.season ?? 1));params.set('e',String(item.episode ?? 1));}
    if (value.completed !== true && clock(value.currentTime) >= 1 && clock(value.duration) > clock(value.currentTime)) params.set('resume','1');
    return '/watch/' + item.type + '/' + item.id + '?' + params;
  }
  function list(tab = 'watchlist', options = {}) {
    const state = read();let rows;
    if (['watched','completed'].includes(tab)) rows = state.watched;
    else if (tab === 'history') {
      const progress = (window.SwiflyContinue?.read?.() || []).filter(row => row.resumable).map(historyEntry).filter(Boolean);
      rows = unique([...state.history,...progress].sort((a,b) => Date.parse(b.watchedAt)-Date.parse(a.watchedAt)),historyEntry,300);
    }
    else if (['continue','progress'].includes(tab)) rows = window.SwiflyContinue?.read?.() || state.history.filter(row => !row.completed && row.duration > row.currentTime && row.currentTime >= 1);
    else rows = state[tab === 'liked' ? 'liked' : 'watchlist'];
    const members = options.folder ? new Set(state.folders.find(folder => folder.id === options.folder)?.members || []) : null;
    const query = text(options.search).trim().toLocaleLowerCase();
    const filtered = rows.filter(row => (!['movie','tv'].includes(options.type) || row.type === options.type) && (!members || members.has(row.titleKey || row.type + ':' + row.id)) && (!query || row.title.toLocaleLowerCase().includes(query)));
    if (options.sort === 'title') filtered.sort((a,b) => a.title.localeCompare(b.title));
    else if (options.sort === 'rating') filtered.sort((a,b) => (Number(b.rating) || 0)-(Number(a.rating) || 0));
    else if (options.sort === 'release') filtered.sort((a,b) => (Number(b.year) || 0)-(Number(a.year) || 0));
    else filtered.sort((a,b) => Date.parse(b.watchedAt || b.savedAt || 0)-Date.parse(a.watchedAt || a.savedAt || 0));
    return clone(filtered);
  }
  function importState(value, owner = profileId(), options = {}) {
    if (!plain(value) || suspended) return false;const state = ensure(owner);
    for (const name of ['watchlist','liked']) if (Array.isArray(value[name])) state[name] = unique([...value[name],...state[name]],titleOnly,300);
    if (Array.isArray(value.watched)) {
      const rows = [...state.watched,...value.watched.map(watchedEntry).filter(Boolean)].sort((a,b) => Date.parse(b.watchedAt)-Date.parse(a.watchedAt));
      state.watched = unique(rows,watchedEntry,1000);
      for (const item of state.watched) if (!state.history.some(row => row.key === item.key)) state.history.push({...item,currentTime:0,duration:0,completed:true});
    }
    return write(state,owner,{source:options.source || 'library',action:'import'});
  }
  function itemFromNode(node) {
    const supplied = node.matches('[data-library-id]') ? node : node.querySelector('[data-watch-id],[data-play-id],[data-library-id]');
    if (supplied) {
      const prefix = supplied.hasAttribute('data-library-id') ? 'library' : supplied.hasAttribute('data-watch-id') ? 'watch' : 'play';
      const item = {id:supplied.dataset[prefix + 'Id'],type:supplied.dataset[prefix + 'Type']};
      if (node.hasAttribute('data-library-season')) {item.season = node.dataset.librarySeason;item.episode = node.dataset.libraryEpisode;}
      return media(item);
    }
    const anchor = node.matches('a[href]') ? node : node.querySelector('a[href]');if (!anchor) return null;
    try {
      const url = new URL(anchor.href,location.href), match = url.pathname.match(/^\/(?:watch\/)?(movie|tv)\/([1-9]\d{0,9})$/);if (!match || url.origin !== location.origin) return null;
      return media({type:match[1],id:match[2],...(node.matches('.svPlayerEpisodeChoice') ? {season:url.searchParams.get('s'),episode:url.searchParams.get('e')} : {})});
    } catch { return null; }
  }
  function renderDecorations(root = document) {
    if (!document.body) return;const state = read(), prefs = state.preferences, watchedKeys = new Set(state.watched.map(item => item.key));
    document.body.dataset.librarySpoilers = prefs.spoilerMode ? 'hide' : 'show';document.body.dataset.libraryHideWatched = String(prefs.hideWatched);
    document.body.dataset.libraryEpisodeView = prefs.episodeView;document.body.dataset.libraryEpisodeSort = prefs.episodeSort;
    for (const card of root.querySelectorAll('.movieCard,.svResumeCard,.svPlayerEpisodeChoice,.svTitleDetails,[data-library-card]')) {
      const item = itemFromNode(card), watched = !!item && (watchedKeys.has(item.key) || watchedKeys.has(item.titleKey));card.dataset.libraryWatched = String(watched);
      const badge = card.querySelector('.svLibraryWatchedBadge');
      if (!watched) {badge?.remove();continue;}
      if (!badge) {const mark = document.createElement('span');mark.className = 'svLibraryWatchedBadge';mark.textContent = 'Watched';(card.querySelector('.dsCardArtwork,.svResumeArtwork,.svPlayerEpisodeThumb') || card).append(mark);}
    }
    for (const node of root.querySelectorAll('.dsHeroContent > p,.svTvSpotlightOverview,.svDetailOverview p,.svPlayerEpisodeOverview,.svPlayerEpisodeText strong,.svPlayerEpisodeThumb img,.svSeason > p,[data-library-spoiler]')) {
      if (!watchedLabels.has(node)) watchedLabels.set(node,{hidden:node.getAttribute('aria-hidden')});
      node.dataset.librarySpoiler = '';
      if (prefs.spoilerMode) node.setAttribute('aria-hidden','true');
      else {const original = watchedLabels.get(node).hidden;original === null ? node.removeAttribute('aria-hidden') : node.setAttribute('aria-hidden',original);}
    }
    for (const link of root.querySelectorAll('[data-player-episode-link]')) {
      if (!spoilerLabels.has(link)) spoilerLabels.set(link,{label:link.getAttribute('aria-label'),title:link.getAttribute('title')});
      if (prefs.spoilerMode) {
        let season = '', episode = '';try {const url = new URL(link.href,location.href);season = url.searchParams.get('s') || '';episode = url.searchParams.get('e') || '';} catch {}
        link.setAttribute('aria-label','Play season ' + season + ', episode ' + episode);link.removeAttribute('title');
      } else {const saved = spoilerLabels.get(link);for (const [name,value] of [['aria-label',saved.label],['title',saved.title]]) value === null ? link.removeAttribute(name) : link.setAttribute(name,value);}
    }
    for (const host of root.querySelectorAll('.svPlayerEpisodeGrid,.svPlayerSeasons')) {
      const position = child => {const link = child.matches('a[href]') ? child : child.querySelector('a[href]');try {const params = new URL(link.href,location.href).searchParams;return Number(params.get('s') || 0)*10000+Number(params.get('e') || 0);} catch {return 0;}};
      const ordered = [...host.children].filter(child => child.matches('.svPlayerEpisodeChoice,[data-player-season-link]')).sort((a,b) => (position(a)-position(b))*(prefs.episodeSort === 'newest' ? -1 : 1));
      for (let index = 0;index < ordered.length;index++) if (host.children[index] !== ordered[index]) host.insertBefore(ordered[index],host.children[index] || null);
    }
  }
  function hydrate(action = 'hydrate') {
    if (verificationRequired || suspended) return;
    const state = ensure();mirror(state);renderDecorations();announce({action});resolveReady({active:true,profileId:profileId(),state:clone(state)});
  }
  function boot() {
    if (started) return;started = true;
    window.addEventListener('swifly:library-change',event => {if (publishing || event.detail?.source) return;syncLegacy();renderDecorations();});
    document.addEventListener('swifly:profile-changed',() => {lifecycle++;if (!verificationRequired && !suspended) hydrate('profile');else {renderDecorations();announce({action:'profile'});}});
    document.addEventListener('swifly:account-hydrated',() => {verificationRequired = false;suspended = false;hydrate();});
    document.addEventListener('swifly:account-suspended',() => {verificationRequired = true;suspended = true;verificationEpoch++;lifecycle++;renderDecorations();announce({action:'suspended'});resolveReady({active:false});});
    window.addEventListener('storage',event => {
      if (suspended) return;
      if (!event.key || event.key === storageKey() || ['swiflytv.activeProfile','swiflytv.accountOwner'].includes(event.key)) {lifecycle++;hydrate('storage');}
      else if (['movieverse.watchlist','movieverse.liked'].includes(event.key)) {syncLegacy();renderDecorations();announce({action:'storage'});}
    });
    new MutationObserver(records => {
      if (frame || !records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && !node.matches('.svLibraryWatchedBadge')))) return;
      frame = requestAnimationFrame(() => {frame = 0;renderDecorations();});
    }).observe(document.body,{childList:true,subtree:true});
    if (verificationRequired) {
      renderDecorations();const token = verificationEpoch;
      Promise.resolve(window.SwiflyAccount.ready).then(session => {
        if (token !== verificationEpoch || !verificationRequired) return;
        const expectedOwner = session?.user?.id || 'guest';
        if (session?.available === false || ownerId() !== expectedOwner) {resolveReady({active:false});return;}
        verificationRequired = false;suspended = false;hydrate('ready');
      }).catch(() => resolveReady({active:false}));
    } else hydrate('ready');
  }
  const api = {read,profileId,ownerId,contextId,storageKey,list,remember,markWatched,removeWatched,isWatched,setWatchlist,setLiked,preferences,savePreferences,createFolder,renameFolder,deleteFolder,setFolderMember,acknowledgeEpisodes,episodeIsRead,syncLegacy,renderDecorations,resumeHref,importState,reconcile,get active() {return !suspended;},ready};
  window.SwiflyLibrary = Object.freeze(api);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
