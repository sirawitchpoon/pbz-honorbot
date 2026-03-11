/**
 * Set monthly snapshot baseline from a backup file so "March 2026" table shows
 * points earned since that backup (e.g. March 1 replay + any March activity).
 * Use when you have a backup from end of Feb / start of March.
 *
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/set-monthly-snapshot-from-backup.ts [path-to-backup.json]
 * Default: database-backups/incoming/phantom_backup_2026-02-28 (1).json
 *
 * For each user in backup: honorPointsAtMonthStart = backup.honorPoints, lastMonthlySnapshotAt = 2026-03-01.
 * For users not in backup: honorPointsAtMonthStart = current honorPoints (so monthly = 0).
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { User } from '../src/models/User';

dotenv.config({ path: resolve(__dirname, '../.env') });

const START_OF_MARCH = new Date(Date.UTC(2026, 2, 1, 0, 0, 0, 0)); // 2026-03-01

async function main() {
  const backupPath = process.argv[2] || resolve(__dirname, '../database-backups/incoming/phantom_backup_2026-02-28 (1).json');
  console.log('Using backup:', backupPath);

  const raw = readFileSync(backupPath, 'utf-8').trim();
  const usersBackup = JSON.parse(raw);
  if (!Array.isArray(usersBackup)) {
    console.error('Backup must be a JSON array');
    process.exit(1);
  }

  const mongoURI = process.env.MONGO_URI;
  if (!mongoURI) {
    console.error('MONGO_URI not set');
    process.exit(1);
  }

  await mongoose.connect(mongoURI);
  console.log('Connected to MongoDB');

  const byUserId = new Map(usersBackup.map((u: any) => [u.userId, u]));
  const dbUsers = await User.find({}).lean();
  let fromBackup = 0;
  let notInBackup = 0;

  for (const u of dbUsers) {
    const backupUser = byUserId.get(u.userId);
    const baseline = backupUser != null && typeof backupUser.honorPoints === 'number'
      ? backupUser.honorPoints
      : (u.honorPoints ?? 0);
    if (backupUser != null) fromBackup++;
    else notInBackup++;

    await User.updateOne(
      { userId: u.userId },
      {
        $set: {
          honorPointsAtMonthStart: baseline,
          lastMonthlySnapshotAt: START_OF_MARCH,
        },
      }
    );
  }

  console.log(`Done. Set snapshot from backup: ${fromBackup} users (baseline from file), ${notInBackup} users (current = baseline).`);
  console.log('March 2026 table will show points earned since start of March.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
