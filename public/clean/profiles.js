/* Browser-local profile management with a cancellable native avatar editor. */
(function () {
  'use strict';
  if (window.SwiflyProfiles) return;
  const profilesKey = 'swiflytv.profiles';
  const activeKey = 'swiflytv.activeProfile';
  const fallback = () => [
    { id: 'main', name: 'Main', mode: 'standard', avatar: { type: 'preset', id: 'orbit' } },
    { id: 'kids', name: 'Kids', mode: 'kids', avatar: { type: 'preset', id: 'luna' } }
  ];
  const avatars = () => window.SwiflyAvatars;
  function readProfiles() {
    try {
      const saved = JSON.parse(localStorage.getItem(profilesKey) || 'null');
      if (Array.isArray(saved)) {
        const profiles = saved.filter(profile => profile && typeof profile === 'object').map((profile, index) => ({
          ...profile,
          id: profile.id || 'legacy-' + index,
          name: String(profile.mode === 'date' && profile.name === 'Date Profile' ? 'Main' : profile.name || 'Profile').slice(0, 32),
          mode: profile.mode === 'kids' || profile.kids ? 'kids' : 'standard'
        }));
        if (profiles.length) return profiles;
      }
    } catch {}
    return fallback();
  }
  function readActive() {
    try { return JSON.parse(localStorage.getItem(activeKey) || 'null'); } catch { return null; }
  }
  function putRaw(key, value) { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); }
  function save(profiles) {
    const previous = localStorage.getItem(profilesKey);
    const previousActive = localStorage.getItem(activeKey);
    const selected = readActive();
    const selectedId = readProfiles().find(profile => avatars().sameProfile(profile, selected))?.id;
    const active = profiles.find(profile => profile.id === selectedId) || (selected ? profiles[0] : null);
    try {
      localStorage.setItem(profilesKey, JSON.stringify(profiles));
      if (active) localStorage.setItem(activeKey, JSON.stringify(active));
    } catch {
      try { putRaw(profilesKey, previous); putRaw(activeKey, previousActive); } catch {}
      throw new Error('Could not save this profile. Free some browser storage or choose a preset icon, then try again.');
    }
    document.dispatchEvent(new Event('swifly:profile-changed'));
  }
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function button(text, action, className = 'dsSecondaryBtn') {
    const element = node('button', className, text);
    element.type = 'button';
    if (action) element.dataset.action = action;
    return element;
  }
  function message(main, value) {
    const output = main.querySelector('[data-profile-error]');
    if (output) { output.textContent = value; output.hidden = !value; }
  }
  function avatarEditor(main) {
    const dialog = document.getElementById('profileAvatarDialog');
    if (!dialog) return null;
    const preview = dialog.querySelector('[data-avatar-preview]');
    const grid = dialog.querySelector('[data-avatar-presets]');
    const error = dialog.querySelector('[data-avatar-error]');
    const status = dialog.querySelector('[data-avatar-status]');
    const input = dialog.querySelector('[data-avatar-file]');
    const saveButton = dialog.querySelector('[data-avatar-save]');
    let draft = null, profile = null, commit = null, opener = null, openerIndex = null, generation = 0, busy = false, useInitial = false;
    function paint() {
      avatars().render(preview, { ...profile, avatar: draft, icon: useInitial ? '' : profile?.icon });
      grid.querySelectorAll('[data-avatar-preset]').forEach(item => item.setAttribute('aria-pressed', String(draft?.type === 'preset' && draft.id === item.dataset.avatarPreset)));
      dialog.querySelector('[data-avatar-initial]').setAttribute('aria-pressed', String(!draft && (useInitial || !profile?.icon)));
      const preset = avatars().presets.find(item => item.id === draft?.id);
      status.textContent = busy ? 'Preparing your photo…' : draft?.type === 'upload' ? 'Your photo · Ready to save' : preset ? preset.name + ' · Selected' : profile?.icon && !useInitial ? 'Your icon · Selected' : 'Profile initial · Selected';
      saveButton.disabled = busy;
    }
    function invalidate() { generation += 1; busy = false; input.value = ''; }
    function close() { invalidate(); dialog.close(); }
    for (const preset of avatars().presets) {
      const item = button('', null, 'svAvatarPreset');
      item.dataset.avatarPreset = preset.id;
      item.setAttribute('aria-label', preset.name);
      const art = node('span', 'svAvatarPresetArt');
      avatars().render(art, { avatar: { type: 'preset', id: preset.id } });
      item.append(art, node('span', 'svAvatarPresetName', preset.name));
      item.addEventListener('click', () => { invalidate(); draft = { type: 'preset', id: preset.id }; useInitial = false; error.textContent = ''; paint(); });
      grid.append(item);
    }
    dialog.querySelector('[data-avatar-initial]').addEventListener('click', () => { invalidate(); draft = null; useInitial = true; error.textContent = ''; paint(); });
    dialog.querySelectorAll('[data-avatar-cancel]').forEach(item => item.addEventListener('click', close));
    dialog.addEventListener('cancel', invalidate);
    dialog.addEventListener('close', () => {
      if (dialog.open) return;
      invalidate(); commit = null;
      const target = opener?.isConnected ? opener : openerIndex !== null ? main.querySelector('[data-index="' + openerIndex + '"] [data-action="icon"]') : null;
      target?.focus();
    });
    dialog.querySelector('[data-avatar-upload]').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file || !dialog.open) return;
      const token = ++generation;
      busy = true; error.textContent = ''; paint();
      try {
        const uploaded = await avatars().prepareUpload(file);
        if (token !== generation || !dialog.open) return;
        draft = uploaded; useInitial = false;
      } catch (failure) {
        if (token !== generation || !dialog.open) return;
        error.textContent = failure.message || 'This image could not be read. Try another photo.';
      } finally {
        if (token === generation && dialog.open) { busy = false; input.value = ''; paint(); }
      }
    });
    saveButton.addEventListener('click', () => {
      if (busy || !commit) return;
      try { commit(draft, useInitial); close(); } catch (failure) { error.textContent = failure.message; }
    });
    return {
      open(value, apply, trigger) {
        invalidate(); profile = value; draft = avatars().normalize(value.avatar); useInitial = false; commit = apply; opener = trigger; openerIndex = trigger?.closest('[data-index]')?.dataset.index ?? null;
        dialog.querySelector('[data-avatar-profile-name]').textContent = value.name || 'New profile';
        error.textContent = ''; paint(); dialog.showModal();
        (grid.querySelector('[aria-pressed="true"]') || grid.querySelector('button')).focus();
      }
    };
  }
  function selection(main) {
    const grid = main.querySelector('#profilesGrid');
    if (!grid) return;
    const profiles = readProfiles();
    const current = readActive();
    grid.replaceChildren();
    profiles.forEach((profile, index) => {
      const selected = avatars().sameProfile(profile, current);
      const card = button('', null, 'dsProfileSelectCard');
      card.dataset.index = index;
      card.dataset.current = String(selected);
      card.setAttribute('aria-pressed', String(selected));
      const image = node('span', 'dsProfileAvatarBig');
      image.setAttribute('aria-hidden', 'true');
      avatars().render(image, profile);
      card.append(image, node('strong', '', profile.name), node('small', '', profile.mode === 'kids' ? 'Kids Safe' : 'Regular'));
      if (selected) card.append(node('span', 'svProfileCurrent', 'Active profile'));
      card.addEventListener('click', () => {
        try { localStorage.setItem(activeKey, JSON.stringify(profile)); }
        catch { message(main, 'Could not switch profiles. Free some browser storage and try again.'); return; }
        document.dispatchEvent(new Event('swifly:profile-changed'));
        location.href = profile.mode === 'kids' ? '/kids' : '/';
      });
      grid.append(card);
    });
    const add = node('a', 'dsProfileSelectCard dsAddProfileCard');
    add.href = '/profiles/manage';
    add.append(node('span', 'dsProfileAvatarBig', '+'), node('strong', '', 'Add Profile'), node('small', '', 'Manage profiles'));
    grid.append(add);
  }
  function manager(main) {
    const form = main.querySelector('#profileCreateForm');
    const list = main.querySelector('#profilesManageList');
    if (!form || !list) return;
    const editor = avatarEditor(main);
    const createButton = main.querySelector('#profileCreateAvatar');
    const createPreview = createButton.querySelector('[data-profile-create-preview]');
    let createAvatar = { type: 'preset', id: 'orbit' };
    function renderCreate() {avatars().render(createPreview, { name: form.elements.name.value || 'Profile', avatar: createAvatar });}
    createButton.addEventListener('click', () => editor.open({name: form.elements.name.value || 'New profile', avatar: createAvatar}, avatar => { createAvatar = avatar; renderCreate(); }, createButton));
    form.elements.name.addEventListener('input', renderCreate);
    function render() {
      list.replaceChildren();
      readProfiles().forEach((profile, index) => {
        const card = node('article', 'dsManageProfileCard');
        card.dataset.index = index;
        const image = button('', 'icon', 'dsProfileAvatarBig svAvatarEditTrigger');
        image.setAttribute('aria-label', 'Change icon for ' + profile.name);
        avatars().render(image, profile);
        const information = node('div', 'dsManageProfileMain');
        information.append(node('strong', '', profile.name), node('small', '', profile.mode === 'kids' ? 'Kids Safe' : 'Regular'));
        const actions = node('div', 'dsManageProfileActions');
        actions.append(button('Icon', 'icon'), button('Rename', 'rename'), button(profile.mode === 'kids' ? 'Make Regular' : 'Make Kids', 'mode'), button('Delete', 'delete'));
        card.append(image, information, actions);
        card.addEventListener('click', event => {
          const trigger = event.target.closest('button[data-action]');
          if (!trigger) return;
          const profiles = readProfiles();
          const current = profiles.find(item => item.id === profile.id);
          if (!current) return;
          message(main, '');
          if (trigger.dataset.action === 'icon') {
            editor.open(current, (avatar, clearLegacy) => {
              const latest = readProfiles();
              const target = latest.find(item => item.id === current.id);
              if (!target) throw new Error('This profile has been removed. Close and try another profile.');
              if (avatar) target.avatar = avatar;
              else { delete target.avatar; if (clearLegacy) delete target.icon; }
              save(latest); render();
            }, trigger);
            return;
          }
          if (trigger.dataset.action === 'rename') {
            const next = prompt('Profile name', current.name);
            if (!next?.trim()) return;
            current.name = next.trim().slice(0, 32);
          } else if (trigger.dataset.action === 'mode') {
            current.mode = current.mode === 'kids' ? 'standard' : 'kids';
            if ('kids' in current) current.kids = current.mode === 'kids';
            if ('href' in current && current.href === '/kids' && current.mode !== 'kids') current.href = '/';
          } else if (trigger.dataset.action === 'delete') {
            if (profiles.length <= 1) { message(main, 'Keep at least one profile.'); return; }
            if (!confirm('Delete ' + current.name + '?')) return;
            profiles.splice(profiles.indexOf(current), 1);
          }
          try { save(profiles); render(); } catch (failure) { message(main, failure.message); }
        });
        list.append(card);
      });
    }
    form.addEventListener('submit', event => {
      event.preventDefault(); message(main, '');
      const name = String(form.elements.name.value || '').trim().slice(0, 32) || 'Profile';
      const mode = form.elements.mode.value === 'kids' ? 'kids' : 'standard';
      const profiles = readProfiles();
      const profile = { id: window.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2, 8), name, mode };
      if (createAvatar) profile.avatar = createAvatar;
      profiles.push(profile);
      try { save(profiles); form.reset(); createAvatar = { type: 'preset', id: 'orbit' }; renderCreate(); render(); }
      catch (failure) { message(main, failure.message); }
    });
    main.querySelector('#resetProfilesBtn')?.addEventListener('click', () => {
      if (!confirm('Reset profiles to Main and Kids?')) return;
      try { save(fallback()); message(main, ''); render(); } catch (failure) { message(main, failure.message); }
    });
    renderCreate(); render();
  }
  function mount() {
    if (!avatars()) return;
    document.querySelectorAll('.dsProfilesSelectPage, .dsProfilesManagePage').forEach(main => {
      if (main.dataset.svProfilesReady) return;
      main.dataset.svProfilesReady = 'true';
      if (main.classList.contains('dsProfilesManagePage')) manager(main);
      else selection(main);
    });
    avatars().refresh();
  }
  window.SwiflyProfiles = Object.freeze({ mount });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  document.addEventListener('swifly:avatars-ready', mount);
})();
