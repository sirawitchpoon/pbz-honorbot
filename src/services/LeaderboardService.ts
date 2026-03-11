import * as cron from 'node-cron';
import { Client, TextChannel, EmbedBuilder, Message, Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageComponent, AttachmentBuilder } from 'discord.js';
import { User } from '../models/User';

export class LeaderboardService {
  private cronJob: cron.ScheduledTask | null = null;
  private monthlyCronJob: cron.ScheduledTask | null = null;
  private lastMessageId: string | null = null;
  private dailyButtonMessageId: string | null = null;
  private client: Client | null = null;

  /**
   * Start the leaderboard service with a cron job that runs daily at midnight UTC
   */
  public start(client: Client): void {
    this.client = client; // Store client for manual updates
    const channelId = process.env.LEADERBOARD_CHANNEL_ID;

    console.log('[LeaderboardService] Initializing leaderboard service...');
    console.log(`[LeaderboardService] LEADERBOARD_CHANNEL_ID from env: ${channelId || 'NOT SET'}`);

    if (!channelId) {
      console.warn('[LeaderboardService] ⚠️ LEADERBOARD_CHANNEL_ID not set. Leaderboard service will not start.');
      console.warn('[LeaderboardService] Set LEADERBOARD_CHANNEL_ID in your .env file to enable the leaderboard service.');
      return;
    }

    // Validate channel ID is a valid snowflake
    if (!/^\d{17,19}$/.test(channelId)) {
      console.error(`[LeaderboardService] ❌ Invalid LEADERBOARD_CHANNEL_ID format: "${channelId}"`);
      console.error('[LeaderboardService] Must be a valid Discord snowflake (17-19 digit number).');
      return;
    }

    console.log(`[LeaderboardService] ✓ Channel ID validated: ${channelId}`);
    console.log('[LeaderboardService] Starting leaderboard service...');

    // Wait for client to be ready before initial update
    if (client.isReady()) {
      console.log('[LeaderboardService] Client is ready, performing initial update...');
      this.updateLeaderboard(client).catch((error) => {
        console.error('[LeaderboardService] ❌ Error in initial leaderboard update:', error);
        if (error instanceof Error) {
          console.error('[LeaderboardService] Error message:', error.message);
          console.error('[LeaderboardService] Error stack:', error.stack);
        }
      });
      // Send/update daily button embed
      this.ensureDailyButton(client).catch((error) => {
        console.error('[LeaderboardService] ❌ Error in initial daily button setup:', error);
      });
    } else {
      console.log('[LeaderboardService] Client not ready yet, will wait for ready event...');
      client.once('ready', () => {
        console.log('[LeaderboardService] Client is now ready, performing initial update...');
        this.updateLeaderboard(client).catch((error) => {
          console.error('[LeaderboardService] ❌ Error in initial leaderboard update:', error);
          if (error instanceof Error) {
            console.error('[LeaderboardService] Error message:', error.message);
            console.error('[LeaderboardService] Error stack:', error.stack);
          }
        });
        // Send/update daily button embed
        this.ensureDailyButton(client).catch((error) => {
          console.error('[LeaderboardService] ❌ Error in initial daily button setup:', error);
        });
      });
    }

    // Schedule cron job to run every day at midnight UTC
    // Cron syntax: 0 0 * * * = at 00:00 every day
    // Monthly snapshot: run at 00:00 on 1st of each month (Asia/Bangkok)
    // SAFETY: Only copies honorPoints to honorPointsAtMonthStart - never modifies honorPoints
    console.log('[LeaderboardService] Scheduling monthly snapshot: 0 0 1 * * (1st of month, Asia/Bangkok)');
    this.monthlyCronJob = cron.schedule(
      '0 0 1 * *',
      async () => {
        console.log('[LeaderboardService] ⏰ ========== MONTHLY (Export + Snapshot) ==========');
        try {
          await this.exportMonthlyLeaderboardToChannel();
          await this.updateMonthlySnapshot();
          console.log('[LeaderboardService] ✓ Monthly export and snapshot completed');
        } catch (err) {
          console.error('[LeaderboardService] ❌ Monthly export/snapshot failed:', err);
        }
        console.log('[LeaderboardService] ========== MONTHLY END ==========');
      },
      { timezone: 'Asia/Bangkok' }
    );

    console.log('[LeaderboardService] Scheduling cron job: 0 0 * * * (every day at midnight UTC)');
    this.cronJob = cron.schedule('0 0 * * *', async () => {
      console.log('[LeaderboardService] ⏰ ========== DAILY LEADERBOARD UPDATE ==========');
      console.log('[LeaderboardService] Running Daily Leaderboard Update...');
      console.log(`[LeaderboardService] Current time: ${new Date().toISOString()}`);

      try {
        console.log('[LeaderboardService] Calling updateLeaderboard()...');
        await this.updateLeaderboard(client);
        console.log('[LeaderboardService] ✓ Daily leaderboard update completed successfully');
      } catch (error) {
        console.error('[LeaderboardService] ❌ Error in daily leaderboard update:', error);
        if (error instanceof Error) {
          console.error('[LeaderboardService] Error message:', error.message);
          console.error('[LeaderboardService] Error stack:', error.stack);
        }
      }
      console.log('[LeaderboardService] ========== DAILY UPDATE ENDED ==========');
    });

    console.log('[LeaderboardService] ✓ Leaderboard service started successfully.');
    console.log('[LeaderboardService] Will update every day at midnight UTC and on bot ready.');
  }

  /**
   * Stop the leaderboard service
   */
  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    if (this.monthlyCronJob) {
      this.monthlyCronJob.stop();
      this.monthlyCronJob = null;
    }
    console.log('[LeaderboardService] Leaderboard service stopped.');
    this.client = null;
  }

  /**
   * Manually trigger export of last month's leaderboard to BACKUP_LEADERBOARD_CHANNEL_ID (same as scheduled).
   * Uses Bangkok timezone for "previous month". Use to correct a wrong label or re-send.
   */
  public async exportMonthlyLeaderboardNow(): Promise<boolean> {
    try {
      await this.exportMonthlyLeaderboardToChannel();
      return true;
    } catch (err) {
      console.error('[LeaderboardService] exportMonthlyLeaderboardNow failed:', err);
      return false;
    }
  }

  /**
   * Export monthly leaderboard (previous month) to BACKUP_LEADERBOARD_CHANNEL_ID as JSON + embed.
   * Called at 00:00 on 1st of month (Asia/Bangkok) before updateMonthlySnapshot().
   * Uses Bangkok timezone so "previous month" is correct when server is in UTC.
   */
  private async exportMonthlyLeaderboardToChannel(): Promise<void> {
    const channelId = (process.env.BACKUP_LEADERBOARD_CHANNEL_ID ?? '').trim();
    if (!channelId || !/^\d{17,19}$/.test(channelId) || !this.client) return;

    const now = new Date();
    // Use Bangkok time so at 00:00 on 1st (Bangkok) we export the month that just ended (e.g. February)
    const bangkokYear = parseInt(now.toLocaleString('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric' }), 10);
    const bangkokMonth = parseInt(now.toLocaleString('en-CA', { timeZone: 'Asia/Bangkok', month: '2-digit' }), 10);
    const prevMonthIndex = bangkokMonth === 1 ? 11 : bangkokMonth - 2; // 0-based month for Date
    const prevYear = bangkokMonth === 1 ? bangkokYear - 1 : bangkokYear;
    const prevMonthDate = new Date(prevYear, prevMonthIndex, 1);
    const monthLabel = prevMonthDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const fileMonth = `${prevYear}-${String(prevMonthIndex + 1).padStart(2, '0')}`;

    const allUsers = await User.find({}).lean();
    const withMonthly = allUsers.map((u) => ({
      userId: u.userId,
      username: u.username,
      honorPoints: u.honorPoints ?? 0,
      monthlyPoints: (u.honorPoints ?? 0) - (u.honorPointsAtMonthStart ?? 0),
    }));
    const top10 = withMonthly
      .filter((u) => u.monthlyPoints > 0)
      .sort((a, b) => b.monthlyPoints - a.monthlyPoints)
      .slice(0, 10)
      .map((u, i) => ({ rank: i + 1, ...u }));

    const payload = {
      month: monthLabel,
      exportedAt: now.toISOString(),
      top10,
    };
    const json = JSON.stringify(payload, null, 2);
    const attachment = new AttachmentBuilder(Buffer.from(json, 'utf-8'), {
      name: `leaderboard_${fileMonth}.json`,
    });

    const desc =
      top10.length === 0
        ? `*No points earned in ${monthLabel}*`
        : top10
            .map((u) => {
              const emoji = u.rank === 1 ? '🥇' : u.rank === 2 ? '🥈' : u.rank === 3 ? '🥉' : '';
              return `${emoji} ${u.rank}. <@${u.userId}> - **${u.monthlyPoints.toLocaleString()}** Honor`;
            })
            .join('\n');

    const embed = new EmbedBuilder()
      .setColor(0x5a3d2b)
      .setTitle(`📜 Jianghu Rankings – (${monthLabel}) (Top 10)`)
      .setDescription(desc)
      .setFooter({
        text: `Last Updated: ${now.toLocaleString('en-US', {
          timeZone: 'Asia/Bangkok',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}`,
      })
      .setTimestamp();

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel?.isTextBased()) {
        await (channel as TextChannel).send({ embeds: [embed], files: [attachment] });
        console.log('[LeaderboardService] ✓ Monthly leaderboard exported to channel', channelId);
      }
    } catch (err) {
      console.error('[LeaderboardService] Failed to send monthly leaderboard to channel:', err);
    }
  }

  /**
   * Update monthly snapshot - copies current honorPoints to honorPointsAtMonthStart.
   * Uses Bangkok time for "start of month" so it matches the cron (00:00 on 1st Bangkok).
   * SAFETY: NEVER modifies honorPoints. Only reads and stores snapshot.
   */
  private async updateMonthlySnapshot(): Promise<void> {
    const users = await User.find({}).lean();
    const now = new Date();
    const bangkokYear = parseInt(now.toLocaleString('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric' }), 10);
    const bangkokMonth = parseInt(now.toLocaleString('en-CA', { timeZone: 'Asia/Bangkok', month: '2-digit' }), 10);
    const startOfMonth = new Date(Date.UTC(bangkokYear, bangkokMonth - 1, 1, 0, 0, 0, 0));

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
    }
    console.log(`[LeaderboardService] Snapshot saved for ${users.length} users (honorPoints unchanged)`);
  }

  /**
   * Manually trigger a leaderboard update (called when points change)
   */
  public async triggerUpdate(): Promise<void> {
    if (!this.client) {
      console.warn('[LeaderboardService] Cannot trigger update: Client not available yet.');
      return;
    }

    if (!this.client.isReady()) {
      console.warn('[LeaderboardService] Cannot trigger update: Client not ready yet.');
      return;
    }

    console.log('[LeaderboardService] 🔄 Manual update triggered (points changed)');
    try {
      await this.updateLeaderboard(this.client);
      console.log('[LeaderboardService] ✓ Manual update completed successfully');
    } catch (error) {
      console.error('[LeaderboardService] ❌ Error in manual update:', error);
      if (error instanceof Error) {
        console.error('[LeaderboardService] Error message:', error.message);
        console.error('[LeaderboardService] Error stack:', error.stack);
      }
    }
  }

  /**
   * Force update the leaderboard immediately (for testing/debugging)
   * This is a public method that can be called manually
   */
  public async forceUpdate(): Promise<boolean> {
    console.log('[LeaderboardService] 🔧 FORCE UPDATE REQUESTED');

    if (!this.client) {
      console.error('[LeaderboardService] ❌ Cannot force update: Client not available');
      return false;
    }

    if (!this.client.isReady()) {
      console.error('[LeaderboardService] ❌ Cannot force update: Client not ready');
      return false;
    }

    try {
      console.log('[LeaderboardService] Executing force update...');
      await this.updateLeaderboard(this.client);
      console.log('[LeaderboardService] ✓ Force update completed successfully');
      return true;
    } catch (error) {
      console.error('[LeaderboardService] ❌ Error in force update:', error);
      if (error instanceof Error) {
        console.error('[LeaderboardService] Error message:', error.message);
        console.error('[LeaderboardService] Error stack:', error.stack);
      }
      return false;
    }
  }

  /**
   * Update the leaderboard in the configured channel
   */
  private async updateLeaderboard(client: Client): Promise<void> {
    const channelId = process.env.LEADERBOARD_CHANNEL_ID;

    if (!channelId) {
      console.warn('[LeaderboardService] LEADERBOARD_CHANNEL_ID not set, skipping update.');
      return;
    }

    console.log(`[LeaderboardService] Attempting to update leaderboard in channel: ${channelId}`);

    if (!client.isReady()) {
      console.warn('[LeaderboardService] Client is not ready yet, skipping update.');
      return;
    }

    try {
      console.log(`[LeaderboardService] Fetching channel with ID: ${channelId}...`);
      const channel = await client.channels.fetch(channelId);

      if (!channel) {
        console.error(`[LeaderboardService] ❌ Channel with ID ${channelId} not found.`);
        console.error(`[LeaderboardService] Make sure the bot has access to the channel and the ID is correct.`);
        return;
      }

      console.log(`[LeaderboardService] ✓ Channel found: ${channel.id} (${channel.type})`);

      if (!channel.isTextBased()) {
        console.error(`[LeaderboardService] ❌ Channel ${channelId} is not a text-based channel. Type: ${channel.type}`);
        return;
      }

      const textChannel = channel as TextChannel;
      console.log(`[LeaderboardService] Channel name: ${textChannel.name || 'Unknown'}`);

      // Check if bot has permission to send messages
      const botMember = await textChannel.guild.members.fetch(client.user!.id);
      const permissions = textChannel.permissionsFor(botMember);

      if (!permissions) {
        console.error(`[LeaderboardService] ❌ Could not fetch permissions for channel ${channelId}`);
        return;
      }

      const hasSendMessages = permissions.has('SendMessages');
      const hasViewChannel = permissions.has('ViewChannel');
      const hasManageMessages = permissions.has('ManageMessages');

      console.log(`[LeaderboardService] Bot permissions: SendMessages=${hasSendMessages}, ViewChannel=${hasViewChannel}, ManageMessages=${hasManageMessages}`);

      if (!hasSendMessages || !hasViewChannel) {
        console.error(`[LeaderboardService] ❌ Bot lacks required permissions in channel ${channelId}.`);
        console.error(`[LeaderboardService] Required: SendMessages=${hasSendMessages}, ViewChannel=${hasViewChannel}`);
        return;
      }

      // Generate embeds (all-time + monthly)
      console.log('[LeaderboardService] Generating leaderboard embeds...');
      const embeds = await this.generateEmbeds();
      console.log('[LeaderboardService] ✓ Embeds generated successfully');

      // Find the last message sent by the bot in this channel
      // Use improved logic: try stored ID first, then search through messages
      let lastMessage: Message | null = null;

      try {
        // First, try to fetch the stored message ID if we have one
        if (this.lastMessageId) {
          console.log(`[LeaderboardService] Attempting to fetch stored message ID: ${this.lastMessageId}`);
          try {
            const storedMessage = await textChannel.messages.fetch(this.lastMessageId);
            if (storedMessage && storedMessage.author.id === client.user?.id) {
              lastMessage = storedMessage;
              console.log(`[LeaderboardService] ✓ Found bot's message using stored ID: ${this.lastMessageId}`);
            } else {
              console.log(`[LeaderboardService] Stored message ID exists but is not from bot, clearing...`);
              this.lastMessageId = null;
            }
          } catch (fetchError: any) {
            // Message not found (deleted or invalid ID)
            if (fetchError.code === 10008 || fetchError.code === 404) {
              console.log(`[LeaderboardService] Stored message ID ${this.lastMessageId} was deleted, clearing...`);
              this.lastMessageId = null;
            } else {
              console.warn(`[LeaderboardService] Error fetching stored message:`, fetchError.message);
              this.lastMessageId = null;
            }
          }
        }

        // If we don't have a valid message yet, search through recent messages
        if (!lastMessage) {
          console.log('[LeaderboardService] Searching through recent messages to find bot\'s last message...');
          console.log('[LeaderboardService] Fetching up to 100 messages...');

          let foundBotMessage = false;
          let lastFetchedId: string | undefined;
          const maxIterations = 5; // Search up to 500 messages (5 batches of 100)

          for (let i = 0; i < maxIterations && !foundBotMessage; i++) {
            let messages: Collection<string, Message>;

            if (lastFetchedId) {
              messages = await textChannel.messages.fetch({ limit: 100, before: lastFetchedId });
            } else {
              messages = await textChannel.messages.fetch({ limit: 100 });
            }

            const messageCount = messages.size;
            console.log(`[LeaderboardService] Batch ${i + 1}: Fetched ${messageCount} messages`);

            // Find the most recent bot message in this batch
            for (const [id, msg] of messages) {
              if (msg.author.id === client.user?.id) {
                lastMessage = msg;
                foundBotMessage = true;
                console.log(`[LeaderboardService] ✓ Found bot's last message: ${id} (in batch ${i + 1})`);
                this.lastMessageId = id;
                break;
              }
              // Track the last message ID for pagination (oldest message in batch)
              if (!lastFetchedId) {
                lastFetchedId = id;
              } else {
                const currentMsg = messages.get(lastFetchedId);
                if (currentMsg && msg.createdTimestamp < currentMsg.createdTimestamp) {
                  lastFetchedId = id;
                }
              }
            }

            // If we got fewer than 100 messages, we've reached the end
            if (messageCount < 100) {
              console.log(`[LeaderboardService] Reached end of message history (batch ${i + 1})`);
              break;
            }
          }

          if (!foundBotMessage) {
            console.log('[LeaderboardService] No bot message found in searched history, will send new message');
            this.lastMessageId = null;
          }
        }
      } catch (error) {
        console.error('[LeaderboardService] ❌ Error finding bot message:', error);
        if (error instanceof Error) {
          console.error('[LeaderboardService] Error message:', error.message);
          console.error('[LeaderboardService] Error stack:', error.stack);
        }
        // Clear stored ID on error, will create new message
        this.lastMessageId = null;
        lastMessage = null;
      }

      if (lastMessage) {
        // Edit existing message
        try {
          console.log(`[LeaderboardService] Channel found: ${textChannel.name}`);
          console.log(`[LeaderboardService] Editing existing message: ${lastMessage.id}...`);
          const editedMessage = await lastMessage.edit({ embeds });
          this.lastMessageId = editedMessage.id; // Update stored ID
          console.log('[LeaderboardService] Message edited successfully');
          console.log('[LeaderboardService] ✓ Leaderboard updated (edited existing message).');
        } catch (error) {
          console.error('[LeaderboardService] ❌ Error editing message:', error);
          if (error instanceof Error) {
            console.error('[LeaderboardService] Error message:', error.message);
            console.error('[LeaderboardService] Error code:', (error as any).code);
          }

          // Check if error is because message was deleted (404 or 10008)
          const errorCode = (error as any).code;
          if (errorCode === 10008 || errorCode === 404) {
            console.log('[LeaderboardService] Message was deleted (error code: ' + errorCode + '), will create a new one...');
            this.lastMessageId = null; // Clear stored ID
            lastMessage = null; // Clear reference so we send a new message
          }

          // If editing fails (including deletion), try sending a new message
          if (!lastMessage) {
            try {
              console.log('[LeaderboardService] Attempting to send new message after edit failed...');
              const newMessage = await textChannel.send({ embeds });
              this.lastMessageId = newMessage.id; // Store new message ID
              console.log('[LeaderboardService] New message sent successfully');
              console.log('[LeaderboardService] ✓ Leaderboard updated (sent new message after edit failed).');
              console.log(`[LeaderboardService] Stored new message ID: ${this.lastMessageId}`);
            } catch (sendError) {
              console.error('[LeaderboardService] ❌ Error sending new message:', sendError);
              if (sendError instanceof Error) {
                console.error('[LeaderboardService] Error message:', sendError.message);
                console.error('[LeaderboardService] Error code:', (sendError as any).code);
              }
              this.lastMessageId = null; // Clear on failure
              throw sendError; // Re-throw to be caught by outer catch
            }
          }
        }
      } else {
        // No previous message found (deleted or first time) - Send new message
        console.log('[LeaderboardService] No bot message found in channel');
        console.log('[LeaderboardService] Sending new leaderboard message...');
        try {
          const newMessage = await textChannel.send({ embeds });
          this.lastMessageId = newMessage.id; // Store new message ID
          console.log('[LeaderboardService] New message sent successfully');
          console.log('[LeaderboardService] ✓ Leaderboard updated (sent new message).');
          console.log(`[LeaderboardService] Stored message ID: ${this.lastMessageId}`);
        } catch (error) {
          console.error('[LeaderboardService] ❌ Error sending message:', error);
          if (error instanceof Error) {
            console.error('[LeaderboardService] Error message:', error.message);
            console.error('[LeaderboardService] Error code:', (error as any).code);
          }
          this.lastMessageId = null;
          throw error; // Re-throw to be caught by outer catch
        }
      }
    } catch (error) {
      console.error('[LeaderboardService] ❌ Critical error updating leaderboard:', error);
      if (error instanceof Error) {
        console.error('[LeaderboardService] Error message:', error.message);
        console.error('[LeaderboardService] Error stack:', error.stack);
      }
      throw error; // Re-throw to be caught by caller
    }
  }

  /**
   * Ensure the daily button embed exists in the daily checking channel
   */
  private async ensureDailyButton(client: Client): Promise<void> {
    const channelId = process.env.DAILYCHECKING_CHANNEL_ID;

    if (!channelId) {
      console.warn('[LeaderboardService] DAILYCHECKING_CHANNEL_ID not set, skipping daily button setup.');
      console.warn('[LeaderboardService] Set DAILYCHECKING_CHANNEL_ID in your .env file to enable the daily button.');
      return;
    }

    // Validate channel ID is a valid snowflake
    if (!/^\d{17,19}$/.test(channelId)) {
      console.error(`[LeaderboardService] ❌ Invalid DAILYCHECKING_CHANNEL_ID format: "${channelId}"`);
      console.error('[LeaderboardService] Must be a valid Discord snowflake (17-19 digit number).');
      return;
    }

    if (!client.isReady()) {
      console.warn('[LeaderboardService] Client is not ready yet, skipping daily button setup.');
      return;
    }

    try {
      const channel = await client.channels.fetch(channelId);

      if (!channel || !channel.isTextBased()) {
        console.error(`[LeaderboardService] ❌ Channel ${channelId} not found or not text-based.`);
        return;
      }

      const textChannel = channel as TextChannel;

      // Check if bot has permission to send messages
      const botMember = await textChannel.guild.members.fetch(client.user!.id);
      const permissions = textChannel.permissionsFor(botMember);

      if (!permissions || !permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
        console.error(`[LeaderboardService] ❌ Bot lacks required permissions in daily checking channel ${channelId}.`);
        console.error(`[LeaderboardService] Required: SendMessages=${permissions?.has('SendMessages')}, ViewChannel=${permissions?.has('ViewChannel')}`);
        return;
      }

      // Create the embed
      const embed = new EmbedBuilder()
        .setColor(0x8b0000)
        .setTitle('🧘 Daily Checking')
        .setDescription('Click the button below to claim your daily honor points reward!\n\nYou can earn **1-10 random honor points** each day.')
        .setFooter({
          text: 'Claim your reward once per day to continue your cultivation journey!',
        })
        .setTimestamp();

      // Create the button
      const button = new ButtonBuilder()
        .setCustomId('daily_claim_button')
        .setLabel('Claim Daily')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⚔️');

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

      // Try to find existing daily button message
      let dailyButtonMessage: Message | null = null;

      if (this.dailyButtonMessageId) {
        try {
          const storedMessage = await textChannel.messages.fetch(this.dailyButtonMessageId);
          if (storedMessage && storedMessage.author.id === client.user?.id) {
            dailyButtonMessage = storedMessage;
            console.log(`[LeaderboardService] ✓ Found existing daily button message: ${this.dailyButtonMessageId}`);
          } else {
            this.dailyButtonMessageId = null;
          }
        } catch (fetchError: any) {
          if (fetchError.code === 10008 || fetchError.code === 404) {
            console.log(`[LeaderboardService] Stored daily button message ID ${this.dailyButtonMessageId} was deleted, clearing...`);
            this.dailyButtonMessageId = null;
          }
        }
      }

      // If not found, search for it
      if (!dailyButtonMessage) {
        console.log('[LeaderboardService] Searching for existing daily button message...');
        const messages = await textChannel.messages.fetch({ limit: 50 });

        for (const [id, msg] of messages) {
          if (msg.author.id === client.user?.id && msg.components.length > 0) {
            // Check if this message has our button
            const hasDailyButton = msg.components.some(row => {
              const components = (row as any).components;
              if (components && Array.isArray(components)) {
                return components.some((component: any) => {
                  return component.type === 2 && component.customId === 'daily_claim_button';
                });
              }
              return false;
            });
            if (hasDailyButton) {
              dailyButtonMessage = msg;
              this.dailyButtonMessageId = id;
              console.log(`[LeaderboardService] ✓ Found daily button message: ${id}`);
              break;
            }
          }
        }
      }

      if (dailyButtonMessage) {
        // Edit existing message
        try {
          await dailyButtonMessage.edit({ embeds: [embed], components: [row] });
          console.log('[LeaderboardService] ✓ Daily button message updated successfully');
        } catch (error) {
          console.error('[LeaderboardService] ❌ Error editing daily button message:', error);
          // If editing fails, try to send a new one
          this.dailyButtonMessageId = null;
          dailyButtonMessage = null;
        }
      }

      if (!dailyButtonMessage) {
        // Send new message
        try {
          const newMessage = await textChannel.send({ embeds: [embed], components: [row] });
          this.dailyButtonMessageId = newMessage.id;
          console.log('[LeaderboardService] ✓ Daily button message sent successfully');
          console.log(`[LeaderboardService] Stored daily button message ID: ${this.dailyButtonMessageId}`);
        } catch (error) {
          console.error('[LeaderboardService] ❌ Error sending daily button message:', error);
        }
      }
    } catch (error) {
      console.error('[LeaderboardService] ❌ Critical error setting up daily button:', error);
      if (error instanceof Error) {
        console.error('[LeaderboardService] Error message:', error.message);
        console.error('[LeaderboardService] Error stack:', error.stack);
      }
    }
  }

  /**
   * Resolve display name for leaderboard: DB username → Discord fetch (and backfill DB) → User_<last6>.
   */
  private async resolveDisplayName(user: { userId: string; username?: string | null }): Promise<string> {
    const rawName = (user as any).username;
    if (typeof rawName === 'string' && rawName.trim()) {
      return rawName.replace(/\*\*/g, '').trim();
    }
    if (this.client) {
      try {
        const discordUser = await this.client.users.fetch(user.userId).catch(() => null);
        if (discordUser) {
          const name = (discordUser.globalName ?? discordUser.username ?? '').trim() || discordUser.username;
          if (name) {
            await User.findOneAndUpdate(
              { userId: user.userId },
              { $set: { username: name } },
              { new: true }
            ).exec().catch(() => {});
            return name.replace(/\*\*/g, '').trim();
          }
        }
      } catch (_) {}
    }
    return `User_${String(user.userId).slice(-6)}`;
  }

  /**
   * Generate leaderboard embeds: all-time + monthly. honorPoints is never modified.
   */
  private async generateEmbeds(): Promise<EmbedBuilder[]> {
    try {
      const allUsers = await User.find({}).lean();

      // All-time: top 10 by honorPoints
      const allTimeTop = [...allUsers]
        .sort((a, b) => (b.honorPoints ?? 0) - (a.honorPoints ?? 0))
        .slice(0, 10);

      // #region agent log
      const top3FromDb = allTimeTop.slice(0, 3).map((u) => ({ userId: u.userId, honorPoints: u.honorPoints }));
      (()=>{const p={sessionId:'62e255',hypothesisId:'H5',location:'LeaderboardService.generateEmbeds',message:'leaderboard DB read (top3)',data:{top3FromDb,totalUsers:allUsers.length},timestamp:Date.now()};fetch('http://localhost:7830/ingest/3f16d42f-49f9-4cb1-8d99-27cc6072eb7c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'62e255'},body:JSON.stringify(p)}).catch(()=>{});try{require('fs').appendFileSync(require('../lib/debugLogPath.js').getDebugLogPath(),JSON.stringify(p)+'\n');}catch(_){}})();
      // #endregion

      const allTimeDesc = allTimeTop.length === 0
        ? '*No warriors have earned honor points yet. Be the first!*'
        : (await Promise.all(
            allTimeTop.map(async (user, i) => {
              const rank = i + 1;
              const pts = user.honorPoints ?? 0;
              const emoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
              const displayName = await this.resolveDisplayName(user);
              return `${emoji} ${rank}. **${displayName}** (<@${user.userId}>) - **${pts.toLocaleString()}** Honor`;
            })
          )).join('\n');

      const allTimeEmbed = new EmbedBuilder()
        .setColor(0x8b0000)
        .setTitle('📜 Jianghu Rankings – All Time (Top 10)')
        .setDescription(allTimeDesc)
        .setTimestamp();

      // Monthly: top 10 by (honorPoints - honorPointsAtMonthStart)
      const now = new Date();
      const monthLabel = now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok', month: 'long', year: 'numeric' });

      const withMonthly = allUsers.map((u) => ({
        ...u,
        monthlyPoints: (u.honorPoints ?? 0) - (u.honorPointsAtMonthStart ?? 0),
      }));

      const monthlyTop = withMonthly
        .filter((u) => u.monthlyPoints > 0)
        .sort((a, b) => b.monthlyPoints - a.monthlyPoints)
        .slice(0, 10);

      const monthlyLines =
        monthlyTop.length === 0
          ? []
          : await Promise.all(
              monthlyTop.map(async (user, i) => {
                const rank = i + 1;
                const pts = user.monthlyPoints;
                const emoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
                const displayName = await this.resolveDisplayName(user);
                return `${emoji} ${rank}. **${displayName}** (<@${user.userId}>) - **${pts.toLocaleString()}** Honor`;
              })
            );
      const monthlyDesc =
        monthlyTop.length === 0
          ? `*No points earned this month yet (${monthLabel})*`
          : monthlyLines.join('\n');

      const monthlyEmbed = new EmbedBuilder()
        .setColor(0x8b0000)
        .setTitle(`📜 Jianghu Rankings – (${monthLabel}) (Top 10)`)
        .setDescription(monthlyDesc)
        .setTimestamp();

      return [allTimeEmbed, monthlyEmbed];
    } catch (error) {
      console.error('[LeaderboardService] generateEmbeds error:', error);
      throw error;
    }
  }
}