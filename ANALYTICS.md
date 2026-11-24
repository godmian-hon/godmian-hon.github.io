# คู่มือการติดแท็ก Google Analytics (GA4 / GTM) และการปรับแต่งระบบ (สำหรับ AI และผู้พัฒนา)

เอกสารนี้สรุปข้อกำหนดการติดแท็กวัดผล Traffic, การส่ง Event (ดาวน์โหลด/ดูม็อด/ดูสกิล), การตั้งค่า Featured mods และมาตรฐานรูปไอคอนสกิลของเว็บ **GodMian (`godmian-hon.github.io`)**

> **คำสั่งสำหรับ AI:** เมื่อได้รับคำสั่งให้สร้างหน้า HTML ใหม่, เพิ่มปุ่มดาวน์โหลด/ปุ่มโต้ตอบใหม่, เพิ่มม็อดใหม่ หรือแก้ไขหน้าเว็บ ให้ปฏิบัติตามข้อกำหนดในไฟล์นี้ทุกครั้ง และ **ห้าม Commit หรือ Push ขึ้น GitHub เองโดยเด็ดขาด** เว้นแต่ผู้ใช้จะสั่งให้เผยแพร่อย่างชัดเจน

---

## 1. แท็ก Google ประจำหน้า HTML (บังคับใส่ทุกไฟล์ `.html`)

ทุกไฟล์ `.html` ในโปรเจกต์ (เช่น `index.html`, `404.html` หรือหน้าใหม่ที่สร้างเพิ่มในอนาคต) **ต้อง** วางสคริปต์นี้ไว้ **บรรทัดแรกสุดทันทีหลังแท็กเปิด `<head>`** (ก่อน `<meta charset="utf-8">`) และห้ามใส่แท็ก Google ซ้ำมากกว่า 1 ชุดในหน้าเดียวกัน:

```html
<head>
  <script async src="https://www.googletagmanager.com/gtm.js?id=GTM-TPTG84ZD"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
  </script>
  <meta charset="utf-8">
```

- **รหัสคอนเทนเนอร์ (Google Tag / GTM):** `GTM-TPTG84ZD`
- **รหัสการวัดผล (GA4 Measurement ID ที่ผูกกับคอนเทนเนอร์นี้):** `G-53FPRR9X3K` (สตรีม `GODMIAN` · `https://godmian-hon.github.io` · รหัสสตรีม `16402492422`)

---

## 2. ระบบวัดผล Event รายม็อด (`js/analytics.js`)

เนื่องจากเว็บไซต์ทำงานแบบ Single-Page Application (ใช้ Hash `#mod/<slug>`) และลิงก์ดาวน์โหลดชี้ไปยัง Google Drive จึงมีโมดูลกลางที่ `js/analytics.js` สำหรับส่งข้อมูลแยกตามชื่อม็อดเข้า `gtag` / `dataLayer`

### รายการ Event ที่ระบบส่งอัตโนมัติ

| ชื่อ Event | จุดที่เรียกใช้งาน | พารามิเตอร์ที่ส่งไปด้วย | ความหมาย |
| --- | --- | --- | --- |
| `mod_view` | `js/app.js` (เมื่อเปิด `#mod/<slug>`) | `mod_id`, `mod_slug`, `mod_name`, `mod_category`, `mod_version` | ผู้ใช้เปิดดูหน้ารายละเอียดของม็อดนั้น |
| `page_view` | `js/app.js` (เมื่อสลับหน้า `#mod/<slug>` หรือกลับหน้าหลัก) | `page_title`, `page_location`, `page_path` | บันทึกการเปลี่ยนหน้าเสมือน (Virtual Pageview) ใน SPA |
| `mod_download` | `js/detail.js` (เมื่อคลิกปุ่ม **Download mod**) | `mod_id`, `mod_slug`, `mod_name`, `mod_category`, `mod_version`, `file_size`, `link_url` | ผู้ใช้กดดาวน์โหลดไฟล์ม็อดแยกตามชื่อม็อด |
| `skill_preview` | `js/detail.js` (เมื่อกดดูสกิล `Q`, `W`, `E`, `R`) | `mod_id`, `mod_slug`, `mod_name`, `mod_category`, `mod_version`, `skill_key`, `skill_name` | ผู้ใช้กดเปิดดูพรีวิวสกิลของฮีโร่ |
| `gallery_open` | `js/detail.js` (เมื่อคลิกขยายภาพตัวอย่างในแกลเลอรี) | `mod_id`, `mod_slug`, `mod_name`, `mod_category`, `mod_version`, `image_index` | ผู้ใช้กดเปิดดูภาพใน Lightbox |
| `video_sound_toggle` | `js/detail.js` (เมื่อกดปุ่มเปิด/ปิดเสียงวิดีโอพรีวิว) | `mod_id`, `mod_slug`, `mod_name`, `mod_category`, `mod_version`, `sound_state` | ผู้ใช้กดเปิดหรือปิดเสียงวิดีโอตัวอย่างม็อด |

### วิธีติดแท็ก Event เมื่อ AI สร้างปุ่มหรือฟีเจอร์ใหม่
เมื่อสร้างปุ่มหรือหน้าใหม่ใน JavaScript ให้ `import` ฟังก์ชันจาก `./analytics.js` เสมอ:

```javascript
import { trackEvent, trackModDownload, trackModView, trackPageView } from './analytics.js';

// ตัวอย่างการส่ง Event ใหม่เมื่อเพิ่มปุ่มหรือฟีเจอร์ใหม่
trackEvent('custom_action_name', {
  mod_slug: mod.slug,
  mod_name: mod.name,
  action_label: 'ชื่อปุ่มหรือรายละเอียด',
});
```

---

## 3. การจัดการหมวด Featured mods (`Featured mods.`)

ในไฟล์ `js/collection.js` ระบบใช้รายการม็อดทั้งหมดที่ตั้ง `"featured": true` มาแสดงในหมวด **Featured mods.** โดยตรง:

```javascript
const picks = mods.filter(mod => mod.featured);
const featured = document.getElementById('featured');
const editorial = picks;
featured.hidden = !editorial.length;
```

- **ห้าม** ใช้ `picks.slice(1)` ใน `js/collection.js` เพราะจะทำให้ม็อดตัวแรกใน `data/mods.json` ถูกตัดออกจากหมวด Featured mods และหากมีม็อดที่ตั้ง `"featured": true` เพียงตัวเดียว หมวด Featured mods จะถูกซ่อนทั้งหมด
- **วิธีเพิ่ม/เอาม็อดออกจาก Featured mods:**
  1. เปิดไฟล์ `data/characters/<slug>.json` (เช่น `data/characters/rachatoey-flint.json` หรือ `data/characters/zoro.json`)
  2. ตั้งค่า `"featured": true` เพื่อให้แสดงในหมวด **Featured mods.** หรือ `"featured": false` เพื่อนำออก (ม็อดที่ตั้งเป็น `false` จะยังแสดงในหมวด **Explore mods.** ด้านล่างตามปกติ)
  3. ลำดับการแสดงผลใน Featured mods จะเรียงตามลำดับรายชื่อใน `data/mods.json`
- **วิธีเปิด/ปิดการแสดงผลฮีโร่บนเว็บ (`enabled`):**
  - หากต้องการซ่อนฮีโร่ออกจากหน้าเว็บทั้งหมดชั่วคราว (ไม่แสดงใน Hero, Featured, Explore และ `#mod/<slug>`) ให้ตั้ง `"enabled": false` ใน `data/characters/<slug>.json` หรือกดปุ่ม **`🚫 ปิด`** ในหน้า `Admin_Tool.bat` (`http://127.0.0.1:8765/admin`) หรือใส่ `-` หน้าชื่อ slug ใน `data/mods.json`
- **วิธีดูยอดดาวน์โหลดและกิจกรรมบน Google Analytics 4:**
  - **แบบเรียลไทม์ (30 นาทีล่าสุด):** ไปที่เมนู **รายงาน → ภาพรวมแบบเรียลไทม์** แล้วดูการ์ด **"จำนวนเหตุการณ์ ตาม ชื่อกิจกรรม"** (`mod_download`, `mod_view`, `skill_preview`, `gallery_open`)
  - **ยอดสะสมย้อนหลัง:** ไปที่เมนู **ดูการมีส่วนร่วมและการคงผู้ใช้ไว้ → กิจกรรม (Events)** แล้วคลิกดูที่ `mod_download` (สามารถเพิ่ม Custom Dimension `mod_name` และ `mod_slug` ในเมนูผู้ดูแลระบบ → คำจำกัดความที่กำหนดเอง เพื่อดูยอดแยกตามชื่อฮีโร่ได้)

---

## 4. มาตรฐานการอัปเดตภาพไอคอนสกิล (`assets/art/`) และคลิปสกิล (`assets/video/`)

- ภาพไอคอนสกิล (`Q`, `W`, `E`, `R`) ในเว็บใช้ฟอร์แมต **WebP** (เช่น `assets/art/rachatoey-skill_q.webp` ขนาด `256×256` หรือ `assets/art/zoro/skill-*.webp` ขนาด `128×128`)
- **ข้อควรระวังเรื่องภาพกลับหัว (`.dds` Vertical Flip):** ไฟล์ `icon.dds` ของเอนจิน K2 (HoN Reborn) เก็บพิกเซลแบบ OpenGL (ล่างขึ้นบน) หากแปลงจาก `icon.dds` มาเป็น WebP บนหน้าเว็บ ต้องพลิกแกนตั้ง (`arr[::-1]`) เสมอเพื่อไม่ให้ไอคอนสกิลกลับหัว
- เมื่อแปลงไฟล์ด้วย Blender 5.3:
  - ต้องตั้งค่า `scene.display_settings.display_device = "sRGB"` และ `scene.view_settings.view_transform = "Standard"` (ห้ามใช้ค่าเริ่มต้น `AgX` เพราะจะทำให้สีของไอคอนซีดเพี้ยน)
- **ระบบคลิปสกิล (`skills[].clip`) และการอัปเดตเวอร์ชันม็อดอัตโนมัติ (`Update_Mod.bat` / `scripts/update-mod.py`):**
  - ฟังก์ชัน `skillClipPath()` ใน `js/data.js` จะแปลงลิงก์ Google Drive `https://drive.google.com/file/d/<FILE_ID>/view` ให้ชี้ไปยังไฟล์ในโปรเจกต์ที่ `./assets/video/drive-<FILE_ID>.mp4` (ไม่ได้สตรีมจาก Google Drive โดยตรงขณะเปิดเว็บ)
  - เมื่อต้องการอัปเดตเวอร์ชันม็อด วันที่อัปเดต ขั้นตอนติดตั้ง (`installationGuide`) ประวัติ (`changelog`) หรือดึงคลิปสกิลใหม่จาก Google Drive ให้รัน `Update_Mod.bat` (หรือ `scripts/update-mod.py --auto` / `--slug <slug> --version <ver> --note "<ข้อความ>"`) ซึ่งจะซิงก์ทุกจุดให้อัตโนมัติโดยไม่ต้องใช้ Node.js

---

## 5. แผนพัฒนาต่อยอด (Future Roadmap / To-Do)

1. **ระบบปลดล็อกแจกสกินตามยอดผู้ติดตาม TikTok (TikTok Follower Goal / Milestone Unlock):**
   - ดึงยอดผู้ติดตามจากหน้าโปรไฟล์ TikTok มาแสดงเป็นหลอดความคืบหน้าบนหน้าเว็บ (เช่น `ผู้ติดตาม TikTok 850 / 1,000 คน`)
   - รองรับฟิลด์ `tiktokGoal` ใน `data/characters/<slug>.json` และในหน้า Admin หากยอดผู้ติดตามยังไม่ถึงเป้าจะซ่อนลิงก์ดาวน์โหลดและแสดงปุ่มไปกดติดตามช่อง TikTok แทน เมื่อยอดถึงเป้าแล้วจะปลดล็อกปุ่ม **Download mod** อัตโนมัติ
2. **ระบบดึงยอดดาวน์โหลด (`mod_download`) จาก GA4 มาแสดงบนการ์ดและหน้าดาวน์โหลด:**
   - ใช้ GitHub Actions ดึงข้อมูลจาก GA4 Data API (เก็บ Service Account JSON ใน GitHub Secrets) แล้วบันทึกลง `data/stats.json` ตามรอบเวลาเพื่อให้หน้าเว็บแสดงยอดดาวน์โหลดจริงโดยไม่เปิดเผยคีย์ลับบนฝั่งเบราว์เซอร์
