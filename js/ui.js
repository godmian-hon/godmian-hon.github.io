import { FALLBACK_IMAGE } from './data.js';
import { followPointer } from './motion.js';

const svgNS = 'http://www.w3.org/2000/svg';
const formatDay = new Intl.DateTimeFormat('th-TH', {
  calendar: 'gregory', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
});

export function humanDate(day) {
  return formatDay.format(new Date(day + 'T00:00:00Z'));
}

export function icon(name) {
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(svgNS, 'use');
  use.setAttribute('href', './assets/icons.svg#' + name);
  svg.append(use);
  return svg;
}

export function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

export function makeImage(src, alt, { eager = false, className = '', width = 720, height = 405 } = {}) {
  const img = document.createElement('img');
  img.className = className;
  img.loading = eager ? 'eager' : 'lazy';
  img.decoding = 'async';
  img.alt = alt || '';
  img.width = width;
  img.height = height;
  img.addEventListener('error', () => {
    img.src = FALLBACK_IMAGE;
    img.alt = 'ไม่มีภาพตัวอย่าง';
  }, { once: true });
  img.src = src || FALLBACK_IMAGE;
  return img;
}

export function modCard(mod, isEditorial = false) {
  const article = element('article', 'mod-card mod-item');
  if (mod.preview) {
    article.dataset.video = mod.preview;
    article.dataset.desc = mod.description;
  }
  article.style.setProperty('--scene-color', mod.accent);
  const link = element('a', 'card-link');
  link.href = './?mod=' + encodeURIComponent(mod.slug);
  link.dataset.modSlug = mod.slug;
  link.setAttribute('aria-label', 'ดูรายละเอียด ' + mod.name);
  const visual = element('div', 'card-visual');
  visual.style.setProperty('--scene-color', mod.accent);
  followPointer(visual, (x, y) => {
    visual.style.setProperty('--light-x', x * 100 + '%');
    visual.style.setProperty('--light-y', y * 100 + '%');
    visual.style.setProperty('--tilt-x', (y - .5) * -5 + 'deg');
    visual.style.setProperty('--tilt-y', (x - .5) * 5 + 'deg');
  }, () => {
    visual.style.removeProperty('--tilt-x');
    visual.style.removeProperty('--tilt-y');
  });
  const badge = element('span', 'category-tag');
  badge.append(icon('layers'), document.createTextNode(mod.category));
  visual.append(makeImage(mod.thumbnail, mod.artworkAlt || mod.name), badge);

  const info = element('div', 'card-info');
  const meta = element('p', 'card-meta');
  if (!isEditorial && mod.featured) {
    const featured = element('span', 'featured-label', 'Featured');
    featured.prepend(icon('spark'));
    meta.append(featured);
  }
  if (mod.version) meta.append(element('span', 'card-version', 'v' + mod.version));
  if (mod.concept) meta.append(element('span', 'concept-note', 'ภาพคอนเซปต์'));
  const dlBadge = element('span', 'card-downloads');
  dlBadge.dataset.downloadSlug = mod.slug;
  dlBadge.hidden = typeof mod.downloadCount !== 'number';
  const dlVal = element('span', 'download-count-value', typeof mod.downloadCount === 'number' ? mod.downloadCount.toLocaleString('th-TH') + ' ครั้ง' : '');
  dlBadge.append(icon('download'), dlVal);
  meta.append(dlBadge);
  const title = element('h3', '', mod.name);
  const subtitle = mod.name.match(/^(.+?)\s+\(([^()]+)\)$/u);
  if (subtitle) title.replaceChildren(document.createTextNode(subtitle[1] + ' '), element('span', 'card-subtitle', '(' + subtitle[2] + ')'));
  const description = element('p', 'card-description', mod.description);
  const details = element('span', 'card-cta', 'View details');
  details.prepend(icon('expand'));
  const facts = element('p', 'card-facts');
  if (mod.fileSize) facts.append(element('span', '', mod.fileSize));
  if (mod.updatedAt) {
    facts.append(element('span', '', 'อัปเดต ' + humanDate(mod.updatedAt)));
  }
  info.append(meta, title, description, facts, details);
  link.append(visual, info);
  article.append(link);
  return article;
}
