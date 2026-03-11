import { Client, TextChannel, EmbedBuilder, Message } from 'discord.js';

interface LogEntry {
  timestamp: Date;
  username: string;
  userId: string;
  points: number;
  currentCount: number;
  maxCount: number;
  /** How the points were earned (e.g. "Send message", "Daily check-in"). Omitted for entries reloaded from old Discord messages. */
  action?: string;
}

export class StatusLogService {
  private logMessageId: string | null = null;
  private client: Client | null = null;
  private logEntries: LogEntry[] = [];
  private readonly MAX_ENTRIES = 10;

  /**
   * Start the status log service
   */
  public start(client: Client): void {
    this.client = client;
    const channelId = process.env.STATUS_CHANNEL_ID;

    console.log('[StatusLogService] Initializing status log service...');
    console.log(`[StatusLogService] STATUS_CHANNEL_ID from env: ${channelId || 'NOT SET'}`);

    if (!channelId) {
      console.warn('[StatusLogService] ⚠️ STATUS_CHANNEL_ID not set. Status log service will not start.');
      console.warn('[StatusLogService] Set STATUS_CHANNEL_ID in your .env file to enable the status log service.');
      return;
    }

    // Validate channel ID is a valid snowflake
    if (!/^\d{17,19}$/.test(channelId)) {
      console.error(`[StatusLogService] ❌ Invalid STATUS_CHANNEL_ID format: "${channelId}"`);
      console.error('[StatusLogService] Must be a valid Discord snowflake (17-19 digit number).');
      return;
    }

    console.log(`[StatusLogService] ✓ Channel ID validated: ${channelId}`);

    // Reload last 10 entries from existing Discord message so status does not disappear after bot restart
    setTimeout(() => this.reloadFromChannel(), 3000);
    console.log('[StatusLogService] Status log service started successfully.');
  }

  /**
   * Reload logEntries from the existing status log message in Discord (after restart).
   * This prevents the status from being overwritten with "No point distributions yet" when the bot restarts.
   */
  private async reloadFromChannel(): Promise<void> {
    const channelId = process.env.STATUS_CHANNEL_ID;
    if (!channelId || !this.client?.isReady()) return;

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) return;

      const textChannel = channel as TextChannel;
      const messages = await textChannel.messages.fetch({ limit: 50 });

      for (const [, msg] of messages) {
        if (msg.author.id !== this.client.user?.id || msg.embeds.length === 0) continue;
        const embed = msg.embeds[0];
        if (!embed.title?.includes('Status Log') && !embed.title?.includes('Point Distribution')) continue;

        const desc = embed.description;
        if (!desc) break;

        // Parse lines: <t:1234567890:T> **username** earned **+10** points (Current: 1/1) ...
        const lineRe = /<t:(\d+):T>\s+\*\*([^*]+)\*\* earned \*\*\+(\d+)\*\* points \(Current: (\d+)\/(\d+)\)/g;
        const entries: LogEntry[] = [];
        let m: RegExpExecArray | null;
        while ((m = lineRe.exec(desc)) !== null) {
          entries.push({
            timestamp: new Date(parseInt(m[1], 10) * 1000),
            username: m[2].trim(),
            userId: '', // not stored in embed; we look up by username in generateEmbed
            points: parseInt(m[3], 10),
            currentCount: parseInt(m[4], 10),
            maxCount: parseInt(m[5], 10),
          });
        }
        if (entries.length > 0) {
          this.logEntries = entries.slice(0, this.MAX_ENTRIES);
          this.logMessageId = msg.id;
          console.log(`[StatusLogService] ✓ Reloaded ${this.logEntries.length} entries from existing message`);
        }
        break;
      }
    } catch (err) {
      console.warn('[StatusLogService] Could not reload from channel:', (err as Error)?.message);
    }
  }

  /**
   * Stop the status log service
   */
  public stop(): void {
    console.log('[StatusLogService] Stopping status log service...');
    this.client = null;
    this.logMessageId = null;
    this.logEntries = [];
    console.log('[StatusLogService] ✓ Status log service stopped.');
  }

  /**
   * Add a new log entry and update the status log message.
   * @param action Optional label for how points were earned (e.g. "Send message", "Daily check-in"). Shown instead of cooldown.
   */
  public async addLogEntry(username: string, userId: string, points: number, currentCount: number, maxCount: number, action?: string): Promise<void> {
    if (!this.client || !this.client.isReady()) {
      console.warn('[StatusLogService] Cannot add log entry: Client not ready yet.');
      return;
    }

    const channelId = process.env.STATUS_CHANNEL_ID;
    if (!channelId) {
      return;
    }

    // Add new entry
    const newEntry: LogEntry = {
      timestamp: new Date(),
      username,
      userId,
      points,
      currentCount,
      maxCount,
      action,
    };

    this.logEntries.unshift(newEntry); // Add to beginning

    // Keep only last MAX_ENTRIES entries
    if (this.logEntries.length > this.MAX_ENTRIES) {
      this.logEntries = this.logEntries.slice(0, this.MAX_ENTRIES);
    }

    // Update the message
    await this.updateLogMessage();
  }

  /**
   * Update the status log message in the channel
   */
  private async updateLogMessage(): Promise<void> {
    const channelId = process.env.STATUS_CHANNEL_ID;

    if (!channelId || !this.client || !this.client.isReady()) {
      return;
    }

    try {
      const channel = await this.client.channels.fetch(channelId);

      if (!channel || !channel.isTextBased()) {
        console.error(`[StatusLogService] ❌ Channel ${channelId} not found or not text-based.`);
        return;
      }

      const textChannel = channel as TextChannel;

      // Check permissions
      const botMember = await textChannel.guild.members.fetch(this.client.user!.id);
      const permissions = textChannel.permissionsFor(botMember);

      if (!permissions || !permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
        console.error(`[StatusLogService] ❌ Bot lacks required permissions in status log channel ${channelId}.`);
        return;
      }

      // Generate embed content
      const embed = await this.generateEmbed();

      // Find existing message
      let logMessage: Message | null = null;

      if (this.logMessageId) {
        try {
          const storedMessage = await textChannel.messages.fetch(this.logMessageId);
          if (storedMessage && storedMessage.author.id === this.client.user?.id) {
            logMessage = storedMessage;
            console.log(`[StatusLogService] ✓ Found existing log message: ${this.logMessageId}`);
          } else {
            this.logMessageId = null;
          }
        } catch (fetchError: any) {
          if (fetchError.code === 10008 || fetchError.code === 404) {
            console.log(`[StatusLogService] Stored log message ID ${this.logMessageId} was deleted, clearing...`);
            this.logMessageId = null;
          }
        }
      }

      // If not found, search for it
      if (!logMessage) {
        console.log('[StatusLogService] Searching for existing log message...');
        const messages = await textChannel.messages.fetch({ limit: 50 });

        // Collect all status log messages
        const statusLogMessages: Message[] = [];
        for (const [id, msg] of messages) {
          if (msg.author.id === this.client.user?.id && msg.embeds.length > 0) {
            // Check if this message has our status log embed (by title)
            const hasStatusLogEmbed = msg.embeds.some(embed => 
              embed.title?.includes('Status Log') || embed.title?.includes('Point Distribution')
            );
            if (hasStatusLogEmbed) {
              statusLogMessages.push(msg);
            }
          }
        }

        // Find the latest message (most recent by timestamp)
        if (statusLogMessages.length > 0) {
          // Sort by createdTimestamp (newest first)
          statusLogMessages.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
          logMessage = statusLogMessages[0]; // Get the latest message
          this.logMessageId = logMessage.id;
          console.log(`[StatusLogService] ✓ Found ${statusLogMessages.length} log message(s), using latest: ${logMessage.id}`);

          // Delete old messages if there are more than one
          if (statusLogMessages.length > 1) {
            console.log(`[StatusLogService] Deleting ${statusLogMessages.length - 1} old log message(s)...`);
            for (let i = 1; i < statusLogMessages.length; i++) {
              try {
                await statusLogMessages[i].delete();
                console.log(`[StatusLogService] ✓ Deleted old log message: ${statusLogMessages[i].id}`);
              } catch (deleteError) {
                console.error(`[StatusLogService] ❌ Error deleting old log message ${statusLogMessages[i].id}:`, deleteError);
              }
            }
          }
        }
      }

      if (logMessage) {
        // Edit existing message
        try {
          await logMessage.edit({ embeds: [embed] });
          console.log('[StatusLogService] ✓ Log message updated successfully');
        } catch (error) {
          console.error('[StatusLogService] ❌ Error editing log message:', error);
          this.logMessageId = null;
          logMessage = null;
        }
      }

      if (!logMessage) {
        // Send new message
        try {
          const newMessage = await textChannel.send({ embeds: [embed] });
          this.logMessageId = newMessage.id;
          console.log('[StatusLogService] ✓ Log message sent successfully');
          console.log(`[StatusLogService] Stored log message ID: ${this.logMessageId}`);
        } catch (error) {
          console.error('[StatusLogService] ❌ Error sending log message:', error);
        }
      }
    } catch (error) {
      console.error('[StatusLogService] ❌ Critical error updating log message:', error);
      if (error instanceof Error) {
        console.error('[StatusLogService] Error message:', error.message);
        console.error('[StatusLogService] Error stack:', error.stack);
      }
    }
  }

  /**
   * Generate the status log embed.
   * Shows how points were earned (e.g. Send message, Daily check-in) instead of cooldown.
   * Entries reloaded from old Discord messages have no action and show no suffix (logs stay intact).
   */
  private async generateEmbed(): Promise<EmbedBuilder> {
    let description = '';

    if (this.logEntries.length === 0) {
      description = '*No point distributions yet. Point distributions will appear here as users earn points.*';
    } else {
      for (const entry of this.logEntries) {
        const timestamp = Math.floor(entry.timestamp.getTime() / 1000);
        const timeStr = `<t:${timestamp}:T>`;
        const actionSuffix = entry.action ? ` — ${entry.action}` : '';
        description += `${timeStr} **${entry.username}** earned **+${entry.points}** points (Current: ${entry.currentCount}/${entry.maxCount})${actionSuffix}\n`;
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x8b0000)
      .setTitle('📊 Status Log - Point Distributions')
      .setDescription(description)
      .setFooter({
        text: `Showing last ${this.logEntries.length} distribution${this.logEntries.length !== 1 ? 's' : ''}`,
      })
      .setTimestamp();

    return embed;
  }
}
