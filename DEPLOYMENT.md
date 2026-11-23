# เผยแพร่ GodMian บน GitHub Pages

ไฟล์เว็บไซต์พร้อมนำไปเผยแพร่ได้จากโฟลเดอร์เดียวกับ `index.html` คู่มือนี้ใช้ **Project site** ซึ่งมี URL รูปแบบ `https://OWNER.github.io/REPOSITORY/` จึงใช้บัญชีเดียวกับเว็บไซต์อื่นได้ หากต้องการเผยแพร่ที่ `https://OWNER.github.io/` ให้ตั้งชื่อ repository เป็น `OWNER.github.io` ตามชื่อบัญชี [รูปแบบเว็บไซต์ GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## 1. สร้าง repository และเพิ่มไฟล์

1. ลงชื่อเข้าใช้ GitHub เลือก **New repository** ตั้งชื่อ เช่น `rift-vault` หากใช้ GitHub Free ให้เลือก **Public** จากนั้นกด **Create repository** [ขั้นตอนสร้าง GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
2. เพิ่มไฟล์โปรเจกต์ลงใน branch `main` ด้วย Git, GitHub Desktop หรือ **Add file → Upload files** วาง `index.html`, `404.html`, โฟลเดอร์ `assets/`, `data/`, `js/` และ `styles/` ไว้ที่ระดับบนสุด เหมือนตำแหน่งที่ใช้ดูตัวอย่างบนเครื่อง
3. ตรวจสอบว่า `.nojekyll` อยู่ข้าง `index.html` หากเครื่องมืออัปโหลดข้ามไฟล์ซ่อน ให้ใช้ **Add file → Create new file** ตั้งชื่อ `.nojekyll` แล้ว commit ไฟล์ว่าง GitHub Pages จะเสิร์ฟไฟล์สแตติกโดยตรง [เอกสารการเตรียมไฟล์เว็บไซต์](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)

## 2. เปิดใช้ Pages

1. ใน repository เลือก **Settings → Pages**
2. ใน **Build and deployment** ตั้ง **Source** เป็น **Deploy from a branch**
3. เลือก branch **main** และโฟลเดอร์ **/(root)** แล้วกด **Save**
4. ดูสถานะในแท็บ **Actions** เมื่อ deployment สำเร็จ ให้กลับไปที่ **Settings → Pages** และเปิด URL ที่ GitHub แสดง [การตั้งค่าแหล่งเผยแพร่](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## 3. ตรวจเว็บไซต์ที่เผยแพร่

- เปิดหน้าแรกจาก URL ของโปรเจกต์ ลองค้นหาชื่อม็อด กรองหมวด และสลับการเรียงลำดับ
- เปิดรายละเอียดหนึ่งรายการ คัดลอก URL ทั้งหมดรวมส่วนที่ขึ้นต้นด้วย `#` ไปเปิดในแท็บใหม่ แล้วรีเฟรช หน้ารายละเอียดและรูปต้องยังเปิดได้ เพราะเบราว์เซอร์อ่านเส้นทางจาก hash ของหน้าเดิม
- เปิดภาพแกลเลอรี เปลี่ยนภาพด้วยปุ่มลูกศร จากนั้นทดสอบปุ่มย้อนกลับและเดินหน้าของเบราว์เซอร์
- ทดสอบลิงก์ Google Drive ของม็อดที่เปิดให้ดาวน์โหลดแล้วจากหน้าต่างส่วนตัว หาก Drive ขอให้ยืนยัน ให้ใช้ลิงก์เปิดหน้าไฟล์ของ Google Drive ในหน้ารายละเอียด รายการคอนเซ็ปต์ยังแสดง **Unavailable**
- เปิด URL ที่ไม่มีอยู่ เช่น `REPOSITORY/missing/deep/path` ให้เห็นหน้า 404 และกด **Back to GodMian** เพื่อกลับเข้าเว็บไซต์ GitHub Pages ใช้ `404.html` จากรากของแหล่งเผยแพร่สำหรับคำขอที่ไม่มีไฟล์ [หน้า 404 สำหรับ GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site)
- หากต้องการให้บริการภายนอกแสดงภาพเมื่อแชร์ลิงก์ ให้นำ URL สาธารณะเต็มของภาพปกใส่ใน `og:image` ใน `index.html` หลังทราบชื่อโดเมนจริง

## อัปเดตเว็บไซต์

แก้ JSON และเพิ่มภาพตาม [คู่มือเพิ่มม็อด](HOW_TO_ADD_MODS.md) ตรวจผลผ่าน HTTP บนเครื่อง แล้ว commit และ push ไปยัง branch ที่เลือกไว้ Pages จะเผยแพร่ commit ใหม่ ให้ตรวจสถานะใน **Actions** ก่อนเปิดหน้าเดิมซ้ำ เมื่อสร้างเวอร์ชันใหม่ ทดสอบด้วยไฟล์จากลิงก์สาธารณะและตรวจว่าเวอร์ชัน ขนาดไฟล์ และวันที่อัปเดตสอดคล้องกัน

## เมื่อหน้าเว็บหรือภาพเปิดไม่ได้

| อาการ | จุดตรวจ |
| --- | --- |
| หน้าแรกขึ้น 404 | เปิด URL ที่แสดงใน Settings → Pages ตรวจ branch และโฟลเดอร์ที่เลือก พร้อมชื่อ `index.html` ตัวพิมพ์เล็ก |
| หน้าแรกเปิดได้แต่ภาพหรือเมนูหาย | ตรวจว่าไฟล์อยู่ใน commit ที่เผยแพร่แล้ว ตัวพิมพ์ใหญ่–เล็กตรงกับชื่อบน GitHub และ path ใน JSON เริ่มจากตำแหน่งของ `index.html` เช่น `./assets/art/cover.webp` |
| เครื่องเปิดภาพได้ แต่เว็บไซต์ใต้ชื่อ repository หาไฟล์ไม่พบ | ตรวจ path ที่ขึ้นต้นด้วย `/` เพราะหมายถึงรากโดเมน ให้เปลี่ยนเป็น `./` เมื่ออ้างถึงไฟล์ของโปรเจกต์ |
| อัปเดตไฟล์แล้วแต่ยังเห็นรุ่นเดิม | ตรวจว่า workflow ของ commit ล่าสุดสำเร็จ จากนั้นรีเฟรชหน้าและตรวจชื่อไฟล์ที่อัปโหลด |
| ผู้ชมดาวน์โหลดไม่ได้ | ตรวจสิทธิ์ **Anyone with the link · Viewer** ของไฟล์จริงใน Google Drive แล้วเปิดลิงก์จากหน้าต่างส่วนตัวอีกครั้ง |

หาก deployment สำเร็จแต่หน้าแรกยังขึ้น 404 ให้เทียบตำแหน่งของไฟล์ใน branch ที่เลือกกับ publishing source [แนวทางแก้ 404 ของ GitHub](https://docs.github.com/en/pages/getting-started-with-github-pages/troubleshooting-404-errors-for-github-pages-sites)
