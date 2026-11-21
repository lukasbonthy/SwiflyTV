/* In-page first-party access to the existing SwiflyTV account backend.
   Never store passwords in the browser; server sets the HttpOnly session cookie. */
(() => {
  'use strict';
  const root = document.querySelector('[data-movie-nights]');
  if (!root || root.dataset.premiereAuthReady === 'true') return;
  const overlay = root.querySelector('[data-night-auth-overlay]');
  const form = root.querySelector('[data-night-auth-form]');
  if (!overlay || !form) return;
  root.dataset.premiereAuthReady = 'true';
  const signupFields = [...form.querySelectorAll('[data-night-signup-field]')];
  const confirmation = form.querySelector('[data-night-auth-confirm]');
  const errorBox = form.querySelector('[data-night-auth-error]');
  const submit = form.querySelector('[data-night-auth-submit]');
  const tabs = [...root.querySelectorAll('[data-night-auth-mode]')];
  const title = root.querySelector('[data-night-auth-title]');
  let mode = 'signup', busy = false, opener = null, request = null;

  function showError(message) {
    errorBox.textContent = message || '';
    errorBox.hidden = !message;
  }
  function updateMode(next) {
    if (busy) return;
    mode = next === 'login' ? 'login' : 'signup';
    tabs.forEach(tab => {
      const selected = tab.dataset.nightAuthMode === mode;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    for (const field of signupFields) {
      field.hidden = mode !== 'signup';
      field.querySelectorAll('input').forEach(input => {
        input.disabled = mode !== 'signup';
        input.required = mode === 'signup';
      });
    }
    confirmation.hidden = mode !== 'signup';
    const confirmInput = confirmation.querySelector('input');
    confirmInput.disabled = mode !== 'signup';
    confirmInput.required = mode === 'signup';
    form.elements.password.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    title.textContent = mode === 'signup' ? 'Your ticket to Movie Nights.' : 'Welcome back to the theater.';
    submit.textContent = mode === 'signup' ? 'Create SwiflyTV account' : 'Sign in to SwiflyTV';
    showError('');
  }
  function close() {
    if (busy) return;
    overlay.hidden = true;
    root.dataset.nightAuthOpen = 'false';
    form.reset();
    showError('');
    opener?.focus?.();
    opener = null;
    document.removeEventListener('keydown', onKeyDown, true);
  }
  function onKeyDown(event) {
    if (overlay.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      const focusable = [...overlay.querySelectorAll('button:not([disabled]),input:not([disabled])')]
        .filter(node => !node.closest('[hidden]'));
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
  }
  async function open(next, trigger) {
    if (busy) return;
    opener = trigger || document.activeElement;
    updateMode(next);
    overlay.hidden = false;
    root.dataset.nightAuthOpen = 'true';
    document.addEventListener('keydown', onKeyDown, true);
    (mode === 'signup' ? form.elements.name : form.elements.email).focus();
    // Surface missing durable storage clearly; never substitute a device-only account.
    try {
      const response = await fetch('/api/connect/session', {credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
      if (!response.ok) return;
      const data = await response.json();
      if (overlay.hidden) return;
      if (data.available === false) {
        showError('SwiflyTV accounts need persistent server storage before registration can open. Please try again after setup.');
        submit.disabled = true;
      } else submit.disabled = false;
    } catch {
      // Submission still reports the actual authentication service failure.
      if (!overlay.hidden) submit.disabled = false;
    }
  }
  root.addEventListener('click', event => {
    const signin = event.target.closest('[data-night-signin]');
    const trigger = signin || event.target.closest('[data-night-auth-open]');
    if (trigger && root.contains(trigger)) {
      event.preventDefault();
      void open(trigger.dataset.nightAuthOpen || 'signup', trigger);
      return;
    }
    if (event.target.closest('[data-night-auth-close]') || event.target === overlay) {
      event.preventDefault(); close();
    }
    const tab = event.target.closest('[data-night-auth-mode]');
    if (tab && overlay.contains(tab)) updateMode(tab.dataset.nightAuthMode);
  });
  root.addEventListener('keydown', event => {
    const tab = event.target.closest('[data-night-auth-mode]');
    if (!tab || !['ArrowLeft','ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const idx = tabs.indexOf(tab);
    const next = tabs[(idx + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length];
    updateMode(next.dataset.nightAuthMode);
    next.focus();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || submit.disabled) return;
    const email = String(form.elements.email.value).trim().toLowerCase();
    const password = String(form.elements.password.value);
    const payload = {email, password};
    if (mode === 'signup') {
      payload.name = String(form.elements.name.value).trim();
      payload.handle = String(form.elements.handle.value).trim().toLowerCase();
      if (password !== form.elements.confirmPassword.value) {
        showError('Your passwords do not match.');
        form.elements.confirmPassword.focus();
        return;
      }
      if (Array.from(password).length < 15 || Array.from(password).length > 128) {
        showError('Choose a password of 15 to 128 characters.');
        form.elements.password.focus();
        return;
      }
      if (!/^[a-z0-9][a-z0-9_]{2,23}$/.test(payload.handle)) {
        showError('Your handle needs 3 to 24 lowercase letters, numbers or underscores.');
        form.elements.handle.focus();
        return;
      }
    }
    busy = true;
    submit.disabled = true;
    showError('');
    const controller = new AbortController();
    request = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/connect/auth/' + mode, {
        method:'POST',
        credentials:'same-origin',
        cache:'no-store',
        headers:{'Content-Type':'application/json', Accept:'application/json'},
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(typeof result.message === 'string' ? result.message : 'Account setup was unavailable. Please try again.');
      form.elements.password.value = '';
      if (form.elements.confirmPassword) form.elements.confirmPassword.value = '';
      // Reload lets Swifly's existing identity controller and Movie Night socket
      // establish the new authenticated session from the server.
      window.location.reload();
    } catch (error) {
      showError(error.name === 'AbortError' ? 'The request took too long. Please try again.' : error.message);
    } finally {
      clearTimeout(timeout);
      if (request === controller) request = null;
      busy = false;
      submit.disabled = false;
    }
  });
  window.addEventListener('pagehide', () => { request?.abort(); });
})();
