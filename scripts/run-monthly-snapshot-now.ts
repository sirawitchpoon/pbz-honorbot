/**
 * Set monthly snapshot to "start of current month" (Bangkok) so the monthly leaderboard
 * shows only points earned this month. Use when the March table was still showing February data.
 *
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/run-monthly-snapshot-now.ts
 *
 * Does: For each user, set honorPointsAtMonthStart = current honorPoints,
 *       lastMonthlySnapshotAt = start of current month (Asia/Bangkok).
 * Effect: Monthly leaderboard will show (honorPoints - honorPointsAtMonthStart) = points this month only.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { resolve } from 'path';
import { User } from '../src/models/User';

dotenv.config({ path: resolve(__dirname, '../.env') });

function getStartOfMonthBangkok(): Date {
  const now = new Date();
  const y = parseInt(now.toLocaleString('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric' }), 10);
  const m = parseInt(now.toLocaleString('en-CA', { timeZone: 'Asia/Bangkok', month: '2-digit' }), 10);
  return new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
}

async function main() {
  const mongoURI = process.env.MONGO_URI;
  if (!mongoURI) {
    console.error('MONGO_URI not set in .env');
    process.exit(1);
  }

  await mongoose.connect(mongoURI);
  console.log('Connected to MongoDB');

  const startOfMonth = getStartOfMonthBangkok();
  console.log('Setting snapshot date to start of current month (Bangkok):', startOfMonth.toISOString());

  const users = await User.find({}).lean();
  let updated = 0;
  for (const u of users) {
    await User.updateOne(
      { userId: u.userId },
      {
        $set: {
          honorPointsAtMonthStart: u.honorPoints ?? 0,
          lastMonthlySnapshotAt: startOfMonth,
        },
      }
    );
    updated++;
  }

  console.log(`Done. Updated ${updated} users. Monthly leaderboard will now show points for this month only.`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
