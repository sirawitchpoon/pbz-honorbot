import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { User } from '../models/User';

export const data = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Check your honor points status, daily quota, and cooldown information');

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.deferred) {
    await interaction.deferReply({ ephemeral: true });
  }

  try {
    // Daily limit: 1 message per day, 10 points (resets midnight Thailand)
    const DAILY_MESSAGE_REWARD_LIMIT = 1;

    // Find or create user
    let user = await User.findOne({ userId: interaction.user.id });

    if (!user) {
      user = await User.create({
        userId: interaction.user.id,
        username: interaction.user.username,
        honorPoints: 0,
        lastMessageDate: new Date(0),
        dailyPoints: 0,
        lastMessagePointsReset: new Date(),
        dailyMessageCount: 0,
        lastDailyReset: new Date(0),
        dailyCheckinStreak: 0,
        lastCheckinDate: new Date(0),
      });
    } else {
      // Update username in case it changed
      if (user.username !== interaction.user.username) {
        user.username = interaction.user.username;
        await user.save();
      }
    }

    const now = new Date();

    // "New day" for message reward = midnight Thailand (Asia/Bangkok)
    const tz = 'Asia/Bangkok';
    const todayBk = `${now.toLocaleString('en-CA', { timeZone: tz, year: 'numeric' })}-${now.toLocaleString('en-CA', { timeZone: tz, month: '2-digit' })}-${now.toLocaleString('en-CA', { timeZone: tz, day: '2-digit' })}`;
    const lastResetDateLocal = user.lastMessagePointsReset || new Date(0);
    const lastBk = `${lastResetDateLocal.toLocaleString('en-CA', { timeZone: tz, year: 'numeric' })}-${lastResetDateLocal.toLocaleString('en-CA', { timeZone: tz, month: '2-digit' })}-${lastResetDateLocal.toLocaleString('en-CA', { timeZone: tz, day: '2-digit' })}`;
    const currentDailyCount = todayBk > lastBk ? 0 : user.dailyMessageCount;

    // Chat reward status: show countdown to next reward (midnight Thailand) when quota used
    let chatRewardStatus: string;
    if (currentDailyCount >= DAILY_MESSAGE_REWARD_LIMIT) {
      const todayBkMidnight = new Date(`${todayBk}T00:00:00+07:00`);
      const nextBkMidnight = new Date(todayBkMidnight.getTime() + 24 * 60 * 60 * 1000);
      const msLeft = Math.max(0, nextBkMidnight.getTime() - now.getTime());
      const hours = Math.floor(msLeft / (60 * 60 * 1000));
      const minutes = Math.floor((msLeft % (60 * 60 * 1000)) / (60 * 1000));
      const seconds = Math.floor((msLeft % (60 * 1000)) / 1000);
      const parts: string[] = [];
      if (hours > 0) parts.push(`${hours} hr${hours !== 1 ? 's' : ''}`);
      if (minutes > 0) parts.push(`${minutes} min`);
      if (seconds > 0 || parts.length === 0) parts.push(`${seconds} sec`);
      chatRewardStatus = `⏳ Next chat reward in **${parts.join(' ')}** (resets at midnight UTC+7)`;
    } else {
      chatRewardStatus = '✅ Send a message to receive **10 points** (once per day)';
    }

    // Calculate daily command status
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    let lastResetDate: Date;
    if (!user.lastDailyReset || user.lastDailyReset.getTime() === 0) {
      lastResetDate = new Date(0);
    } else {
      lastResetDate = new Date(user.lastDailyReset);
    }

    const lastReset = new Date(Date.UTC(
      lastResetDate.getUTCFullYear(),
      lastResetDate.getUTCMonth(),
      lastResetDate.getUTCDate()
    ));

    const dailyCommandStatus = (user.lastDailyReset && user.lastDailyReset.getTime() !== 0 && today.getTime() === lastReset.getTime())
      ? '⏳ **Claimed** (come back tomorrow)'
      : '✅ **Available**';

    const dailyQuotaStatus = currentDailyCount >= DAILY_MESSAGE_REWARD_LIMIT
      ? `Current: **${currentDailyCount}** / Max: **${DAILY_MESSAGE_REWARD_LIMIT}** 🛑 (Limit reached)`
      : `Current: **${currentDailyCount}** / Max: **${DAILY_MESSAGE_REWARD_LIMIT}**`;

    // Build embed
    const embed = new EmbedBuilder()
      .setColor(0x8b0000)
      .setTitle('📋 Today\'s Tasks')
      .setDescription(`Tasks overview for **${interaction.user.username}**`)
      .addFields(
        {
          name: '⚔️ Current Honor Points',
          value: `**${user.honorPoints}** 🏆`,
          inline: false,
        },
        {
          name: '💬 Daily Message Quota',
          value: dailyQuotaStatus,
          inline: false,
        },
        {
          name: '💬 Chat Reward',
          value: chatRewardStatus,
          inline: false,
        },
        {
          name: '🧘 Daily Check-in',
          value: dailyCommandStatus,
          inline: false,
        }
      )
      .setFooter({
        text: 'Use /help to learn how to earn more honor points',
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error processing status command:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Error')
      .setDescription('An error occurred while fetching your status. Please try again later.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}
