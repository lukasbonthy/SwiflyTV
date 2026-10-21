/* The mobile account menu lives outside the composited liquid navbar.
   Desktop/TV keep the original <details> dropdown and its existing handlers. */
(() => {
  'use strict';
  function boot() {
    const menu = document.querySelector('.dsProfileMenu');
    const trigger = menu?.querySelector(':scope > summary');
    const panel = menu?.querySelector('.dsProfileDropdown');
    if (!menu || !trigger || !panel || panel.dataset.svAccountOverlay) return;
    panel.dataset.svAccountOverlay = 'true';

    const narrow = matchMedia('(max-width: 860px)');
    const scrim = document.createElement('div');
    scrim.className = 'svMobileAccountScrim';
    scrim.setAttribute('aria-hidden', 'true');
    const glassPane = panel.querySelector(':scope > .svLiquidPane');
    const originalRole = panel.getAttribute('role');
    const originalLabel = panel.getAttribute('aria-label');
    let portaled = false;
    let guestHeader = null;

    const compact = () => narrow.matches && document.documentElement.dataset.svTv !== 'true';
    const position = () => {
      if (!portaled) return;
      // Layout relative to the visual viewport, never a filtered nav ancestor.
      const viewport = window.visualViewport?.height || window.innerHeight;
      const offset = window.visualViewport?.offsetTop || 0;
      const bottom = trigger.getBoundingClientRect().bottom;
      panel.style.setProperty('--sv-account-sheet-top',
        Math.round(Math.max(12, Math.min(bottom + 12, viewport + offset - 170))) + 'px');
    };
    const restore = () => {
      if (!portaled) return;
      portaled = false;
      document.body.classList.remove('svMobileAccountOpen');
      panel.classList.remove('svAccountSheetPortaled');
      panel.classList.add('svLiquidDropdown');
      if (glassPane) panel.prepend(glassPane);
      panel.style.removeProperty('--sv-account-sheet-top');
      if (originalRole === null) panel.removeAttribute('role'); else panel.setAttribute('role', originalRole);
      if (originalLabel === null) panel.removeAttribute('aria-label'); else panel.setAttribute('aria-label', originalLabel);
      panel.removeAttribute('aria-modal');
      const close = panel.querySelector('.svAccountMenuClose');
      if (close) panel.append(close);
      guestHeader?.remove();
      guestHeader = null;
      menu.append(panel);
      scrim.remove();
    };
    const mount = () => {
      if (portaled || !compact()) return;
      portaled = true;
      panel.classList.remove('svLiquidDropdown');
      glassPane?.remove();
      panel.classList.add('svAccountSheetPortaled');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Account menu');
      panel.setAttribute('aria-modal', 'true');
      let head = panel.querySelector('.dsDropdownUser');
      if (!head) {
        guestHeader = document.createElement('div');
        guestHeader.className = 'svAccountSheetGuestHeader';
        const title = document.createElement('strong');
        title.textContent = 'Your account';
        guestHeader.append(title);
        panel.prepend(guestHeader);
        head = guestHeader;
      }
      const close = panel.querySelector('.svAccountMenuClose');
      if (close) head.append(close);
      document.body.append(scrim, panel);
      document.body.classList.add('svMobileAccountOpen');
      position();
      panel.scrollTop = 0;
    };
    const sync = () => {
      if (menu.open && compact()) mount();
      else if (portaled) {
        if (!compact() && menu.open) menu.removeAttribute('open');
        restore();
      }
    };
    const dismiss = () => {
      if (!menu.open) return;
      menu.removeAttribute('open');
      restore();
      trigger.focus({ preventScroll: true });
    };
    trigger.addEventListener('click', event => {
      if (!compact()) return;
      // Mount synchronously: do not paint one frame of the old glass dropdown.
      event.preventDefault();
      if (menu.open) dismiss();
      else {
        menu.setAttribute('open', '');
        sync();
      }
    });
    scrim.addEventListener('click', dismiss);
    menu.addEventListener('toggle', sync);
    narrow.addEventListener('change', sync);
    window.addEventListener('resize', position, { passive: true });
    window.visualViewport?.addEventListener('resize', position, { passive: true });
    window.visualViewport?.addEventListener('scroll', position, { passive: true });
    new MutationObserver(sync).observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-sv-tv']
    });
    panel.addEventListener('keydown', e => {
      if (!portaled) return;
      if (e.key === 'Escape') { e.preventDefault(); dismiss(); return; }
      if (e.key !== 'Tab') return;
      const nodes = [...panel.querySelectorAll('a[href],button:not([disabled])')]
        .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    // Preserve the original delegated click listeners for TV mode and Studio.
    // After they run, dismiss the sheet without navigating away.
    panel.addEventListener('click', event => {
      if (event.target.closest('[data-st-open],[data-sv-tv-toggle]')) {
        queueMicrotask(() => { if (menu.open) { menu.removeAttribute('open'); restore(); } });
      }
    });
    window.addEventListener('pagehide', restore);
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();