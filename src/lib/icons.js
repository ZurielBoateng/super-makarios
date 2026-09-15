// Small inline SVG icon set (stroke-based, inherits currentColor) so we
// don't pull in an icon font or library just for a dozen glyphs.

const wrap = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export const icons = {
  sun: wrap(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
  ),
  moon: wrap('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>'),
  auto: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none"/>'),
  bookmark: wrap('<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/>'),
  bookmarkFilled:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/></svg>',
  download: wrap('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
  checkCircle: wrap('<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.3 2.3L16 10"/>'),
  cloud: wrap('<path d="M7 18h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7.1 8.5 4 4 0 0 0 7 18Z"/>'),
  search: wrap('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  back: wrap('<path d="M15 6l-6 6 6 6"/>'),
  settings: wrap(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1Z"/>'
  ),
  plus: wrap('<path d="M12 5v14M5 12h14"/>'),
  trash: wrap('<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7"/>'),
  upload: wrap('<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>'),
  logout: wrap('<path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9"/>'),
  chevronLeft: wrap('<path d="m14 6-6 6 6 6"/>'),
  chevronRight: wrap('<path d="m10 6 6 6-6 6"/>'),
  aa: wrap('<path d="M4 18 8.5 6h1L14 18M5.5 14h6.5M17 18v-6.2c0-1.2-.9-2-2-2s-2 .8-2 2"/>'),
  shelf: wrap('<path d="M4 5v16M20 5v16M4 9h16M4 15h16"/>'),
  x: wrap('<path d="M6 6l12 12M18 6 6 18"/>'),
  edit: wrap('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  wifiOff: wrap(
    '<path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 3-2M19 13a10 10 0 0 0-3.4-2.2M2 8.8A15 15 0 0 1 8 5.5M22 8.8a15 15 0 0 0-3.6-2.7M12 20h.01M1 1l22 22"/>'
  ),
};

export function icon(name, extraClass = '') {
  const svg = icons[name] || '';
  if (!extraClass) return svg;
  return svg.replace('<svg ', `<svg class="${extraClass}" `);
}
