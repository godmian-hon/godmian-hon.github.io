import { makeImage } from './ui.js';
import { animate, enableSwipe, followPointer, imageSwitcher } from './motion.js';

export function initializeHero(mods) {
  const featured = mods.filter(mod => mod.featured);
  const pool = featured.length > 1 ? featured : mods;
  const slides = [...pool].sort((a, b) => Number(b.featured) - Number(a.featured) || b.createdAt.localeCompare(a.createdAt));
  const controls = document.getElementById('hero-controls');
  const spotlightLink = document.getElementById('spotlight-link');
  if (!slides.length) {
    spotlightLink.hidden = true;
    return;
  }
  const stage = document.getElementById('hero-art');
  const modName = document.getElementById('hero-mod-name');
  const label = document.getElementById('hero-label');
  const counter = document.getElementById('hero-index');
  const previous = document.getElementById('hero-prev');
  const next = document.getElementById('hero-next');
  let index = 0;
  let restartRotation;
  const hero = document.getElementById('home');
  const switchImage = imageSwitcher(stage, 220);
  const prepared = new Map();
  const atmosphere = document.createElement('div');
  atmosphere.className = 'hero-atmosphere';
  atmosphere.setAttribute('aria-hidden', 'true');
  stage.after(atmosphere);

  function drift() {
    atmosphere.replaceChildren();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const motes = document.createDocumentFragment();
    for (let i = 0; i < 28; i++) {
      const mote = document.createElement('i');
      mote.style.left = (8 + (i * 37) % 88) + '%';
      mote.style.top = (18 + (i * 29) % 78) + '%';
      mote.style.setProperty('--drift', ((i % 2 ? 1 : -1) * (14 + (i % 5) * 11)) + 'px');
      mote.style.setProperty('--rise', (-65 - (i % 4) * 22) + 'px');
      mote.style.setProperty('--size', (2.5 + (i % 4) * 1.1) + 'px');
      mote.style.animationDuration = (3.4 + (i % 5) * 0.65) + 's';
      mote.style.animationDelay = -(i * 0.37) + 's';
      motes.append(mote);
    }
    atmosphere.append(motes);
  }

  followPointer(hero, (x, y) => {
    stage.style.setProperty('--pan-x', (x - .5) * 12 + 'px');
    stage.style.setProperty('--pan-y', (y - .5) * 8 + 'px');
  }, () => {
    stage.style.removeProperty('--pan-x');
    stage.style.removeProperty('--pan-y');
  });
  if (slides.length > 1) enableSwipe(hero, delta => showSlide(index + delta));

  function slideImage(mod) {
    return makeImage(mod.heroImage || mod.thumbnail, mod.artworkAlt || mod.name, {
      eager: true, width: 1440, height: 617, className: 'spotlight-art'
    });
  }

  function showSlide(position) {
    restartRotation?.();
    const direction = position >= index ? 1 : -1;
    index = (position + slides.length) % slides.length;
    const mod = slides[index];
    const existing = stage.firstElementChild;
    const targetSrc = mod.heroImage || mod.thumbnail;
    if (existing && stage.childElementCount === 1 && existing.getAttribute('src') === targetSrc) {
      existing.fetchPriority = 'high';
    } else {
      const img = prepared.get(mod) || slideImage(mod);
      prepared.delete(mod);
      img.fetchPriority = 'high';
      switchImage(img, direction);
    }
    const neighbors = new Set([slides[(index + 1) % slides.length], slides[(index + slides.length - 1) % slides.length]]);
    for (const cached of prepared.keys()) {
      if (!neighbors.has(cached)) prepared.delete(cached);
    }
    for (const neighbor of neighbors) {
      if (neighbor === mod || prepared.has(neighbor)) continue;
      const upcoming = slideImage(neighbor);
      upcoming.fetchPriority = 'low';
      prepared.set(neighbor, upcoming);
      upcoming.decode().catch(() => {});
    }
    hero.style.setProperty('--scene-color', mod.accent);
    drift();
    modName.textContent = mod.name;
    modName.href = spotlightLink.href = './?mod=' + encodeURIComponent(mod.slug);
    modName.dataset.modSlug = spotlightLink.dataset.modSlug = mod.slug;
     delete spotlightLink.dataset.route;
    label.textContent = mod.concept ? 'Spotlight / ภาพคอนเซปต์' : 'In the spotlight';
    counter.textContent = String(index + 1).padStart(2, '0');
    animate(modName.parentElement, [
      { opacity: .35, transform: 'translateX(' + direction * 8 + 'px)' },
      { opacity: 1, transform: 'none' }
    ]);
  }

  if (slides.length > 1) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    let timer;
    function schedule() {
      clearTimeout(timer);
      if (visible && !document.hidden && !reduced.matches && !hero.matches(':focus-within')) {
        timer = setTimeout(() => showSlide(index + 1), 6000);
      }
    }
    restartRotation = schedule;
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      schedule();
    }).observe(hero);
    reduced.addEventListener('change', schedule);
    document.addEventListener('visibilitychange', schedule);
    hero.addEventListener('focusin', schedule);
    hero.addEventListener('focusout', () => queueMicrotask(schedule));
  }

  previous.addEventListener('click', () => showSlide(index - 1));
  next.addEventListener('click', () => showSlide(index + 1));
  document.getElementById('hero-total').textContent = String(slides.length).padStart(2, '0');
  previous.parentElement.hidden = slides.length < 2;
  counter.parentElement.hidden = slides.length < 2;
  controls.hidden = false;
  showSlide(0);
}
