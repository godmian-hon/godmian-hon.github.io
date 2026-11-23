import { loadMods } from './data.js';
import { renderDetail, leaveDetail } from './detail.js';
import { initializeHero } from './hero.js';
import { initializeCollection } from './collection.js';
import { element } from './ui.js';
import { initializeNavigation, setMenu, setCurrent, noteScroll } from './navigation.js';

import { initializeVideoPreview } from './video-preview.js';

initializeVideoPreview();

const siteTitle = document.title;
const home = document.getElementById('home-view');
const detail = document.getElementById('detail-view');
const search = document.getElementById('mod-search');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let mods = [];
let failed = false;
let dataReady = false;
let homeReady = false;
let searchRequested = false;
let returnLink = null;
let artworkTransition;

function recordReturn(event) {
  const link = event.target.closest('a[href^="#mod/"]');
  if (link && home.contains(link)) returnLink = { link, y: scrollY, hash: location.hash };
}

function showUnknown() {
  const box = element('section', 'wrap missing-mod');
  const title = element('h1', '', 'ไม่พบม็อด');
  const description = element('p', '', failed ? 'รีโหลดหน้าเว็บเพื่อลองอีกครั้ง' : 'ไม่พบรายการนี้ในคลังม็อด');
  const back = element('a', 'btn btn-primary', 'Explore mods');
  back.href = '#explore';
  box.append(title, description, back);
  detail.replaceChildren(box);
}

function renderRoute(initial = false, restore = false) {
  if (!dataReady) return;
  const hash = location.hash.slice(1);
  const isDetail = hash.startsWith('mod/');
  const wasDetail = !detail.hidden;
  leaveDetail();
  setMenu(false);
  home.hidden = isDetail;
  detail.hidden = !isDetail;
  if (isDetail) {
    const mod = mods.find(item => item.slug === hash.slice(4));
    if (mod) renderDetail(mod, detail);
    else showUnknown();
    document.title = (mod?.name || 'ไม่พบม็อด') + ' — GodMian';
    setCurrent('explore');
    window.scrollTo({ top: 0, behavior: 'instant' });
    const heading = detail.querySelector('h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    return;
  }
  if (!homeReady) {
    initializeHero(mods);
    initializeCollection(mods, failed);
    homeReady = true;
  }
  detail.replaceChildren();
  document.title = siteTitle;
  if (restore && wasDetail && returnLink?.hash === location.hash && returnLink.link.isConnected) {
    window.scrollTo({ top: returnLink.y, behavior: 'instant' });
    returnLink.link.focus({ preventScroll: true });
    returnLink = null;
    return;
  }
  const target = ['explore', 'about', 'featured', 'main-content'].includes(hash) ? hash : 'home';
  const destination = document.getElementById(target);
  const section = destination.hidden ? document.getElementById('explore') : destination;
  const behavior = initial || wasDetail || reducedMotion.matches || searchRequested ? 'instant' : 'smooth';
  if (target === 'home') window.scrollTo({ top: 0, behavior });
  else section.scrollIntoView({ behavior, block: 'start' });
  if (searchRequested) {
    search.focus({ preventScroll: true });
    searchRequested = false;
  } else if (!initial && (wasDetail || target !== 'home')) {
    const focusTarget = section.querySelector('h1, h2') || section;
    focusTarget.tabIndex = -1;
    focusTarget.focus({ preventScroll: true });
  }
  noteScroll();
}

function searchMods() {
  searchRequested = true;
  if (location.hash === '#explore') renderRoute();
  else location.hash = 'explore';
}

initializeNavigation(searchMods);
document.addEventListener('click', event => {
  if (event.defaultPrevented) return;
  recordReturn(event);
  const link = event.target.closest('a[href^="#"]');
  if (link?.hash === location.hash && !link.hash.startsWith('#mod/')) {
    event.preventDefault();
    renderRoute();
  }
});
try {
  mods = await loadMods();
} catch {
  failed = true;
}
dataReady = true;
renderRoute(true);
let traversing = false;
window.addEventListener('popstate', () => { traversing = true; });
window.addEventListener('hashchange', () => {
  const restore = traversing;
  traversing = false;
  const hash = location.hash;
  const openingSelection = !home.hidden && hash.startsWith('#mod/') && returnLink?.link.hash === hash;
  const source = openingSelection && (returnLink.link.querySelector('.card-visual img') ||
    document.querySelector('#hero-art img:last-child'));
  if (artworkTransition || !source || !source.complete || !document.startViewTransition || reducedMotion.matches) {
    artworkTransition?.skipTransition();
    renderRoute(false, restore);
    return;
  }
  // Let the browser carry the selected artwork from its thumbnail into the detail cover.
  source.style.viewTransitionName = 'selected-artwork';
  let cover;
  const transition = document.startViewTransition(() => {
    source.style.removeProperty('view-transition-name');
    if (location.hash !== hash) return;
    renderRoute(false, restore);
    cover = detail.querySelector('.detail-cover');
    if (cover) cover.style.viewTransitionName = 'selected-artwork';
  });
  artworkTransition = transition;
  const skip = () => { if (reducedMotion.matches) transition.skipTransition(); };
  reducedMotion.addEventListener('change', skip);
  transition.finished.finally(() => {
    source.style.removeProperty('view-transition-name');
    cover?.style.removeProperty('view-transition-name');
    reducedMotion.removeEventListener('change', skip);
    artworkTransition = null;
  });
});
