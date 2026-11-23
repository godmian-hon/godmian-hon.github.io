const preference = matchMedia('(prefers-reduced-motion: reduce)');
const active = new Set();
const easeOut = 'cubic-bezier(.18,.78,.22,1)';

export function animate(node, keyframes, options = {}) {
  if (preference.matches || !node.animate) return;
  const animation = node.animate(keyframes, { duration: 440, easing: easeOut, ...options });
  active.add(animation);
  const forget = () => active.delete(animation);
  animation.finished.then(forget, forget);
  return animation;
}

preference.addEventListener('change', () => {
  if (preference.matches) active.forEach(animation => animation.cancel());
});

// Start on intersection, leaving the ordinary document visible at all times.
export function revealOnScroll(nodes) {
  if (preference.matches || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(entries => {
    let order = 0;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      animate(entry.target, [
        { opacity: .15, transform: 'translateY(18px)' },
        { opacity: 1, transform: 'none' }
      ], { delay: Math.min(order++, 3) * 48, fill: 'backwards', duration: 500 });
    }
  });
  for (const node of nodes) observer.observe(node);
  return () => observer.disconnect();
}

// Keep the previous artwork on screen while the selected image decodes.
export function imageSwitcher(stage) {
  let latest;
  let transition;
  return async (image, direction = 1) => {
    latest = image;
    if (!stage.firstElementChild) {
      stage.append(image);
      return;
    }
    try { await image.decode(); } catch { /* makeImage handles the fallback. */ }
    if (image !== latest || !stage.isConnected) return;
    transition?.cancel();
    const previous = stage.lastElementChild;
    previous.classList.add('outgoing-art');
    previous.setAttribute('aria-hidden', 'true');
    stage.replaceChildren(previous, image);
    transition = animate(image, [
      { opacity: 0, transform: 'translateX(' + direction * 12 + 'px) scale(1.035)' },
      { opacity: 1, transform: 'none' }
    ], { duration: 520 });
    if (transition) await transition.finished.catch(() => {});
    previous.remove();
  };
}

export function enableSwipe(surface, step) {
  let start;
  surface.addEventListener('touchstart', event => {
    start = event.touches.length === 1 && !event.target.closest('a,button,input,select') ? event.touches[0] : null;
  }, { passive: true });
  surface.addEventListener('touchcancel', () => { start = null; });
  surface.addEventListener('touchend', event => {
    if (!start) return;
    const end = event.changedTouches[0];
    const dx = end.clientX - start.clientX;
    const dy = end.clientY - start.clientY;
    start = null;
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.6) step(dx < 0 ? 1 : -1);
  }, { passive: true });
}

// Decorative movement follows input only on devices with a precise pointer.
export function followPointer(surface, update, reset) {
  const enabled = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  let frame = 0;
  function clear() {
    cancelAnimationFrame(frame);
    frame = 0;
    reset();
  }
  surface.addEventListener('pointermove', event => {
    if (!enabled.matches || event.pointerType === 'touch' || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const rect = surface.getBoundingClientRect();
      update((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
    });
  }, { passive: true });
  surface.addEventListener('pointerleave', clear);
  surface.addEventListener('pointercancel', clear);
}
