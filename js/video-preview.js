export function initializeVideoPreview() {
  const card = document.createElement('aside');
  card.className = 'cursor-preview';
  card.setAttribute('aria-hidden', 'true');
  const video = document.createElement('video');
  video.autoplay = video.loop = video.playsInline = video.defaultMuted = video.muted = true;
  const description = document.createElement('p');
  card.append(video, description);
  document.body.append(card);

  let active = null;
  let cleanup;
  let frame;
  let x, y, targetX, targetY;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  function paint() {
    const factor = reduced.matches ? 1 : 0.28;
    x += (targetX - x) * factor;
    y += (targetY - y) * factor;
    card.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    frame = Math.abs(targetX - x) + Math.abs(targetY - y) > 0.5 ? requestAnimationFrame(paint) : 0;
  }

  function position(cursor, size, limit) {
    const near = cursor + 18;
    return Math.max(8, Math.min(near + size <= limit - 8 ? near : cursor - size - 18, limit - size - 8));
  }

  function hide() {
    if (!active) return;
    active = null;
    cancelAnimationFrame(frame);
    frame = 0;
    card.classList.remove('visible');
    video.pause();
    video.currentTime = 0;
    cleanup = setTimeout(() => {
      video.removeAttribute('src');
      video.load();
    }, 180);
  }

  function follow(event) {
    const item = event.pointerType === 'mouse' && event.target.closest?.('.mod-item[data-video]');
    if (!item) { hide(); return; }
    const entering = active !== item;
    if (entering) {
      clearTimeout(cleanup);
      active = item;
      description.textContent = item.dataset.desc || '';
      video.src = item.dataset.video;
      video.play().catch(() => {});
      card.classList.add('visible');
    }
    targetX = position(event.clientX, card.offsetWidth, document.documentElement.clientWidth);
    targetY = position(event.clientY, card.offsetHeight, document.documentElement.clientHeight);
    if (entering) { x = targetX; y = targetY; }
    if (!frame) paint();
  }

  document.addEventListener('pointerover', follow);
  document.addEventListener('pointermove', follow);
  document.addEventListener('pointerout', event => {
    if (active && !active.contains(event.relatedTarget)) hide();
  });
  for (const event of ['resize', 'blur', 'hashchange', 'pagehide', 'scroll']) window.addEventListener(event, hide);
  document.addEventListener('visibilitychange', hide);
}
