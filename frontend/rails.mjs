export const MAX_VISIBLE_TITLES = 7;

export function railWindow(items, offset, size = MAX_VISIBLE_TITLES) {
  return items.slice(offset, offset + size);
}

export function nextOffset(offset, direction, total, size = MAX_VISIBLE_TITLES) {
  const last = total ? Math.floor((total - 1) / size) * size : 0;
  return Math.max(0, Math.min(last, offset + direction * size));
}

export function responsivePageSize() {
  if (typeof window === 'undefined') return MAX_VISIBLE_TITLES;
  return window.matchMedia('(max-width: 620px)').matches ? 2 :
    window.matchMedia('(max-width: 1023px)').matches ? 4 : MAX_VISIBLE_TITLES;
}

export function subscribeToRailSize(callback) {
  const queries = ['(max-width: 620px)', '(max-width: 1023px)'].map(query => window.matchMedia(query));
  queries.forEach(query => query.addEventListener('change', callback));
  return () => queries.forEach(query => query.removeEventListener('change', callback));
}
