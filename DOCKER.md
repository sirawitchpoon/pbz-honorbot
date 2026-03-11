# 🐳 Docker Deployment Guide

คู่มือการรัน HonorBot PBZ ด้วย Docker

## 📋 Prerequisites

- Docker และ Docker Compose ติดตั้งแล้ว
- `.env` file ตั้งค่าเรียบร้อยแล้ว

## 🚀 Quick Start

### วิธีที่ 1: ใช้ Script (แนะนำ)

```bash
./docker-start.sh
```

Script นี้จะ:
- ตรวจสอบและอัปเดต `MONGO_URI` ให้ใช้ Docker service name
- Build Docker images
- Start services ทั้ง MongoDB และ Bot
- แสดงสถานะ containers

### วิธีที่ 2: ใช้คำสั่ง Docker Compose โดยตรง

#### 1. อัปเดต `.env` file

ตรวจสอบว่า `MONGO_URI` ใน `.env` เป็น:
```env
MONGO_URI=mongodb://mongodb:27017/honorbot
```

**สำคัญ:** ใช้ `mongodb` (ชื่อ service ใน docker-compose) ไม่ใช่ `localhost` หรือ `127.0.0.1`

#### 2. Build และ Start Services

```bash
# Build images
docker-compose build

# Start services (detached mode)
docker-compose up -d
```

#### 3. ตรวจสอบสถานะ

```bash
# ดูสถานะ containers
docker-compose ps

# ดู logs ทั้งหมด
docker-compose logs -f

# ดู logs ของ bot เท่านั้น
docker-compose logs -f app

# ดู logs ของ MongoDB เท่านั้น
docker-compose logs -f mongodb
```

#### 4. Deploy Discord Commands

```bash
# Deploy commands จากภายใน container
docker-compose exec app npm run deploy:prod
```

## 📝 คำสั่ง Docker ที่ใช้บ่อย

### เริ่ม Services
```bash
docker-compose up -d
```

### หยุด Services
```bash
docker-compose down
```

### หยุดและลบ Volumes (⚠️ จะลบข้อมูลใน database)
```bash
docker-compose down -v
```

### Restart Services
```bash
docker-compose restart
```

### Rebuild และ Start
```bash
docker-compose up --build -d
```

### ดู Logs
```bash
# Logs ทั้งหมด
docker-compose logs -f

# Logs ของ bot
docker-compose logs -f app

# Logs ของ MongoDB
docker-compose logs -f mongodb

# Logs 50 บรรทัดล่าสุด
docker-compose logs --tail=50 app
```

### เข้าไปใน Container
```bash
# เข้าไปใน bot container
docker-compose exec app sh

# เข้าไปใน MongoDB container
docker-compose exec mongodb mongosh
```

### Execute Commands ใน Container
```bash
# Deploy Discord commands
docker-compose exec app npm run deploy:prod

# Clear Discord commands
docker-compose exec app npm run clear-commands
```

## 🔧 Troubleshooting

### MongoDB ไม่เชื่อมต่อ

1. ตรวจสอบว่า MongoDB container รันอยู่:
   ```bash
   docker-compose ps mongodb
   ```

2. ตรวจสอบ logs:
   ```bash
   docker-compose logs mongodb
   ```

3. ทดสอบ connection จาก bot container:
   ```bash
   docker-compose exec app sh
   # จากนั้นใน container
   ping mongodb
   ```

### Bot ไม่ start

1. ตรวจสอบ logs:
   ```bash
   docker-compose logs app
   ```

2. ตรวจสอบ `.env` file:
   - `DISCORD_TOKEN` ถูกต้องหรือไม่
   - `MONGO_URI=mongodb://mongodb:27017/honorbot`

3. Rebuild image:
   ```bash
   docker-compose build --no-cache app
   docker-compose up -d app
   ```

### Port ถูกใช้งานแล้ว

ถ้า port 27017 หรือ 3000 ถูกใช้งานแล้ว:

1. หยุด services อื่นที่ใช้ port เดียวกัน
2. หรือเปลี่ยน port ใน `docker-compose.yml`:
   ```yaml
   ports:
     - "27018:27017"  # เปลี่ยน external port
   ```

## 📊 Monitoring

### ดู Resource Usage
```bash
docker stats
```

### ดู Container Details
```bash
docker inspect honorbot-app
docker inspect honorbot-mongodb
```

## 🔄 Update Bot

เมื่อมีการอัปเดตโค้ด:

```bash
# Rebuild และ restart
docker-compose up --build -d

# หรือ rebuild เฉพาะ app
docker-compose build app
docker-compose up -d app
```

## 🗑️ Clean Up

### ลบ Containers และ Networks
```bash
docker-compose down
```

### ลบ Containers, Networks และ Volumes (⚠️ ลบข้อมูล)
```bash
docker-compose down -v
```

### ลบ Images
```bash
docker-compose down --rmi all
```

## 📚 Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [MongoDB Docker Image](https://hub.docker.com/_/mongo)
