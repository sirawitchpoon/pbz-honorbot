/**
 * Restore คะแนนจริง (Honor Points) วันที่ 4 มี.ค. = backup 00:00 น. + แต้มจากแชทใน CSV
 *
 * 1) Restore จาก phantom_backup_2026-03-03.json (สถานะตอน 00:00 น. ไทย วันที่ 4 มี.ค.)
 * 2) บวกแต้มจากไฟล์แชท PBZ | General Chat (EN) - 2026-03-04.csv
 *    กฏ: 5 แต้ม/ข้อความ, จำกัด 1 ครั้งต่อวันต่อคน, นับเฉพาะข้อความหลัง 00:00 น. ไทย (วันที่ 4)
 *
 * รันจากโฟลเดอร์โปรเจกต์ (ที่เดียวกับ docker-compose) — คอนเทนเนอร์ไม่มีโฟลเดอร์ scripts/
 * ถ้า MongoDB อยู่ใน Docker: ใช้ MONGO_URI=mongodb://localhost:27017/honorbot
 *
 *   cd /root/honorbot-pbz
 *   MONGO_URI=mongodb://localhost:27017/honorbot npx ts-node scripts/restore-full-march4.ts
 *
 * หรือใส่ MONGO_URI ใน .env ให้ชี้ไปที่ MongoDB ที่เชื่อมได้จากเครื่องนี้
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as XLSX from 'xlsx';
import { BackupService } from '../src/services/BackupService';
import { User } from '../src/models/User';

dotenv.config({ path: resolve(__dirname, '../.env') });

const BACKUP_PATH = resolve(__dirname, '../database-backups/incoming/phantom_backup_2026-03-03.json');
const CSV_PATH = resolve(__dirname, '../database-backups/incoming/PBZ | General Chat (EN) - 2026-03-04.csv');
const BASE_DATE = '2026-03-04';
// 00:00 น. ไทย วันที่ 4 = 01:00 ในไฟล์ (คอลัมน์เป็น UTC+8)
const AFTER_DATE = new Date('2026-03-04T01:00:00.000+08:00');
const POINTS_PER_MESSAGE = 5;
const MAX_MESSAGES_PER_DAY = 1;

function normalizeMongoExtendedJson(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(normalizeMongoExtendedJson);
  if (typeof obj === 'object' && obj !== null) {
    if ('$date' in obj && Object.keys(obj).length === 1) return obj.$date;
    if ('$oid' in obj && Object.keys(obj).length === 1) return obj.$oid;
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) out[k] = normalizeMongoExtendedJson(v);
    return out;
  }
  return obj;
}

function normalizeHeader(s: string): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseDate(val: unknown, baseDateStr: string): Date | null {
  if (val == null) return null;
  const s = String(val).trim();
  if (!s) return null;
  const timeOnlyMatch = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(s);
  if (timeOnlyMatch) {
    const [, h, m, sec] = timeOnlyMatch;
    const combined = `${baseDateStr}T${h.padStart(2, '0')}:${m}:${sec}`;
    const d = new Date(combined);
    return isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function runRestoreFromBackup(): Promise<void> {
  console.log('[Step 1] Restore from backup:', BACKUP_PATH);
  const raw = readFileSync(BACKUP_PATH, 'utf-8').trim();
  let users: any[] = JSON.parse(raw);
  users = users.map((u) => normalizeMongoExtendedJson(u));
  console.log('  Loaded', users.length, 'user records');
  const result = await BackupService.importDatabase(users);
  console.log('  Result:', result.imported, 'imported,', result.updated, 'updated,', result.errors, 'errors');
}

async function runReplayFromCsv(): Promise<void> {
  console.log('[Step 2] Replay chat points from CSV:', CSV_PATH);
  console.log('  Rules: %d pts/message, max %d message/day, after 00:00 Thai March 4', POINTS_PER_MESSAGE, MAX_MESSAGES_PER_DAY);

  const buf = readFileSync(CSV_PATH);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!data.length) {
    console.log('  CSV empty, skipping replay.');
    return;
  }

  const headers = (data[0] as string[]).map((h) => String(h ?? ''));
  const rows = data.slice(1) as unknown[][];
  const colByPattern = (patterns: RegExp[]): number =>
    headers.findIndex((h) => patterns.some((p) => p.test(normalizeHeader(h))));
  const dateCol = colByPattern([/timestamp/, /date/, /time/, /created/, /posted/]);
  const authorCol = colByPattern([/^user$/i, /author/, /username/, /name/, /member/]);
  if (dateCol < 0 || authorCol < 0) {
    console.error('  Missing Date or User column. Headers:', headers);
    return;
  }

  const dailyCounts = new Map<string, number>();
  for (const row of rows) {
    const date = parseDate(row[dateCol], BASE_DATE);
    if (!date || date < AFTER_DATE) continue;
    const author = row[authorCol] != null ? String(row[authorCol]).trim() : '';
    if (!author) continue;
    const authorKey = `name:${author.toLowerCase()}`;
    const key = `${toDateKey(date)}|${authorKey}`;
    const prev = dailyCounts.get(key) ?? 0;
    if (prev < MAX_MESSAGES_PER_DAY) dailyCounts.set(key, prev + 1);
  }

  const userPoints = new Map<string, number>();
  for (const [key, count] of dailyCounts) {
    const authorKey = key.split('|')[1];
    const points = count * POINTS_PER_MESSAGE;
    userPoints.set(authorKey, (userPoints.get(authorKey) ?? 0) + points);
  }

  console.log('  Users to add points:', userPoints.size);
  const dbUsers = await User.find({}).lean();
  const byUsername = new Map(dbUsers.map((u) => [u.username.trim().toLowerCase(), u]));

  let updated = 0;
  for (const [authorKey, addPoints] of userPoints) {
    const username = authorKey.startsWith('name:') ? authorKey.slice(5) : authorKey;
    const user = byUsername.get(username);
    if (!user) continue;
    await User.updateOne({ userId: user.userId }, { $inc: { honorPoints: addPoints } });
    updated++;
    console.log('  +%d pts → %s', addPoints, user.username);
  }
  console.log('  Done. Updated %d users with chat points.', updated);
}

async function main() {
  const mongoURI = process.env.MONGO_URI;
  if (!mongoURI) {
    console.error('MONGO_URI not set. Example: MONGO_URI=mongodb://localhost:27017/honorbot npx ts-node scripts/restore-full-march4.ts');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoURI);
  try {
    await runRestoreFromBackup();
    await runReplayFromCsv();
    console.log('\nRestore complete. คะแนนจริง = backup 00:00 น. + แต้มจากแชทวันที่ 4 มี.ค.');
  } finally {
    await mongoose.disconnect();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
