const header = document.getElementById('site-header');
const nav = document.getElementById('primary-nav');
const toggle = document.getElementById('menu-toggle');

export function setMenu(open) {
  nav.classList.toggle('open', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'ปิดเมนู' : 'เปิดเมนู');
  toggle.querySelector('use').setAttribute('href', './assets/icons.svg#' + (open ? 'close' : 'menu'));
}

export function setCurrent(section) {
  nav.querySelectorAll('a').forEach(link => {
    const route = link.dataset.route || link.hash.slice(1);
    if (route === section) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

export function noteScroll() {
  header.classList.toggle('scrolled', scrollY > 16);
  if (document.getElementById('home-view').hidden) return;
  const threshold = Math.min(innerHeight * .44, 260);
  let current = 'home';
  if (document.getElementById('explore').getBoundingClientRect().top < threshold) current = 'explore';
  if (document.getElementById('about').getBoundingClientRect().top < threshold ||
    (innerHeight + scrollY >= document.documentElement.scrollHeight - 2 && scrollY > 0)) current = 'about';
  setCurrent(current);
}

export function initializeNavigation(searchMods) {
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') === 'false'));
  document.getElementById('global-search').addEventListener('click', searchMods);
  document.addEventListener('click', event => {
    if (!header.contains(event.target) && nav.classList.contains('open')) setMenu(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      toggle.focus();
    }
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey &&
      !event.target.closest('input, textarea, select, [contenteditable="true"]') && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      searchMods();
    }
  });
  document.querySelector('.skip').addEventListener('click', event => {
    event.preventDefault();
    const main = document.getElementById('main-content');
    main.focus({ preventScroll: true });
    main.scrollIntoView({ block: 'start' });
  });
  matchMedia('(min-width: 761px)').addEventListener('change', () => setMenu(false));
  window.addEventListener('scroll', noteScroll, { passive: true });
}
