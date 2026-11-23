import { makeImage } from './ui.js';
import { animate, enableSwipe, followPointer, imageSwitcher } from './motion.js';

export function initializeHero(mods) {
  const featured = mods.filter(mod => mod.featured);
  const slides = featured.length ? featured : mods.slice(0, 1);
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
  const hero = document.getElementById('home');
  const switchImage = imageSwitcher(stage);
  const atmosphere = document.createElement('div');
  atmosphere.className = 'hero-atmosphere';
  atmosphere.setAttribute('aria-hidden', 'true');
  stage.after(atmosphere);

  function drift() {
    atmosphere.replaceChildren();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const motes = document.createDocumentFragment();
    for (let i = 0; i < 18; i++) {
      const mote = document.createElement('i');
      mote.style.left = (28 + (i * 47) % 71) + '%';
      mote.style.top = (16 + (i * 29) % 81) + '%';
      mote.style.setProperty('--drift', (16 + i % 5 * 11) + 'px');
      mote.style.animationDelay = i % 6 * 95 + 'ms';
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

  function showSlide(position) {
    const direction = position >= index ? 1 : -1;
    index = (position + slides.length) % slides.length;
    const mod = slides[index];
    const img = makeImage(mod.heroImage || mod.thumbnail, mod.artworkAlt || mod.name, {
      eager: true, width: 1920, height: 840, className: 'spotlight-art'
    });
    img.fetchPriority = 'high';
    switchImage(img, direction);
    hero.style.setProperty('--scene-color', mod.accent);
    drift();
    modName.textContent = mod.name;
    modName.href = spotlightLink.href = '#mod/' + mod.slug;
    label.textContent = mod.concept ? 'Spotlight / ภาพคอนเซปต์' : 'In the spotlight';
    counter.textContent = String(index + 1).padStart(2, '0');
    animate(modName.parentElement, [
      { opacity: .35, transform: 'translateX(' + direction * 8 + 'px)' },
      { opacity: 1, transform: 'none' }
    ]);
  }

  previous.addEventListener('click', () => showSlide(index - 1));
  next.addEventListener('click', () => showSlide(index + 1));
  document.getElementById('hero-total').textContent = String(slides.length).padStart(2, '0');
  previous.parentElement.hidden = slides.length < 2;
  counter.parentElement.hidden = slides.length < 2;
  controls.hidden = false;
  showSlide(0);
}
