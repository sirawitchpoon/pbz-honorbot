# 📋 คู่มือเชิญบอท HonorBot PBZ

## 🔗 ลิงก์เชิญบอท

```
https://discord.com/api/oauth2/authorize?client_id=1463909626792775680&permissions=125952&scope=bot%20applications.commands
```

หรือรันคำสั่งนี้เพื่อสร้างลิงก์ใหม่:
```bash
bash generate-invite-link.sh
```

---

## ✅ Permissions ที่ต้องติ๊ก (สำคัญมาก!)

เมื่อเชิญบอท Discord จะแสดงหน้าต่างให้เลือก permissions ต้องติ๊ก permissions ต่อไปนี้:

### 📌 Permissions หลัก (ต้องมี)

1. ✅ **View Channels** (1024)
   - บอทต้องดูช่องต่างๆ ได้

2. ✅ **Send Messages** (2048)
   - บอทต้องส่งข้อความได้

3. ✅ **Manage Messages** (8192)
   - บอทต้องแก้ไขข้อความได้ (สำหรับอัปเดต button messages)

4. ✅ **Read Message History** (65536)
   - บอทต้องอ่านประวัติข้อความได้

5. ✅ **Embed Links** (16384)
   - บอทต้องส่ง embed messages ได้ (สำหรับแสดงข้อมูลแบบสวยงาม)

6. ✅ **Attach Files** (32768)
   - บอทต้องแนบไฟล์ได้ (สำหรับส่ง backup files)

### 🔧 Bot Permissions (อัตโนมัติ)

- ✅ **Use Slash Commands** (applications.commands)
  - สำหรับใช้ slash commands (admin commands)

---

## 📝 ขั้นตอนการเชิญบอท

### วิธีที่ 1: ใช้ลิงก์โดยตรง

1. **คัดลอกลิงก์** ด้านบน
2. **เปิดในเบราว์เซอร์** (Chrome, Firefox, Edge, etc.)
3. **เลือกเซิร์ฟเวอร์** ที่ต้องการเชิญบอท
4. **ตรวจสอบ Permissions** ที่แสดง:
   - ✅ View Channels
   - ✅ Send Messages
   - ✅ Manage Messages
   - ✅ Read Message History
   - ✅ Embed Links
   - ✅ Attach Files
5. **คลิก "Authorize"** เพื่อเชิญบอท

### วิธีที่ 2: สร้างลิงก์ใหม่

```bash
cd /root/honorbot-pbz
bash generate-invite-link.sh
```

---

## ⚠️ สิ่งที่ต้องทำหลังเชิญบอท

### 1. ตรวจสอบ Permissions ในแต่ละ Channel

บอทต้องมี permissions ใน channels เหล่านี้:

- ✅ **Daily Check-in Channel** (`DAILYCHECKING_CHANNEL_ID`)
  - View Channel
  - Send Messages
  - Manage Messages

- ✅ **Profile Channel** (`PROFILE_CHANNEL_ID` หรือ `HALL_CHANNEL_ID`)
  - View Channel
  - Send Messages
  - Manage Messages

- ✅ **Status Channel** (`STATUS_CHANNEL_ID`)
  - View Channel
  - Send Messages
  - Manage Messages

- ✅ **Tasks Channel** (`TASKS_CHANNEL_ID`)
  - View Channel
  - Send Messages

- ✅ **Gamble Channel** (`COIN_FLIP_CHANNEL_ID`)
  - View Channel
  - Send Messages
  - Manage Messages

- ✅ **Lucky Draw Channel** (`LUCKYDRAW_CHANNEL_ID`) - ถ้ามี
  - View Channel
  - Send Messages
  - Manage Messages

- ✅ **Leaderboard Channel** (`LEADERBOARD_CHANNEL_ID`)
  - View Channel
  - Send Messages
  - Manage Messages

- ✅ **Instruction Channel** (`MANUAL_CHANNEL_ID`)
  - View Channel
  - Send Messages
  - Manage Messages

### 2. วิธีตั้งค่า Permissions ใน Channel

#### วิธีที่ 1: ตั้งค่า Role Permissions (แนะนำ)

1. ไปที่ **Server Settings** → **Roles**
2. หา role ของบอท (ชื่อบอท)
3. ไปที่ **Permissions**
4. ติ๊ก permissions ที่ต้องการ:
   - ✅ View Channels
   - ✅ Send Messages
   - ✅ Manage Messages
   - ✅ Read Message History
   - ✅ Embed Links
   - ✅ Attach Files

#### วิธีที่ 2: ตั้งค่า Channel-Specific Permissions

1. **คลิกขวาที่ Channel** → **Edit Channel**
2. ไปที่ **Permissions** tab
3. คลิก **Add Role or Member** → เลือกบอท
4. ติ๊ก permissions:
   - ✅ View Channel
   - ✅ Send Messages
   - ✅ Manage Messages
   - ✅ Read Message History

### 3. Restart Bot Container

หลังจากเชิญบอทและตั้งค่า permissions แล้ว:

```bash
cd /root/honorbot-pbz
docker-compose restart app
```

หรือถ้าต้องการดู logs:

```bash
docker-compose logs -f app
```

---

## 🔍 ตรวจสอบว่าเชิญบอทสำเร็จ

### 1. ตรวจสอบใน Discord

- บอทจะปรากฏใน **Member List** (ด้านขวา)
- สถานะจะเป็น **Online** (สีเขียว) หรือ **Idle** (สีเหลือง)

### 2. ตรวจสอบ Logs

```bash
docker-compose logs -f app
```

ควรเห็นข้อความ:
```
✅ Bot is ready!
✅ Logged in as: HonorBot PBZ#1234
```

### 3. ทดสอบการทำงาน

- ไปที่ **Daily Check-in Channel** → ควรเห็น button "🧘 Daily Check-in"
- ไปที่ **Profile Channel** → ควรเห็น button "🪪 View Profile"
- ไปที่ **Status Channel** → ควรเห็น button "📊 Check Status"
- ไปที่ **Gamble Channel** → ควรเห็น button "🎰 Coin Flip Game"

---

## ❌ ปัญหาที่พบบ่อย

### ปัญหา: บอทไม่ตอบสนอง

**แก้ไข:**
1. ตรวจสอบว่า bot container ทำงานอยู่:
   ```bash
   docker-compose ps
   ```
2. ตรวจสอบ logs:
   ```bash
   docker-compose logs app
   ```
3. ตรวจสอบ permissions ใน channels

### ปัญหา: Buttons ไม่ปรากฏ

**แก้ไข:**
1. ตรวจสอบ channel IDs ใน `.env` ว่าถูกต้อง
2. ตรวจสอบ permissions ใน channel นั้นๆ
3. Restart bot:
   ```bash
   docker-compose restart app
   ```

### ปัญหา: บอทไม่สามารถส่งข้อความได้

**แก้ไข:**
1. ตรวจสอบว่า bot มี **Send Messages** permission
2. ตรวจสอบว่า channel ไม่ได้ซ่อน (hidden) จาก bot
3. ตรวจสอบว่า bot role ไม่ได้ถูก mute

---

## 📞 สรุป Quick Reference

### Permissions ที่ต้องติ๊ก:
- ✅ View Channels
- ✅ Send Messages
- ✅ Manage Messages
- ✅ Read Message History
- ✅ Embed Links
- ✅ Attach Files

### ลิงก์เชิญ:
```
https://discord.com/api/oauth2/authorize?client_id=1463909626792775680&permissions=125952&scope=bot%20applications.commands
```

### หลังเชิญ:
1. ตั้งค่า permissions ในแต่ละ channel
2. Restart bot container
3. ทดสอบการทำงาน

---

**หมายเหตุ:** ถ้าบอทถูกเชิญไปแล้วแต่ต้องการ permissions เพิ่มเติม ให้ใช้ลิงก์เชิญใหม่และเลือก permissions ที่ต้องการ
