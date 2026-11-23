export const FALLBACK_IMAGE = "./assets/fallback.svg";

const text = value => typeof value === "string" ? value.trim() : "";
const list = value => Array.isArray(value) ? value.map(text).filter(Boolean) : [];

function imagePath(value) {
  const path = text(value).replace(/^\.\//, "");
  const parts = path.split("/");
  if (parts[0] !== "assets" || !/\.(avif|webp|png|jpe?g|gif|svg)$/i.test(path)) return "";
  const invalid = parts.some(part => !part || part === "." || part === ".." || /[\\%?#:\u0000-\u001f]/.test(part));
  return invalid ? "" : "./" + path;
}

function isoDate(value) {
  const day = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const parsed = new Date(day + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : "";
}

export function getDriveLinks(value) {
  if (!text(value)) return null;
  let url;
  try {
    url = new URL(text(value));
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  let id;
  if (url.hostname === "drive.google.com") {
    const file = url.pathname.match(/^\/file\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)(?:\/(?:view|preview|edit))?\/?$/);
    if (file) id = file[1];
    else if (/^\/(?:u\/\d+\/)?(?:open|uc)\/?$/.test(url.pathname)) id = url.searchParams.get("id");
  } else if (url.hostname === "drive.usercontent.google.com" && url.pathname === "/download") {
    id = url.searchParams.get("id");
  }
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
  const view = new URL("https://drive.google.com/file/d/" + id + "/view");
  const download = new URL("https://drive.google.com/uc");
  download.searchParams.set("export", "download");
  download.searchParams.set("id", id);
  const resourceKey = url.searchParams.get("resourcekey");
  if (resourceKey) {
    download.searchParams.set("resourcekey", resourceKey);
    view.searchParams.set("resourcekey", resourceKey);
  }
  return { download: download.href, view: view.href };
}

export function normalizeMods(records) {
  if (!Array.isArray(records)) throw new TypeError("The mod catalogue must be an array.");
  const ids = new Set();
  const slugs = new Set();
  const mods = [];
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const id = text(record.id);
    const slug = text(record.slug);
    const name = text(record.name);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) continue;
    if (!name || ids.has(id) || slugs.has(slug)) continue;
    ids.add(id);
    slugs.add(slug);

    const screenshots = [];
    const screenshotAlts = [];
    if (Array.isArray(record.screenshots)) {
      record.screenshots.forEach((source, index) => {
        const path = imagePath(source);
        if (path && !screenshots.includes(path)) {
          screenshots.push(path);
          screenshotAlts.push(text(record.screenshotAlts?.[index]) || name + ", preview " + screenshots.length);
        }
      });
    }

    const thumbnail = imagePath(record.thumbnail);
    const heroImage = imagePath(record.heroImage) || screenshots[0] || thumbnail || FALLBACK_IMAGE;
    const artworkAlt = text(record.artworkAlt) || name + " artwork";
    if (!screenshots.length && heroImage !== FALLBACK_IMAGE) {
      screenshots.push(heroImage);
      screenshotAlts.push(artworkAlt);
    }
    const changelog = Array.isArray(record.changelog) ? record.changelog
      .filter(entry => entry && typeof entry === "object")
      .map(entry => ({ version: text(entry.version), date: isoDate(entry.date), changes: list(entry.changes) }))
      .filter(entry => entry.changes.length) : [];
    const createdAt = isoDate(record.createdAt);
    const downloadUrl = text(record.downloadUrl);
    const driveLinks = getDriveLinks(downloadUrl);
    mods.push({
      id, slug, name, thumbnail: thumbnail || heroImage, heroImage, artworkAlt, screenshots, screenshotAlts,
      category: text(record.category) || "Other", version: text(record.version),
      accent: /^#[0-9a-f]{6}$/i.test(text(record.accent)) ? record.accent : "#97caff",
      description: text(record.description), longDescription: text(record.longDescription),
      comments: text(record.comments),
      skills: (Array.isArray(record.skills) ? record.skills : []).filter(skill => skill && text(skill.name)).map(skill => ({
        key: text(skill.key), name: text(skill.name), icon: imagePath(skill.icon), description: text(skill.description)
      })),
      video: getDriveLinks(record.previewVideoUrl),
      featured: record.featured === true, concept: record.concept === true,
      createdAt, updatedAt: isoDate(record.updatedAt) || createdAt,
      fileSize: text(record.fileSize), downloadUrl: driveLinks ? downloadUrl : "", driveLinks,
      installationGuide: list(record.installationGuide), changelog,
    });
  }
  return mods;
}

export async function loadMods() {
  const response = await fetch(new URL("../data/mods.json", import.meta.url));
  if (!response.ok) throw new Error("The mod catalogue could not be loaded.");
  return normalizeMods(await response.json());
}
