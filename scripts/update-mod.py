#!/usr/bin/env python3
"""
GodMian One-Stop Mod & Skill Clip Updater.

Automatically syncs:
1. Mod version, updatedAt date, fileSize, installationGuide (.honmod filename/version), and changelog
   from character JSONs and/or Google Drive downloadUrl headers.
2. Skill video clips (Q, W, E, R) from Google Drive links into assets/video/drive-<FILE_ID>.mp4
   (auto-detects when a Drive video was replaced or newly linked, and applies +faststart when ffmpeg is available).

Does NOT commit or push to GitHub.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODS_JSON = ROOT / "data" / "mods.json"
CHARS_DIR = ROOT / "data" / "characters"
VIDEO_DIR = ROOT / "assets" / "video"


def find_ffmpeg() -> str | None:
    which = shutil.which("ffmpeg")
    if which:
        return which
    local_app = os.environ.get("LOCALAPPDATA", "")
    if local_app:
        capcut_root = Path(local_app) / "CapCut" / "Apps"
        if capcut_root.exists():
            candidates = sorted(capcut_root.glob("*/ffmpeg.exe"), reverse=True)
            if candidates:
                return str(candidates[0])
    return None


def extract_drive_id(url: str) -> str | None:
    if not url or not isinstance(url, str):
        return None
    url = url.strip()
    m = re.search(r"drive\.google\.com/file/(?:u/\d+/)?d/([A-Za-z0-9_-]+)", url)
    if m:
        return m.group(1)
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.hostname in ("drive.google.com", "drive.usercontent.google.com"):
            qs = urllib.parse.parse_qs(parsed.query)
            if "id" in qs and qs["id"]:
                return qs["id"][0]
    except Exception:
        pass
    return None


def probe_drive_file(file_id: str) -> tuple[int | None, str | None]:
    """Return (content_length_bytes, filename) from Google Drive direct download headers."""
    url = f"https://drive.usercontent.google.com/download?export=download&id={file_id}&confirm=t"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            cl = resp.headers.get("Content-Length")
            size = int(cl) if cl and cl.isdigit() else None
            cd = resp.headers.get("Content-Disposition") or ""
            fname = None
            m = re.search(r'filename\*?=(?:UTF-8\'\')?"?([^";]+)"?', cd, re.IGNORECASE)
            if m:
                fname = urllib.parse.unquote(m.group(1).strip())
            return size, fname
    except Exception as exc:
        print(f"  [WARN] เช็กข้อมูล Google Drive ({file_id}) ไม่สำเร็จ: {exc}")
        return None, None


def download_drive_mp4(file_id: str, dest: Path, ffmpeg_exe: str | None) -> bool:
    url = f"https://drive.usercontent.google.com/download?export=download&id={file_id}&confirm=t"
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4", dir=str(VIDEO_DIR)) as tmp:
        tmp_path = Path(tmp.name)
    try:
        print(f"  -> กำลังดาวน์โหลดคลิปจาก Google Drive ({file_id}) ...")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as resp, open(tmp_path, "wb") as out:
            shutil.copyfileobj(resp, out)
        with open(tmp_path, "rb") as fp:
            hdr = fp.read(12)
        if len(hdr) < 8 or hdr[4:8] != b"ftyp":
            print(f"  [ERROR] ไฟล์ {file_id} ไม่ใช่ MP4 สาธารณะ (ตรวจสอบสิทธิ์ Anyone with the link)")
            return False

        if ffmpeg_exe:
            fast_tmp = tmp_path.with_suffix(".fast.mp4")
            res = subprocess.run(
                [ffmpeg_exe, "-y", "-hide_banner", "-loglevel", "error", "-i", str(tmp_path), "-c", "copy", "-movflags", "+faststart", str(fast_tmp)],
                capture_output=True,
                text=True,
            )
            if res.returncode == 0 and fast_tmp.exists() and fast_tmp.stat().st_size > 0:
                tmp_path.unlink(missing_ok=True)
                tmp_path = fast_tmp
            else:
                fast_tmp.unlink(missing_ok=True)

        shutil.move(str(tmp_path), str(dest))
        print(f"  [OK] อัปเดตคลิป {dest.relative_to(ROOT)} ({dest.stat().st_size:,} bytes)")
        return True
    except Exception as exc:
        print(f"  [ERROR] ดาวน์โหลดคลิป {file_id} ล้มเหลว: {exc}")
        return False
    finally:
        tmp_path.unlink(missing_ok=True)


def sync_install_guide_version(guide: list[str], version: str, honmod_filename: str | None = None) -> list[str]:
    if not version:
        return guide
    updated = []
    for step in guide:
        s = step.replace("{version}", version)
        if honmod_filename and re.search(r"[A-Za-z0-9_.-]+_v\d+(?:\.\d+)+\.honmod", s):
            s = re.sub(r"[A-Za-z0-9_.-]+_v\d+(?:\.\d+)+\.honmod", honmod_filename, s)
        else:
            s = re.sub(r"(_v)\d+(?:\.\d+)+(\.honmod\b)", rf"\g<1>{version}\2", s)
        updated.append(s)
    return updated


def apply_version_update(
    data: dict,
    new_version: str | None = None,
    changelog_notes: list[str] | None = None,
    today: str | None = None,
    honmod_filename: str | None = None,
) -> bool:
    changed = False
    today_str = today or dt.date.today().isoformat()
    old_version = (data.get("version") or "").strip()
    target_version = (new_version or old_version).strip()

    if target_version and target_version != old_version:
        data["version"] = target_version
        data["updatedAt"] = today_str
        changed = True
        print(f"  [OK] อัปเดต version: {old_version} -> {target_version} (updatedAt: {today_str})")

    if isinstance(data.get("installationGuide"), list) and target_version:
        new_guide = sync_install_guide_version(data["installationGuide"], target_version, honmod_filename)
        if new_guide != data["installationGuide"]:
            data["installationGuide"] = new_guide
            changed = True
            print(f"  [OK] ซิงก์ชื่อเวอร์ชันใน installationGuide -> v{target_version}")

    if changelog_notes:
        clean_notes = [n.strip() for n in changelog_notes if n and n.strip()]
        if clean_notes:
            changelog = data.get("changelog")
            if not isinstance(changelog, list):
                changelog = []
            if changelog and isinstance(changelog[0], dict) and changelog[0].get("version") == target_version:
                existing = changelog[0].get("changes") or []
                for note in clean_notes:
                    if note not in existing:
                        existing.append(note)
                changelog[0]["changes"] = existing
                changelog[0]["date"] = today_str
            else:
                changelog.insert(0, {
                    "version": target_version or "1.0.0",
                    "date": today_str,
                    "changes": clean_notes,
                })
            data["changelog"] = changelog
            data["updatedAt"] = today_str
            changed = True
            print(f"  [OK] เพิ่มประวัติการอัปเดต (changelog) รุ่น {target_version}")

    return changed


def sync_character(
    char_path: Path,
    ffmpeg_exe: str | None,
    force_refresh_clips: bool = False,
    check_drive_mod: bool = True,
) -> bool:
    data = json.loads(char_path.read_text(encoding="utf-8"))
    slug = data.get("slug") or char_path.stem
    name = data.get("name") or slug
    print(f"\n=== [{slug}] {name} (v{data.get('version', '?')}) ===")
    changed = False
    today_str = dt.date.today().isoformat()

    # 1. Check downloadUrl on Google Drive for version in filename
    honmod_filename = None
    dl_id = extract_drive_id(data.get("downloadUrl", ""))
    if dl_id and check_drive_mod:
        size_bytes, fname = probe_drive_file(dl_id)
        if fname:
            honmod_filename = fname
            m_ver = re.search(r"_v(\d+(?:\.\d+)+)\.honmod$", fname, re.IGNORECASE)
            if m_ver:
                drive_ver = m_ver.group(1)
                if drive_ver != data.get("version"):
                    print(f"  [ตรวจพบไฟล์ม็อดเวอร์ชันใหม่บน Drive] {fname} (v{drive_ver})")
                    if apply_version_update(data, new_version=drive_ver, today=today_str, honmod_filename=fname):
                        changed = True
        if size_bytes and not data.get("fileSize"):
            mb = size_bytes / (1024 * 1024)
            data["fileSize"] = f"{mb:.1f} MB"
            changed = True

    # Ensure installationGuide always matches current version
    if apply_version_update(data, new_version=data.get("version"), today=today_str, honmod_filename=honmod_filename):
        changed = True

    # 2. Check and sync skill clips
    skills = data.get("skills")
    if isinstance(skills, list):
        for skill in skills:
            if not isinstance(skill, dict):
                continue
            key = (skill.get("key") or "").strip()
            clip_val = (skill.get("clip") or "").strip()
            clip_src = (skill.get("clipSource") or "").strip()

            # Promote clipSource if clip was left on an old local file path
            if clip_src and extract_drive_id(clip_src) and not extract_drive_id(clip_val):
                skill["clip"] = clip_src
                clip_val = clip_src
                del skill["clipSource"]
                changed = True
                print(f"  [OK] สกิล {key}: เปลี่ยนไปใช้ลิงก์ Google Drive จาก clipSource")
            elif "clipSource" in skill and extract_drive_id(clip_val) == extract_drive_id(clip_src):
                del skill["clipSource"]
                changed = True

            fid = extract_drive_id(clip_val)
            if not fid:
                continue

            dest = VIDEO_DIR / f"drive-{fid}.mp4"
            need_download = force_refresh_clips or not dest.exists()
            if not need_download:
                remote_size, _ = probe_drive_file(fid)
                if remote_size is not None:
                    local_size = dest.stat().st_size
                    # Compare sizes (allow up to 32 KB difference from +faststart moov relocation)
                    if abs(remote_size - local_size) > 32768:
                        print(f"  [ตรวจพบคลิปสกิล {key} อัปเดตใหม่บน Drive] (เดิม {local_size:,}B -> ใหม่ {remote_size:,}B)")
                        need_download = True

            if need_download:
                if download_drive_mp4(fid, dest, ffmpeg_exe):
                    legacy_alias = VIDEO_DIR / f"skill-{key.lower()}.mp4"
                    if slug == "rachatoey-flint" and legacy_alias.exists():
                        shutil.copy2(dest, legacy_alias)

    if changed:
        char_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"  [SAVED] บันทึกข้อมูล {char_path.relative_to(ROOT)} เรียบร้อย")
    else:
        print("  [OK] ข้อมูลและคลิปสกิลทั้งหมดเป็นเวอร์ชันล่าสุดแล้ว")

    return changed


def interactive_wizard(ffmpeg_exe: str | None) -> None:
    slugs = json.loads(MODS_JSON.read_text(encoding="utf-8"))
    print("\n" + "=" * 62)
    print("  ระบบจัดการและอัปเดตม็อด (เลือกม็อดเพื่อแก้เวอร์ชัน / คลิปสกิล)")
    print("=" * 62)
    char_paths: list[Path] = []
    for idx, slug in enumerate(slugs, start=1):
        p = CHARS_DIR / f"{slug}.json"
        if not p.exists():
            continue
        char_paths.append(p)
        d = json.loads(p.read_text(encoding="utf-8"))
        feat = " [Featured]" if d.get("featured") else ""
        print(f"  [{idx}] {d.get('name', slug)} — v{d.get('version', '?')} (อัปเดต {d.get('updatedAt', '-')}){feat}")
    print("  [R] บังคับโหลดคลิปสกิลทุกตัวจาก Google Drive ใหม่ทั้งหมด (--refresh)")
    print("  [Enter] เสร็จสิ้น / ปิดโปรแกรม")

    choice = input("\nเลือกหมายเลขม็อดที่ต้องการแก้ไข (หรือกด Enter เพื่อออก): ").strip()
    if not choice:
        return
    if choice.lower() == "r":
        for p in char_paths:
            sync_character(p, ffmpeg_exe, force_refresh_clips=True)
        return
    if not choice.isdigit() or not (1 <= int(choice) <= len(char_paths)):
        print("[WARN] หมายเลขไม่ถูกต้อง")
        return

    target_path = char_paths[int(choice) - 1]
    data = json.loads(target_path.read_text(encoding="utf-8"))
    print(f"\n--- แก้ไข: {data.get('name')} (เวอร์ชันปัจจุบัน: {data.get('version')}) ---")

    new_ver = input(f"1. เวอร์ชันใหม่ (กด Enter เพื่อคงค่าเดิม [{data.get('version')}]): ").strip()
    new_dl = input("2. ลิงก์ Google Drive ไฟล์ .honmod ใหม่ (กด Enter เพื่อคงค่าเดิม): ").strip()
    new_note = input("3. รายละเอียดอัปเดตใน Changelog (กด Enter หากไม่ต้องการเพิ่ม): ").strip()

    if new_dl:
        data["downloadUrl"] = new_dl

    skills = data.get("skills") or []
    for skill in skills:
        k = skill.get("key", "?")
        sname = skill.get("name", "")
        new_clip = input(f"4.{k} ลิงก์ Google Drive คลิปสกิล {k} ({sname}) ใหม่ (กด Enter เพื่อคงค่าเดิม): ").strip()
        if new_clip:
            skill["clip"] = new_clip
            skill.pop("clipSource", None)

    today_str = dt.date.today().isoformat()
    apply_version_update(
        data,
        new_version=new_ver or data.get("version"),
        changelog_notes=[new_note] if new_note else None,
        today=today_str,
    )
    if new_ver or new_dl or new_note:
        data["updatedAt"] = today_str

    target_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n[SAVED] บันทึก {target_path.relative_to(ROOT)} เรียบร้อย กำลังซิงก์ไฟล์และคลิปสกิล...")
    sync_character(target_path, ffmpeg_exe, force_refresh_clips=bool(new_dl))


def main() -> int:
    ap = argparse.ArgumentParser(description="GodMian Mod & Skill Video Updater")
    ap.add_argument("--auto", action="store_true", help="รันซิงก์อัตโนมัติโดยไม่ถามโต้ตอบ")
    ap.add_argument("--refresh", action="store_true", help="บังคับดาวน์โหลดคลิปสกิลจาก Google Drive ใหม่ทั้งหมด")
    ap.add_argument("--slug", help="ระบุ slug ของม็อดที่ต้องการอัปเดต เช่น rachatoey-flint หรือ zoro")
    ap.add_argument("--version", help="ตั้งเลขเวอร์ชันใหม่ เช่น 0.7.13 (อัปเดต updatedAt และ installationGuide อัตโนมัติ)")
    ap.add_argument("--note", action="append", help="ข้อความที่จะเพิ่มใน changelog (ใส่ซ้ำได้หลายข้อ)")
    ap.add_argument("--download-url", help="ลิงก์ Google Drive ของไฟล์ .honmod ตัวใหม่")
    ap.add_argument("--clip-q", help="ลิงก์ Google Drive คลิปสกิล Q")
    ap.add_argument("--clip-w", help="ลิงก์ Google Drive คลิปสกิล W")
    ap.add_argument("--clip-e", help="ลิงก์ Google Drive คลิปสกิล E")
    ap.add_argument("--clip-r", help="ลิงก์ Google Drive คลิปสกิล R")
    args = ap.parse_args()

    ffmpeg_exe = find_ffmpeg()

    if args.slug:
        target = CHARS_DIR / f"{args.slug}.json"
        if not target.exists():
            print(f"[ERROR] ไม่พบไฟล์ {target}")
            return 1
        data = json.loads(target.read_text(encoding="utf-8"))
        today_str = dt.date.today().isoformat()
        if args.download_url:
            data["downloadUrl"] = args.download_url.strip()
            data["updatedAt"] = today_str
        clip_updates = {"Q": args.clip_q, "W": args.clip_w, "E": args.clip_e, "R": args.clip_r}
        for skill in data.get("skills") or []:
            k = (skill.get("key") or "").upper()
            if clip_updates.get(k):
                skill["clip"] = clip_updates[k].strip()
                skill.pop("clipSource", None)
                data["updatedAt"] = today_str
        apply_version_update(
            data,
            new_version=args.version or data.get("version"),
            changelog_notes=args.note,
            today=today_str,
        )
        target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        sync_character(target, ffmpeg_exe, force_refresh_clips=args.refresh)
        return 0

    slugs = json.loads(MODS_JSON.read_text(encoding="utf-8"))
    for slug in slugs:
        p = CHARS_DIR / f"{slug}.json"
        if p.exists():
            sync_character(p, ffmpeg_exe, force_refresh_clips=args.refresh)

    if not args.auto and sys.stdin.isatty():
        interactive_wizard(ffmpeg_exe)

    print("\n[เสร็จสมบูรณ์] อัปเดตไฟล์ในเครื่องเรียบร้อยแล้ว (ยังไม่ได้ Commit หรือ Push ขึ้น GitHub)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
