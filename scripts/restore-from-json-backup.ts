/**
 * Restore Honor Points (and other user data) from database-backups/users_export.json
 *
 * Use when:
 * - Honor points were lost (e.g. after /reset database or DB restore)
 * - You have a JSON backup (NDJSON or array format) with the correct points
 *
 * Run: npx ts-node scripts/restore-from-json-backup.ts [path-to-backup.json]
 * Default path: database-backups/users_export.json
 *
 * MongoDB extended JSON ($date, $oid) in the file is normalized before import.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { BackupService } from '../src/services/BackupService';

dotenv.config({ path: resolve(__dirname, '../.env') });

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

async function main() {
  const backupPath = process.argv[2] || resolve(__dirname, '../database-backups/users_export.json');
  console.log('Using backup file:', backupPath);
  // #region agent log
  try {
    const path = require('path');
    const logPath = process.env.LOG_DIR ? path.join(process.env.LOG_DIR, 'debug-62e255.log') : path.resolve(process.cwd(), 'debug-62e255.log');
    const line = JSON.stringify({ sessionId: '62e255', hypothesisId: 'H2', location: 'restore-from-json-backup.ts:main', message: 'restore script started', data: { backupPath }, timestamp: Date.now() }) + '\n';
    require('fs').appendFileSync(logPath, line);
  } catch (_) {}
  // #endregion

  const raw = readFileSync(backupPath, 'utf-8').trim();
  let users: any[];

  if (raw.startsWith('[')) {
    users = JSON.parse(raw);
  } else {
    users = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  users = users.map((u) => normalizeMongoExtendedJson(u));
  console.log('Loaded', users.length, 'user records');

  const mongoURI = process.env.MONGO_URI;
  if (!mongoURI) {
    console.error('MONGO_URI not set in .env');
    process.exit(1);
  }

  await mongoose.connect(mongoURI);
  console.log('Connected to MongoDB');

  const result = await BackupService.importDatabase(users);
  console.log('Restore result:', result);

  await mongoose.disconnect();
  console.log('Done. Honor points and other fields have been restored from backup.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
