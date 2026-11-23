import { modCard } from './ui.js';
import { animate, revealOnScroll } from './motion.js';

export function initializeCollection(mods, failed = false) {
  const picks = mods.filter(mod => mod.featured);
  const featured = document.getElementById('featured');
  featured.hidden = !picks.length;
  const editorial = picks.length > 1 ? picks.slice(1) : picks;
  document.getElementById('feature-grid').replaceChildren(...editorial.map(mod => modCard(mod, true)));
  if (featured.hidden) document.querySelector('.scroll-cue').href = '#explore';

  const field = document.getElementById('mod-search');
  const category = document.getElementById('category-filter');
  const order = document.getElementById('sort-order');
  const grid = document.getElementById('archive-grid');
  const empty = document.getElementById('collection-empty');
  const count = document.getElementById('result-count');
  const reset = document.getElementById('reset-filters');
  const names = [...new Set(mods.map(mod => mod.category))].sort((a, b) => a.localeCompare(b));
  names.forEach(name => category.add(new Option(name, name)));
  const cards = new Map(mods.map(mod => [mod, modCard(mod)]));
  let stopReveal;
  let initialized = false;

  function update() {
    const needle = field.value.trim().normalize('NFC').toLocaleLowerCase();
    const matches = mods.filter(mod =>
      mod.name.normalize('NFC').toLocaleLowerCase().includes(needle) &&
      (!category.value || mod.category === category.value)
    );
    matches.sort((a, b) => {
      if (!a.updatedAt || !b.updatedAt) return Number(!a.updatedAt) - Number(!b.updatedAt);
      const direction = order.value === 'oldest' ? 1 : -1;
      return direction * a.updatedAt.localeCompare(b.updatedAt);
    });
    const positions = new Map();
    if (initialized) {
      stopReveal?.();
      for (const card of grid.children) {
        positions.set(card, card.getBoundingClientRect());
        card.getAnimations?.().forEach(animation => animation.cancel());
      }
    }
    grid.replaceChildren(...matches.map(mod => cards.get(mod)));
    if (initialized) {
      for (const card of grid.children) {
        const next = card.getBoundingClientRect();
        if (next.bottom < 0 || next.top > innerHeight) continue;
        const old = positions.get(card);
        const dx = old ? old.left - next.left : 0;
        const dy = old ? old.top - next.top : 12;
        if (dx || dy) animate(card, [
          { opacity: old ? 1 : .2, transform: 'translate(' + dx + 'px,' + dy + 'px)' },
          { opacity: 1, transform: 'none' }
        ], { duration: 330 });
      }
    } else {
      stopReveal = revealOnScroll(grid.children);
      initialized = true;
    }
    count.textContent = 'พบ ' + matches.length + ' ม็อด';
    empty.hidden = matches.length > 0;
  }

  if (!mods.length) {
    document.getElementById('empty-title').textContent = failed ? 'โหลดคลังม็อดไม่สำเร็จ' : 'ยังไม่มีม็อดในคลัง';
    document.getElementById('empty-description').textContent = failed ? 'รีโหลดหน้านี้เพื่อลองอีกครั้ง' : 'กลับมาดูผลงานใหม่ได้ภายหลัง';
    reset.hidden = true;
  }
  field.addEventListener('input', update);
  category.addEventListener('change', update);
  order.addEventListener('change', update);
  reset.addEventListener('click', () => {
    field.value = category.value = '';
    update();
    field.focus();
  });
  update();
  revealOnScroll(document.querySelectorAll('#feature-grid .mod-card, .section-heading, .about-inner'));
}
