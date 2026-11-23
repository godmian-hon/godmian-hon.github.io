import { element, humanDate, icon, makeImage } from "./ui.js";
import { enableSwipe, imageSwitcher, revealOnScroll } from "./motion.js";

let openDialog = null;
let stopReveal;

export function leaveDetail() {
  closeLightbox();
  stopReveal?.();
  stopReveal = null;
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
  button.addEventListener("click", () => openLightbox(mod, index));
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
  panel.append(metadata);
  if (mod.driveLinks) {
    const links = element("div", "detail-downloads");
    const download = driveLink("Download mod", mod.driveLinks.download, "btn btn-primary detail-download");
    download.prepend(icon("download"));
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

export function renderDetail(mod, container) {
  closeLightbox();
  const article = element("article", "wrap detail-layout");
  article.style.setProperty("--scene-color", mod.accent);
  const back = element("a", "detail-back", "Back to collection");
  back.href = "#explore";
  back.prepend(icon("left"));
  const header = element("div", "detail-header");
  const cover = makeImage(mod.heroImage, mod.artworkAlt, { eager: true, className: "detail-cover", width: 1280, height: 720 });
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
  if (mod.screenshots.length) {
    const gallery = textSection("ภาพตัวอย่าง");
    const images = element("div", "detail-gallery");
    mod.screenshots.forEach((_, index) => images.append(imageButton(mod, index)));
    gallery.append(images);
    article.append(gallery);
  }
  const notes = element("div", "detail-notes");
  const installation = textSection("วิธีติดตั้ง");
  installation.append(mod.installationGuide.length ? textList(mod.installationGuide, "ol") :
    element("p", "", mod.driveLinks ? "ยังไม่มีคำแนะนำการติดตั้ง" : "วิธีติดตั้งจะตามมาเมื่อเปิดให้ดาวน์โหลดไฟล์ม็อด"));
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
