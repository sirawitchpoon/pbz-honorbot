/**
 * Replay Discord chat export (Excel/CSV) to add message-based Honor Points
 *
 * Rules (same as bot):
 * - Max 5 messages per day count for points
 * - Points per message: 2 (average of 1–5 weighted distribution)
 * - Skips bots and empty messages
 *
 * Expected columns (case-insensitive, any of these names):
 * - Date: "Date", "Timestamp", "Time", "Created"
 * - Author: "Author", "Username", "User", "Name"
 * - Optional Author ID: "Author ID", "User ID", "UserId" → matches DB userId
 *
 * Run: npx ts-node scripts/replay-chat-export-to-points.ts <path-to-export.xlsx|.csv> [--after-date=ISO_DATE] [--base-date=YYYY-MM-DD]
 * Example: npx ts-node scripts/replay-chat-export-to-points.ts "/path/to/export.xlsx"
 * Example (only messages on or after 7:22 AM Thailand): npx ts-node scripts/replay-chat-export-to-points.ts "/path/to/export.xlsx" --after-date=2026-02-28T00:22:00
 * Example (CSV with time-only column, e.g. "0:08:02" = March 1): npx ts-node scripts/replay-chat-export-to-points.ts "export-2026-03-01.csv" --base-date=2026-03-01
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { User } from '../src/models/User';

dotenv.config({ path: resolve(__dirname, '../.env') });

let MAX_MESSAGES_PER_DAY = 5;
// Default 2 (legacy); override with --points-per-message=1 for recovery
let POINTS_PER_MESSAGE = 2;

function normalizeHeader(s: string): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseDate(val: unknown, baseDateStr: string | null): Date | null {
  if (val == null) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return new Date(d.y, d.m - 1, d.d);
    return new Date((val - 25569) * 86400 * 1000);
  }
  const s = String(val).trim();
  if (!s) return null;
  // Time-only (e.g. "0:08:02" or "12:34:56") with optional base date (e.g. "2026-03-01")
  const timeOnlyMatch = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(s);
  if (timeOnlyMatch && baseDateStr) {
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

function parseArgs(): { filePath: string; afterDate: Date | null; baseDate: string | null; pointsPerMessage: number; maxMessagesPerDay: number } {
  const args = process.argv.slice(2);
  let filePath = '';
  let afterDate: Date | null = null;
  let baseDate: string | null = null;
  let pointsPerMessage = 2;
  let maxMessagesPerDay = 5;
  for (const arg of args) {
    if (arg.startsWith('--after-date=')) {
      const val = arg.slice('--after-date='.length).trim();
      if (val) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) afterDate = d;
      }
    } else if (arg.startsWith('--base-date=')) {
      const val = arg.slice('--base-date='.length).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) baseDate = val;
    } else if (arg.startsWith('--points-per-message=')) {
      const val = parseInt(arg.slice('--points-per-message='.length).trim(), 10);
      if (Number.isInteger(val) && val >= 1 && val <= 10) pointsPerMessage = val;
    } else if (arg.startsWith('--max-messages-per-day=')) {
      const val = parseInt(arg.slice('--max-messages-per-day='.length).trim(), 10);
      if (Number.isInteger(val) && val >= 1 && val <= 100) maxMessagesPerDay = val;
    } else if (!filePath) {
      filePath = arg;
    }
  }
  return { filePath, afterDate, baseDate, pointsPerMessage, maxMessagesPerDay };
}

async function main() {
  const { filePath, afterDate, baseDate, pointsPerMessage, maxMessagesPerDay } = parseArgs();
  POINTS_PER_MESSAGE = pointsPerMessage;
  MAX_MESSAGES_PER_DAY = maxMessagesPerDay;
  if (!filePath) {
    console.error('Usage: npx ts-node scripts/replay-chat-export-to-points.ts <path-to-export.xlsx|.csv> [--after-date=ISO_DATE] [--base-date=YYYY-MM-DD] [--points-per-message=1] [--max-messages-per-day=1]');
    process.exit(1);
  }
  if (afterDate) {
    console.log('Filter: only messages on or after', afterDate.toISOString());
  }
  if (baseDate) {
    console.log('Base date for time-only column:', baseDate);
  }
  console.log('Points per message (capped at', MAX_MESSAGES_PER_DAY, 'per day):', POINTS_PER_MESSAGE);

  console.log('Reading:', filePath);
  const buf = readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false, raw: true });
  const firstSheet = wb.SheetNames[0];
  const ws = wb.Sheets[firstSheet];
  const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  if (!data.length) {
    console.error('Sheet is empty');
    process.exit(1);
  }

  const headers = (data[0] as string[]).map((h) => String(h ?? ''));
  const rows = data.slice(1) as unknown[][];

  const colIndex = (names: string[]) => {
    const normalized = names.map(normalizeHeader);
    const i = headers.findIndex((h) => normalized.includes(normalizeHeader(h)));
    return i >= 0 ? i : -1;
  };
  const colIndexPartial = (patterns: RegExp[]) => {
    const i = headers.findIndex((h) => patterns.some((p) => p.test(normalizeHeader(h))));
    return i >= 0 ? i : -1;
  };

  const dateCol =
    colIndex(['Date', 'Timestamp', 'Time', 'Created', 'Posted']) >= 0
      ? colIndex(['Date', 'Timestamp', 'Time', 'Created', 'Posted'])
      : colIndexPartial([/timestamp/, /date/, /time/, /created/, /posted/]);
  const authorCol =
    colIndex(['Author', 'Username', 'User', 'Name', 'Member']) >= 0
      ? colIndex(['Author', 'Username', 'User', 'Name', 'Member'])
      : colIndexPartial([/author/, /username/, /^user$/i, /name/, /member/]);
  const authorIdCol = colIndex(['Author ID', 'User ID', 'UserId', 'Author Id']);

  if (dateCol < 0 || authorCol < 0) {
    console.error('Could not find Date and Author columns. Headers:', headers);
    process.exit(1);
  }

  // (dateKey, authorKey) -> message count (capped at MAX_MESSAGES_PER_DAY)
  const dailyCounts = new Map<string, number>();

  for (const row of rows) {
    const dateVal = row[dateCol];
    const date = parseDate(dateVal, baseDate);
    if (!date) continue;
    if (afterDate && date < afterDate) continue;

    let authorKey: string;
    const authorIdVal = authorIdCol >= 0 ? row[authorIdCol] : undefined;
    const authorVal = row[authorCol];
    if (authorIdVal != null && String(authorIdVal).trim()) {
      authorKey = `id:${String(authorIdVal).trim()}`;
    } else if (authorVal != null && String(authorVal).trim()) {
      authorKey = `name:${String(authorVal).trim().toLowerCase()}`;
    } else {
      continue;
    }

    const key = `${toDateKey(date)}|${authorKey}`;
    const prev = dailyCounts.get(key) ?? 0;
    if (prev < MAX_MESSAGES_PER_DAY) dailyCounts.set(key, prev + 1);
  }

  // Sum points per user (authorKey -> total points)
  const userPoints = new Map<string, number>();
  for (const [key, count] of dailyCounts) {
    const [, authorKey] = key.split('|');
    const points = count * POINTS_PER_MESSAGE;
    userPoints.set(authorKey, (userPoints.get(authorKey) ?? 0) + points);
  }

  console.log('Users with message points:', userPoints.size);
  if (userPoints.size === 0) {
    console.log('No messages to apply. Exiting.');
    process.exit(0);
  }

  const mongoURI = process.env.MONGO_URI;
  if (!mongoURI) {
    console.error('MONGO_URI not set in .env');
    process.exit(1);
  }

  await mongoose.connect(mongoURI);
  console.log('Connected to MongoDB');

  const dbUsers = await User.find({}).lean();
  const byUserId = new Map(dbUsers.map((u) => [u.userId, u]));
  const byUsername = new Map(dbUsers.map((u) => [u.username.trim().toLowerCase(), u]));

  let updated = 0;
  let skipped = 0;

  for (const [authorKey, addPoints] of userPoints) {
    let user: { userId: string; honorPoints: number } | undefined;
    if (authorKey.startsWith('id:')) {
      const userId = authorKey.slice(3);
      user = byUserId.get(userId);
    } else {
      const name = authorKey.slice(5);
      user = byUsername.get(name);
    }

    if (!user) {
      skipped++;
      continue;
    }

    await User.updateOne(
      { userId: user.userId },
      { $inc: { honorPoints: addPoints } }
    );
    updated++;
    console.log(`  +${addPoints} pts → ${user.userId} (total +${addPoints})`);
  }

  console.log(`Done. Updated ${updated} users, skipped ${skipped} (no matching user in DB).`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
