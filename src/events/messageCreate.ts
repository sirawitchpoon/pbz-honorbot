import { Message, Events } from 'discord.js';
import { User } from '../models/User';
import mongoose from 'mongoose';
import { MONGODB_CONNECTED } from '../utils/connectDB';
import { serviceRegistry } from '../services/ServiceRegistry';
import dotenv from 'dotenv';

dotenv.config();

export const name = Events.MessageCreate;

// Daily limit: 1 message per day, 10 points per message (resets at midnight Thailand time)
const DAILY_MESSAGE_REWARD_LIMIT = 1;
const MESSAGE_REWARD_POINTS = 10;
const CHAT_REWARD_TIMEZONE = 'Asia/Bangkok';

/** Get date key YYYY-MM-DD in Thailand time for day comparison (midnight = new day) */
function getDateKeyBangkok(d: Date): string {
  const y = d.toLocaleString('en-CA', { timeZone: CHAT_REWARD_TIMEZONE, year: 'numeric' });
  const m = d.toLocaleString('en-CA', { timeZone: CHAT_REWARD_TIMEZONE, month: '2-digit' });
  const day = d.toLocaleString('en-CA', { timeZone: CHAT_REWARD_TIMEZONE, day: '2-digit' });
  return `${y}-${m}-${day}`;
}

// Track processed messages to prevent duplicate processing
// This Set stores message IDs that have already been processed
// Messages are removed after 5 minutes to prevent memory leaks
const processedMessages = new Set<string>();

// Clean up old message IDs every 5 minutes
setInterval(() => {
  // The Set will automatically handle cleanup, but we can add logic here if needed
  // For now, we rely on the fact that message IDs are unique and won't be reused
  // We could add a timestamp-based cleanup if needed, but it's not critical
}, 5 * 60 * 1000);

export async function execute(message: Message): Promise<void> {
  // Ignore messages from bots
  if (message.author.bot) {
    return;
  }

  // Ignore messages that are commands (slash commands are handled by interactionCreate, but be safe)
  // Also ignore empty messages
  if (!message.content || message.content.trim().length === 0) {
    return;
  }

  // Prevent duplicate processing of the same message
  // This can happen if the event is fired multiple times or if there's a race condition
  const messageId = message.id;
  if (processedMessages.has(messageId)) {
    console.log(`[Points] Message ${messageId} from ${message.author.username} already processed, skipping`);
    return;
  }

  // Mark message as processed immediately to prevent race conditions
  processedMessages.add(messageId);

  // Check MongoDB connection - silently return if not connected
  if (mongoose.connection.readyState !== MONGODB_CONNECTED) {
    // Remove from processed set if we can't process
    processedMessages.delete(messageId);
    return;
  }

  try {
    // Find user in database or create new if not exists
    let user = await User.findOne({ userId: message.author.id });

    if (!user) {
      user = await User.create({
        userId: message.author.id,
        username: message.author.username,
        honorPoints: 0,
        lastMessageDate: new Date(0), // Set to epoch to allow first message
        dailyPoints: 0,
        lastMessagePointsReset: new Date(), // Initialize reset date
        dailyMessageCount: 0,
        lastDailyReset: new Date(),
        dailyCheckinStreak: 0,
        lastCheckinDate: new Date(0),
      });
    } else {
      // Update username in case it changed
      if (user.username !== message.author.username) {
        user.username = message.author.username;
      }
    }

    const now = new Date();

    // Daily Reset Logic: new day = midnight Thailand (Asia/Bangkok)
    const todayBangkok = getDateKeyBangkok(now);
    const lastResetDate = user.lastMessagePointsReset || new Date(0);
    const lastResetBangkok = getDateKeyBangkok(lastResetDate);

    // Reset daily message count if it's a new day (in Thailand timezone)
    if (todayBangkok > lastResetBangkok) {
      user.dailyMessageCount = 0;
      user.dailyPoints = 0;
      user.lastMessagePointsReset = now;
      console.log(`[Points] Daily message count reset for ${user.username} (new day in ${CHAT_REWARD_TIMEZONE})`);
    }

    // Check if daily reward limit has been reached (1 message per day)
    if (user.dailyMessageCount >= DAILY_MESSAGE_REWARD_LIMIT) {
      // Daily limit reached - ignore (no reaction) to indicate no points are being earned
      return;
    }

    // Cooldown Logic: Check if lastMessageDate was less than 60 seconds ago
    // Skip cooldown check if lastMessageDate is epoch (new user's first message)
    const isNewUserFirstMessage = user.lastMessageDate.getTime() === 0;

    if (!isNewUserFirstMessage) {
      const timeSinceLastMessage = (now.getTime() - user.lastMessageDate.getTime()) / 1000; // Convert to seconds
      const cooldownRemaining = Math.ceil(60 - timeSinceLastMessage);

      if (timeSinceLastMessage < 60) {
        // Cooldown not passed - silently return (no reaction)
        console.log(`[Points] Cooldown active for ${user.username}: ${cooldownRemaining} seconds remaining`);
        return;
      }
    }

    // 10 points per message (1 message per day only)
    const pointsToAdd = MESSAGE_REWARD_POINTS;

    const isNewDay = todayBangkok > lastResetBangkok;
    const username = message.author.username;

    // Atomic update: use findOneAndUpdate + $inc so concurrent message rewards don't overwrite each other
    const updateFilter = { userId: message.author.id };
    const updateDoc = isNewDay
      ? {
          $set: {
            lastMessageDate: now,
            lastMessagePointsReset: now,
            dailyMessageCount: 1,
            dailyPoints: pointsToAdd,
            username,
          },
          $inc: { honorPoints: pointsToAdd },
        }
      : {
          $set: { lastMessageDate: now, username },
          $inc: { honorPoints: pointsToAdd, dailyMessageCount: 1, dailyPoints: pointsToAdd },
        };

    const updated = await User.findOneAndUpdate(updateFilter, updateDoc, {
      new: true,
    });

    if (!updated) {
      console.error('[Points] findOneAndUpdate returned null for', message.author.id);
      processedMessages.delete(messageId);
      return;
    }

    user = updated;

    // Console Log
    console.log(
      `[Points] User ${user.username} (${message.author.id}) gained ${pointsToAdd} points. ` +
      `Daily rewards: ${user.dailyMessageCount}/${DAILY_MESSAGE_REWARD_LIMIT}, Total: ${user.honorPoints}`
    );

    // Update status log
    const statusLogService = serviceRegistry.getStatusLogService();
    if (statusLogService) {
      statusLogService.addLogEntry(
        user.username,
        user.userId,
        pointsToAdd,
        user.dailyMessageCount,
        DAILY_MESSAGE_REWARD_LIMIT,
        'Send message'
      ).catch((error) => {
        console.error('[Points] Error updating status log:', error);
      });
    }

    // Trigger leaderboard update (non-blocking)
    const leaderboardService = serviceRegistry.getLeaderboardService();
    if (leaderboardService) {
      leaderboardService.triggerUpdate().catch((error) => {
        console.error('[Points] Error triggering leaderboard update:', error);
      });
    }

    // No reaction feedback - users should check status via /status command
  } catch (error) {
    console.error('Error processing message for honor points:', error);
    // Remove from processed set on error so it can be retried if needed
    processedMessages.delete(messageId);
  }
}
