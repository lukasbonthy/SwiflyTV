/* Original profile art and private, bounded avatar image preparation. */
(function () {
  'use strict';
  if (window.SwiflyAvatars) return;
  const presets = Object.freeze([
    { id: 'orbit', name: 'Orbit' }, { id: 'luna', name: 'Luna' },
    { id: 'ember', name: 'Ember' }, { id: 'pixel', name: 'Pixel' },
    { id: 'drift', name: 'Drift' }, { id: 'nova', name: 'Nova' },
    { id: 'bloom', name: 'Bloom' }, { id: 'eclipse', name: 'Eclipse' }
  ].map(preset => Object.freeze({ ...preset, src: '/assets/clean/avatars/' + preset.id + '.svg?v=209' })));
  const presetIds = new Set(presets.map(preset => preset.id));
  const maxFileBytes = 5 * 1024 * 1024;
  const maxDataLength = 128000;
  const imageData = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;

  function normalize(value) {
    if (!value || typeof value !== 'object') return null;
    if (value.type === 'preset' && presetIds.has(value.id)) return { type: 'preset', id: value.id };
    if (value.type === 'upload' && typeof value.data === 'string' && value.data.length <= maxDataLength && imageData.test(value.data)) {
      return { type: 'upload', data: value.data };
    }
    return null;
  }

  function render(node, profile) {
    if (!node) return;
    const avatar = normalize(profile?.avatar);
    node.replaceChildren();
    node.classList.add('svProfileAvatar');
    node.dataset.avatarKind = avatar?.type || 'initial';
    if (avatar) {
      const img = document.createElement('img');
      img.src = avatar.type === 'preset' ? presets.find(preset => preset.id === avatar.id).src : avatar.data;
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      img.draggable = false;
      img.decoding = 'async';
      node.append(img);
    } else {
      const icon = typeof profile?.icon === 'string' ? Array.from(profile.icon).slice(0, 8).join('') : '';
      node.textContent = icon || Array.from(String(profile?.name || 'SwiflyTV'))[0].toUpperCase();
    }
    if (profile?.color && /^[a-z]+$/.test(profile.color)) node.dataset.color = profile.color;
    else delete node.dataset.color;
  }

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  }
  function sameProfile(a, b) {
    if (!a || !b) return false;
    return a.id && b.id ? a.id === b.id : Boolean(a.name && a.name === b.name);
  }
  function active() {
    const selected = readJson('swiflytv.activeProfile');
    const profiles = readJson('swiflytv.profiles');
    return (Array.isArray(profiles) && profiles.find(profile => sameProfile(profile, selected))) || selected;
  }
  function refresh() {
    const profile = active();
    if (!profile) return;
    document.querySelectorAll('.profilePill, [data-account-avatar], .dsDropdownUser > span').forEach(node => {
      render(node, profile);
      if (node.classList.contains('profilePill')) node.classList.add('hasProfileIcon');
    });
    document.querySelectorAll('.dsDropdownUser > small').forEach(label => { label.textContent = String(profile.name || 'Main') + ' profile'; });
  }

  async function bytes(file) {
    const part = file.slice(0, 16);
    if (part.arrayBuffer) return new Uint8Array(await part.arrayBuffer());
    return new Uint8Array(await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('This image could not be read. Try another photo.'));
      reader.readAsArrayBuffer(part);
    }));
  }
  function signature(header) {
    if (header.length >= 8 && [137,80,78,71,13,10,26,10].every((byte, index) => header[index] === byte)) return 'image/png';
    if (header.length >= 3 && header[0] === 255 && header[1] === 216 && header[2] === 255) return 'image/jpeg';
    if (header.length >= 12 && String.fromCharCode(...header.slice(0, 4)) === 'RIFF' && String.fromCharCode(...header.slice(8, 12)) === 'WEBP') return 'image/webp';
    return '';
  }
  async function decode(file) {
    if (typeof createImageBitmap === 'function') return createImageBitmap(file);
    const url = URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('This image could not be read. Try another photo.'));
        image.src = url;
      });
    } finally { URL.revokeObjectURL(url); }
  }
  async function prepareUpload(file) {
    if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPG or WebP image.');
    if (!file.size || file.size > maxFileBytes) throw new Error('Choose an image smaller than 5 MB.');
    if (signature(await bytes(file)) !== file.type) throw new Error('This is not a valid PNG, JPG or WebP image.');
    let image;
    try {
      image = await decode(file);
      const width = image.width || image.naturalWidth;
      const height = image.height || image.naturalHeight;
      if (!width || !height || width > 8192 || height > 8192 || width * height > 32000000) throw new Error('This image is too large. Choose a smaller photo.');
      const size = Math.min(width, height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser could not prepare the image. Try another photo.');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, (width - size) / 2, (height - size) / 2, size, size, 0, 0, 256, 256);
      for (const quality of [.86, .7, .5]) {
        const data = canvas.toDataURL('image/webp', quality);
        if (!data.startsWith('data:image/webp;')) break;
        if (data.length <= maxDataLength && imageData.test(data)) return { type: 'upload', data };
      }
      context.fillStyle = '#172133';
      context.globalCompositeOperation = 'destination-over';
      context.fillRect(0, 0, 256, 256);
      const data = canvas.toDataURL('image/jpeg', .8);
      if (data.length <= maxDataLength && imageData.test(data)) return { type: 'upload', data };
      throw new Error('This image is too detailed. Try another photo.');
    } catch (error) {
      if (error?.message?.startsWith('This ')) throw error;
      throw new Error('This image could not be read. Try another photo.');
    } finally { image?.close?.(); }
  }

  window.SwiflyAvatars = Object.freeze({ presets, normalize, render, prepareUpload, refresh, active, sameProfile });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
  else refresh();
  window.addEventListener('storage', event => { if (['swiflytv.profiles', 'swiflytv.activeProfile'].includes(event.key) || !event.key) refresh(); });
  document.addEventListener('swifly:profile-changed', refresh);
  document.dispatchEvent(new Event('swifly:avatars-ready'));
})();
