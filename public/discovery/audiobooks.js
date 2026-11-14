/* A quiet library with real chapters, request ownership and native audio. */
(() => {
  'use strict';
  const root = document.querySelector('[data-audiobooks]');
  if (!root) return;
  const find = selector => root.querySelector(selector);
  const form = find('[data-book-search]'), grid = find('[data-book-results]'), status = find('[data-book-status]');
  const more = find('[data-book-more]'), skeleton = find('[data-book-skeleton]'), dialog = find('[data-book-dialog]');
  const detail = find('[data-book-detail]'), detailStatus = find('[data-book-detail-status]'), title = find('[data-book-title]');
  const playback = find('[data-book-playback]'), chapters = find('[data-book-chapters]'), audio = find('[data-book-audio]');
  const speed = find('[data-book-speed]'), sleep = find('[data-book-sleep]'), sleepStatus = find('[data-book-sleep-status]');
  const previous = find('[data-book-previous]'), next = find('[data-book-next]'), quiet = find('[data-book-focus]');
  const releaseInitial = window.SwiflySiteLoading?.hold('Opening the listening room…');
  const params = () => new URLSearchParams(location.search);
  const boundedPage = value => Math.max(1, Math.min(200, parseInt(value, 10) || 1));
  const getStorage = key => {try { return localStorage.getItem(key); } catch { return null; }};
  const putStorage = (key, value) => {try { localStorage.setItem(key, value); } catch {}};
  const profile = () => {try { return JSON.parse(getStorage('swiflytv.activeProfile'))?.id || 'main'; } catch { return 'main'; }};
  const owner = () => getStorage('swiflytv.accountOwner') || '';
  const cleanProfile = value => String(value).replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 80);
  const progressKey = id => 'swiflytv.library.audio.' + cleanProfile(id);
  const node = (tag, cls, text) => {const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n;};
  const time = seconds => {const n = Math.max(0, Math.floor(Number(seconds) || 0)); return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');};
  const length = book => {const seconds = Number(book.seconds); return seconds > 0 ? (seconds >= 3600 ? Math.floor(seconds / 3600) + 'h ' : '') + Math.floor(seconds % 3600 / 60) + 'm' : String(book.duration || '').replace(/:00$/, '');};
  const audioUrl = value => {try {const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && /(^|\.)archive\.org$/.test(u.hostname) && /(?:\/download\/|\/items\/).+\.(mp3|m4a|m4b|ogg|opus|wav|flac|aac)$/i.test(u.pathname) ? u.href : ''; } catch { return ''; }};
  let page = boundedPage(params().get('page')), nextPage = null, query = (params().get('q') || '').trim().slice(0, 120);
  let listEpoch = 0, detailEpoch = 0, listController = null, detailController = null, disposed = false;
  let book = null, requestedBook = '', index = 0, resumeTime = 0, lastSave = 0, sleepTimer = 0, sleepAt = 0;
  let bookProfile = profile(), bookAccount = owner(), skipNextCloseHistory = false;
  const seen = new Set();
  form.elements.q.value = query;

  function saved(id = bookProfile) {
    try {const data = JSON.parse(getStorage(progressKey(id)) || '{}'); return data && typeof data === 'object' && !Array.isArray(data) ? data : {}; } catch { return {}; }
  }
  function updateUrl(values, push = false) {
    const u = new URL(location.href);
    for (const [key, value] of Object.entries(values)) value === null || value === '' || value === undefined ? u.searchParams.delete(key) : u.searchParams.set(key, String(value));
    const target = u.pathname + u.search + u.hash;
    if (target !== location.pathname + location.search + location.hash) history[push ? 'pushState' : 'replaceState']({}, '', target);
  }
  function coverFallback(b) {
    const art = node('span', 'svBookCoverFallback');
    art.append(node('small', '', 'THE QUIET COLLECTION'), node('strong', '', b.title), node('span', '', b.author));
    return art;
  }
  function renderContinue() {
    const entries = Object.entries(saved(profile())).filter(([id, row]) => /^\d{1,10}$/.test(id) && row && (Number(row.time) > 5 || Number(row.chapter) > 0) && typeof row.title === 'string').sort((a, b) => (Number(b[1].at) || 0) - (Number(a[1].at) || 0));
    const panel = find('[data-book-continue]'); panel.hidden = !entries.length;
    if (!entries.length) return;
    const [id, row] = entries[0];
    find('[data-book-continue-title]').textContent = row.title;
    find('[data-book-continue-meta]').textContent = 'Chapter ' + (Math.max(0, Number(row.chapter) || 0) + 1) + ' · ' + time(row.time) + (row.author ? ' · ' + row.author : '');
    find('[data-book-resume]').dataset.bookResume = id;
  }
  function save(force = false) {
    if (owner() !== bookAccount || !book || !audio.currentSrc && !audio.getAttribute('src') || !Number.isFinite(audio.currentTime) || !force && Date.now() - lastSave < 5000) return;
    const rows = saved();
    rows[book.id] = {chapter:index, time:audio.currentTime, speed:audio.playbackRate, at:Date.now(), title:book.title, author:book.author || ''};
    const limited = Object.fromEntries(Object.entries(rows).sort((a, b) => (Number(b[1]?.at) || 0) - (Number(a[1]?.at) || 0)).slice(0, 60));
    putStorage(progressKey(bookProfile), JSON.stringify(limited)); lastSave = Date.now();
    renderContinue(); window.dispatchEvent(new Event('swifly:library-change'));
  }
  function setScene(value, persist = false) {
    const scene = ['lake', 'forest', 'night'].includes(value) ? value : 'lake';
    root.dataset.bookScene = scene;
    for (const button of root.querySelectorAll('button[data-book-scene]')) button.setAttribute('aria-pressed', String(button.dataset.bookScene === scene));
    if (persist) putStorage('swiflytv.audiobooks.scene.' + cleanProfile(profile()), scene);
  }
  function focus(value) {
    root.dataset.bookQuiet = String(value); quiet.setAttribute('aria-pressed', String(value));
    quiet.querySelector('span').textContent = value ? 'Back to library' : 'Quiet view';
  }
  async function get(path, signal) {
    const response = await fetch('/api/discovery' + path, {signal, headers:{Accept:'application/json'}});
    const data = await response.json();
    if (!response.ok) throw Error(data.message || 'The library is taking a moment. Please try again.');
    return data;
  }
  function card(b) {
    const article = node('article', 'svDiscoveryCard svBookCard'), cover = node('button', 'svDiscoveryPoster svBookCover');
    article.dataset.bookCard = String(b.id); cover.type = 'button'; cover.setAttribute('aria-label', 'Listen to ' + b.title);
    cover.addEventListener('click', () => openBook(b.id));
    if (/^https:\/\//.test(b.poster || '')) {
      const image = node('img'); image.src = b.poster; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
      image.addEventListener('error', () => cover.replaceChildren(coverFallback(b)), {once:true}); cover.append(image);
    } else cover.append(coverFallback(b));
    const copy = node('div', 'svDiscoveryCardCopy');
    copy.append(node('small', '', b.language || 'AUDIOBOOK'), node('h3', '', b.title), node('p', '', b.author));
    const facts = [length(b), Number(b.chapterCount) > 0 ? b.chapterCount + ' chapters' : 'Ready to listen'].filter(Boolean).join(' · ');
    copy.append(node('span', 'svBookCardFacts', facts)); article.append(cover, copy); return article;
  }
  async function load(requestedPage = 1, append = false) {
    listController?.abort(); const token = ++listEpoch; listController = new AbortController();
    requestedPage = boundedPage(requestedPage); root.dataset.bookState = 'loading';
    form.setAttribute('aria-busy', 'true'); grid.setAttribute('aria-busy', 'true'); more.disabled = true;
    status.textContent = append ? 'Finding a few more stories…' : 'Opening the library…'; skeleton.hidden = append;
    find('[data-book-results-title]').textContent = query ? 'Stories matching “' + query + '”' : 'New to the quiet collection';
    find('[data-book-clear]').hidden = !query;
    if (!append) {seen.clear(); grid.replaceChildren();}
    try {
      const data = await get('/books?' + new URLSearchParams({q:query, page:String(requestedPage)}), listController.signal);
      if (token !== listEpoch || disposed) return;
      if (!Array.isArray(data.books)) throw Error('The library could not read these results. Please try again.');
      const fragment = document.createDocumentFragment();
      for (const b of data.books) {
        if (!b || !/^\d{1,10}$/.test(String(b.id)) || !b.title || b.playable === false || b.chapterCount === 0 || seen.has(String(b.id))) continue;
        seen.add(String(b.id)); fragment.append(card(b));
      }
      grid.append(fragment); page = requestedPage;
      nextPage = data.hasMore === true ? boundedPage(data.nextPage || page + 1) : data.hasMore === false ? null : data.books.length >= 24 ? page + 1 : null;
      if (nextPage <= page || nextPage > 200) nextPage = null;
      more.hidden = nextPage === null;
      const count = grid.children.length;
      find('[data-book-results-count]').textContent = count ? count + (count === 1 ? ' recording' : ' recordings') + (query ? ' to explore' : ' · ready to listen') : 'A different story is out there.';
      status.textContent = data.message || (count ? '' : query ? 'No playable recordings match this search. Try a shorter title or the author’s surname.' : 'The library is quiet right now. Try a title or author, or check back in a moment.');
      root.dataset.bookState = count ? 'ready' : 'empty';
      if (append) updateUrl({page:page > 1 ? page : null});
    } catch (error) {
      if (token !== listEpoch || disposed || error.name === 'AbortError') return;
      root.dataset.bookState = 'error'; more.hidden = true; status.textContent = error.message;
      const retry = node('button', '', 'Try again'); retry.type = 'button';
      retry.addEventListener('click', () => load(requestedPage, append)); status.append(' ', retry);
    } finally {
      if (token === listEpoch && !disposed) {more.disabled = false; skeleton.hidden = true; form.setAttribute('aria-busy', 'false'); grid.setAttribute('aria-busy', 'false'); releaseInitial?.();}
    }
  }
  function clearSleep() {clearTimeout(sleepTimer); sleepTimer = 0; sleepAt = 0; sleep.value = '0'; sleepStatus.textContent = '';}
  function stopAudio() {audio.pause(); audio.removeAttribute('src'); audio.load(); clearSleep();}
  function closeBook(updateHistory = true) {
    save(true); stopAudio(); detailController?.abort(); ++detailEpoch; requestedBook = ''; book = null; playback.hidden = true;
    if (updateHistory) updateUrl({book:null});
  }
  function renderDetail(b) {
    title.textContent = b.title;
    const heading = node('div', 'svBookDetailHead');
    if (b.poster) {const image = node('img'); image.src = b.poster; image.alt = ''; image.addEventListener('error', () => image.replaceWith(coverFallback(b)), {once:true}); heading.append(image);} else heading.append(coverFallback(b));
    const copy = node('div'), facts = node('div', 'svBookDetailFacts');
    for (const value of [b.language, length(b), b.chapters.length + ' chapters'].filter(Boolean)) facts.append(node('span', '', value));
    copy.append(node('p', 'svBookAuthor', b.author), facts);
    if (b.description) copy.append(node('p', 'svBookDescription', b.description));
    try {
      const u = new URL(b.textUrl);
      if (u.protocol === 'https:' && /(^|\.)(gutenberg\.org|standardebooks\.org|wikisource\.org|archive\.org)$/.test(u.hostname)) {
        const read = node('a', 'svBookTextLink', 'Read the original text ↗'); read.href = u.href; read.target = '_blank'; read.rel = 'noopener noreferrer'; copy.append(read);
      }
    } catch {}
    heading.append(copy); detail.replaceChildren(heading);
  }
  async function openBook(id, updateHistory = true) {
    if (!/^\d{1,10}$/.test(String(id)) || disposed) return;
    save(true); stopAudio(); detailController?.abort(); const token = ++detailEpoch; requestedBook = String(id); book = null;
    bookProfile = profile(); bookAccount = owner(); detail.replaceChildren(); chapters.replaceChildren(); playback.hidden = true;
    title.textContent = 'Opening your story…'; detailStatus.textContent = 'Making a little room for a good story.';
    if (!dialog.open) dialog.showModal(); find('[data-book-close]').focus();
    if (updateHistory) updateUrl({book:String(id)}, true);
    try {
      await window.SwiflyAccount?.ready;
      if (token !== detailEpoch || disposed || !dialog.open) return;
      bookProfile = profile(); bookAccount = owner(); detailController = new AbortController();
      const data = await get('/books/' + id, detailController.signal);
      if (token !== detailEpoch || disposed || !dialog.open) return;
      const b = data.book;
      if (!b || String(b.id) !== String(id) || !Array.isArray(b.chapters)) throw Error('This recording is unavailable. Choose another story.');
      b.chapters = b.chapters.filter(c => c && audioUrl(c.url)).map(c => ({...c, url:audioUrl(c.url)}));
      if (!b.chapters.length) {title.textContent = b.title || 'This story is unavailable'; detailStatus.textContent = 'This recording has no playable chapters. Please choose another edition.'; return;}
      book = b; renderDetail(book); playback.hidden = false;
      const progress = saved()[book.id]; index = Math.max(0, Math.min(book.chapters.length - 1, Math.floor(Number(progress?.chapter) || 0)));
      resumeTime = Math.max(0, Number(progress?.time) || 0); speed.value = String([.75, 1, 1.25, 1.5, 2].includes(Number(progress?.speed)) ? progress.speed : 1);
      find('[data-book-chapter-count]').textContent = book.chapters.length + ' chapters';
      const fragment = document.createDocumentFragment();
      for (const [i, chapter] of book.chapters.entries()) {
        const button = node('button', 'svBookChapter'); button.type = 'button'; button.dataset.bookChapter = String(i);
        button.append(node('span', '', String(i + 1).padStart(2, '0')), node('strong', '', chapter.title || 'Chapter ' + (i + 1)), node('small', '', chapter.duration ? Math.max(1, Math.round(chapter.duration / 60)) + ' min' : ''));
        button.addEventListener('click', () => select(i, {play:true, resume:i === index ? resumeTime : 0})); fragment.append(button);
      }
      chapters.replaceChildren(fragment); select(index, {resume:resumeTime});
    } catch (error) {
      if (token === detailEpoch && !disposed && error.name !== 'AbortError') {
        title.textContent = 'This story is taking a moment'; detailStatus.textContent = error.message;
        const retry = node('button', '', 'Try this story again'); retry.type = 'button'; retry.addEventListener('click', () => openBook(id, false)); detailStatus.append(' ', retry);
      }
    }
  }
  function select(nextIndex, {play = false, resume = 0} = {}) {
    if (!book?.chapters[nextIndex]) return;
    save(true); index = nextIndex; resumeTime = Math.max(0, Number(resume) || 0);
    audio.defaultPlaybackRate = Number(speed.value) || 1; audio.src = book.chapters[index].url; audio.load(); audio.playbackRate = audio.defaultPlaybackRate;
    for (const button of chapters.children) button.setAttribute('aria-current', String(Number(button.dataset.bookChapter) === index));
    find('[data-book-current]').textContent = book.chapters[index].title || 'Chapter ' + (index + 1);
    detailStatus.textContent = resume > 5 ? 'Your place is saved. Resume from ' + time(resume) + '.' : 'Press play, and let the rest of the day wait.';
    previous.disabled = index === 0; next.disabled = index === book.chapters.length - 1;
    if (play) audio.play().catch(() => {detailStatus.textContent = 'Tap the audio play button when you’re ready.';});
  }
  function finishSleep() {save(true); audio.pause(); clearSleep(); sleepStatus.textContent = 'Sleep timer complete. Playback paused.';}
  function search(value, push = true) {
    if (dialog.open) {skipNextCloseHistory = true; dialog.close();}
    query = String(value || '').trim().slice(0, 120); form.elements.q.value = query;
    updateUrl({q:query || null, page:null, book:null}, push); load(1);
  }
  audio.addEventListener('loadedmetadata', () => {if (resumeTime > 0 && Number.isFinite(audio.duration) && resumeTime < audio.duration - 2) audio.currentTime = resumeTime; resumeTime = 0;});
  audio.addEventListener('timeupdate', () => {save(); if (sleepAt && Date.now() >= sleepAt) finishSleep();});
  audio.addEventListener('pause', () => save(true));
  audio.addEventListener('error', () => {if (book) detailStatus.textContent = 'This chapter could not load. Try another chapter or another recording.';});
  audio.addEventListener('ended', () => {save(true); if (sleep.value === 'chapter') {finishSleep(); return;} if (book && index + 1 < book.chapters.length) select(index + 1, {play:true}); else detailStatus.textContent = 'The end. We hope the story stays with you.';});
  speed.addEventListener('change', () => {audio.defaultPlaybackRate = audio.playbackRate = Number(speed.value); save(true);});
  sleep.addEventListener('change', () => {clearTimeout(sleepTimer); sleepAt = 0; sleepStatus.textContent = sleep.value === 'chapter' ? 'We’ll pause when this chapter ends.' : ''; const minutes = Number(sleep.value); if (minutes > 0) {sleepAt = Date.now() + minutes * 60000; sleepTimer = setTimeout(finishSleep, minutes * 60000); sleepStatus.textContent = 'Pausing in ' + minutes + ' minutes.';}});
  previous.addEventListener('click', () => select(index - 1, {play:!audio.paused})); next.addEventListener('click', () => select(index + 1, {play:!audio.paused}));
  form.addEventListener('submit', event => {event.preventDefault(); search(form.elements.q.value);});
  more.addEventListener('click', () => {if (nextPage && !more.disabled) load(nextPage, true);});
  for (const button of root.querySelectorAll('[data-book-query]')) button.addEventListener('click', () => search(button.dataset.bookQuery));
  find('[data-book-clear]').addEventListener('click', () => {search(''); form.elements.q.focus();});
  for (const button of root.querySelectorAll('button[data-book-scene]')) button.addEventListener('click', () => setScene(button.dataset.bookScene, true));
  quiet.addEventListener('click', () => focus(quiet.getAttribute('aria-pressed') !== 'true'));
  find('[data-book-resume]').addEventListener('click', event => {if (event.currentTarget.dataset.bookResume) openBook(event.currentTarget.dataset.bookResume);});
  document.addEventListener('keydown', event => {if (event.key === 'Escape' && !dialog.open && root.dataset.bookQuiet === 'true') {focus(false); quiet.focus();}});
  find('[data-book-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {const update = !skipNextCloseHistory; skipNextCloseHistory = false; closeBook(update);});
  dialog.addEventListener('click', event => {if (event.target !== dialog) return; const b = dialog.getBoundingClientRect(); if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) dialog.close();});
  document.addEventListener('visibilitychange', () => {if (document.hidden) save(true); if (sleepAt && Date.now() >= sleepAt) finishSleep();});
  function identityChanged() {if (dialog.open) dialog.close(); else closeBook(); setScene(getStorage('swiflytv.audiobooks.scene.' + cleanProfile(profile()))); renderContinue();}
  document.addEventListener('swifly:account-suspended', identityChanged); document.addEventListener('swifly:profile-changed', identityChanged);
  window.addEventListener('storage', event => {if (!event.key || ['swiflytv.activeProfile', 'swiflytv.accountOwner'].includes(event.key)) identityChanged();});
  window.addEventListener('popstate', () => {
    const p = params(), nextQuery = (p.get('q') || '').trim().slice(0, 120), nextListPage = boundedPage(p.get('page'));
    if (nextQuery !== query || nextListPage !== page) {query = nextQuery; form.elements.q.value = query; load(nextListPage);}
    const id = p.get('book');
    if (id && id !== requestedBook) openBook(id, false);
    else if (!id && dialog.open) {skipNextCloseHistory = true; dialog.close();}
  });
  window.addEventListener('pagehide', () => {save(true); disposed = true; audio.pause(); clearTimeout(sleepTimer); listController?.abort(); detailController?.abort(); ++listEpoch; ++detailEpoch;});
  window.addEventListener('pageshow', event => {if (!event.persisted) return; disposed = false; load(boundedPage(params().get('page'))); if (params().get('book')) openBook(params().get('book'), false); if (sleepAt && Date.now() >= sleepAt) finishSleep();});
  setScene(getStorage('swiflytv.audiobooks.scene.' + cleanProfile(profile()))); renderContinue(); load(page);
  const openInitial = () => {const initial = params().get('book'); if (initial) openBook(initial, false);};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', openInitial, {once:true}); else openInitial();
})();
