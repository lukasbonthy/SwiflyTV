/* A real library view backed by the profile state and playback progress APIs. */
(() => {
  'use strict';
  const tabs = [['watchlist','Saved'],['continue','Continue watching'],['history','History'],['completed','Completed'],['liked','Favorites']];
  const node = (tag,className,text) => {const element = document.createElement(tag);if (className) element.className = className;if (text !== undefined) element.textContent = text;return element;};
  const field = (label,select) => {const wrapper = node('label','svLibraryField');wrapper.append(node('span','',label),select);return wrapper;};
  function select(attribute,options) {const input = node('select');input.setAttribute(attribute,'');for (const [value,label] of options) {const option = node('option','',label);option.value = value;input.append(option);}return input;}
  const button = (text,attribute,className = 'svLibraryButton') => {const element = node('button',className,text);element.type = 'button';element.setAttribute(attribute,'');return element;};
  const time = value => {const seconds = Math.max(0,Math.floor(Number(value) || 0)),hours = Math.floor(seconds/3600),minutes = Math.floor(seconds%3600/60);return (hours ? hours + ':' + String(minutes).padStart(2,'0') : minutes) + ':' + String(seconds%60).padStart(2,'0');};
  const imageUrl = value => typeof value !== 'string' ? '' : /^https:\/\/image\.tmdb\.org\/t\/p\/[A-Za-z0-9_/.-]+$/.test(value) ? value : /^\/[A-Za-z0-9_.-]+$/.test(value) ? 'https://image.tmdb.org/t/p/w342' + value : '';
  function mount(root) {
    if (root.dataset.libraryMounted || !window.SwiflyLibrary) return;
    root.dataset.libraryMounted = 'true';root.classList.add('svLibraryPage','dsPlainPage');
    const api = window.SwiflyLibrary, query = new URLSearchParams(location.search);
    const defaultTab = tabs.some(([id]) => id === root.dataset.libraryDefaultTab) ? root.dataset.libraryDefaultTab : 'watchlist';
    let tab = tabs.some(([id]) => id === query.get('tab')) ? query.get('tab') : defaultTab, editorMode = 'create', selected = new Map(),clearingFavorites = false;
    const header = node('header','svLibraryHeader'),heading = node('h1','','My List');header.append(node('span','svLibraryEyebrow','YOUR LIBRARY'),heading,node('p','','The stories you saved, started, and finished.'));
    const navigation = node('nav','svLibraryTabs');navigation.setAttribute('aria-label','Library sections');
    for (const [id,label] of tabs) {const control = button(label,'data-library-tab','svLibraryTab');control.dataset.libraryTab = id;navigation.append(control);}
    const type = select('data-library-type',[['all','All formats'],['movie','Movies'],['tv','Series']]);if (['movie','tv'].includes(query.get('type'))) type.value = query.get('type');
    const folder = select('data-library-folder',[['','All folders']]);folder.value = '';
    const sort = select('data-library-sort',[['recent','Recently added'],['title','Title A–Z'],['rating','Highest rated'],['release','Newest release']]);if (['title','rating','release'].includes(query.get('sort'))) sort.value = query.get('sort');
    const search = node('input');search.type = 'search';search.setAttribute('data-library-search','');search.placeholder = 'Find in your library';search.maxLength = 120;search.setAttribute('aria-label','Find a title in your library');
    const toolbar = node('div','svLibraryToolbar');toolbar.append(field('Format',type),field('Folder',folder),field('Sort',sort),field('Search',search));
    const folderControls = node('div','svLibraryFolderControls'),create = button('New folder','data-library-folder-open'),rename = button('Rename folder','data-library-folder-rename'),remove = button('Delete folder','data-library-folder-delete','svLibraryButton svLibraryDanger'),clearFavorites = button('Clear favorites','data-library-clear-liked','svLibraryButton svLibraryDanger');folderControls.append(create,rename,remove,clearFavorites);
    const editor = node('section','svLibraryFolderEditor');editor.hidden = true;editor.setAttribute('data-library-folder-editor','');
    const form = node('form','svLibraryFolderForm');form.setAttribute('data-library-folder-form','');const folderInput = node('input');folderInput.type = 'text';folderInput.name = 'folderName';folderInput.maxLength = 60;folderInput.required = true;folderInput.id = 'svLibraryFolderName';const folderLabel = node('label','','Folder name');folderLabel.htmlFor = folderInput.id;
    const submit = node('button','svLibraryButton','Create folder');submit.type = 'submit';const cancel = button('Cancel','data-library-folder-cancel');form.append(folderLabel,folderInput,submit,cancel);editor.append(form);
    const status = node('p','svLibraryStatus');status.setAttribute('data-library-status','');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const summary = node('p','svLibraryCount');summary.setAttribute('data-library-count','');
    const grid = node('div','dsGrid svLibraryGrid');grid.setAttribute('data-library-grid','');
    const empty = node('div','svLibraryEmpty');empty.setAttribute('data-library-empty','');
    const emptyText = node('p'),emptyActions = node('p');emptyActions.setAttribute('data-library-empty-actions','');
    const resetFilters = button('Clear filters','data-library-reset-filters'),browse = node('a','dsSecondaryBtn','Find something to watch'),recover = node('a','dsSecondaryBtn','Import or recover saved data');
    browse.href = '/search';browse.setAttribute('data-library-browse','');recover.href = '/account#account-data';recover.setAttribute('data-library-recover','');
    emptyActions.append(resetFilters,document.createTextNode(' '),browse,document.createTextNode(' '),recover);empty.append(emptyText,emptyActions);
    root.replaceChildren(header,navigation,toolbar,folderControls,editor,status,summary,empty,grid);
    function updateUrl() {
      const params = new URLSearchParams(location.search);
      for (const [name,value] of [['tab',tab === defaultTab ? '' : tab],['type',type.value === 'all' ? '' : type.value],['folder',folder.value],['sort',sort.value === 'recent' ? '' : sort.value]]) value ? params.set(name,value) : params.delete(name);
      const suffix = params.toString();history.replaceState(history.state,'',location.pathname + (suffix ? '?' + suffix : '') + location.hash);
    }
    function openEditor(mode) {
      editorMode = mode;const current = api.read().folders.find(value => value.id === folder.value);
      if (mode === 'rename' && !current) return;
      folderInput.value = mode === 'rename' ? current.name : '';submit.textContent = mode === 'rename' ? 'Save name' : 'Create folder';editor.hidden = false;folderInput.focus();status.textContent = '';
    }
    function card(item,state,progress) {
      const key = item.key || item.type + ':' + item.id, titleKey = item.titleKey || item.type + ':' + item.id;
      const article = node('article','movieCard dsCard svLibraryCard');article.setAttribute('data-library-card','');article.dataset.libraryId = item.id;article.dataset.libraryType = item.type;
      if (item.season !== undefined && item.episode !== undefined) {article.dataset.librarySeason = item.season;article.dataset.libraryEpisode = item.episode;}
      const artwork = node('div','dsCardArtwork'),poster = node('a','posterWrap dsThumb');poster.href = '/' + item.type + '/' + item.id;poster.setAttribute('aria-label','Details for ' + item.title);
      const src = imageUrl(item.poster || item.backdrop);
      if (src) {const image = node('img');image.src = src;image.alt = item.title + ' poster';image.width = 342;image.height = 513;image.loading = 'lazy';image.decoding = 'async';poster.append(image);} else poster.append(node('div','posterFallback',item.title.slice(0,1)));
      artwork.append(poster);article.append(artwork);
      const copy = node('div','svLibraryCardCopy'),title = node('a','dsCardTitle',item.title);title.href = poster.href;title.title = item.title;
      const facts = [item.type === 'tv' ? 'Series' : 'Movie',item.year];if (item.season !== undefined) facts.push('S' + item.season + ' · E' + item.episode);
      copy.append(title,node('p','svLibraryCardMeta',facts.filter(Boolean).join(' · ')));
      const current = tab === 'history' && item.completed !== true && Number(item.duration) > Number(item.currentTime) ? item : progress.get(titleKey);
      const sameEpisode = current && (item.season === undefined || Number(current.season) === Number(item.season) && Number(current.episode) === Number(item.episode));
      const resumable = sameEpisode && Number(current.currentTime) >= 1 && Number(current.duration) > Number(current.currentTime);
      if (resumable) {
        const meter = node('progress','svLibraryProgress');meter.max = Number(current.duration);meter.value = Number(current.currentTime);meter.setAttribute('aria-label','Playback progress for ' + item.title);
        copy.append(meter,node('p','svLibraryProgressLabel',time(current.currentTime) + ' of ' + time(current.duration)));
      } else if (item.watchedAt && Number.isFinite(Date.parse(item.watchedAt))) {const date = node('time','svLibraryDate',new Date(item.watchedAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}));date.dateTime = item.watchedAt;copy.append(date);}
      const actions = node('div','svLibraryCardActions'),play = node('a','svLibraryPlay',resumable ? 'Resume · ' + time(current.currentTime) : 'Play');play.href = api.resumeHref(resumable ? current : item);
      if (resumable) {play.setAttribute('data-library-resume-key',key);selected.set(key,{...current});}
      play.dataset.libraryFocus = key + ':play';play.setAttribute('aria-label',(resumable ? 'Resume ' : 'Play ') + item.title + (item.season !== undefined ? ', season ' + item.season + ', episode ' + item.episode : ''));
      actions.append(play);
      const watched = api.isWatched(item),mark = button(watched ? 'Mark unwatched' : 'Mark watched','data-library-mark-key');mark.dataset.libraryMarkKey = key;mark.dataset.libraryFocus = key + ':watched';mark.setAttribute('aria-pressed',String(watched));actions.append(mark);
      if (['watchlist','liked'].includes(tab)) {const removeItem = button('Remove','data-library-remove-key');removeItem.dataset.libraryRemoveKey = key;removeItem.dataset.libraryFocus = key + ':remove';removeItem.setAttribute('aria-label','Remove ' + item.title + ' from ' + (tab === 'liked' ? 'Favorites' : 'Saved'));actions.append(removeItem);}
      copy.append(actions);
      if (state.folders.length) {
        const menu = node('details','svLibraryFolderMenu'),label = node('summary','','Folders');menu.append(label);
        for (const value of state.folders) {const wrapper = node('label'),checkbox = node('input');checkbox.type = 'checkbox';checkbox.checked = value.members.includes(titleKey);checkbox.dataset.libraryMember = value.id;checkbox.dataset.libraryItemKey = key;checkbox.dataset.libraryFocus = key + ':folder:' + value.id;wrapper.append(checkbox,node('span','',value.name));menu.append(wrapper);}
        copy.append(menu);
      }
      selected.set(key,{...item,...(selected.has(key) ? {resume:selected.get(key)} : {})});article.append(copy);return article;
    }
    function render() {
      const focused = document.activeElement?.dataset.libraryFocus, state = api.read(), chosen = folder.value || query.get('folder') || '';
      folder.replaceChildren();for (const [value,label] of [['','All folders'],...state.folders.map(value => [value.id,value.name])]) {const option = node('option','',label);option.value = value;folder.append(option);}
      folder.value = state.folders.some(value => value.id === chosen) ? chosen : '';query.delete('folder');
      rename.hidden = remove.hidden = !folder.value;
      clearFavorites.hidden = tab !== 'liked' || !api.active || !state.liked.length;clearFavorites.disabled = clearingFavorites;
      heading.textContent = tab === 'watchlist' ? 'My List' : tabs.find(([id]) => id === tab)[1];
      for (const control of navigation.querySelectorAll('[data-library-tab]')) control.setAttribute('aria-pressed',String(control.dataset.libraryTab === tab));
      const rows = api.list(tab,{type:type.value,folder:folder.value,sort:sort.value,search:search.value}),progress = new Map(api.list('continue').map(value => [value.type + ':' + value.id,value]));
      selected = new Map();grid.replaceChildren(...rows.map(item => card(item,state,progress)));summary.textContent = rows.length + (['history','completed'].includes(tab) ? rows.length === 1 ? ' entry' : ' entries' : rows.length === 1 ? ' title' : ' titles');
      const filtered = !!(search.value || folder.value || type.value !== 'all'),hasRows = !!rows.length;
      empty.hidden = hasRows;emptyText.textContent = !api.active ? 'Your library is refreshing…' : filtered ? 'No titles match these filters.' : tab === 'completed' ? 'Movies and episodes you finish or mark watched will appear here.' : tab === 'history' ? 'Start watching a title to build your history.' : tab === 'continue' ? 'Start a film or episode to pick it up here later.' : tab === 'liked' ? 'Choose the heart on a title to add it to Favorites.' : 'Choose Save on a film or series to keep it here. Missing an earlier list? You can import a backup or check this browser for saved data.';
      emptyActions.hidden = hasRows || !api.active;resetFilters.hidden = hasRows || !api.active || !filtered;browse.hidden = hasRows || !api.active || filtered;recover.hidden = hasRows || !api.active || filtered || tab !== 'watchlist';
      api.renderDecorations(root);
      if (focused) [...root.querySelectorAll('[data-library-focus]')].find(value => value.dataset.libraryFocus === focused)?.focus();
    }
    navigation.addEventListener('click',event => {const control = event.target.closest('[data-library-tab]');if (!control) return;tab = control.dataset.libraryTab;status.textContent = '';updateUrl();render();});
    for (const input of [type,folder,sort]) input.addEventListener('change',() => {updateUrl();render();});
    search.addEventListener('input',render);
    resetFilters.addEventListener('click',() => {type.value = 'all';folder.value = '';query.delete('folder');search.value = '';status.textContent = '';updateUrl();render();search.focus();});
    clearFavorites.addEventListener('click',async() => {
      if (clearingFavorites || !api.active) return;
      const items = api.list('liked'),owner = api.contextId();
      if (!items.length || !window.confirm('Remove all favorites from this profile? Saved titles and watching history will stay.')) return;
      clearingFavorites = true;render();let removed = false;
      try {
        for (const item of items) if (api.contextId() !== owner || !api.setLiked(item,false)) throw Error('Some favorites could not be cleared. Check browser storage and try again.');
        removed = true;status.textContent = 'Favorites cleared in this browser.';
        if (window.SwiflyAccount?.user) await window.SwiflyAccount.sync?.();
      } catch (error) {
        if (api.contextId() === owner) status.textContent = removed ? 'Favorites cleared in this browser, but account sync failed. Open Account to retry syncing.' : error.message;
      } finally {clearingFavorites = false;render();}
    });
    create.addEventListener('click',() => openEditor('create'));rename.addEventListener('click',() => openEditor('rename'));cancel.addEventListener('click',() => {editor.hidden = true;create.focus();});
    remove.addEventListener('click',() => {if (api.deleteFolder(folder.value)) {folder.value = '';status.textContent = 'Folder deleted. Your titles are still saved.';updateUrl();render();}});
    form.addEventListener('submit',event => {
      event.preventDefault();
      try {const result = editorMode === 'rename' ? api.renameFolder(folder.value,folderInput.value) : api.createFolder(folderInput.value);if (!result) throw Error('This folder could not be saved. Please try again.');editor.hidden = true;status.textContent = editorMode === 'rename' ? 'Folder renamed.' : 'Folder created.';create.focus();render();}
      catch (error) {status.textContent = error.message;folderInput.focus();}
    });
    grid.addEventListener('click',event => {
      const resume = event.target.closest('[data-library-resume-key]');
      if (resume) {const item = selected.get(resume.dataset.libraryResumeKey);if (item) window.SwiflyContinue?.saveProgress?.(item.resume || item);return;}
      const mark = event.target.closest('[data-library-mark-key]'),removeItem = event.target.closest('[data-library-remove-key]');
      if (mark) {const item = selected.get(mark.dataset.libraryMarkKey);if (item) api.isWatched(item) ? api.removeWatched(item) : api.markWatched(item);}
      else if (removeItem) {const item = selected.get(removeItem.dataset.libraryRemoveKey);if (item) (tab === 'liked' ? api.setLiked : api.setWatchlist)(item,false);}
    });
    grid.addEventListener('change',event => {const control = event.target.closest('[data-library-member]');if (!control) return;const item = selected.get(control.dataset.libraryItemKey);if (item) api.setFolderMember(control.dataset.libraryMember,item,control.checked);});
    window.addEventListener('swifly:library-change',render);window.addEventListener('swifly:continue-change',render);
    render();
  }
  function boot() {for (const root of document.querySelectorAll('[data-library-page]')) mount(root);}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
