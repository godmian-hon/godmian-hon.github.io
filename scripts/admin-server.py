#!/usr/bin/env python3
"""
GodMian Local Mod Manager Web App (http://127.0.0.1:8765/admin)
Run via Admin_Tool.bat. Serves both:
- /admin : Full CRUD Web App for creating, editing, deleting, reordering mods,
           bumping versions, syncing Google Drive .honmod & skill clips, and uploading/flipping icons.
- /      : Live preview of the GodMian website.
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import http.server
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import webbrowser
from pathlib import Path

THIS_DIR = Path(__file__).resolve().parent
ROOT = THIS_DIR.parent
MODS_JSON = ROOT / "data" / "mods.json"
CHARS_DIR = ROOT / "data" / "characters"
ART_DIR = ROOT / "assets" / "art"
VIDEO_DIR = ROOT / "assets" / "video"
BLENDER_EXE = Path(r"C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe")

import importlib.util

sys.path.insert(0, str(THIS_DIR))
_spec = importlib.util.spec_from_file_location("update_mod", THIS_DIR / "update-mod.py")
update_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(update_mod)


def load_all_mods() -> dict:
    slugs: list[str] = []
    if MODS_JSON.exists():
        slugs = json.loads(MODS_JSON.read_text(encoding="utf-8"))
    characters: list[dict] = []
    seen = set()
    for slug in slugs:
        p = CHARS_DIR / f"{slug}.json"
        if p.exists():
            d = json.loads(p.read_text(encoding="utf-8"))
            characters.append(enrich_mod_status(d))
            seen.add(slug)
    # Also include any character json files not in mods.json
    if CHARS_DIR.exists():
        for p in sorted(CHARS_DIR.glob("*.json")):
            if p.stem not in seen:
                d = json.loads(p.read_text(encoding="utf-8"))
                characters.append(enrich_mod_status(d, in_catalogue=False))
    return {"slugs": slugs, "characters": characters, "today": dt.date.today().isoformat()}


def enrich_mod_status(data: dict, in_catalogue: bool = True) -> dict:
    d = dict(data)
    d["_inCatalogue"] = in_catalogue
    skills_status = []
    for sk in d.get("skills") or []:
        s = dict(sk)
        clip = (s.get("clip") or s.get("clipSource") or "").strip()
        fid = update_mod.extract_drive_id(clip)
        if fid:
            local_rel = f"assets/video/drive-{fid}.mp4"
            local_p = ROOT / local_rel
            s["_resolvedClip"] = "./" + local_rel
            s["_clipExists"] = local_p.exists()
            s["_clipSizeKB"] = round(local_p.stat().st_size / 1024, 1) if local_p.exists() else 0
            s["_driveId"] = fid
        elif clip:
            clean = clip.lstrip("./")
            local_p = ROOT / clean
            s["_resolvedClip"] = "./" + clean
            s["_clipExists"] = local_p.exists()
            s["_clipSizeKB"] = round(local_p.stat().st_size / 1024, 1) if local_p.exists() else 0
            s["_driveId"] = ""
        else:
            s["_resolvedClip"] = ""
            s["_clipExists"] = False
            s["_clipSizeKB"] = 0
            s["_driveId"] = ""
        skills_status.append(s)
    d["_skillsStatus"] = skills_status
    return d


def convert_or_flip_webp_with_blender(
    src_path: Path,
    dst_path: Path,
    size: int | None = None,
    max_width: int | None = None,
    custom_w: int | None = None,
    custom_h: int | None = None,
    flip_y: bool = False,
    quality: int = 92,
) -> tuple[int, int]:
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    if not BLENDER_EXE.exists():
        shutil.copy2(src_path, dst_path)
        return (0, 0)
    code = """
import os, json, bpy, numpy as np
src = os.environ["BL_SRC"]
dst = os.environ["BL_DST"]
target_size = int(os.environ.get("BL_SIZE", "0"))
max_width = int(os.environ.get("BL_MAX_W", "0"))
custom_w = int(os.environ.get("BL_CUSTOM_W", "0"))
custom_h = int(os.environ.get("BL_CUSTOM_H", "0"))
flip_y = os.environ.get("BL_FLIP", "0") == "1"
quality = int(os.environ.get("BL_QUALITY", "92"))

img = bpy.data.images.load(src, check_existing=False)
w, h = img.size
arr = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
if flip_y:
    arr = arr[::-1, :, :].copy()

# If target_size > 0 (square icon preset), center-crop 1:1 if rectangular, and use exact box-averaging when integer multiple
if target_size > 0:
    if w != h:
        side = min(w, h)
        y0 = (h - side) // 2
        x0 = (w - side) // 2
        arr = arr[y0:y0 + side, x0:x0 + side, :].copy()
        w = h = side
    if w > target_size and w % target_size == 0:
        f = w // target_size
        arr = arr.reshape(target_size, f, target_size, f, 4).mean(axis=(1, 3))
        w = h = target_size

out_img = bpy.data.images.new("out_webp", width=w, height=h, alpha=True)
out_img.colorspace_settings.name = "sRGB"
out_img.pixels.foreach_set(arr.ravel())

final_w, final_h = w, h
if target_size > 0 and (w != target_size or h != target_size):
    out_img.scale(target_size, target_size)
    final_w = final_h = target_size
elif custom_w > 0 and custom_h > 0 and (w != custom_w or h != custom_h):
    out_img.scale(custom_w, custom_h)
    final_w, final_h = custom_w, custom_h
elif max_width > 0 and w > max_width:
    final_w = max_width
    final_h = max(1, int(round(h * (max_width / float(w)))))
    out_img.scale(final_w, final_h)

scene = bpy.context.scene
scene.display_settings.display_device = "sRGB"
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.exposure = 0.0
scene.view_settings.gamma = 1.0
scene.render.image_settings.file_format = "WEBP"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.quality = max(1, min(100, quality))
out_img.save_render(dst, scene=scene)
print("WEBP_DIMS:" + json.dumps([final_w, final_h]))
"""
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8") as tmp:
        tmp.write(code)
        script_p = Path(tmp.name)
    try:
        env = os.environ.copy()
        env["BL_SRC"] = str(src_path)
        env["BL_DST"] = str(dst_path)
        env["BL_SIZE"] = str(size or 0)
        env["BL_MAX_W"] = str(max_width or 0)
        env["BL_CUSTOM_W"] = str(custom_w or 0)
        env["BL_CUSTOM_H"] = str(custom_h or 0)
        env["BL_FLIP"] = "1" if flip_y else "0"
        env["BL_QUALITY"] = str(quality)
        res = subprocess.run([str(BLENDER_EXE), "--background", "--python", str(script_p)], env=env, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(res.stderr or res.stdout)
        for line in (res.stdout or "").splitlines():
            if line.startswith("WEBP_DIMS:"):
                dims = json.loads(line.split("WEBP_DIMS:", 1)[1])
                return (int(dims[0]), int(dims[1]))
        return (0, 0)
    finally:
        script_p.unlink(missing_ok=True)


ADMIN_HTML = r"""<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GodMian Mod Manager (Local Tool)</title>
  <style>
    :root {
      --bg: #0d1117;
      --panel: #161b22;
      --border: #30363d;
      --text: #e6edf3;
      --muted: #8b949e;
      --accent: #2f81f7;
      --green: #238636;
      --red: #da3633;
      --yellow: #d29922;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 20px;
      background: var(--panel);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 20;
    }
    header h1 { margin: 0; font-size: 18px; }
    .top-actions { display: flex; gap: 8px; align-items: center; }
    .layout {
      display: grid;
      grid-template-columns: 300px 1fr;
      min-height: calc(100vh - 55px);
    }
    .sidebar {
      border-right: 1px solid var(--border);
      background: #10141a;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .mod-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .mod-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 6px;
      cursor: pointer;
    }
    .mod-item.active {
      border-color: var(--accent);
      background: #1c2638;
    }
    .mod-item-title { font-weight: 600; font-size: 14px; }
    .mod-item-sub { font-size: 12px; color: var(--muted); }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      font-size: 11px;
      border-radius: 4px;
      background: #283140;
      color: #9ecbff;
      margin-left: 4px;
    }
    .badge.feat { background: #1e4620; color: #7ee787; }
    .content {
      padding: 20px;
      max-width: 1100px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .card h2 {
      margin: 0 0 12px;
      font-size: 16px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    label {
      display: block;
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 4px;
    }
    input[type="text"], input[type="date"], textarea, select {
      width: 100%;
      padding: 8px 10px;
      background: #0d1117;
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font: inherit;
    }
    textarea { min-height: 75px; resize: vertical; }
    .row { display: flex; gap: 8px; align-items: center; }
    .checkbox-row {
      display: flex;
      gap: 20px;
      align-items: center;
      padding-top: 8px;
    }
    .checkbox-row label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      color: var(--text);
      cursor: pointer;
      margin: 0;
    }
    button, .btn {
      padding: 7px 13px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: #21262d;
      color: var(--text);
      font: 600 13px/1.3 inherit;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }
    button:hover, .btn:hover { background: #30363d; }
    .btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    .btn-primary:hover { background: #388bfd; }
    .btn-success { background: var(--green); border-color: var(--green); color: #fff; }
    .btn-success:hover { background: #2ea043; }
    .btn-danger { background: var(--red); border-color: var(--red); color: #fff; }
    .btn-danger:hover { background: #f85149; }
    .btn-sm { padding: 4px 8px; font-size: 12px; }
    .skill-box {
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px;
      background: #11161d;
      margin-bottom: 10px;
    }
    .skill-layout {
      display: grid;
      grid-template-columns: 95px 1fr 220px;
      gap: 14px;
      align-items: start;
    }
    .thumb-preview {
      width: 90px;
      height: 90px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: #000;
      display: block;
    }
    .video-preview {
      width: 100%;
      max-height: 140px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: #000;
    }
    .status-toast {
      position: fixed;
      bottom: 18px;
      right: 18px;
      padding: 12px 18px;
      border-radius: 8px;
      background: #1f6feb;
      color: #fff;
      font-weight: 600;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      z-index: 100;
      display: none;
    }
    .quick-bump {
      background: #162319;
      border: 1px solid #2ea043;
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 16px;
    }
    .quick-bump h3 { margin: 0 0 8px; font-size: 15px; color: #7ee787; }
    .help-text { font-size: 12px; color: var(--muted); margin-top: 4px; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>🛠️ GodMian Mod Manager (เครื่องมือจัดการม็อดในเครื่อง)</h1>
    </div>
    <div class="top-actions">
      <button type="button" onclick="syncAllClips()">🔄 ซิงก์คลิปสกิลทั้งหมดจาก Drive</button>
      <a class="btn" id="preview-site-link" href="/" target="_blank">🌐 เปิดดูหน้าเว็บตัวอย่าง</a>
      <button type="button" class="btn-success" onclick="saveCurrentMod(false)">💾 บันทึกข้อมูล (Save)</button>
      <button type="button" class="btn-primary" onclick="saveCurrentMod(true)">⚡ บันทึก + ดึงคลิปใหม่จาก Drive</button>
    </div>
  </header>

  <div class="layout">
    <aside class="sidebar">
      <button type="button" class="btn-primary" style="width:100%;justify-content:center" onclick="createNewMod()">➕ สร้างม็อดใหม่</button>
      <div class="help-text">คลิกเลือกม็อดเพื่อแก้ไข หรือกดลูกศร ⬆️⬇️ เพื่อจัดลำดับการแสดงผล</div>
      <div id="mod-list" class="mod-list"></div>
    </aside>

    <main class="content" id="editor-panel">
      <p>กำลังโหลดข้อมูลม็อด...</p>
    </main>
  </div>

  <div id="toast" class="status-toast"></div>

  <script>
    let state = { slugs: [], characters: [], today: '' };
    let currentSlug = null;

    function toast(msg, color = '#1f6feb') {
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.style.background = color;
      el.style.display = 'block';
      clearTimeout(el._t);
      el._t = setTimeout(() => { el.style.display = 'none'; }, 3500);
    }

    async function api(path, body = null) {
      const opts = body ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      } : {};
      const res = await fetch(path, opts);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || ('HTTP ' + res.status));
      return data;
    }

    async function loadData(selectSlug = null) {
      state = await api('/api/mods');
      if (selectSlug) currentSlug = selectSlug;
      if (!currentSlug || !state.characters.find(c => c.slug === currentSlug)) {
        currentSlug = state.characters[0]?.slug || null;
      }
      renderSidebar();
      renderEditor();
    }

    function renderSidebar() {
      const list = document.getElementById('mod-list');
      list.innerHTML = '';
      state.characters.forEach((mod, idx) => {
        const div = document.createElement('div');
        div.className = 'mod-item' + (mod.slug === currentSlug ? ' active' : '');
        div.onclick = () => { currentSlug = mod.slug; renderSidebar(); renderEditor(); };
        const info = document.createElement('div');
        info.innerHTML = `
          <div class="mod-item-title">${escapeHtml(mod.name || mod.slug)}</div>
          <div class="mod-item-sub">
            v${escapeHtml(mod.version || '-')} · ${escapeHtml(mod.updatedAt || '-')}
            ${mod.featured ? '<span class="badge feat">Featured</span>' : ''}
            ${mod.concept ? '<span class="badge">Concept</span>' : ''}
          </div>
        `;
        const arrows = document.createElement('div');
        arrows.className = 'row';
        arrows.onclick = e => e.stopPropagation();
        const up = document.createElement('button');
        up.className = 'btn-sm';
        up.textContent = '⬆️';
        up.disabled = idx === 0;
        up.onclick = () => moveMod(idx, -1);
        const dn = document.createElement('button');
        dn.className = 'btn-sm';
        dn.textContent = '⬇️';
        dn.disabled = idx === state.characters.length - 1;
        dn.onclick = () => moveMod(idx, 1);
        arrows.append(up, dn);
        div.append(info, arrows);
        list.append(div);
      });
    }

    async function moveMod(idx, delta) {
      const slugs = state.characters.map(c => c.slug);
      const target = idx + delta;
      if (target < 0 || target >= slugs.length) return;
      [slugs[idx], slugs[target]] = [slugs[target], slugs[idx]];
      await api('/api/mods/reorder', { slugs });
      toast('จัดลำดับม็อดเรียบร้อย');
      await loadData(currentSlug);
    }

    function getCurrentMod() {
      return state.characters.find(c => c.slug === currentSlug);
    }

    function escapeHtml(s) {
      return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }

    function renderEditor() {
      const panel = document.getElementById('editor-panel');
      const mod = getCurrentMod();
      if (!mod) {
        panel.innerHTML = '<p>ยังไม่มีม็อด กดปุ่ม "สร้างม็อดใหม่" ด้านซ้ายได้เลย</p>';
        return;
      }
      document.getElementById('preview-site-link').href = '/#mod/' + encodeURIComponent(mod.slug);

      const skills = (mod._skillsStatus && mod._skillsStatus.length) ? mod._skillsStatus : [
        { key: 'Q', name: '', icon: '', description: '', clip: '' },
        { key: 'W', name: '', icon: '', description: '', clip: '' },
        { key: 'E', name: '', icon: '', description: '', clip: '' },
        { key: 'R', name: '', icon: '', description: '', clip: '' },
      ];

      panel.innerHTML = `
        <div class="quick-bump">
          <h3>⚡ อัปเดตเวอร์ชันด่วน (แก้จุดเดียว ซิงก์วันที่ + วิธีติดตั้ง + Changelog ให้อัตโนมัติ)</h3>
          <div class="grid-3">
            <div>
              <label>เลขเวอร์ชันใหม่ (เช่น 0.7.13)</label>
              <input type="text" id="quick-version" value="${escapeHtml(mod.version)}" oninput="syncQuickVersion(this.value)">
            </div>
            <div>
              <label>สิ่งที่อัปเดตในเวอร์ชันนี้ (จะเพิ่มเข้า Changelog อัตโนมัติเมื่อกดบันทึก)</label>
              <input type="text" id="quick-note" placeholder="เช่น ปรับปรุงเอฟเฟกต์สกิล Q และอัปเดตไอคอนใหม่">
            </div>
            <div style="display:flex;align-items:flex-end;gap:8px">
              <button type="button" class="btn-success" onclick="saveCurrentMod(false)">💾 บันทึกเวอร์ชันนี้ทันที</button>
              <button type="button" class="btn-danger" onclick="deleteCurrentMod()">🗑️ ลบม็อดนี้</button>
            </div>
          </div>
        </div>

        <div class="card">
          <h2>1. ข้อมูลหลักของม็อด (${escapeHtml(mod.slug)})</h2>
          <div class="grid-3">
            <div>
              <label>ชื่อม็อด (name)</label>
              <input type="text" id="f-name" value="${escapeHtml(mod.name)}">
            </div>
            <div>
              <label>Slug (ใช้ใน URL #mod/slug)</label>
              <input type="text" id="f-slug" value="${escapeHtml(mod.slug)}" readonly style="opacity:0.7">
            </div>
            <div>
              <label>รหัส ID (ไม่ซ้ำ)</label>
              <input type="text" id="f-id" value="${escapeHtml(mod.id)}">
            </div>
            <div>
              <label>หมวดหมู่ (category)</label>
              <input type="text" id="f-category" value="${escapeHtml(mod.category || 'Hero Skin')}">
            </div>
            <div>
              <label>สีธีม (accent HEX)</label>
              <input type="text" id="f-accent" value="${escapeHtml(mod.accent || '#4af2ea')}">
            </div>
            <div class="checkbox-row">
              <label><input type="checkbox" id="f-featured" ${mod.featured ? 'checked' : ''}> ⭐ แสดงใน Featured mods</label>
              <label><input type="checkbox" id="f-concept" ${mod.concept ? 'checked' : ''}> 🎨 ภาพคอนเซปต์</label>
            </div>
          </div>

          <div class="grid-4" style="margin-top:12px">
            <div>
              <label>เวอร์ชัน (version)</label>
              <input type="text" id="f-version" value="${escapeHtml(mod.version)}">
            </div>
            <div>
              <label>ขนาดไฟล์ (fileSize)</label>
              <input type="text" id="f-fileSize" value="${escapeHtml(mod.fileSize)}">
            </div>
            <div>
              <label>วันที่สร้าง (createdAt)</label>
              <input type="date" id="f-createdAt" value="${escapeHtml(mod.createdAt)}">
            </div>
            <div>
              <label>วันที่อัปเดตล่าสุด (updatedAt)</label>
              <input type="date" id="f-updatedAt" value="${escapeHtml(mod.updatedAt || state.today)}">
            </div>
          </div>

          <div style="margin-top:12px">
            <label>ลิงก์ดาวน์โหลดไฟล์ .honmod บน Google Drive (downloadUrl)</label>
            <div class="row">
              <input type="text" id="f-downloadUrl" value="${escapeHtml(mod.downloadUrl)}" placeholder="https://drive.google.com/file/d/.../view?usp=sharing">
              <button type="button" onclick="probeDriveMod()">🔍 ดึงเวอร์ชัน + ขนาดไฟล์จาก Drive</button>
            </div>
          </div>

          <div style="margin-top:12px">
            <label>คำอธิบายสั้น (description — แสดงในการ์ดหน้าแรก)</label>
            <textarea id="f-description">${escapeHtml(mod.description)}</textarea>
          </div>
          <div style="margin-top:12px">
            <label>คำอธิบายเต็ม (longDescription — แสดงในหน้ารายละเอียด)</label>
            <textarea id="f-longDescription">${escapeHtml(mod.longDescription)}</textarea>
          </div>
        </div>

        <div class="card">
          <h2>
            <span>2. สกิลฮีโร่ ไอคอน และคลิปวิดีโอสกิล (Q, W, E, R)</span>
            <button type="button" class="btn-sm" onclick="syncModClipsOnly()">🔄 ดึงคลิปสกิลของม็อดนี้จาก Drive ใหม่ทั้งหมด</button>
          </h2>
          <div id="skills-container">
            ${skills.map((sk, i) => `
              <div class="skill-box" data-skill-idx="${i}">
                <div class="skill-layout">
                  <div>
                    <img id="sk-img-prev-${i}" class="thumb-preview" src="/${escapeHtml((sk.icon || '').replace(/^\.\//, ''))}?t=${Date.now()}" onerror="this.src='/assets/fallback.svg'">
                    <div style="margin-top:6px;display:flex;flex-direction:column;gap:4px">
                      <label class="btn btn-sm" style="justify-content:center;margin:0">
                        📁 เลือกรูป
                        <input type="file" accept="image/*" style="display:none" onchange="uploadSkillIcon(${i}, this.files[0])">
                      </label>
                      <button type="button" class="btn-sm" onclick="flipSkillIcon(${i})" title="คลิกเพื่อพลิกภาพกลับหัว (บนลงล่าง)">🔃 พลิกกลับหัว</button>
                    </div>
                  </div>
                  <div>
                    <div class="grid-3">
                      <div>
                        <label>ปุ่มสกิล (Key)</label>
                        <input type="text" id="sk-key-${i}" value="${escapeHtml(sk.key)}">
                      </div>
                      <div>
                        <label>ชื่อสกิล</label>
                        <input type="text" id="sk-name-${i}" value="${escapeHtml(sk.name)}">
                      </div>
                      <div>
                        <label>พาธรูปไอคอน (WebP)</label>
                        <input type="text" id="sk-icon-${i}" value="${escapeHtml(sk.icon)}">
                      </div>
                    </div>
                    <div style="margin-top:8px">
                      <label>คำอธิบายสกิล</label>
                      <input type="text" id="sk-desc-${i}" value="${escapeHtml(sk.description)}">
                    </div>
                    <div style="margin-top:8px">
                      <label>ลิงก์ Google Drive คลิปสกิล (หรือพาธ assets/video/...)</label>
                      <div class="row">
                        <input type="text" id="sk-clip-${i}" value="${escapeHtml(sk.clip || sk.clipSource || '')}" placeholder="https://drive.google.com/file/d/.../view?usp=sharing">
                        <button type="button" class="btn-sm" onclick="syncSingleSkillClip(${i})">⬇️ ดึงคลิปนี้จาก Drive</button>
                      </div>
                      <div class="help-text">
                        ${sk._clipExists
                          ? `✅ มีไฟล์คลิปในเครื่องแล้ว: <code>${escapeHtml(sk._resolvedClip)}</code> (${sk._clipSizeKB} KB)`
                          : (sk.clip ? `⚠️ ยังไม่มีไฟล์คลิปในเครื่อง กดปุ่ม "ดึงคลิปนี้จาก Drive" หรือ "บันทึก + ดึงคลิปใหม่"` : 'ไม่มีคลิปสำหรับสกิลนี้')}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label>ตัวอย่างคลิปปัจจุบัน</label>
                    ${sk._clipExists
                      ? `<video class="video-preview" src="/${escapeHtml(sk._resolvedClip.replace(/^\.\//, ''))}?t=${Date.now()}" controls muted loop></video>`
                      : `<div class="help-text" style="padding:30px 10px;text-align:center;border:1px dashed var(--border);border-radius:6px">ไม่มีวิดีโอ</div>`}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card">
          <h2>3. รูปภาพปก แกลเลอรี และวิดีโอพรีวิวหลัก</h2>
          <div class="grid-3">
            <div>
              <label>ภาพย่อ (thumbnail — แนะนำกว้าง ~720px WebP)</label>
              <div class="row">
                <input type="text" id="f-thumbnail" value="${escapeHtml(mod.thumbnail)}" oninput="document.getElementById('prev-thumb').src='/' + this.value.replace(/^\\.\\//,'') + '?t=' + Date.now()">
                <label class="btn btn-sm btn-primary" style="margin:0">📁 แปลงรูปใส่ปกย่อ<input type="file" accept="image/*,.dds,.tga" style="display:none" onchange="uploadArtImage('f-thumbnail', '${escapeHtml(mod.slug)}-thumb.webp', this.files[0], 720, 'prev-thumb')"></label>
              </div>
              <img id="prev-thumb" src="/${escapeHtml((mod.thumbnail || '').replace(/^\.\//, ''))}?t=${Date.now()}" style="margin-top:8px;width:100%;max-height:110px;object-fit:cover;border-radius:6px;border:1px solid var(--border);background:#000" onerror="this.src='/assets/fallback.svg'">
            </div>
            <div>
              <label>ภาพปกหลัก (heroImage — แนะนำกว้าง ~1600-1920px WebP)</label>
              <div class="row">
                <input type="text" id="f-heroImage" value="${escapeHtml(mod.heroImage)}" oninput="document.getElementById('prev-hero').src='/' + this.value.replace(/^\\.\\//,'') + '?t=' + Date.now()">
                <label class="btn btn-sm btn-primary" style="margin:0">📁 แปลงรูปใส่ปกหลัก<input type="file" accept="image/*,.dds,.tga" style="display:none" onchange="uploadArtImage('f-heroImage', '${escapeHtml(mod.slug)}.webp', this.files[0], 1920, 'prev-hero')"></label>
              </div>
              <img id="prev-hero" src="/${escapeHtml((mod.heroImage || '').replace(/^\.\//, ''))}?t=${Date.now()}" style="margin-top:8px;width:100%;max-height:110px;object-fit:cover;border-radius:6px;border:1px solid var(--border);background:#000" onerror="this.src='/assets/fallback.svg'">
            </div>
            <div>
              <label>คำอธิบายภาพหลัก (artworkAlt)</label>
              <input type="text" id="f-artworkAlt" value="${escapeHtml(mod.artworkAlt)}">
            </div>
          </div>

          <div class="grid-2" style="margin-top:12px">
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <label style="margin:0">ภาพตัวอย่างแกลเลอรี (screenshots — บรรทัดละ 1 พาธ)</label>
                <label class="btn btn-sm" style="margin:0">📁 เลือกรูปแปลงเป็น WebP เพิ่มเข้าแกลเลอรี<input type="file" accept="image/*,.dds,.tga" multiple style="display:none" onchange="uploadGalleryImages(this.files)"></label>
              </div>
              <textarea id="f-screenshots">${escapeHtml((mod.screenshots || []).join('\n'))}</textarea>
            </div>
            <div>
              <label>คำบรรยายภาพแกลเลอรี (screenshotAlts — บรรทัดละ 1 ข้อความ)</label>
              <textarea id="f-screenshotAlts">${escapeHtml((mod.screenshotAlts || []).join('\n'))}</textarea>
            </div>
          </div>

          <div class="grid-2" style="margin-top:12px">
            <div>
              <label>ไฟล์วิดีโอพรีวิวหลักในเว็บ (preview เช่น assets/video/rachatoey.mp4)</label>
              <input type="text" id="f-preview" value="${escapeHtml(mod.preview)}">
            </div>
            <div>
              <label>ลิงก์ Google Drive วิดีโอพรีวิวหลัก (previewVideoUrl)</label>
              <input type="text" id="f-previewVideoUrl" value="${escapeHtml(mod.previewVideoUrl)}">
            </div>
          </div>
        </div>

        <div class="card" style="border-color:#2f81f7">
          <h2>
            <span>🖼️ เครื่องมือแปลงไฟล์ภาพเป็น WebP (แปลงภาพสกิล / ภาพปก / ภาพย่อ / แกลเลอรี)</span>
          </h2>
          <div class="help-text" style="margin-bottom:10px">
            รองรับไฟล์ <b>.png, .jpg, .jpeg, .dds, .tga, .bmp, .webp</b> แปลงด้วย Blender 5.3 โหมดสี <code>sRGB (Standard)</code> สีไม่เพี้ยน พร้อมย่อขนาดหรือพลิกภาพกลับหัวได้ในคลิกเดียว
          </div>
          <div class="grid-3">
            <div>
              <label>1. ประเภทและขนาดภาพที่จะแปลง</label>
              <select id="conv-preset" onchange="onConvPresetChange()">
                <option value="skill256">ไอคอนสกิลมาตรฐาน (จัตุรัส 256×256 px)</option>
                <option value="skill128">ไอคอนสกิลขนาดเล็ก (จัตุรัส 128×128 px)</option>
                <option value="hero1920">ภาพปกหลัก Hero Cover (กว้างไม่เกิน 1920 px)</option>
                <option value="thumb720">ภาพย่อการ์ด Thumbnail (กว้างไม่เกิน 720 px)</option>
                <option value="original">คงขนาดต้นฉบับ (Original Size)</option>
                <option value="custom">กำหนดขนาดเอง (Custom Width × Height)</option>
              </select>
            </div>
            <div>
              <label>2. นำไปใส่ช่องไหนของม็อด "${escapeHtml(mod.name)}"</label>
              <select id="conv-slot" onchange="onConvSlotChange()">
                <option value="none">ไม่ผูกช่อง (แปลงเก็บใน assets/art/ หรือดาวน์โหลดเอง)</option>
                <option value="skill_0">ใส่เป็น ไอคอนสกิล Q</option>
                <option value="skill_1">ใส่เป็น ไอคอนสกิล W</option>
                <option value="skill_2">ใส่เป็น ไอคอนสกิล E</option>
                <option value="skill_3">ใส่เป็น ไอคอนสกิล R</option>
                <option value="heroImage">ใส่เป็น ภาพปกหลัก (heroImage)</option>
                <option value="thumbnail">ใส่เป็น ภาพย่อ (thumbnail)</option>
                <option value="screenshots">เพิ่มต่อท้ายใน แกลเลอรี (screenshots)</option>
              </select>
            </div>
            <div>
              <label>3. ชื่อไฟล์ปลายทางใน assets/art/ (แก้ไขได้)</label>
              <input type="text" id="conv-filename" placeholder="${escapeHtml(mod.slug)}-custom.webp">
            </div>
          </div>

          <div id="conv-custom-dims" class="grid-2" style="margin-top:10px;display:none">
            <div>
              <label>ความกว้าง (Width px)</label>
              <input type="text" id="conv-w" value="512">
            </div>
            <div>
              <label>ความสูง (Height px)</label>
              <input type="text" id="conv-h" value="512">
            </div>
          </div>

          <div class="grid-3" style="margin-top:10px;align-items:end">
            <div>
              <label>คุณภาพ WebP (1-100, แนะนำ 92)</label>
              <input type="text" id="conv-quality" value="92">
            </div>
            <div class="checkbox-row">
              <label><input type="checkbox" id="conv-flip"> 🔃 พลิกภาพแนวตั้ง (สำหรับไฟล์ .dds จากเกมที่กลับหัว)</label>
            </div>
            <div>
              <label>หรือวางพาธไฟล์ในเครื่องโดยตรง (เช่น C:\Users\...\skill_q.png)</label>
              <div class="row">
                <input type="text" id="conv-local-path" placeholder="วางพาธไฟล์จากในเครื่องแล้วกดแปลง...">
                <button type="button" class="btn-primary btn-sm" onclick="convertFromLocalPath()">⚡ แปลงจากพาธ</button>
              </div>
            </div>
          </div>

          <div style="margin-top:12px;padding:18px;border:2px dashed #388bfd;border-radius:8px;background:#0d1520;text-align:center">
            <label class="btn btn-primary" style="cursor:pointer;font-size:14px;padding:10px 20px">
              📂 คลิกเลือกไฟล์ภาพจากเครื่องเพื่อแปลงเป็น WebP (เลือกหลายไฟล์พร้อมกันได้)
              <input type="file" id="conv-files" accept="image/*,.dds,.tga,.bmp" multiple style="display:none" onchange="runBatchConverter(this.files)">
            </label>
            <div class="help-text" style="margin-top:6px">เมื่อเลือกไฟล์แล้ว ระบบจะแปลงเป็น .webp ทันที พร้อมแสดงภาพตัวอย่างและปุ่มดาวน์โหลดด้านล่าง</div>
          </div>

          <div id="conv-results" style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px"></div>
        </div>

        <div class="card">
          <h2>4. วิธีติดตั้ง (installationGuide) และประวัติอัปเดต (changelog)</h2>
          <div class="help-text" style="margin-bottom:8px">
            💡 ชื่อไฟล์ที่มี <code>_vX.Y.Z.honmod</code> ในวิธีติดตั้งจะถูกเปลี่ยนเลขเวอร์ชันให้ตรงกับช่อง Version โดยอัตโนมัติทุกครั้งที่บันทึก
          </div>
          <div>
            <label>ขั้นตอนการติดตั้ง (บรรทัดละ 1 ขั้นตอน)</label>
            <textarea id="f-installationGuide" style="min-height:95px">${escapeHtml((mod.installationGuide || []).join('\n'))}</textarea>
          </div>
          <div style="margin-top:12px">
            <label>ประวัติการอัปเดต (Changelog JSON — หรือกรอกช่อง "อัปเดตเวอร์ชันด่วน" ด้านบนเพื่อให้ระบบเพิ่มให้อัตโนมัติ)</label>
            <textarea id="f-changelog" style="min-height:130px;font-family:monospace">${escapeHtml(JSON.stringify(mod.changelog || [], null, 2))}</textarea>
          </div>
        </div>
      `;
    }

    function syncQuickVersion(val) {
      const vInput = document.getElementById('f-version');
      const uInput = document.getElementById('f-updatedAt');
      if (vInput) vInput.value = val.trim();
      if (uInput && state.today) uInput.value = state.today;
    }

    function collectFormMod() {
      const mod = getCurrentMod();
      let changelog = [];
      try {
        changelog = JSON.parse(document.getElementById('f-changelog').value || '[]');
      } catch (e) {
        alert('รูปแบบ JSON ในช่อง Changelog ไม่ถูกต้อง: ' + e.message);
        throw e;
      }
      const skills = [];
      document.querySelectorAll('#skills-container .skill-box').forEach((box, i) => {
        skills.push({
          key: document.getElementById(`sk-key-${i}`).value.trim(),
          name: document.getElementById(`sk-name-${i}`).value.trim(),
          icon: document.getElementById(`sk-icon-${i}`).value.trim(),
          description: document.getElementById(`sk-desc-${i}`).value.trim(),
          clip: document.getElementById(`sk-clip-${i}`).value.trim(),
        });
      });

      return {
        ...mod,
        id: document.getElementById('f-id').value.trim(),
        slug: document.getElementById('f-slug').value.trim(),
        name: document.getElementById('f-name').value.trim(),
        category: document.getElementById('f-category').value.trim(),
        accent: document.getElementById('f-accent').value.trim(),
        featured: document.getElementById('f-featured').checked,
        concept: document.getElementById('f-concept').checked,
        version: document.getElementById('f-version').value.trim(),
        fileSize: document.getElementById('f-fileSize').value.trim(),
        createdAt: document.getElementById('f-createdAt').value.trim(),
        updatedAt: document.getElementById('f-updatedAt').value.trim(),
        downloadUrl: document.getElementById('f-downloadUrl').value.trim(),
        description: document.getElementById('f-description').value.trim(),
        longDescription: document.getElementById('f-longDescription').value.trim(),
        thumbnail: document.getElementById('f-thumbnail').value.trim(),
        heroImage: document.getElementById('f-heroImage').value.trim(),
        artworkAlt: document.getElementById('f-artworkAlt').value.trim(),
        screenshots: document.getElementById('f-screenshots').value.split('\n').map(s => s.trim()).filter(Boolean),
        screenshotAlts: document.getElementById('f-screenshotAlts').value.split('\n').map(s => s.trim()).filter(Boolean),
        preview: document.getElementById('f-preview').value.trim(),
        previewVideoUrl: document.getElementById('f-previewVideoUrl').value.trim(),
        installationGuide: document.getElementById('f-installationGuide').value.split('\n').map(s => s.trim()).filter(Boolean),
        changelog,
        skills,
      };
    }

    async function saveCurrentMod(refreshClips = false) {
      try {
        const payload = collectFormMod();
        const quickNote = document.getElementById('quick-note')?.value.trim() || '';
        toast('กำลังบันทึกข้อมูล...', '#d29922');
        await api('/api/mods/save', { mod: payload, quickNote, refreshClips });
        toast('บันทึกข้อมูลเรียบร้อยแล้ว!', '#238636');
        await loadData(payload.slug);
      } catch (e) {
        toast('เกิดข้อผิดพลาด: ' + e.message, '#da3633');
      }
    }

    async function probeDriveMod() {
      const url = document.getElementById('f-downloadUrl').value.trim();
      if (!url) return alert('กรุณาวางลิงก์ Google Drive ก่อนครับ');
      try {
        toast('กำลังตรวจสอบไฟล์บน Google Drive...', '#d29922');
        const info = await api('/api/drive/probe', { url });
        if (info.fileSize) document.getElementById('f-fileSize').value = info.fileSize;
        if (info.version) {
          document.getElementById('f-version').value = info.version;
          document.getElementById('quick-version').value = info.version;
          if (state.today) document.getElementById('f-updatedAt').value = state.today;
        }
        toast(`ดึงข้อมูลสำเร็จ: ${info.filename || ''} (${info.fileSize || '-'})`, '#238636');
      } catch (e) {
        toast('ดึงข้อมูลไม่สำเร็จ: ' + e.message, '#da3633');
      }
    }

    async function syncSingleSkillClip(idx) {
      const url = document.getElementById(`sk-clip-${idx}`).value.trim();
      if (!url) return alert('กรุณาใส่ลิงก์ Google Drive ของคลิปสกิลนี้ก่อนครับ');
      await saveCurrentMod(false);
      try {
        toast('กำลังดาวน์โหลดคลิปสกิลจาก Google Drive...', '#d29922');
        await api('/api/clips/sync', { slug: currentSlug, skillIndex: idx, refresh: true });
        toast('ดาวน์โหลดและอัปเดตคลิปสกิลเรียบร้อย!', '#238636');
        await loadData(currentSlug);
      } catch (e) {
        toast('ดาวน์โหลดคลิปไม่สำเร็จ: ' + e.message, '#da3633');
      }
    }

    async function syncModClipsOnly() {
      await saveCurrentMod(true);
    }

    async function syncAllClips() {
      try {
        toast('กำลังซิงก์คลิปสกิลของทุกม็อดจาก Google Drive...', '#d29922');
        await api('/api/clips/sync', { refresh: true });
        toast('ซิงก์คลิปสกิลทั้งหมดเรียบร้อย!', '#238636');
        await loadData(currentSlug);
      } catch (e) {
        toast('ซิงก์ไม่สำเร็จ: ' + e.message, '#da3633');
      }
    }

    async function createNewMod() {
      const slug = prompt('ตั้งรหัส slug ภาษาอังกฤษตัวพิมพ์เล็ก (เช่น luffy-monkey หรือ baki-rampage):');
      if (!slug) return;
      const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
      if (!cleanSlug) return alert('รหัส slug ไม่ถูกต้อง');
      const name = prompt('ตั้งชื่อม็อดที่จะแสดงบนเว็บ (เช่น ลูฟี่ (Monkey King)):', cleanSlug);
      if (!name) return;
      try {
        await api('/api/mods/create', { slug: cleanSlug, name: name.trim() });
        toast('สร้างม็อดใหม่เรียบร้อย!', '#238636');
        await loadData(cleanSlug);
      } catch (e) {
        toast('สร้างม็อดไม่สำเร็จ: ' + e.message, '#da3633');
      }
    }

    async function deleteCurrentMod() {
      const mod = getCurrentMod();
      if (!mod) return;
      if (!confirm(`ยืนยันการลบม็อด "${mod.name}" (${mod.slug}) ออกจากระบบ?`)) return;
      try {
        await api('/api/mods/delete', { slug: mod.slug });
        toast('ลบม็อดเรียบร้อย', '#238636');
        currentSlug = null;
        await loadData();
      } catch (e) {
        toast('ลบม็อดไม่สำเร็จ: ' + e.message, '#da3633');
      }
    }

    function fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    async function uploadSkillIcon(idx, file) {
      if (!file) return;
      try {
        toast('กำลังแปลงและอัปเดตไอคอนสกิล (256x256 WebP)...', '#d29922');
        const b64 = await fileToBase64(file);
        const key = (document.getElementById(`sk-key-${idx}`).value || 'q').trim().toLowerCase();
        const curIcon = (document.getElementById(`sk-icon-${idx}`).value || '').trim().replace(/^\.\/assets\/art\//, '');
        const targetName = curIcon && curIcon.endsWith('.webp') ? curIcon : `${currentSlug}-skill_${key}.webp`;
        const isDds = file.name.toLowerCase().endsWith('.dds');
        const res = await api('/api/image/upload', { filename: targetName, base64: b64, size: 256, flipY: isDds });
        document.getElementById(`sk-icon-${idx}`).value = res.path;
        document.getElementById(`sk-img-prev-${idx}`).src = '/' + res.path.replace(/^\.\//, '') + '?t=' + Date.now();
        toast(`อัปเดตไอคอนสกิลเรียบร้อย (${res.width}x${res.height}, ${res.newSizeKB} KB)! กดบันทึกเพื่อเซฟ JSON`, '#238636');
      } catch (e) {
        toast('อัปโหลดไอคอนไม่สำเร็จ: ' + e.message, '#da3633');
      }
    }

    async function uploadArtImage(inputId, targetName, file, maxWidth = 0, previewId = '') {
      if (!file) return;
      try {
        toast('กำลังแปลงรูปภาพเป็น WebP...', '#d29922');
        const b64 = await fileToBase64(file);
        const curVal = (document.getElementById(inputId).value || '').trim().replace(/^\.\/assets\/art\//, '');
        const outName = (curVal && curVal.endsWith('.webp') && !curVal.includes('fallback')) ? curVal : targetName;
        const res = await api('/api/image/upload', { filename: outName, base64: b64, maxWidth });
        document.getElementById(inputId).value = res.path;
        if (previewId && document.getElementById(previewId)) {
          document.getElementById(previewId).src = '/' + res.path.replace(/^\.\//, '') + '?t=' + Date.now();
        }
        toast(`แปลงเป็น WebP เรียบร้อย (${res.width}x${res.height}, ${res.newSizeKB} KB)! กดบันทึกเพื่อเซฟ JSON`, '#238636');
      } catch (e) {
        toast('อัปโหลดรูปไม่สำเร็จ: ' + e.message, '#da3633');
      }
    }

    async function uploadGalleryImages(files) {
      if (!files || !files.length) return;
      const box = document.getElementById('f-screenshots');
      const lines = box.value.split('\n').map(s => s.trim()).filter(Boolean);
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        try {
          toast(`กำลังแปลงรูปแกลเลอรี (${i + 1}/${files.length}): ${f.name}...`, '#d29922');
          const b64 = await fileToBase64(f);
          const cleanStem = f.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
          const outName = `${currentSlug}-${cleanStem}.webp`;
          const res = await api('/api/image/upload', { filename: outName, base64: b64, maxWidth: 1920 });
          if (!lines.includes(res.path)) lines.push(res.path);
        } catch (e) {
          toast('แปลงรูปไม่สำเร็จ: ' + e.message, '#da3633');
        }
      }
      box.value = lines.join('\n');
      toast('แปลงและเพิ่มรูปเข้าแกลเลอรีเรียบร้อย! กดบันทึกเพื่อเซฟ JSON', '#238636');
    }

    function onConvPresetChange() {
      const preset = document.getElementById('conv-preset').value;
      document.getElementById('conv-custom-dims').style.display = preset === 'custom' ? 'grid' : 'none';
    }

    function onConvSlotChange() {
      const slot = document.getElementById('conv-slot').value;
      const presetEl = document.getElementById('conv-preset');
      const fnameEl = document.getElementById('conv-filename');
      if (slot.startsWith('skill_')) {
        const idx = parseInt(slot.split('_')[1], 10);
        const key = (document.getElementById(`sk-key-${idx}`)?.value || 'q').trim().toLowerCase();
        const cur = (document.getElementById(`sk-icon-${idx}`)?.value || '').trim().replace(/^\.\/assets\/art\//, '');
        presetEl.value = 'skill256';
        fnameEl.value = (cur && cur.endsWith('.webp')) ? cur : `${currentSlug}-skill_${key}.webp`;
      } else if (slot === 'heroImage') {
        presetEl.value = 'hero1920';
        fnameEl.value = `${currentSlug}.webp`;
      } else if (slot === 'thumbnail') {
        presetEl.value = 'thumb720';
        fnameEl.value = `${currentSlug}-thumb.webp`;
      } else if (slot === 'screenshots') {
        presetEl.value = 'hero1920';
        fnameEl.value = '';
      }
      onConvPresetChange();
    }

    function getConvOptions(defaultStem) {
      const preset = document.getElementById('conv-preset').value;
      const slot = document.getElementById('conv-slot').value;
      let fname = document.getElementById('conv-filename').value.trim();
      if (!fname) {
        fname = `${currentSlug || 'image'}-${defaultStem}.webp`;
      }
      if (!fname.toLowerCase().endsWith('.webp')) fname += '.webp';
      const quality = parseInt(document.getElementById('conv-quality').value || '92', 10) || 92;
      const flipY = document.getElementById('conv-flip').checked;
      let size = 0, maxWidth = 0, customW = 0, customH = 0;
      if (preset === 'skill256') size = 256;
      else if (preset === 'skill128') size = 128;
      else if (preset === 'hero1920') maxWidth = 1920;
      else if (preset === 'thumb720') maxWidth = 720;
      else if (preset === 'custom') {
        customW = parseInt(document.getElementById('conv-w').value || '0', 10) || 0;
        customH = parseInt(document.getElementById('conv-h').value || '0', 10) || 0;
      }
      return { filename: fname, size, maxWidth, customW, customH, flipY, quality, slot };
    }

    function applyConvertedToSlot(slot, webPath) {
      if (slot.startsWith('skill_')) {
        const idx = parseInt(slot.split('_')[1], 10);
        const inp = document.getElementById(`sk-icon-${idx}`);
        const img = document.getElementById(`sk-img-prev-${idx}`);
        if (inp) inp.value = webPath;
        if (img) img.src = '/' + webPath.replace(/^\.\//, '') + '?t=' + Date.now();
      } else if (slot === 'heroImage') {
        document.getElementById('f-heroImage').value = webPath;
        const p = document.getElementById('prev-hero');
        if (p) p.src = '/' + webPath.replace(/^\.\//, '') + '?t=' + Date.now();
      } else if (slot === 'thumbnail') {
        document.getElementById('f-thumbnail').value = webPath;
        const p = document.getElementById('prev-thumb');
        if (p) p.src = '/' + webPath.replace(/^\.\//, '') + '?t=' + Date.now();
      } else if (slot === 'screenshots') {
        const box = document.getElementById('f-screenshots');
        const lines = box.value.split('\n').map(s => s.trim()).filter(Boolean);
        if (!lines.includes(webPath)) lines.push(webPath);
        box.value = lines.join('\n');
      }
    }

    function appendConvResultCard(res, sourceLabel) {
      const container = document.getElementById('conv-results');
      const url = '/' + res.path.replace(/^\.\//, '') + '?t=' + Date.now();
      const card = document.createElement('div');
      card.style.cssText = 'border:1px solid var(--border);border-radius:8px;padding:10px;background:#11161d';
      card.innerHTML = `
        <img src="${url}" style="width:100%;height:150px;object-fit:contain;background:#000;border-radius:6px;border:1px solid var(--border)">
        <div style="margin-top:8px;font-weight:600;font-size:13px;word-break:break-all">${escapeHtml(res.path)}</div>
        <div class="help-text">ขนาด: <b>${res.width}×${res.height} px</b> · ไฟล์: <b>${res.oldSizeKB} KB → ${res.newSizeKB} KB</b></div>
        <div class="row" style="margin-top:8px">
          <button type="button" class="btn-sm" onclick="navigator.clipboard.writeText('${escapeHtml(res.path)}');toast('คัดลอกพาธแล้ว')">📋 คัดลอกพาธ</button>
          <a class="btn btn-sm btn-primary" href="${url}" download="${escapeHtml(res.path.split('/').pop())}">⬇️ โหลด .webp</a>
        </div>
      `;
      container.prepend(card);
    }

    async function runBatchConverter(files) {
      if (!files || !files.length) return;
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        try {
          if (f.name.toLowerCase().endsWith('.dds')) {
            document.getElementById('conv-flip').checked = true;
          }
          const stem = f.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
          const opts = getConvOptions(stem);
          if (files.length > 1) {
            opts.filename = `${currentSlug || 'img'}-${stem}.webp`;
          }
          toast(`กำลังแปลงไฟล์เป็น WebP (${i + 1}/${files.length}): ${f.name}...`, '#d29922');
          const b64 = await fileToBase64(f);
          const res = await api('/api/image/upload', { ...opts, base64: b64 });
          applyConvertedToSlot(opts.slot, res.path);
          appendConvResultCard(res, f.name);
          toast(`แปลง ${f.name} -> ${res.path} สำเร็จ! (${res.newSizeKB} KB)`, '#238636');
        } catch (e) {
          toast('แปลงไฟล์ไม่สำเร็จ: ' + e.message, '#da3633');
        }
      }
    }

    async function convertFromLocalPath() {
      const localPath = document.getElementById('conv-local-path').value.trim().replace(/^"|"$/g, '');
      if (!localPath) return alert('กรุณาวางพาธไฟล์ในเครื่องก่อนครับ');
      try {
        if (localPath.toLowerCase().endsWith('.dds')) {
          document.getElementById('conv-flip').checked = true;
        }
        const baseName = localPath.split(/[\\/]/).pop().replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
        const opts = getConvOptions(baseName);
        toast('กำลังแปลงไฟล์จากพาธในเครื่องเป็น WebP...', '#d29922');
        const res = await api('/api/image/upload', { ...opts, localPath });
        applyConvertedToSlot(opts.slot, res.path);
        appendConvResultCard(res, localPath);
        toast(`แปลงเป็น WebP สำเร็จ: ${res.path} (${res.newSizeKB} KB)!`, '#238636');
      } catch (e) {
        toast('แปลงไฟล์จากพาธไม่สำเร็จ: ' + e.message, '#da3633');
      }
    }

    async function flipSkillIcon(idx) {
      const iconPath = document.getElementById(`sk-icon-${idx}`).value.trim();
      if (!iconPath) return alert('ยังไม่มีพาธรูปไอคอน');
      try {
        toast('กำลังพลิกภาพแนวตั้ง...', '#d29922');
        await api('/api/image/flip', { path: iconPath });
        document.getElementById(`sk-img-prev-${idx}`).src = '/' + iconPath.replace(/^\.\//, '') + '?t=' + Date.now();
        toast('พลิกภาพกลับหัวเรียบร้อย!', '#238636');
      } catch (e) {
        toast('พลิกภาพไม่สำเร็จ: ' + e.message, '#da3633');
      }
    }

    loadData();
  </script>
</body>
</html>
"""


class AdminRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write(f"[AdminServer] {self.address_string()} - {fmt % args}\n")

    def send_json(self, payload: dict, status: int = 200) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in ("/admin", "/admin/"):
            raw = ADMIN_HTML.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(raw)
            return
        if parsed.path == "/api/mods":
            self.send_json(load_all_mods())
            return
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length", "0"))
        body_raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            body = json.loads(body_raw) if body_raw else {}
            if parsed.path == "/api/mods/save":
                self.handle_save_mod(body)
            elif parsed.path == "/api/mods/create":
                self.handle_create_mod(body)
            elif parsed.path == "/api/mods/delete":
                self.handle_delete_mod(body)
            elif parsed.path == "/api/mods/reorder":
                self.handle_reorder_mods(body)
            elif parsed.path == "/api/drive/probe":
                self.handle_probe_drive(body)
            elif parsed.path == "/api/clips/sync":
                self.handle_sync_clips(body)
            elif parsed.path == "/api/image/upload":
                self.handle_image_upload(body)
            elif parsed.path == "/api/image/flip":
                self.handle_image_flip(body)
            else:
                self.send_json({"error": f"Unknown endpoint {parsed.path}"}, status=404)
        except Exception as exc:
            self.send_json({"error": str(exc)}, status=400)

    def handle_save_mod(self, body: dict) -> None:
        mod = body.get("mod") or {}
        slug = (mod.get("slug") or "").strip()
        if not slug or not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", slug):
            raise ValueError("รหัส slug ไม่ถูกต้อง")

        # Strip internal status fields starting with '_'
        clean = {k: v for k, v in mod.items() if not k.startswith("_")}
        clean_skills = []
        for sk in clean.get("skills") or []:
            if isinstance(sk, dict):
                s_clean = {k: v for k, v in sk.items() if not k.startswith("_")}
                clean_skills.append(s_clean)
        clean["skills"] = clean_skills

        quick_note = (body.get("quickNote") or "").strip()
        today_str = dt.date.today().isoformat()
        update_mod.apply_version_update(
            clean,
            new_version=clean.get("version"),
            changelog_notes=[quick_note] if quick_note else None,
            today=today_str,
        )

        CHARS_DIR.mkdir(parents=True, exist_ok=True)
        char_path = CHARS_DIR / f"{slug}.json"
        char_path.write_text(json.dumps(clean, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        slugs = json.loads(MODS_JSON.read_text(encoding="utf-8")) if MODS_JSON.exists() else []
        if slug not in slugs:
            slugs.append(slug)
            MODS_JSON.write_text(json.dumps(slugs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        ffmpeg_exe = update_mod.find_ffmpeg()
        update_mod.sync_character(char_path, ffmpeg_exe, force_refresh_clips=bool(body.get("refreshClips")))
        self.send_json({"ok": True, "slug": slug})

    def handle_create_mod(self, body: dict) -> None:
        slug = (body.get("slug") or "").strip().lower()
        name = (body.get("name") or slug).strip()
        if not slug or not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", slug):
            raise ValueError("รหัส slug ต้องใช้ a-z, 0-9 และขีดกลางเท่านั้น")
        char_path = CHARS_DIR / f"{slug}.json"
        if char_path.exists():
            raise ValueError(f"มีม็อด {slug} อยู่แล้ว")
        today_str = dt.date.today().isoformat()
        new_mod = {
            "id": f"gm-{slug}",
            "slug": slug,
            "accent": "#4af2ea",
            "name": name,
            "category": "Hero Skin",
            "description": f"คำอธิบายสั้นของ {name}",
            "longDescription": f"รายละเอียดเต็มของ {name}",
            "version": "0.1.0",
            "fileSize": "",
            "featured": False,
            "concept": False,
            "thumbnail": "./assets/fallback.svg",
            "heroImage": "./assets/fallback.svg",
            "artworkAlt": name,
            "screenshots": [],
            "screenshotAlts": [],
            "downloadUrl": "",
            "installationGuide": [
                f"ดาวน์โหลดไฟล์แพ็กเกจ {slug}_v0.1.0.honmod มาไว้ในเครื่อง",
                "เปิดโปรแกรมจัดการม็อด Newerth Forge สำหรับ Heroes of Newerth Reborn",
                f"ลากไฟล์ .honmod เข้าสู่รายการม็อดแล้วติ๊กเปิดใช้งาน {name}",
                "กด Apply Mods แล้วเข้าเกมเพื่อใช้งาน",
            ],
            "changelog": [
                {
                    "version": "0.1.0",
                    "date": today_str,
                    "changes": [f"เปิดตัวม็อด {name}"],
                }
            ],
            "createdAt": today_str,
            "updatedAt": today_str,
            "skills": [
                {"key": "Q", "name": "สกิล 1", "icon": "./assets/fallback.svg", "description": "", "clip": ""},
                {"key": "W", "name": "สกิล 2", "icon": "./assets/fallback.svg", "description": "", "clip": ""},
                {"key": "E", "name": "สกิล 3", "icon": "./assets/fallback.svg", "description": "", "clip": ""},
                {"key": "R", "name": "อัลติเมต", "icon": "./assets/fallback.svg", "description": "", "clip": ""},
            ],
            "previewVideoUrl": "",
            "preview": "",
        }
        CHARS_DIR.mkdir(parents=True, exist_ok=True)
        char_path.write_text(json.dumps(new_mod, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        slugs = json.loads(MODS_JSON.read_text(encoding="utf-8")) if MODS_JSON.exists() else []
        if slug not in slugs:
            slugs.append(slug)
            MODS_JSON.write_text(json.dumps(slugs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        self.send_json({"ok": True, "slug": slug})

    def handle_delete_mod(self, body: dict) -> None:
        slug = (body.get("slug") or "").strip()
        if not slug:
            raise ValueError("ไม่ระบุ slug")
        char_path = CHARS_DIR / f"{slug}.json"
        if char_path.exists():
            char_path.unlink()
        if MODS_JSON.exists():
            slugs = [s for s in json.loads(MODS_JSON.read_text(encoding="utf-8")) if s != slug]
            MODS_JSON.write_text(json.dumps(slugs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        self.send_json({"ok": True})

    def handle_reorder_mods(self, body: dict) -> None:
        slugs = body.get("slugs")
        if not isinstance(slugs, list):
            raise ValueError("รายการ slugs ไม่ถูกต้อง")
        MODS_JSON.write_text(json.dumps(slugs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        self.send_json({"ok": True})

    def handle_probe_drive(self, body: dict) -> None:
        url = (body.get("url") or "").strip()
        fid = update_mod.extract_drive_id(url)
        if not fid:
            raise ValueError("ไม่พบรหัสไฟล์ Google Drive ในลิงก์นี้")
        size_bytes, fname = update_mod.probe_drive_file(fid)
        file_size = f"{size_bytes / (1024 * 1024):.1f} MB" if size_bytes else ""
        ver = ""
        if fname:
            m = re.search(r"_v(\d+(?:\.\d+)+)\.honmod$", fname, re.IGNORECASE)
            if m:
                ver = m.group(1)
        self.send_json({"fileId": fid, "filename": fname or "", "fileSize": file_size, "version": ver})

    def handle_sync_clips(self, body: dict) -> None:
        ffmpeg_exe = update_mod.find_ffmpeg()
        slug = (body.get("slug") or "").strip()
        refresh = bool(body.get("refresh", True))
        if slug:
            p = CHARS_DIR / f"{slug}.json"
            if not p.exists():
                raise ValueError(f"ไม่พบม็อด {slug}")
            update_mod.sync_character(p, ffmpeg_exe, force_refresh_clips=refresh)
        else:
            slugs = json.loads(MODS_JSON.read_text(encoding="utf-8"))
            for s in slugs:
                p = CHARS_DIR / f"{s}.json"
                if p.exists():
                    update_mod.sync_character(p, ffmpeg_exe, force_refresh_clips=refresh)
        self.send_json({"ok": True})

    def handle_image_upload(self, body: dict) -> None:
        raw_filename = (body.get("filename") or "image.webp").strip().replace("\\", "/").lstrip("./")
        if raw_filename.startswith("assets/art/"):
            raw_filename = raw_filename[len("assets/art/"):]
        parts = [p for p in raw_filename.split("/") if p and p not in (".", "..")]
        rel_subpath = "/".join(parts) if parts else "image.webp"
        if not rel_subpath.lower().endswith(".webp"):
            rel_subpath = str(Path(rel_subpath).with_suffix(".webp")).replace("\\", "/")

        size = int(body.get("size") or 0)
        max_width = int(body.get("maxWidth") or 0)
        custom_w = int(body.get("customW") or 0)
        custom_h = int(body.get("customH") or 0)
        flip_y = bool(body.get("flipY", False))
        quality = int(body.get("quality") or 92)
        local_path_str = (body.get("localPath") or "").strip().strip('"')

        ART_DIR.mkdir(parents=True, exist_ok=True)
        dst_path = ART_DIR / rel_subpath
        dst_path.parent.mkdir(parents=True, exist_ok=True)

        if local_path_str:
            src_local = Path(local_path_str)
            if not src_local.exists():
                raise ValueError(f"ไม่พบไฟล์ในเครื่อง: {local_path_str}")
            old_kb = round(src_local.stat().st_size / 1024.0, 1)
            out_w, out_h = convert_or_flip_webp_with_blender(
                src_local,
                dst_path,
                size=size if size > 0 else None,
                max_width=max_width if max_width > 0 else None,
                custom_w=custom_w if custom_w > 0 else None,
                custom_h=custom_h if custom_h > 0 else None,
                flip_y=flip_y,
                quality=quality,
            )
        else:
            b64 = body.get("base64") or ""
            raw = base64.b64decode(b64)
            old_kb = round(len(raw) / 1024.0, 1)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".img") as tmp:
                tmp.write(raw)
                tmp_path = Path(tmp.name)
            try:
                out_w, out_h = convert_or_flip_webp_with_blender(
                    tmp_path,
                    dst_path,
                    size=size if size > 0 else None,
                    max_width=max_width if max_width > 0 else None,
                    custom_w=custom_w if custom_w > 0 else None,
                    custom_h=custom_h if custom_h > 0 else None,
                    flip_y=flip_y,
                    quality=quality,
                )
            finally:
                tmp_path.unlink(missing_ok=True)

        new_kb = round(dst_path.stat().st_size / 1024.0, 1) if dst_path.exists() else 0
        self.send_json({
            "ok": True,
            "path": f"./assets/art/{rel_subpath}",
            "width": out_w,
            "height": out_h,
            "oldSizeKB": old_kb,
            "newSizeKB": new_kb,
        })

    def handle_image_flip(self, body: dict) -> None:
        rel = (body.get("path") or "").strip().lstrip("./")
        if not rel.startswith("assets/"):
            raise ValueError("พาธรูปภาพต้องอยู่ใน assets/")
        target = ROOT / rel
        if not target.exists():
            raise ValueError(f"ไม่พบไฟล์ {rel}")
        convert_or_flip_webp_with_blender(target, target, size=None, flip_y=True)
        self.send_json({"ok": True, "path": "./" + rel})


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description="GodMian Local Mod Manager Web App")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()

    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), AdminRequestHandler)
    url = f"http://127.0.0.1:{args.port}/admin"
    print("=" * 62)
    print("  GodMian Mod Manager Web App เปิดทำงานแล้ว!")
    print(f"  -> หน้าจัดการม็อด (สร้าง/ลบ/แก้ไข) : {url}")
    print(f"  -> หน้าเว็บตัวอย่าง (Live Preview) : http://127.0.0.1:{args.port}/")
    print("  (ปิดหน้าต่างนี้เมื่อเลิกใช้งาน)")
    print("=" * 62)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nปิดเซิร์ฟเวอร์แล้ว")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
