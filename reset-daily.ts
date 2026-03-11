import dotenv from 'dotenv';
import { connectDB } from './src/utils/connectDB';
import { User } from './src/models/User';

dotenv.config();

async function resetDaily(userId?: string) {
  try {
    await connectDB();
    console.log('Connected to MongoDB');

    if (userId) {
      // Reset specific user
      const user = await User.findOne({ userId });
      if (!user) {
        console.log(`User ${userId} not found`);
        process.exit(1);
      }
      
      console.log(`Before reset: lastDailyReset = ${user.lastDailyReset}`);
      user.lastDailyReset = new Date(0); // Set to epoch
      await user.save();
      console.log(`✓ Reset daily claim for user ${userId} (${user.username})`);
    } else {
      // Reset all users
      const result = await User.updateMany(
        {},
        { $set: { lastDailyReset: new Date(0) } }
      );
      console.log(`✓ Reset daily claim for ${result.modifiedCount} users`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

const userId = process.argv[2];
resetDaily(userId);
