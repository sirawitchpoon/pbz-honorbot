/**
 * Migration: Set honorPointsAtMonthStart for monthly leaderboard
 *
 * SAFETY: This script NEVER modifies honorPoints. It only adds/updates:
 *   - honorPointsAtMonthStart = current honorPoints (so monthly points start at 0)
 *   - lastMonthlySnapshotAt = start of current month
 *
 * Run once before enabling monthly leaderboard:
 *   npx ts-node migrate-monthly-snapshot.ts
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { User } from './src/models/User';

dotenv.config();

async function migrate() {
  try {
    const mongoURI = process.env.MONGO_URI;
    if (!mongoURI) {
      console.error('❌ MONGO_URI not defined in .env');
      process.exit(1);
    }

    await mongoose.connect(mongoURI);
    console.log('✓ Connected to MongoDB');

    const users = await User.find({}).lean();
    console.log(`Found ${users.length} users`);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    let updated = 0;
    for (const u of users) {
      // ONLY update snapshot fields. honorPoints is NEVER touched.
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

    console.log(`✓ Updated ${updated} users with monthly snapshot`);
    console.log('  honorPoints was NOT modified - all user points are preserved.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

migrate();
