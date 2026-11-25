import { element, humanDate, icon, makeImage } from "./ui.js";
import { enableSwipe, imageSwitcher, revealOnScroll } from "./motion.js";
import { trackGalleryOpen, trackLauncherDownload, trackModDownload, trackSkillPreview, trackVideoSoundToggle } from "./analytics.js";

const NEWERTH_FORGE_URL = "https://github.com/KRAT0Sz/mod-launcher/releases/download/1.8.2/Newerth.Forge.Setup.1.8.2.exe";
const INSTALL_GUIDE_VIDEO = "./assets/video/install-guide.mp4";
const SHARED_INSTALL_STEPS = [
  "ดาวน์โหลดและติดตั้งโปรแกรม Newerth Forge (ตัวจัดการม็อดสำหรับเอาไฟล์ม็อดเข้าสู่ตัวเกม Heroes of Newerth Reborn)",
  "ดาวน์โหลดไฟล์ม็อด (.honmod) ของตัวละครนี้มาไว้ในเครื่อง (ไม่ต้องแตกไฟล์)",
  "เปิดโปรแกรม Newerth Forge ลากไฟล์ .honmod เข้าไปในรายการ (หรือกด Add Mod) ติ๊กเปิดสวิตช์ม็อด แล้วกด Apply Mods ตามคลิปด้านล่าง",
];

let openDialog = null;
let stopReveal;
let activeThemeToken = 0;
const paletteCache = new Map();

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return [h, s, l];
}

function hexToHsl(hex) {
  const clean = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return [275, 0.85, 0.58];
  const num = parseInt(clean, 16);
  return rgbToHsl((num >> 16) & 255, (num >> 8) & 255, num & 255);
}

function buildPaletteFromHsl(h, s, l) {
  const hue = Math.round(((h % 360) + 360) % 360);
  const sat = Math.round(Math.max(72, Math.min(96, s * 100 + 12)));
  const brightSat = Math.round(Math.max(80, Math.min(100, s * 100 + 18)));
  const baseLight = Math.round(Math.max(56, Math.min(66, l * 100)));
  // Keep button background rich enough for crisp white text across all hues
  const isBrightHue = hue >= 42 && hue <= 195;
  const strongLight = isBrightHue ? 38 : 46;
  const deepLight = isBrightHue ? 27 : 34;
  const deepHue = (hue + 8) % 360;

  return {
    color: `hsl(${hue} ${sat}% ${baseLight}%)`,
    bright: `hsl(${hue} ${brightSat}% 75%)`,
    strong: `hsl(${hue} ${sat}% ${strongLight}%)`,
    deep: `hsl(${deepHue} ${sat}% ${deepLight}%)`,
  };
}

function extractPaletteFromImage(img, fallbackHex) {
  const key = img.currentSrc || img.src;
  if (key && paletteCache.has(key)) return paletteCache.get(key);
  try {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    const BIN_COUNT = 24;
    const weights = new Float64Array(BIN_COUNT);
    const sinSum = new Float64Array(BIN_COUNT);
    const cosSum = new Float64Array(BIN_COUNT);
    const satSum = new Float64Array(BIN_COUNT);
    const lightSum = new Float64Array(BIN_COUNT);

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      if (l < 0.15 || l > 0.88 || s < 0.2) continue;

      const pixelIndex = i / 4;
      const px = (pixelIndex % size) / size;
      const py = Math.floor(pixelIndex / size) / size;
      const centerDist = Math.hypot(px - 0.5, py - 0.5);
      const centerBoost = 1.15 - Math.min(0.45, centerDist * 0.65);

      // Mildly discount desaturated warm skin tones so vibrant effects/armor/auras win
      const skinPenalty = (h >= 16 && h <= 42 && s < 0.66) ? 0.38 : 1.0;
      const vibrancy = Math.pow(s, 1.75) * (1 - Math.abs(l - 0.52) * 1.1);
      const w = vibrancy * centerBoost * skinPenalty;
      if (w <= 0) continue;

      const bin = Math.floor((h / 360) * BIN_COUNT) % BIN_COUNT;
      const rad = (h * Math.PI) / 180;
      weights[bin] += w;
      sinSum[bin] += Math.sin(rad) * w;
      cosSum[bin] += Math.cos(rad) * w;
      satSum[bin] += s * w;
      lightSum[bin] += l * w;
    }

    let bestBin = -1;
    let bestScore = 0;
    for (let b = 0; b < BIN_COUNT; b++) {
      const prev = (b + BIN_COUNT - 1) % BIN_COUNT;
      const next = (b + 1) % BIN_COUNT;
      const score = weights[b] + 0.28 * (weights[prev] + weights[next]);
      if (score > bestScore && weights[b] > 0) {
        bestScore = score;
        bestBin = b;
      }
    }

    if (bestBin !== -1) {
      const w = weights[bestBin];
      let avgHue = (Math.atan2(sinSum[bestBin] / w, cosSum[bestBin] / w) * 180) / Math.PI;
      if (avgHue < 0) avgHue += 360;
      const avgSat = satSum[bestBin] / w;
      const avgLight = lightSum[bestBin] / w;
      const palette = buildPaletteFromHsl(avgHue, avgSat, avgLight);
      if (key) paletteCache.set(key, palette);
      return palette;
    }
  } catch {
    // Fallback if canvas extraction fails
  }
  const [fh, fs, fl] = hexToHsl(fallbackHex);
  return buildPaletteFromHsl(fh, fs, fl);
}

function applyScenePalette(article, palette) {
  const root = document.documentElement;
  root.classList.add("detail-theme-active");
  for (const target of [article, root]) {
    if (!target) continue;
    target.style.setProperty("--scene-color", palette.color);
    target.style.setProperty("--scene-bright", palette.bright);
    target.style.setProperty("--scene-strong", palette.strong);
    target.style.setProperty("--scene-deep", palette.deep);
  }
}

export function leaveDetail() {
  activeThemeToken += 1;
  closeLightbox();
  stopReveal?.();
  stopReveal = null;
  const root = document.documentElement;
  root.classList.remove("detail-theme-active");
  root.style.removeProperty("--scene-color");
  root.style.removeProperty("--scene-bright");
  root.style.removeProperty("--scene-strong");
  root.style.removeProperty("--scene-deep");
}

function control(label, glyph, className = "detail-icon-btn") {
  const button = element("button", className);
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = label;
  button.append(icon(glyph));
  return button;
}

export function closeLightbox() {
  if (openDialog?.open) openDialog.close();
}

function openLightbox(mod, startIndex) {
  if (openDialog?.open || !mod.screenshots.length) return;
  const dialog = element("dialog", "detail-lightbox");
  const head = element("div", "detail-lightbox-head");
  const title = element("h2", "", mod.name);
  title.id = "lightbox-title";
  dialog.setAttribute("aria-labelledby", title.id);
  const close = control("ปิดหน้าต่างภาพ", "close");
  close.autofocus = true;
  close.addEventListener("click", () => dialog.close());
  head.append(title, close);
  const stage = element("div", "detail-lightbox-stage");
  const switchImage = imageSwitcher(stage);
  const foot = element("div", "detail-lightbox-foot");
  const caption = element("p", "detail-lightbox-count");
  caption.setAttribute("aria-live", "polite");
  foot.append(caption);
  let current = startIndex;
  function display(index) {
    const direction = index >= current ? 1 : -1;
    current = (index + mod.screenshots.length) % mod.screenshots.length;
    switchImage(makeImage(mod.screenshots[current], mod.screenshotAlts[current], { eager: true }), direction);
    caption.textContent = "ภาพที่ " + (current + 1) + " จาก " + mod.screenshots.length;
  }
  if (mod.screenshots.length > 1) {
    enableSwipe(stage, delta => display(current + delta));
    const prev = control("ภาพก่อนหน้า", "left");
    const next = control("ภาพถัดไป", "right");
    prev.addEventListener("click", () => display(current - 1));
    next.addEventListener("click", () => display(current + 1));
    foot.append(prev, next);
    dialog.addEventListener("keydown", event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      display(current + (event.key === "ArrowRight" ? 1 : -1));
    });
  }
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (openDialog === dialog) {
      openDialog = null;
      document.documentElement.classList.remove("detail-lightbox-open");
    }
  }, { once: true });
  dialog.append(head, stage, foot);
  document.body.append(dialog);
  openDialog = dialog;
  display(current);
  dialog.showModal();
  document.documentElement.classList.add("detail-lightbox-open");
}

export function imageButton(mod, index) {
  const button = element("button", "detail-gallery-image");
  button.type = "button";
  button.setAttribute("aria-label", "ขยายภาพที่ " + (index + 1) + " จาก " + mod.screenshots.length + " ของ " + mod.name);
  button.append(makeImage(mod.screenshots[index], mod.screenshotAlts[index]));
  const badge = element("span", "detail-enlarge");
  badge.append(icon("expand"));
  button.append(badge);
  button.addEventListener("click", () => {
    trackGalleryOpen(mod, index);
    openLightbox(mod, index);
  });
  return button;
}

function driveLink(label, href, className) {
  const link = element("a", className, label);
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function summary(mod) {
  const panel = element("div", "detail-summary");
  const labels = element("div", "detail-labels");
  labels.append(element("span", "", mod.category));
  if (mod.concept) labels.append(element("span", "detail-concept", "ภาพคอนเซปต์"));
  const title = element("h1", "detail-title", mod.name);
  title.tabIndex = -1;
  panel.append(labels, title);
  if (mod.description) panel.append(element("p", "detail-lead", mod.description));
  const metadata = element("dl", "detail-facts");
  for (const [label, value] of [
    ["เวอร์ชัน", mod.version || "ไม่ระบุ"],
    ["อัปเดต", mod.updatedAt ? humanDate(mod.updatedAt) : "ไม่ระบุ"],
  ]) {
    const item = element("div");
    item.append(element("dt", "", label), element("dd", "", value));
    metadata.append(item);
  }
  if (mod.driveLinks) {
    const dlItem = element("div");
    dlItem.dataset.downloadSlug = mod.slug;
    dlItem.hidden = typeof mod.downloadCount !== "number";
    const dlDd = element("dd", "download-count-value", typeof mod.downloadCount === "number" ? mod.downloadCount.toLocaleString("th-TH") + " ครั้ง" : "0 ครั้ง");
    dlItem.append(element("dt", "", "ดาวน์โหลด"), dlDd);
    metadata.append(dlItem);
  }
  panel.append(metadata);
  if (mod.driveLinks) {
    const links = element("div", "detail-downloads");
    const download = driveLink("Download mod", mod.driveLinks.download, "btn btn-primary detail-download");
    download.prepend(icon("download"));
    download.addEventListener("click", () => {
      trackModDownload(mod);
      if (typeof mod.downloadCount === "number") {
        mod.downloadCount += 1;
        const formatted = mod.downloadCount.toLocaleString("th-TH") + " ครั้ง";
        document.querySelectorAll(`[data-download-slug="${mod.slug}"]`).forEach(node => {
          const numNode = node.querySelector(".download-count-value") || node;
          numNode.textContent = formatted;
          node.hidden = false;
        });
      }
    });
    links.append(download);
    panel.append(links);
  } else {
    const status = element("p", "detail-status");
    status.append(element("span", "", "Download"), element("strong", "", "Unavailable"));
    panel.append(status);
  }
  return panel;
}

function textList(items, tag) {
  const list = element(tag, "detail-text-list");
  items.forEach(item => list.append(element("li", "", item)));
  return list;
}

function textSection(title) {
  const section = element("section", "detail-section");
  section.append(element("h2", "", title));
  return section;
}

function videoPlayer(source, title) {
  const player = element("video", "mod-video");
  player.src = source;
  player.autoplay = true;
  player.defaultMuted = player.muted = true;
  player.playsInline = true;
  player.controls = true;
  player.setAttribute("aria-label", title);
  return player;
}

export function renderDetail(mod, container) {
  closeLightbox();
  const token = ++activeThemeToken;
  const article = element("article", "wrap detail-layout");
  const [fh, fs, fl] = hexToHsl(mod.accent);
  applyScenePalette(article, buildPaletteFromHsl(fh, fs, fl));

  const back = element("a", "detail-back", "Back to collection");
  back.href = "./";
  back.dataset.route = "explore";
  back.prepend(icon("left"));
  const header = element("div", "detail-header");
  const cover = makeImage(mod.heroImage, mod.artworkAlt, { eager: true, className: "detail-cover", width: 1280, height: 720 });
  const syncThemeFromCover = () => {
    if (token !== activeThemeToken || !cover.naturalWidth) return;
    const palette = extractPaletteFromImage(cover, mod.accent);
    applyScenePalette(article, palette);
  };
  if (cover.complete && cover.naturalWidth) {
    syncThemeFromCover();
  } else {
    cover.addEventListener("load", syncThemeFromCover, { once: true });
  }
  header.append(cover, summary(mod));
  article.append(back, header);
  if (mod.longDescription) {
    const about = textSection("รายละเอียดม็อด");
    about.append(element("p", "", mod.longDescription));
    article.append(about);
  }
  if (mod.comments) {
    const comments = textSection("หมายเหตุ");
    comments.append(element("p", "", mod.comments));
    article.append(comments);
  }
  if (mod.skills.length) {
    const section = textSection("สกิลฮีโร่");
    const grid = element("div", "skill-grid");
    for (const skill of mod.skills) {
      const card = element("div", "skill-entry");
      const trigger = element("button", "skill-card");
      const title = [skill.key, skill.name].filter(Boolean).join(" · ");
      trigger.type = "button";
      trigger.setAttribute("aria-label", title);
      trigger.dataset.title = title;
      trigger.append(makeImage(skill.icon, "", { width: 100, height: 100 }));
      card.append(trigger);
      trigger.dataset.video = skill.clip;
      trigger.dataset.desc = skill.description;
      const panel = element("div", "skill-preview");
      panel.id = mod.slug + "-skill-" + grid.childElementCount;
      panel.hidden = true;
      trigger.setAttribute("aria-controls", panel.id);
      trigger.setAttribute("aria-expanded", "false");
      const isMobile = () => matchMedia("(max-width: 768px), (hover: none) and (pointer: coarse)").matches;
      const show = open => {
        if (open === !panel.hidden) return;
        panel.hidden = !open;
        trigger.setAttribute("aria-expanded", String(open));
        if (open) {
          trackSkillPreview(mod, skill);
          if (skill.clip && !isMobile()) {
            const player = videoPlayer(skill.clip, skill.name);
            player.loop = true;
            panel.append(player);
          }
          panel.append(element("h3", "", title), element("p", "", skill.description));
        } else {
          panel.querySelector("video")?.pause();
          panel.replaceChildren();
        }
      };
      trigger.addEventListener("click", event => {
        if (event.pointerType !== "mouse" || event.detail === 0) show(panel.hidden);
      });
      card.addEventListener("focusout", event => {
        if (!card.contains(event.relatedTarget)) show(false);
      });
      card.addEventListener("keydown", event => {
        if (event.key === "Escape") { trigger.focus(); show(false); }
      });
      card.append(panel);
      grid.append(card);
    }
    section.append(grid);
    article.append(section);
  }
  const mobileNoVideo = matchMedia("(max-width: 768px), (hover: none) and (pointer: coarse)").matches;
  if (!mobileNoVideo && (mod.preview || mod.video)) {
    const section = textSection("วิดีโอพรีวิว");
    section.classList.add("detail-video-section");
    if (mod.preview) {
      const player = videoPlayer(mod.preview, mod.name);
      player.poster = mod.heroImage;
      player.controls = false;
      player.loop = true;
      player.disablePictureInPicture = true;
      player.disableRemotePlayback = true;
      player.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback");
      const frame = element("div", "main-preview");
      const sound = element("button", "preview-sound");
      sound.type = "button";
      sound.setAttribute("aria-label", "เสียงวิดีโอพรีวิว");
      sound.setAttribute("aria-pressed", "false");
      const label = element("span", "", "เปิดเสียง");
      sound.append(label);
      sound.addEventListener("click", () => {
        player.muted = !player.muted;
        trackVideoSoundToggle(mod, player.muted);
        sound.setAttribute("aria-pressed", String(!player.muted));
        label.textContent = player.muted ? "เปิดเสียง" : "ปิดเสียง";
        if (player.paused) player.play().catch(() => {});
      });
      frame.addEventListener("contextmenu", event => event.preventDefault());
      frame.append(player, sound);
      section.append(frame);
    } else {
      const player = element("iframe", "mod-video");
      const url = new URL(mod.video.view);
      url.pathname = url.pathname.replace(/\/view$/, "/preview");
      player.src = url.href;
      player.title = "วิดีโอพรีวิว " + mod.name;
      player.loading = "lazy";
      player.allowFullscreen = true;
      section.append(player);
    }
    article.append(section);
  }
  if (mod.screenshots.length) {
    const gallery = textSection("ภาพตัวอย่าง");
    const images = element("div", "detail-gallery");
    mod.screenshots.forEach((_, index) => images.append(imageButton(mod, index)));
    gallery.append(images);
    article.append(gallery);
  }
  const notes = element("div", "detail-notes");
  const installation = textSection("วิธีติดตั้ง");
  const launcherBox = element("div", "install-launcher-box");
  const launcherText = element("p", "install-launcher-desc", "ใช้โปรแกรม Newerth Forge เป็นตัว Launcher สำหรับลงไฟล์ม็อด (.honmod) เข้าสู่ตัวเกม Heroes of Newerth Reborn");
  const launcherBtn = driveLink("ดาวน์โหลด Newerth Forge (Launcher)", NEWERTH_FORGE_URL, "btn btn-primary detail-download install-launcher-btn");
  launcherBtn.prepend(icon("download"));
  launcherBtn.addEventListener("click", () => trackLauncherDownload(mod));
  launcherBox.append(launcherText, launcherBtn);
  installation.append(launcherBox, textList(SHARED_INSTALL_STEPS, "ol"));
  const guideVideoWrap = element("div", "install-video-wrap");
  const guideVideo = videoPlayer(INSTALL_GUIDE_VIDEO, "วิดีโอสอนวิธีติดตั้งม็อดด้วย Newerth Forge");
  guideVideo.loop = true;
  guideVideo.controls = true;
  guideVideoWrap.append(guideVideo);
  installation.append(guideVideoWrap);
  const history = textSection("ประวัติการอัปเดต");
  if (!mod.changelog.length) history.append(element("p", "", "ยังไม่มีประวัติการอัปเดต"));
  for (const change of mod.changelog) {
    const row = element("div", "detail-change");
    const heading = element("h3", "", change.version ? "เวอร์ชัน " + change.version : "อัปเดต");
    if (change.date) {
      const date = element("time", "", humanDate(change.date));
      date.dateTime = change.date;
      heading.append(date);
    }
    row.append(heading, textList(change.changes, "ul"));
    history.append(row);
  }
  notes.append(installation, history);
  article.append(notes);
  container.replaceChildren(article);
  stopReveal = revealOnScroll(article.querySelectorAll(".detail-section"));
}
