import { loadMods, fetchReleaseDownloadCounts, updateDownloadCountBadges } from './data.js';
import { renderDetail, leaveDetail } from './detail.js';
import { initializeHero } from './hero.js';
import { initializeCollection } from './collection.js';
import { element } from './ui.js';
import { initializeNavigation, setMenu, setCurrent, noteScroll } from './navigation.js';
import { trackModView, trackPageView } from './analytics.js';
import { initializeVideoPreview } from './video-preview.js';

initializeVideoPreview();

const siteTitle = document.title;
const home = document.getElementById('home-view');
const detail = document.getElementById('detail-view');
const search = document.getElementById('mod-search');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const VALID_SECTIONS = ['home', 'explore', 'about', 'featured', 'main-content'];

let mods = [];
let failed = false;
let dataReady = false;
let homeReady = false;
let searchRequested = false;
let returnLink = null;
let artworkTransition;

function getCleanBasePath() {
  return location.pathname || '/';
}

function normalizeUrlAndResolveRoute() {
  const hash = location.hash ? location.hash.slice(1) : '';
  if (hash.startsWith('mod/')) {
    const slug = decodeURIComponent(hash.slice(4));
    history.replaceState({ mod: slug }, '', getCleanBasePath() + '?mod=' + encodeURIComponent(slug));
    return { type: 'mod', slug };
  }
  if (hash && VALID_SECTIONS.includes(hash)) {
    history.replaceState({ section: hash }, '', getCleanBasePath());
    return { type: 'section', target: hash };
  }
  if (location.hash) {
    history.replaceState(history.state, '', getCleanBasePath() + location.search);
  }

  const params = new URLSearchParams(location.search);
  const modSlug = params.get('mod');
  if (modSlug) {
    return { type: 'mod', slug: modSlug };
  }

  const sectionParam = params.get('section');
  if (sectionParam && VALID_SECTIONS.includes(sectionParam)) {
    history.replaceState({ section: sectionParam }, '', getCleanBasePath());
    return { type: 'section', target: sectionParam };
  }

  const stateSection = history.state?.section;
  if (stateSection && VALID_SECTIONS.includes(stateSection)) {
    return { type: 'section', target: stateSection };
  }

  return { type: 'section', target: 'home' };
}

function showUnknown() {
  const box = element('section', 'wrap missing-mod');
  const title = element('h1', '', 'ไม่พบม็อด');
  const description = element('p', '', failed ? 'รีโหลดหน้าเว็บเพื่อลองอีกครั้ง' : 'ไม่พบรายการนี้ในคลังม็อด');
  const back = element('a', 'btn btn-primary', 'Explore mods');
  back.href = './';
  back.dataset.route = 'explore';
  box.append(title, description, back);
  detail.replaceChildren(box);
}

function renderRoute(initial = false, restore = false) {
  if (!dataReady) return;
  const route = normalizeUrlAndResolveRoute();
  const isDetail = route.type === 'mod';
  const wasDetail = !detail.hidden;
  leaveDetail();
  setMenu(false);
  home.hidden = isDetail;
  detail.hidden = !isDetail;

  if (isDetail) {
    const mod = mods.find(item => item.slug === route.slug);
    if (mod) renderDetail(mod, detail);
    else showUnknown();
    document.title = (mod?.name || 'ไม่พบม็อด') + ' — GodMian';
    if (mod) trackModView(mod);
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
  if (!initial) trackPageView();

  if (restore && wasDetail && returnLink?.link?.isConnected) {
    window.scrollTo({ top: returnLink.y, behavior: 'instant' });
    returnLink.link.focus({ preventScroll: true });
    returnLink = null;
    noteScroll();
    return;
  }

  const target = VALID_SECTIONS.includes(route.target) ? route.target : 'home';
  const destination = document.getElementById(target);
  const section = (!destination || destination.hidden) ? document.getElementById('explore') : destination;
  const behavior = initial || wasDetail || reducedMotion.matches || searchRequested ? 'instant' : 'smooth';

  if (target === 'home') window.scrollTo({ top: 0, behavior });
  else section?.scrollIntoView({ behavior, block: 'start' });

  if (searchRequested) {
    search.focus({ preventScroll: true });
    searchRequested = false;
  } else if (!initial && (wasDetail || target !== 'home') && section) {
    const focusTarget = section.querySelector('h1, h2') || section;
    focusTarget.tabIndex = -1;
    focusTarget.focus({ preventScroll: true });
  }
  noteScroll();
}

function transitionToRoute(restore = false, openingLink = null) {
  const route = normalizeUrlAndResolveRoute();
  const openingSelection = !home.hidden && route.type === 'mod' && openingLink;
  const source = openingSelection && (openingLink.querySelector('.card-visual img') ||
    document.querySelector('#hero-art img:last-child'));

  if (artworkTransition || !source || !source.complete || !document.startViewTransition || reducedMotion.matches) {
    artworkTransition?.skipTransition();
    renderRoute(false, restore);
    return;
  }

  source.style.viewTransitionName = 'selected-artwork';
  let cover;
  const transition = document.startViewTransition(() => {
    source.style.removeProperty('view-transition-name');
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
}

function navigateToSection(target) {
  const wasDetail = !detail.hidden;
  if (wasDetail || location.search || location.hash) {
    history.pushState({ section: target }, '', getCleanBasePath());
  } else {
    history.replaceState({ section: target }, '', getCleanBasePath());
  }
  renderRoute(false, false);
}

function navigateToMod(slug, sourceLink = null) {
  if (sourceLink && home.contains(sourceLink)) {
    returnLink = { link: sourceLink, y: scrollY };
  }
  const targetUrl = getCleanBasePath() + '?mod=' + encodeURIComponent(slug);
  const currentSlug = new URLSearchParams(location.search).get('mod');
  if (currentSlug !== slug) {
    history.pushState({ mod: slug }, '', targetUrl);
  }
  transitionToRoute(false, sourceLink);
}

function searchMods() {
  searchRequested = true;
  navigateToSection('explore');
}

initializeNavigation(searchMods);

document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const modLink = event.target.closest('a[data-mod-slug]');
  if (modLink) {
    event.preventDefault();
    navigateToMod(modLink.dataset.modSlug, modLink);
    return;
  }

  const routeLink = event.target.closest('a[data-route]');
  if (routeLink) {
    event.preventDefault();
    navigateToSection(routeLink.dataset.route);
    return;
  }

  const legacyHashLink = event.target.closest('a[href^="#"]');
  if (legacyHashLink) {
    const hashTarget = legacyHashLink.getAttribute('href').slice(1);
    if (hashTarget.startsWith('mod/')) {
      event.preventDefault();
      navigateToMod(decodeURIComponent(hashTarget.slice(4)), legacyHashLink);
    } else if (VALID_SECTIONS.includes(hashTarget)) {
      event.preventDefault();
      navigateToSection(hashTarget);
    }
  }
});

try {
  mods = await loadMods();
} catch {
  failed = true;
}
dataReady = true;
renderRoute(true);
const scheduleReleaseCountFetch = () => {
  const run = () => fetchReleaseDownloadCounts(mods).then(() => updateDownloadCountBadges(mods)).catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2500 });
  else setTimeout(run, 1200);
};
if (document.readyState === 'complete') scheduleReleaseCountFetch();
else window.addEventListener('load', scheduleReleaseCountFetch, { once: true });

window.addEventListener('popstate', () => {
  transitionToRoute(true);
});

window.addEventListener('hashchange', () => {
  transitionToRoute(false);
});
