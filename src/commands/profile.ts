import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { User } from '../models/User';
import mongoose from 'mongoose';
import { MONGODB_CONNECTED, MONGODB_DISCONNECTED } from '../utils/connectDB';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('View your honor points profile and ranking');

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.deferred) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  try {
    // Check MongoDB connection - try to reconnect if disconnected
    const connectionState = mongoose.connection.readyState;
    
    if (connectionState !== MONGODB_CONNECTED) {
      // If disconnected, try to reconnect once
      if (connectionState === MONGODB_DISCONNECTED) {
        const { connectDB } = await import('../utils/connectDB');
        try {
          await connectDB();
          // Wait a bit for connection to establish
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (reconnectError) {
          // Reconnection failed
        }
      }
      
      // Check again after reconnection attempt
      if (mongoose.connection.readyState !== MONGODB_CONNECTED) {
        await interaction.editReply({
          content: '❌ Database connection is not available. Please ensure MongoDB is running and try again later.',
        });
        return;
      }
    }

    // Feature Flag: Read ENABLE_STREAK from environment (defaults to true if not set)
    const enableStreak = process.env.ENABLE_STREAK === undefined || process.env.ENABLE_STREAK?.toLowerCase() === 'true';

    // Fetch or create user from DB
    // Use findOneAndUpdate with no-op to force fresh read from database
    // This bypasses any Mongoose query caching and ensures we get the latest data
    let user = await User.findOneAndUpdate(
      { userId: interaction.user.id },
      { $setOnInsert: {} }, // No-op update that doesn't change anything (only sets on insert, which won't happen)
      { 
        new: true, // Return updated document
        upsert: false, // Don't create if not exists (we handle that below)
        lean: true, // Return plain object (no Mongoose document caching)
        runValidators: false, // Skip validation for no-op
      }
    );
    
    // Debug log to verify we're getting fresh data
    if (user) {
      console.log(`[Profile] Fetched user ${user.username} (${user.userId}): ${user.honorPoints} points, ${user.dailyMessageCount} messages today`);
    }

    if (!user) {
      // User doesn't exist - create default profile
      const newUser = await User.create({
        userId: interaction.user.id,
        username: interaction.user.username,
        honorPoints: 0,
        lastMessageDate: new Date(),
        dailyPoints: 0,
        lastDailyReset: new Date(0),
        dailyCheckinStreak: 0,
        lastCheckinDate: new Date(0),
      });
      // Convert to plain object for consistency (use type assertion)
      user = newUser.toObject() as any;

      // Build fields array conditionally
      const fields = [
        { name: 'Honor Points', value: '0', inline: true },
        { name: 'Global Rank', value: 'Unranked', inline: true },
      ];

      // Only add Daily Streak field if streak system is enabled
      if (enableStreak) {
        fields.splice(1, 0, { name: 'Daily Streak', value: '0 days', inline: true });
      }

      fields.push({
        name: 'Join Date',
        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
        inline: false,
      });

      // Set footer message based on streak system status for new users
      const newUserFooterText = enableStreak
        ? 'Start sending messages or use /daily to begin your journey!'
        : 'Daily streak system is currently disabled. Start sending messages or use /daily to begin your journey!';

      const embed = new EmbedBuilder()
        .setColor(0x8b0000)
        .setTitle('🪪 Wanderer Identity')
        .setDescription('Welcome, new wanderer! You have been registered in the Hall of Fame.')
        .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
        .addFields(fields)
        .setFooter({
          text: newUserFooterText,
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Update username if it changed (need to fetch as document for saving)
    if (user.username !== interaction.user.username) {
      const userDoc = await User.findOne({ userId: interaction.user.id });
      if (userDoc) {
        userDoc.username = interaction.user.username;
        await userDoc.save();
        // Update local user object
        user.username = interaction.user.username;
      }
    }

    // Calculate rank: count users with more honorPoints
    const rank = (await User.countDocuments({
      honorPoints: { $gt: user.honorPoints },
    })) + 1;

    // Get join date (prefer createdAt from mongoose timestamps, fallback to lastMessageDate)
    const joinDate = user.createdAt || user.lastMessageDate || new Date();

    // Get user avatar
    const avatarUrl = interaction.user.displayAvatarURL({ size: 256 });

    // Daily message stats: "new day" = midnight Thailand (Asia/Bangkok), same as messageCreate
    const now = new Date();
    const tz = 'Asia/Bangkok';
    const todayBk = `${now.toLocaleString('en-CA', { timeZone: tz, year: 'numeric' })}-${now.toLocaleString('en-CA', { timeZone: tz, month: '2-digit' })}-${now.toLocaleString('en-CA', { timeZone: tz, day: '2-digit' })}`;
    const lastResetDate = user.lastMessagePointsReset || new Date(0);
    const lastBk = `${lastResetDate.toLocaleString('en-CA', { timeZone: tz, year: 'numeric' })}-${lastResetDate.toLocaleString('en-CA', { timeZone: tz, month: '2-digit' })}-${lastResetDate.toLocaleString('en-CA', { timeZone: tz, day: '2-digit' })}`;
    const isNewDayMsg = todayBk > lastBk;
    const DAILY_MESSAGE_REWARD_LIMIT = 1; // 10 pts, 1 msg/day, reset midnight Thailand
    const currentDailyMessageCount = isNewDayMsg ? 0 : user.dailyMessageCount;

    // Calculate daily check-in status (using UTC like in daily.ts)
    const nowUTC = new Date();
    const todayUTC = new Date(Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate()));
    let lastResetDateUTC: Date;
    if (!user.lastDailyReset || user.lastDailyReset.getTime() === 0) {
      lastResetDateUTC = new Date(0);
    } else {
      lastResetDateUTC = new Date(user.lastDailyReset);
    }
    const lastResetUTC = new Date(Date.UTC(
      lastResetDateUTC.getUTCFullYear(),
      lastResetDateUTC.getUTCMonth(),
      lastResetDateUTC.getUTCDate()
    ));
    const dailyCheckinStatus = (user.lastDailyReset && user.lastDailyReset.getTime() !== 0 && todayUTC.getTime() === lastResetUTC.getTime())
      ? '✅ **Claimed**'
      : '⏳ **Available**';

    // Build fields array conditionally
    const fields = [
      {
        name: 'Honor Points',
        value: `${user.honorPoints.toLocaleString()}`,
        inline: true,
      },
      {
        name: 'Global Rank',
        value: `#${rank}`,
        inline: true,
      },
    ];

    // Only add Daily Streak field if streak system is enabled
    if (enableStreak) {
      fields.splice(1, 0, {
        name: 'Daily Streak',
        value: `${user.dailyCheckinStreak} day${user.dailyCheckinStreak !== 1 ? 's' : ''}`,
        inline: true,
      });
    }

    // Add Daily Message Progress field (1 message/day = 10 pts)
    fields.push({
      name: '💬 Daily Message Progress',
      value: `Current: **${currentDailyMessageCount}** / Max: **${DAILY_MESSAGE_REWARD_LIMIT}**`,
      inline: true,
    });

    // Add Daily Check-in Status field
    fields.push({
      name: '🧘 Daily Check-in Status',
      value: dailyCheckinStatus,
      inline: true,
    });

    fields.push({
      name: 'Join Date',
      value: `<t:${Math.floor(joinDate.getTime() / 1000)}:F>`,
      inline: false,
    });

    // Set footer message based on streak system status
    const footerText = enableStreak 
      ? 'Continue your cultivation to climb the ranks!'
      : 'Daily streak system is currently disabled. Continue your cultivation to climb the ranks!';

    const embed = new EmbedBuilder()
      .setColor(0x8b0000)
      .setTitle('🪪 Wanderer Identity')
      .setDescription(`**${interaction.user.username}'s** cultivation record`)
      .setThumbnail(avatarUrl)
      .addFields(fields)
      .setFooter({
        text: footerText,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error processing profile command:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Error')
      .setDescription('An error occurred while fetching your profile. Please try again later.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}
