/* Apply Studio drafts to the real page without replacing forms or playback. */
(() => {
  'use strict';
  if (window.SwiflyExperience) return;
  const homeKeys = ['continue','upcoming','recommended','trending-movies','trending-tv','popular-movies','popular-tv','top-movies','top-tv','new-releases'];
  const navKeys = ['home','movies','tv','discover','list','study'];
  const defaults = {
    homeOrder:homeKeys,homeHidden:[],heroMode:'cinematic',heroPosition:'first',posterWidth:180,homeColumns:6,rowShape:'rail',
    navOrder:navKeys,navLayout:'top',navLabels:true,navIcons:'line',navDensity:'comfortable',navActive:'pill',
    hudPosition:'right',hudWidth:360,hudDensity:'comfortable',hudTransparency:85,hudIcons:'line',hudMotion:'subtle',notificationPreview:'expanded',toastPosition:'bottom',
    aiSpacing:'comfortable',aiWidth:720,aiCards:'list',aiGlass:'inherit',aiOptions:false,
    loaderStyle:'cinematic',transitionSpeed:220,loaderDim:90,pageMotion:true,posterHover:'lift',posterActions:'auto',focusStyle:'ring',
    adaptiveCinema:false,adaptiveStrength:35,performancePreset:'auto',reduceMotion:false,reduceTransparency:false,glass:'liquid',tvScale:110,tvControls:'standard'
  };
  const choices = {
    heroMode:['cinematic','compact','banner'],heroPosition:['first','after-first'],rowShape:['rail','grid'],navLayout:['top','sidebar'],navIcons:['line','filled','minimal'],navDensity:['comfortable','compact'],navActive:['pill','underline','accent'],
    hudPosition:['right','left'],hudDensity:['comfortable','compact'],hudIcons:['line','solid'],hudMotion:['subtle','none'],notificationPreview:['expanded','compact'],toastPosition:['bottom','top'],aiSpacing:['comfortable','compact'],aiCards:['list','grid'],aiGlass:['inherit','solid','soft'],
    loaderStyle:['cinematic','minimal','artwork','aurora','basic'],posterHover:['lift','zoom','reveal','flat'],posterActions:['auto','always'],focusStyle:['ring','frame'],performancePreset:['auto','desktop','mobile','xbox','minimal'],glass:['off','subtle','liquid'],tvControls:['standard','large']
  };
  const ranges = {posterWidth:[120,260],homeColumns:[3,8],hudWidth:[280,480],hudTransparency:[65,100],aiWidth:[560,880],transitionSpeed:[100,400],loaderDim:[70,98],adaptiveStrength:[0,65],tvScale:[100,130]};
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)'), transparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
  const aiDefaults = new WeakMap();
  let values = {...defaults}, started = false, suspended = false, homeObserver, artObserver, adaptiveGeneration = 0, glow;
  function current() { const value = window.SwiflyAppearance; return value?.effective || value || defaults; }
  function normalize(input) {
    const result = {...defaults};
    if (!input || typeof input !== 'object') return result;
    for (const key of Object.keys(defaults)) {
      if (choices[key]?.includes(input[key])) result[key] = input[key];
      else if (ranges[key] && Number.isFinite(input[key])) result[key] = Math.max(ranges[key][0],Math.min(ranges[key][1],input[key]));
      else if (typeof defaults[key] === 'boolean' && typeof input[key] === 'boolean') result[key] = input[key];
    }
    for (const [key,keys] of [['homeOrder',homeKeys],['navOrder',navKeys]]) if (Array.isArray(input[key])) result[key] = [...new Set([...input[key].filter(item => keys.includes(item)),...keys])];
    if (Array.isArray(input.homeHidden)) result.homeHidden = [...new Set(input.homeHidden.filter(item => homeKeys.includes(item)))];
    result.reduceMotion = result.reduceMotion || reduced.matches;
    result.reduceTransparency = result.reduceTransparency || transparency.matches;
    return result;
  }
  function data(node,name,value) { if (node.dataset[name] !== String(value)) node.dataset[name] = String(value); }
  function token(node,name,value) { if (node.style.getPropertyValue(name) !== String(value)) node.style.setProperty(name,String(value)); }
  function light() { return ['xbox','minimal'].includes(values.performancePreset) || document.documentElement.dataset.svXbox === 'true'; }
  function order(parent,nodes) {
    for (let index = 0; index < nodes.length; index++) {
      const present = [...parent.children].filter(node => nodes.includes(node));
      if (present[index] !== nodes[index]) parent.insertBefore(nodes[index],present[index] || null);
    }
  }
  function applyHome() {
    const main = document.querySelector('main[data-st-home]'), rowsHost = main?.querySelector('[data-st-home-rows]');
    if (!rowsHost) return;
    const rows = [...main.querySelectorAll('section[data-st-home-section]')];
    let homeOrder=values.homeOrder;const base=window.SwiflyStudioConfig?.defaults.homeOrder||homeKeys;
    const library=window.SwiflyLibrary;let format='off';
    if(library?.active!==false&&library?.read&&JSON.stringify(homeOrder)===JSON.stringify(base)){
      const counts={movie:0,tv:0};for(const item of (library.read().history||[]).slice(0,100))if(Object.prototype.hasOwnProperty.call(counts,item.type))counts[item.type]++;
      if(counts.tv!==counts.movie){format=counts.tv>counts.movie?'tv':'movie';const content=base.filter(key=>!['continue','upcoming','recommended'].includes(key)),priority=key=>format==='tv'?(key.endsWith('-tv')?0:1):(key.endsWith('-movies')||key==='new-releases'?0:1);homeOrder=[...base.filter(key=>['continue','upcoming','recommended'].includes(key)),...content.sort((a,b)=>priority(a)-priority(b))];}
    }
    data(main,'stPersonalized',format);
    rows.sort((a,b) => homeOrder.indexOf(a.dataset.stHomeSection)-homeOrder.indexOf(b.dataset.stHomeSection));
    const available = rows.filter(row => !row.hidden && row.querySelector('a[href],.movieCard,.svResumeCard'));
    const catalog = available.filter(row => row.dataset.stHomeSection !== 'continue');
    const fallbackRows = catalog.length ? catalog : available;
    const hidden = new Set(values.homeHidden), fallback = fallbackRows.every(row => hidden.has(row.dataset.stHomeSection)) ? fallbackRows[0] : null;
    for (const row of rows) data(row,'stHomeHidden',hidden.has(row.dataset.stHomeSection) && row !== fallback);
    let lead = main.querySelector('[data-st-home-lead]');
    const hero = [...main.children].find(node => node.matches('.dsHero'));
    const first = available.find(row => row.dataset.stHomeHidden !== 'true');
    if (values.heroPosition === 'after-first' && hero && first) {
      if (!lead) { lead = document.createElement('div'); lead.className = 'dsContent stHomeLead'; lead.dataset.stHomeLead = ''; main.insertBefore(lead,hero); }
      for (const row of rows) if (row !== first && row.parentElement === lead) rowsHost.append(row);
      if (first.parentElement !== lead) lead.append(first);
      order(rowsHost,rows.filter(row => row !== first));
    } else {
      for (const row of rows) if (row.parentElement !== rowsHost) rowsHost.append(row);
      order(rowsHost,rows); lead?.remove();
    }
    token(main,'--st-home-poster-width',values.posterWidth+'px'); token(main,'--st-home-columns',values.homeColumns);
    if (!homeObserver) {
      homeObserver = new MutationObserver(records => {
        if (records.some(record => record.type === 'attributes' && record.target.matches('[data-st-home-section]') || record.type === 'childList' && (record.target.id === 'continueWatchingRail' || [...record.addedNodes,...record.removedNodes].some(node => node.nodeType === 1 && node.matches('[data-st-home-section]'))))) applyHome();
      });
      homeObserver.observe(main,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
    }
  }
  const navPaths = {
    home:'m3 10 9-7 9 7v10h-6v-7H9v7H3Z',movies:'M4 3h16v18H4zM4 8h16M4 16h16M8 3v5m8-5v5M8 16v5m8-5v5',tv:'M3 6h18v14H3zM8 2l4 4 4-4',discover:'M16 8l-3 5-5 3 3-5zM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',list:'M5 3h14v18l-7-4-7 4Z',study:'M3 5c3-1 6 0 9 2 3-2 6-3 9-2v15c-3-1-6 0-9 2-3-2-6-3-9-2Zm9 2v15'
  };
  function applyNav() {
    const groups = new Set();
    for (const anchor of document.querySelectorAll('a[data-st-nav]')) {
      if (!navKeys.includes(anchor.dataset.stNav)) continue;
      groups.add(anchor.parentElement);
      if (!anchor.hasAttribute('aria-label')) anchor.setAttribute('aria-label',anchor.textContent.trim());
      if (!anchor.querySelector('[data-st-nav-label]')) {
        const existing = [...anchor.children].find(node => node.tagName === 'SPAN');
        if (existing) existing.dataset.stNavLabel = '';
        else {
          const label = document.createElement('span'); label.dataset.stNavLabel = '';
          for (const node of [...anchor.childNodes]) if (node.nodeType === 3) label.append(node);
          anchor.append(label);
        }
      }
      if (!anchor.querySelector('svg')) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg','svg'), path = document.createElementNS('http://www.w3.org/2000/svg','path');
        svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true'); svg.setAttribute('focusable','false');
        path.setAttribute('d',navPaths[anchor.dataset.stNav]);svg.append(path);anchor.prepend(svg);
      }
    }
    for (const group of groups) {
      const anchors = [...group.children].filter(node => node.matches('a[data-st-nav]'));
      anchors.sort((a,b) => values.navOrder.indexOf(a.dataset.stNav)-values.navOrder.indexOf(b.dataset.stNav)); order(group,anchors);token(group,'--st-nav-count',anchors.length);
    }
  }
  function applyAI() {
    for (const options of document.querySelectorAll('[data-recommendations] .svRecommendationPreferences')) {
      const previous = aiDefaults.get(options);
      if (previous === undefined ? values.aiOptions : previous !== values.aiOptions) options.open = values.aiOptions;
      aiDefaults.set(options,values.aiOptions);
    }
  }
  function artwork() {
    const dialogs = [...document.querySelectorAll('dialog[open]')].reverse();
    for (const dialog of dialogs) {const source = dialog.querySelector('[data-sv-palette-src]');if (source) return source.getAttribute('data-sv-palette-src');}
    const detail = [...document.querySelectorAll('.svTitleDetails[data-sv-palette-src]')].find(node => !node.closest('dialog:not([open])'));
    return detail?.getAttribute('data-sv-palette-src') || document.querySelector('main .dsHero[data-sv-palette-src]')?.getAttribute('data-sv-palette-src') || '';
  }
  function artworkUrl(value) {
    try {const url = new URL(value,location.href); return value && !url.username && !url.password && (url.protocol === 'https:' || url.origin === location.origin && url.protocol === 'http:') ? url.href : '';}
    catch (_) {return '';}
  }
  function applyLoading() {
    const loader = document.getElementById('svSiteLoading'); if (!loader) return;
    if (!loader.querySelector('.stLoadingBrand')) {const brand = document.createElement('span');brand.className = 'stLoadingBrand';brand.setAttribute('aria-hidden','true');brand.textContent = 'SWIFLYTV';loader.prepend(brand);}
    const src = artworkUrl(artwork() || document.querySelector('[data-player-backdrop]')?.dataset.playerBackdrop || '');
    if (src) token(loader,'--st-loader-art','url('+JSON.stringify(src)+')');else loader.style.removeProperty('--st-loader-art');
  }
  function refreshAdaptive() {
    const body = document.body, generation = ++adaptiveGeneration;
    const permitted = values.adaptiveCinema && values.adaptiveStrength > 0 && !values.reduceMotion && !values.reduceTransparency && !light() && !suspended && !document.hidden && !document.querySelector('.svPlayerPage,.dsWatchPage,[data-player-root]');
    const src = permitted && artwork();
    if (!src || !window.SwiflyHeroPalette?.sample) {
      data(body,'stAdaptiveActive',false);body.style.removeProperty('--st-adaptive-primary');body.style.removeProperty('--st-adaptive-secondary');return;
    }
    window.SwiflyHeroPalette.sample(src).then(palette => {
      if (generation !== adaptiveGeneration || suspended) return;
      if (!palette) {data(body,'stAdaptiveActive',false);body.style.removeProperty('--st-adaptive-primary');body.style.removeProperty('--st-adaptive-secondary');return;}
      if (!glow) {glow = document.createElement('div');glow.className = 'stAdaptiveGlow';glow.setAttribute('aria-hidden','true');body.prepend(glow);}
      token(body,'--st-adaptive-primary',palette.primary);token(body,'--st-adaptive-secondary',palette.secondary);data(body,'stAdaptiveActive',true);
    });
  }
  function apply(input) {
    if (!document.body) return;
    values = normalize(input);
    const body = document.body, focused = document.activeElement;
    const fields = ['heroMode','heroPosition','rowShape','navLayout','navLabels','navIcons','navDensity','navActive','hudPosition','hudDensity','hudIcons','notificationPreview','toastPosition','aiSpacing','aiCards','aiGlass','loaderStyle','posterActions','focusStyle','performancePreset','tvControls'];
    for (const field of fields) data(body,'st'+field[0].toUpperCase()+field.slice(1),values[field]);
    data(body,'stExperienceLight',light());data(body,'stPosterHover',values.reduceMotion || light() ? 'flat' : values.posterHover);
    data(body,'stPageMotion',values.pageMotion && !values.reduceMotion && !light()); data(body,'stHudMotion',values.reduceMotion || light() ? 'none' : values.hudMotion);
    data(body,'stExperienceOpaque',values.reduceTransparency || values.glass === 'off' || light());
    token(body,'--st-hud-width',values.hudWidth+'px');token(body,'--st-hud-alpha',values.hudTransparency/100);token(body,'--st-ai-width',values.aiWidth+'px');
    token(body,'--st-experience-speed',values.transitionSpeed+'ms');token(document.documentElement,'--st-experience-speed',values.transitionSpeed+'ms');token(body,'--st-loader-alpha',values.loaderDim/100);token(body,'--st-adaptive-opacity',values.adaptiveStrength/100);token(body,'--st-tv-scale',values.tvScale/100);
    applyHome();applyNav();applyAI();applyLoading();refreshAdaptive();
    if (focused?.isConnected && document.activeElement !== focused && !focused.closest('[data-st-home-hidden="true"]')) focused.focus({preventScroll:true});
  }
  function boot() {
    if (started) return; started = true; apply(current());
    document.addEventListener('swifly:studio-change',event => apply(event.detail?.effective || event.detail?.values || current()));
    const accessibility = () => apply(current());
    reduced.addEventListener('change',accessibility);transparency.addEventListener('change',accessibility);
    window.addEventListener('swifly:library-change',applyHome);
    window.SwiflyLibrary?.ready?.then?.(applyHome);
    document.addEventListener('visibilitychange',refreshAdaptive);
    artObserver = new MutationObserver(records => {
      if (records.some(record => record.type === 'attributes' && record.target.matches('dialog,[data-sv-palette-src],[data-player-root]') || record.type === 'childList' && [...record.addedNodes,...record.removedNodes].some(node => node.nodeType === 1 && (node.matches('[data-sv-palette-src],[data-player-root],dialog') || node.querySelector('[data-sv-palette-src],[data-player-root]'))))) {applyLoading();refreshAdaptive();}
    });
    artObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','hidden','data-sv-palette-src','data-player-state']});
    window.addEventListener('pagehide',() => {suspended = true;adaptiveGeneration++;});
    window.addEventListener('pageshow',event => {if (event.persisted) {suspended = false;apply(current());}});
  }
  window.SwiflyExperience = Object.freeze({refresh:() => apply(current())});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
