/**
 * Google Tag / Google Analytics 4 event tracking helpers for GodMian.
 * Container ID: GTM-TPTG84ZD | Measurement ID: G-53FPRR9X3K
 */

export function trackEvent(eventName, params = {}) {
  if (typeof window === 'undefined') return;
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, params);
  } else if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push({ event: eventName, ...params });
  }
}

export function modParams(mod) {
  if (!mod) return {};
  return {
    mod_id: mod.id || '',
    mod_slug: mod.slug || '',
    mod_name: mod.name || '',
    mod_category: mod.category || '',
    mod_version: mod.version || '',
  };
}

export function trackPageView(pagePath = location.pathname + location.hash, pageTitle = document.title) {
  trackEvent('page_view', {
    page_title: pageTitle,
    page_location: location.href,
    page_path: pagePath,
  });
}

export function trackModView(mod) {
  if (!mod) return;
  trackEvent('mod_view', modParams(mod));
  trackPageView(location.pathname + '#mod/' + mod.slug, mod.name + ' — GodMian');
}

export function trackModDownload(mod) {
  if (!mod) return;
  trackEvent('mod_download', {
    ...modParams(mod),
    file_size: mod.fileSize || '',
    link_url: mod.driveLinks?.download || mod.downloadUrl || '',
  });
}

export function trackSkillPreview(mod, skill) {
  if (!mod || !skill) return;
  trackEvent('skill_preview', {
    ...modParams(mod),
    skill_key: skill.key || '',
    skill_name: skill.name || '',
  });
}

export function trackGalleryOpen(mod, index) {
  if (!mod) return;
  trackEvent('gallery_open', {
    ...modParams(mod),
    image_index: index + 1,
  });
}

export function trackVideoSoundToggle(mod, muted) {
  if (!mod) return;
  trackEvent('video_sound_toggle', {
    ...modParams(mod),
    sound_state: muted ? 'muted' : 'unmuted',
  });
}
