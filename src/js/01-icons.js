// ---------- icons (24px grid, stroked) ----------
const ICONS = {
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  'chev-l': 'M15 5l-7 7 7 7',
  'chev-r': 'M9 5l7 7-7 7',
  'chev-d': 'M5 9l7 7 7-7',
  'arrow-l': 'M19 12H5M11 6l-6 6 6 6',
  search: 'M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0zM15.5 15.5l4.5 4.5',
  more: { d: 'M12 5.5v.01M12 12v.01M12 18.5v.01', sw: 3 },
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6v.01M4.5 12v.01M4.5 18v.01',
  bookmark: 'M7 3.5h10a1 1 0 0 1 1 1V21l-6-4.2L6 21V4.5a1 1 0 0 1 1-1z',
  'bookmark-fill': { d: 'M7 3.5h10a1 1 0 0 1 1 1V21l-6-4.2L6 21V4.5a1 1 0 0 1 1-1z', fill: true },
  highlight: 'M14 4.5l5.5 5.5-8 8H6v-5.5zM12 6.5l5.5 5.5M4 21h9',
  note: 'M5 4h14v10l-6 6H5zM13 20v-6h6M8.5 8.5h7M8.5 12h4',
  type: 'M3.5 18L8 6h1l4.5 12M5.2 14h6.6M17.5 11.5a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4zM20.2 11v7',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  shrink: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  speaker: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  play: { d: 'M8 5v14l11-7z', fill: true },
  pause: { d: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z', fill: true },
  stop: { d: 'M6.5 6.5h11v11h-11z', fill: true },
  download: 'M12 4v11M7 10.5l5 5 5-5M5 20h14',
  upload: 'M12 16V5M7 9.5l5-5 5 5M5 20h14',
  trash: 'M4 7h16M10 7V4.5h4V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6',
  edit: 'M15 5l4 4L8.5 19.5h-4v-4zM13 7l4 4',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z',
  'star-fill': { d: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z', fill: true },
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  rows: 'M4 5h4v5H4zM11 7.5h9M4 14h4v5H4zM11 16.5h9',
  clock: 'M12 7.5V12l3 2M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0z',
  'zoom-in': 'M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0zM15.5 15.5l4.5 4.5M11 8v6M8 11h6',
  'zoom-out': 'M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0zM15.5 15.5l4.5 4.5M8 11h6',
  copy: 'M8.5 8.5h11v11h-11zM5 15.5V4.5h11',
  info: 'M12 11v6M12 7.6v.01M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0z',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2.5-2.5L20 17M15.5 9.5v.01',
  send: 'M4.5 12L20 4.5 15 20l-3-6.5zM12 13.5l8-9',
  'book-open': 'M3 5.5c3-1 6-.8 9 1 3-1.8 6-2 9-1V19c-3-1-6-.8-9 1-3-1.8-6-2-9-1zM12 6.5V20',
  shelf: 'M3.5 20.5h17M5.5 20.5V6h3.2v14.5M10.3 20.5V4h3.2v16.5M15 20.5l2.4-14 3 .5-2.2 13.5',
  keyboard: 'M3 6.5h18v11H3zM7 10.5v.01M11 10.5v.01M15 10.5v.01M7.5 14h9',
  calendar: 'M4 6h16v14H4zM4 10.5h16M8 3.5v4M16 3.5v4',
  refresh: 'M20 11.5a8 8 0 1 1-2.6-5.9M20 4v5h-5',
  spread: 'M3 5.5h8.2v13H3zM12.8 5.5H21v13h-8.2z',
  single: 'M7 4h10v16H7z',
  sliders: 'M4 7h9M17 7h3M15 5v4M4 17h4M12 17h8M10 15v4',
  layers: 'M12 4l8.5 4.2L12 12.4 3.5 8.2zM3.5 12.2l8.5 4.2 8.5-4.2M3.5 16.2l8.5 4.2 8.5-4.2',
  flame: 'M12 21c-3.6 0-6-2.4-6-5.6 0-3.4 2.6-5.2 3.4-8.4 1.9 1.3 2.8 3 2.9 4.6 1-.8 1.6-2.1 1.7-3.6 2.4 1.8 4 4.4 4 7.4 0 3.2-2.4 5.6-6 5.6z',
  device: 'M7.5 3h9v18h-9zM11 18h2',
  folder: 'M3 6.5h6l2 2h10V19H3z',
  tag: 'M3.5 12.5V4h8.5l8.5 8.5-8 8zM8 8.5v.01',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  hash: 'M5 9h14M5 15h14M10.5 4l-2 16M15.5 4l-2 16',
  focus: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M9 12h6',
};
function icon(name, cls) {
  const spec = ICONS[name] || ICONS.info;
  const d = typeof spec === 'string' ? spec : spec.d;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'i' + (spec.fill ? ' fill' : '') + (cls ? ' ' + cls : ''));
  if (spec.sw) svg.style.strokeWidth = spec.sw;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}
function hydrateIcons(root = document) {
  for (const el of $$('[data-icon]', root)) {
    const svg = icon(el.dataset.icon);
    if (el.classList.contains('brand-mark')) { el.append(svg); el.removeAttribute('data-icon'); continue; }
    el.replaceWith(svg);
  }
}
function setIcon(btn, name) {
  const old = btn.querySelector('svg.i');
  const n = icon(name);
  if (old) old.replaceWith(n); else btn.prepend(n);
}
