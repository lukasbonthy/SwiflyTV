/* v154: progressive movie details overlays, using the existing server routes. */
(() => {
  'use strict';
  if (window.SwiflyDetails) return;
  let dialog, viewport, trigger, request, generation = 0, started = false;
  const closeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  function initialize(root) {
    if (typeof window.syncLibraryButtons === 'function') window.syncLibraryButtons();
    root.querySelectorAll('.svDetailLogo').forEach(image => {
      const title = image.closest('.svDetailTitle');
      const loaded = () => title?.classList.toggle('hasLogo', image.naturalWidth > 0);
      image.addEventListener('load', loaded, {once:true});
      image.addEventListener('error', () => title?.classList.remove('hasLogo'), {once:true});
      if (image.complete) loaded();
    });
    window.SwiflyGlassSurfaces?.refresh(root);
    window.SwiflyMotion?.refresh(root);
  }
  function reset() {
    generation++; request?.abort(); request = null;
    window.SwiflyMotion?.stop(viewport);
    window.SwiflyMotion?.release(viewport);
    document.documentElement.classList.remove('svDetailsOpen');
    if (trigger?.isConnected) trigger.focus({preventScroll:true});
    trigger = null;
    viewport?.replaceChildren();
  }
  function ensureDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.className = 'svDetailDialog'; dialog.setAttribute('aria-label', 'Movie details');
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'svDetailDismiss dsIconBtn';
    close.dataset.svDetailClose = ''; close.setAttribute('aria-label', 'Close movie details'); close.innerHTML = closeIcon;
    viewport = document.createElement('div'); viewport.className = 'svDetailViewport';
    dialog.append(close, viewport); document.body.append(dialog);
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {if (!dialog.open) reset();});
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
  }
  async function open(href, from) {
    ensureDialog(); request?.abort();
    window.SwiflyMotion?.stop(viewport);
    window.SwiflyMotion?.release(viewport);
    request = new AbortController(); const current = ++generation;
    if (!dialog.open) {
      trigger = from || document.activeElement;
      window.SwiflyMotion?.stop();
      document.documentElement.classList.add('svDetailsOpen');
      dialog.showModal();
    }
    viewport.scrollTop = 0; dialog.setAttribute('aria-busy', 'true');
    viewport.innerHTML = '<div class="svDetailLoading" role="status"><div class="svDetailLoadingArt"></div><div class="svDetailLoadingCopy"><span></span><span></span><span></span></div><p>Loading details…</p></div>';
    try {
      const url = new URL(href, location.href); url.searchParams.set('view', 'modal');
      const response = await fetch(url.pathname + url.search, {signal:request.signal, headers:{Accept:'text/html'}});
      if (!response.ok) throw new Error('Details unavailable');
      const document = new DOMParser().parseFromString(await response.text(), 'text/html');
      if (current !== generation || !dialog.open) return;
      const content = document.querySelector('.svTitleDetails');
      if (!content) throw new Error('Details unavailable');
      content.querySelectorAll('script, .svDetailClose').forEach(node => node.remove());
      viewport.replaceChildren(content);
      dialog.setAttribute('aria-label', (content.querySelector('h1')?.textContent.trim() || 'Movie') + ' details');
      initialize(content);
    } catch (error) {
      if (error.name === 'AbortError' || current !== generation || !dialog.open) return;
      const panel = document.createElement('div'); panel.className = 'svDetailError';
      const heading = document.createElement('h2'); heading.textContent = 'Details are taking a moment';
      const copy = document.createElement('p'); copy.textContent = 'You can open the full title page or return to browsing.';
      const link = document.createElement('a'); link.href = href; link.className = 'dsSecondaryBtn'; link.dataset.svDetailFallback = ''; link.textContent = 'Open full details';
      panel.append(heading, copy, link); viewport.replaceChildren(panel);
    } finally { if (current === generation) dialog.removeAttribute('aria-busy'); }
  }
  function boot() {
    if (started) return; started = true; initialize(document);
    document.addEventListener('click', event => {
      const link = event.target.closest('a[href]');
      if (!link || event.defaultPrevented || event.button > 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (link.hasAttribute('data-sv-details-back')) {
        if (history.length > 1) {event.preventDefault(); history.back();}
        return;
      }
      if (link.hasAttribute('data-sv-detail-fallback') || link.hasAttribute('download') || (link.target && link.target !== '_self') || link.hasAttribute('data-play-id')) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || !/^\/(movie|tv)\/\d+\/?$/.test(url.pathname)) return;
      if (!('HTMLDialogElement' in window) || typeof HTMLDialogElement.prototype.showModal !== 'function') return;
      event.preventDefault(); open(url.pathname + url.search, link);
    });
  }
  window.SwiflyDetails = Object.freeze({open, close() {if (dialog?.open) dialog.close();}});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();
