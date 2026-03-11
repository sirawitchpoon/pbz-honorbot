import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  userId: string;
  username: string;
  honorPoints: number;
  lastMessageDate: Date;
  dailyPoints: number; // Daily points earned from messages
  lastMessagePointsReset: Date; // Last time message points were reset (daily)
  dailyMessageCount: number; // Number of times user earned points from messages today
  lastDailyReset: Date; // Last time daily check-in was used
  dailyCheckinStreak: number;
  lastCheckinDate: Date;
  dailyLuckyDrawCount: number; // Number of lucky draw plays today
  lastLuckyDrawDate: Date; // Last date when lucky draw was played
  /** Snapshot of honorPoints at start of month - for monthly leaderboard. NEVER modifies honorPoints. */
  honorPointsAtMonthStart: number;
  lastMonthlySnapshotAt: Date; // Last time we saved the snapshot (start of month)
  createdAt?: Date; // Added by mongoose timestamps
  updatedAt?: Date; // Added by mongoose timestamps
}

const UserSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
    },
    honorPoints: {
      type: Number,
      default: 0,
    },
    lastMessageDate: {
      type: Date,
      default: Date.now,
    },
    dailyPoints: {
      type: Number,
      default: 0,
    },
    lastMessagePointsReset: {
      type: Date,
      default: Date.now,
    },
    dailyMessageCount: {
      type: Number,
      default: 0,
    },
    lastDailyReset: {
      type: Date,
      default: Date.now,
    },
    dailyCheckinStreak: {
      type: Number,
      default: 0,
    },
    lastCheckinDate: {
      type: Date,
      default: new Date(0), // Set to epoch so first check-in is treated as day 1
    },
    dailyLuckyDrawCount: {
      type: Number,
      default: 0,
    },
    lastLuckyDrawDate: {
      type: Date,
      default: new Date(0), // Set to epoch to allow first play
    },
    // Monthly leaderboard: snapshot at start of month. honorPoints is NEVER decreased.
    honorPointsAtMonthStart: {
      type: Number,
      default: 0,
    },
    lastMonthlySnapshotAt: {
      type: Date,
      default: new Date(0),
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  }
);

export const User = mongoose.model<IUser>('User', UserSchema);
