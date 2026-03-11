import { Client, TextChannel, EmbedBuilder, Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { User } from '../models/User';
import mongoose from 'mongoose';
import { MONGODB_CONNECTED } from '../utils/connectDB';

const DAILY_LIMIT = 5;
const WIN_REWARD = +5;  // Win: +5 points (60% chance)
const LOSE_REWARD = -5; // Lose: -5 points (40% chance)
const WIN_PROBABILITY = 60; // 60% chance to win

export class LuckyDrawService {
  private luckyDrawMessageId: string | null = null;
  private client: Client | null = null;

  /**
   * Start the lucky draw service
   */
  public start(client: Client): void {
    this.client = client;
    const channelId = process.env.LUCKYDRAW_CHANNEL_ID;

    console.log('[LuckyDrawService] Initializing lucky draw service...');
    console.log(`[LuckyDrawService] LUCKYDRAW_CHANNEL_ID from env: ${channelId || 'NOT SET'}`);

    if (!channelId) {
      console.warn('[LuckyDrawService] ⚠️ LUCKYDRAW_CHANNEL_ID not set. Lucky draw service will not start.');
      console.warn('[LuckyDrawService] Set LUCKYDRAW_CHANNEL_ID in your .env file to enable the lucky draw service.');
      return;
    }

    // Validate channel ID is a valid snowflake
    if (!/^\d{17,19}$/.test(channelId)) {
      console.error(`[LuckyDrawService] ❌ Invalid LUCKYDRAW_CHANNEL_ID format: "${channelId}"`);
      console.error('[LuckyDrawService] Must be a valid Discord snowflake (17-19 digit number).');
      return;
    }

    console.log(`[LuckyDrawService] ✓ Channel ID validated: ${channelId}`);
    console.log('[LuckyDrawService] Starting lucky draw service...');

    // Wait for client to be ready before initial setup
    if (client.isReady()) {
      console.log('[LuckyDrawService] Client is ready, performing initial setup...');
      this.ensureLuckyDrawButton(client).catch((error) => {
        console.error('[LuckyDrawService] ❌ Error in initial lucky draw setup:', error);
      });
    } else {
      console.log('[LuckyDrawService] Client not ready yet, will wait for ready event...');
      client.once('ready', () => {
        console.log('[LuckyDrawService] Client is now ready, performing initial setup...');
        this.ensureLuckyDrawButton(client).catch((error) => {
          console.error('[LuckyDrawService] ❌ Error in initial lucky draw setup:', error);
        });
      });
    }

    console.log('[LuckyDrawService] ✓ Lucky draw service started successfully.');
  }

  /**
   * Stop the lucky draw service
   */
  public stop(): void {
    console.log('[LuckyDrawService] Stopping lucky draw service...');
    this.client = null;
    this.luckyDrawMessageId = null;
    console.log('[LuckyDrawService] ✓ Lucky draw service stopped.');
  }

  /**
   * Ensure the lucky draw button embed exists in the channel
   */
  private async ensureLuckyDrawButton(client: Client): Promise<void> {
    const channelId = process.env.LUCKYDRAW_CHANNEL_ID;

    if (!channelId) {
      return;
    }

    if (!client.isReady()) {
      console.warn('[LuckyDrawService] Client is not ready yet, skipping lucky draw button setup.');
      return;
    }

    try {
      const channel = await client.channels.fetch(channelId);

      if (!channel || !channel.isTextBased()) {
        console.error(`[LuckyDrawService] ❌ Channel ${channelId} not found or not text-based.`);
        return;
      }

      const textChannel = channel as TextChannel;

      // Check if bot has permission to send messages
      const botMember = await textChannel.guild.members.fetch(client.user!.id);
      const permissions = textChannel.permissionsFor(botMember);

      if (!permissions || !permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
        console.error(`[LuckyDrawService] ❌ Bot lacks required permissions in lucky draw channel ${channelId}.`);
        return;
      }

      // Create the embed
      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle('🎰 Lucky Draw')
        .setDescription(
          'Click the button below to try your luck!\n\n' +
          'You can play **5 times per day** (resets at midnight UTC).\n\n' +
          '**Requirement:** You need at least **5 honor points** to play.'
        )
        .setFooter({
          text: 'Good luck! May fortune favor you!',
        })
        .setTimestamp();

      // Create the button
      const button = new ButtonBuilder()
        .setCustomId('luckydraw_claim_button')
        .setLabel('Try Your Luck!')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎰');

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

      // Try to find existing lucky draw button message
      let luckyDrawMessage: Message | null = null;

      if (this.luckyDrawMessageId) {
        try {
          const storedMessage = await textChannel.messages.fetch(this.luckyDrawMessageId);
          if (storedMessage && storedMessage.author.id === client.user?.id) {
            luckyDrawMessage = storedMessage;
            console.log(`[LuckyDrawService] ✓ Found existing lucky draw button message: ${this.luckyDrawMessageId}`);
          } else {
            this.luckyDrawMessageId = null;
          }
        } catch (fetchError: any) {
          if (fetchError.code === 10008 || fetchError.code === 404) {
            console.log(`[LuckyDrawService] Stored lucky draw message ID ${this.luckyDrawMessageId} was deleted, clearing...`);
            this.luckyDrawMessageId = null;
          }
        }
      }

      // If not found, search for it
      if (!luckyDrawMessage) {
        console.log('[LuckyDrawService] Searching for existing lucky draw button message...');
        const messages = await textChannel.messages.fetch({ limit: 50 });

        for (const [id, msg] of messages) {
          if (msg.author.id === client.user?.id && msg.components.length > 0) {
            // Check if this message has our button
            const hasLuckyDrawButton = msg.components.some(row => {
              const components = (row as any).components;
              if (components && Array.isArray(components)) {
                return components.some((component: any) => {
                  return component.type === 2 && component.customId === 'luckydraw_claim_button';
                });
              }
              return false;
            });
            if (hasLuckyDrawButton) {
              luckyDrawMessage = msg;
              this.luckyDrawMessageId = id;
              console.log(`[LuckyDrawService] ✓ Found lucky draw button message: ${id}`);
              break;
            }
          }
        }
      }

      if (luckyDrawMessage) {
        // Edit existing message
        try {
          await luckyDrawMessage.edit({ embeds: [embed], components: [row] });
          console.log('[LuckyDrawService] ✓ Lucky draw button message updated successfully');
        } catch (error) {
          console.error('[LuckyDrawService] ❌ Error editing lucky draw button message:', error);
          this.luckyDrawMessageId = null;
          luckyDrawMessage = null;
        }
      }

      if (!luckyDrawMessage) {
        // Send new message
        try {
          const newMessage = await textChannel.send({ embeds: [embed], components: [row] });
          this.luckyDrawMessageId = newMessage.id;
          console.log(`[LuckyDrawService] ✓ Created new lucky draw button message: ${newMessage.id}`);
        } catch (error) {
          console.error('[LuckyDrawService] ❌ Error sending lucky draw button message:', error);
        }
      }
    } catch (error) {
      console.error('[LuckyDrawService] ❌ Error in ensureLuckyDrawButton:', error);
      if (error instanceof Error) {
        console.error('[LuckyDrawService] Error message:', error.message);
      }
    }
  }

  /**
   * Get random reward based on probability
   * 60% chance to win +5 points, 40% chance to lose -5 points
   */
  public static getRandomReward(): number {
    const random = Math.random() * 100;
    
    if (random < WIN_PROBABILITY) {
      return WIN_REWARD; // 60% chance: +5 points
    } else {
      return LOSE_REWARD; // 40% chance: -5 points
    }
  }

  /**
   * Handle lucky draw button click
   */
  public static async handleLuckyDrawButton(interaction: any): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Check MongoDB connection
      if (mongoose.connection.readyState !== MONGODB_CONNECTED) {
        await interaction.editReply({
          content: '❌ Database connection is not available. Please try again later.',
        });
        return;
      }

      // Find or create user
      let user = await User.findOne({ userId: interaction.user.id });

      if (!user) {
        user = await User.create({
          userId: interaction.user.id,
          username: interaction.user.username,
          honorPoints: 0,
          lastMessageDate: new Date(),
          dailyPoints: 0,
          lastMessagePointsReset: new Date(),
          dailyMessageCount: 0,
          lastDailyReset: new Date(0),
          dailyCheckinStreak: 0,
          lastCheckinDate: new Date(0),
          dailyLuckyDrawCount: 0,
          lastLuckyDrawDate: new Date(0),
        });
      } else {
        // Update username if changed
        if (user.username !== interaction.user.username) {
          user.username = interaction.user.username;
        }
      }

      // Daily reset logic
      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

      let lastLuckyDrawDate: Date;
      if (!user.lastLuckyDrawDate || user.lastLuckyDrawDate.getTime() === 0) {
        lastLuckyDrawDate = new Date(0);
      } else {
        lastLuckyDrawDate = new Date(user.lastLuckyDrawDate);
      }

      const lastDraw = new Date(Date.UTC(
        lastLuckyDrawDate.getUTCFullYear(),
        lastLuckyDrawDate.getUTCMonth(),
        lastLuckyDrawDate.getUTCDate()
      ));

      // Reset daily count if it's a new day
      if (today.getTime() > lastDraw.getTime()) {
        user.dailyLuckyDrawCount = 0;
        user.lastLuckyDrawDate = now;
      }

      // Check daily limit
      if (user.dailyLuckyDrawCount >= DAILY_LIMIT) {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const nextResetTimestamp = Math.floor(tomorrow.getTime() / 1000);

        const embed = new EmbedBuilder()
          .setColor(0xffaa00)
          .setTitle('⏳ Daily Limit Reached')
          .setDescription(
            `You have already played **${DAILY_LIMIT}** times today.\n\n` +
            `Come back <t:${nextResetTimestamp}:R> to try your luck again!`
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Check if user has enough points (need at least 5 to play)
      const REQUIRED_POINTS = 5;
      if (user.honorPoints < REQUIRED_POINTS) {
        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('❌ Cannot Play')
          .setDescription(
            `You need at least **${REQUIRED_POINTS}** honor points to play.\n\n` +
            `**Your current balance:** ${user.honorPoints} ⚔️`
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Get random reward
      const reward = LuckyDrawService.getRandomReward();
      const isWin = reward === WIN_REWARD;
      const rewardEmoji = isWin ? '🎉' : '💀';

      // Update user points
      const oldBalance = user.honorPoints;
      user.honorPoints += reward;
      
      // Ensure points don't go below 0
      if (user.honorPoints < 0) {
        user.honorPoints = 0;
      }

      user.dailyLuckyDrawCount += 1;
      user.lastLuckyDrawDate = now;
      await user.save();

      // Create result embed
      const embed = new EmbedBuilder()
        .setColor(isWin ? 0x00ff00 : 0xff0000)
        .setTitle(isWin ? '🎉 You Won!' : '❌ You Lost')
        .setDescription(
          `**Reward:** ${rewardEmoji} **${reward > 0 ? '+' : ''}${reward}** points\n\n` +
          `**Previous Balance:** ${oldBalance} ⚔️\n` +
          `**New Balance:** ${user.honorPoints} ⚔️\n\n` +
          `**Daily Plays:** ${user.dailyLuckyDrawCount}/${DAILY_LIMIT}`
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      console.log(
        `[LuckyDraw] User ${user.username} (${interaction.user.id}) got reward: ${reward} points. ` +
        `New balance: ${user.honorPoints}. Daily plays: ${user.dailyLuckyDrawCount}/${DAILY_LIMIT}`
      );
    } catch (error) {
      console.error('[LuckyDraw] Error processing lucky draw button:', error);

      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Error')
        .setDescription('An error occurred while processing your lucky draw. Please try again later.')
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
}
