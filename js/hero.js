import { makeImage } from './ui.js';

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

  function showSlide(position) {
    index = (position + slides.length) % slides.length;
    const mod = slides[index];
    const img = makeImage(mod.heroImage || mod.thumbnail, mod.artworkAlt || mod.name, {
      eager: true, width: 1920, height: 840, className: 'spotlight-art'
    });
    img.fetchPriority = 'high';
    stage.replaceChildren(img);
    modName.textContent = mod.name;
    modName.href = spotlightLink.href = '#mod/' + mod.slug;
    label.textContent = mod.concept ? 'Spotlight / ภาพคอนเซปต์' : 'In the spotlight';
    counter.textContent = String(index + 1).padStart(2, '0');
  }

  previous.addEventListener('click', () => showSlide(index - 1));
  next.addEventListener('click', () => showSlide(index + 1));
  document.getElementById('hero-total').textContent = String(slides.length).padStart(2, '0');
  previous.parentElement.hidden = slides.length < 2;
  controls.hidden = false;
  showSlide(0);
}
