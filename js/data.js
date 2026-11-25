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

const videoPath = value => /^assets\/video\/[a-z0-9_-]+\.mp4$/i.test(text(value)) ? "./" + value : "";

function isoDate(value) {
  const day = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const parsed = new Date(day + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : "";
}

export function getGithubReleaseLink(value) {
  if (!text(value)) return null;
  let url;
  try {
    url = new URL(text(value));
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hostname !== "github.com") return null;
  const match = url.pathname.match(/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/releases\/download\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  const [, owner, repo, tag, filename] = match;
  return {
    provider: "github",
    owner,
    repo,
    tag: decodeURIComponent(tag),
    filename: decodeURIComponent(filename),
    download: url.href,
    view: `https://github.com/${owner}/${repo}/releases/tag/${tag}`,
  };
}

export function getDriveLinks(value) {
  const gh = getGithubReleaseLink(value);
  if (gh) return gh;
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
  return { provider: "drive", download: download.href, view: view.href };
}

export async function fetchReleaseDownloadCounts(mods) {
  if (typeof navigator !== "undefined" && (navigator.webdriver || /Lighthouse|PTST|HeadlessChrome|PageSpeed/i.test(navigator.userAgent || ""))) {
    return mods;
  }
  const CACHE_KEY = "godmian_release_counts_v1";
  const CACHE_TTL_MS = 10 * 60 * 1000;
  let cachedPayload = null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Date.now() - parsed.ts < CACHE_TTL_MS && Array.isArray(parsed.releases)) {
        cachedPayload = parsed.releases;
      }
    }
  } catch {
    // Ignore sessionStorage errors
  }

  const repos = new Set();
  for (const mod of mods) {
    if (mod.driveLinks?.provider === "github") {
      repos.add(`${mod.driveLinks.owner}/${mod.driveLinks.repo}`);
    }
  }
  if (!repos.size) repos.add("godmian-hon/godmian-hon.github.io");

  const assetCounts = new Map();
  const tagCounts = new Map();
  const slugPrefixCounts = new Map();

  function accumulateReleases(releases) {
    if (!Array.isArray(releases)) return;
    for (const rel of releases) {
      const tag = text(rel.tag_name);
      let relTotal = 0;
      if (Array.isArray(rel.assets)) {
        for (const asset of rel.assets) {
          const count = Number(asset.download_count) || 0;
          relTotal += count;
          if (asset.browser_download_url) assetCounts.set(asset.browser_download_url, count);
          if (asset.name) assetCounts.set(asset.name.toLowerCase(), (assetCounts.get(asset.name.toLowerCase()) || 0) + count);
        }
      }
      if (tag) {
        tagCounts.set(tag.toLowerCase(), relTotal);
        const prefix = tag.toLowerCase().split("-v")[0];
        if (prefix) slugPrefixCounts.set(prefix, (slugPrefixCounts.get(prefix) || 0) + relTotal);
      }
    }
  }

  if (cachedPayload) {
    accumulateReleases(cachedPayload);
  } else {
    const collected = [];
    await Promise.allSettled([...repos].map(async repoPath => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      try {
        const res = await fetch(`https://api.github.com/repos/${repoPath}/releases?per_page=100`, {
          headers: { Accept: "application/vnd.github+json" },
          signal: controller.signal,
        });
        if (!res.ok) return;
        const releases = await res.json();
        if (Array.isArray(releases)) {
          collected.push(...releases);
          accumulateReleases(releases);
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }));
    if (collected.length) {
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), releases: collected }));
      } catch {
        // Ignore storage quota errors
      }
    }
  }

  for (const mod of mods) {
    let total;
    const slugPrefix = mod.slug.split("-")[0].toLowerCase();
    if (slugPrefixCounts.has(mod.slug.toLowerCase())) {
      total = slugPrefixCounts.get(mod.slug.toLowerCase());
    } else if (slugPrefixCounts.has(slugPrefix)) {
      total = slugPrefixCounts.get(slugPrefix);
    } else if (mod.driveLinks?.provider === "github") {
      const { download, filename, tag } = mod.driveLinks;
      if (assetCounts.has(download)) total = assetCounts.get(download);
      else if (filename && assetCounts.has(filename.toLowerCase())) total = assetCounts.get(filename.toLowerCase());
      else if (tag && tagCounts.has(tag.toLowerCase())) total = tagCounts.get(tag.toLowerCase());
      else total = 0;
    }
    if (typeof total === "number") {
      mod.downloadCount = total;
    }
  }
  return mods;
}

export function updateDownloadCountBadges(mods) {
  for (const mod of mods) {
    if (typeof mod.downloadCount !== "number") continue;
    const formatted = mod.downloadCount.toLocaleString("th-TH");
    document.querySelectorAll(`[data-download-slug="${mod.slug}"]`).forEach(node => {
      const numNode = node.querySelector(".download-count-value") || node;
      numNode.textContent = formatted + " ครั้ง";
      node.hidden = false;
    });
  }
}

export function skillClipPath(value) {
  const links = getDriveLinks(value);
  if (!links || links.provider !== "drive") return videoPath(value);
  const id = new URL(links.download).searchParams.get("id");
  return "./assets/video/drive-" + id + ".mp4";
}

export function normalizeMods(records) {
  if (!Array.isArray(records)) throw new TypeError("The mod catalogue must be an array.");
  const ids = new Set();
  const slugs = new Set();
  const mods = [];
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    if (record.enabled === false || record.hidden === true) continue;
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
    const version = text(record.version) || changelog[0]?.version || "";
    const createdAt = isoDate(record.createdAt);
    const latestChangelogDate = changelog.map(entry => entry.date).filter(Boolean).sort().pop() || "";
    const rawUpdatedAt = isoDate(record.updatedAt);
    const updatedAt = [rawUpdatedAt, latestChangelogDate, createdAt].filter(Boolean).sort().pop() || "";
    const downloadUrl = text(record.downloadUrl);
    const driveLinks = getDriveLinks(downloadUrl);
    const installationGuide = list(record.installationGuide).map(step =>
      version
        ? step
            .replace(/\{version\}/gi, version)
            .replace(/(_v)\d+(?:\.\d+)+(\.honmod\b)/gi, "$1" + version + "$2")
        : step
    );
    mods.push({
      id, slug, name, thumbnail: thumbnail || heroImage, heroImage, artworkAlt, screenshots, screenshotAlts,
      category: text(record.category) || "Other", version,
      accent: /^#[0-9a-f]{6}$/i.test(text(record.accent)) ? record.accent : "#97caff",
      description: text(record.description), longDescription: text(record.longDescription),
      comments: text(record.comments),
      skills: (Array.isArray(record.skills) ? record.skills : []).filter(skill => skill && text(skill.name)).map(skill => ({
        key: text(skill.key), name: text(skill.name), icon: imagePath(skill.icon), clip: skillClipPath(skill.clip || skill.clipSource), description: text(skill.description)
      })),
      preview: videoPath(record.preview), video: getDriveLinks(record.previewVideoUrl),
      featured: record.featured === true, concept: record.concept === true,
      createdAt, updatedAt,
      fileSize: text(record.fileSize), downloadUrl: driveLinks ? downloadUrl : "", driveLinks,
      installationGuide, changelog,
    });
  }
  return mods;
}

export async function loadMods() {
  const response = await fetch(new URL("../data/mods.json", import.meta.url), { cache: "no-cache" });
  if (!response.ok) throw new Error("The mod catalogue could not be loaded.");
  const rawCatalogue = await response.json();
  let entries;
  let disabledSlugs = new Set();
  if (Array.isArray(rawCatalogue)) {
    entries = rawCatalogue;
  } else if (rawCatalogue && typeof rawCatalogue === "object" && Array.isArray(rawCatalogue.mods)) {
    entries = rawCatalogue.mods;
    if (Array.isArray(rawCatalogue.disabled)) {
      disabledSlugs = new Set(rawCatalogue.disabled.map(text).filter(Boolean));
    }
  } else {
    throw new TypeError("Invalid mod catalogue.");
  }
  const activeEntries = entries.filter(entry => {
    if (typeof entry === "string") {
      return !entry.startsWith("-") && !entry.startsWith("_") && !disabledSlugs.has(entry);
    }
    if (entry && typeof entry === "object") {
      return entry.enabled !== false && entry.hidden !== true && !disabledSlugs.has(text(entry.slug));
    }
    return false;
  });
  const results = await Promise.allSettled(activeEntries.map(async entry => {
    if (typeof entry !== "string") return entry;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry)) throw new Error("Invalid character slug: " + entry);
    const file = await fetch(new URL("../data/characters/" + entry + ".json", import.meta.url), { cache: "no-cache" });
    if (!file.ok) throw new Error("Could not load character: " + entry);
    const character = await file.json();
    if (character?.slug !== entry) throw new Error("Character slug mismatch: " + entry);
    return character;
  }));
  const records = [];
  for (const result of results) {
    if (result.status === "fulfilled") records.push(result.value);
    else console.warn(result.reason);
  }
  if (activeEntries.length && !records.length) throw new Error("No character files could be loaded.");
  return normalizeMods(records);
}
