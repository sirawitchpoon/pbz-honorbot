import { Client, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Message } from 'discord.js';

export class UserInteractionService {
  private client: Client | null = null;
  private buttonMessageIds: Map<string, string> = new Map(); // channelId -> messageId

  /**
   * Start the user interaction service
   */
  public start(client: Client): void {
    this.client = client;
    console.log('[UserInteractionService] Initializing user interaction service...');

    // Wait for client to be ready before initial setup
    if (client.isReady()) {
      this.setupAllButtons(client).catch((error) => {
        console.error('[UserInteractionService] ❌ Error in initial button setup:', error);
      });
    } else {
      client.once('ready', () => {
        this.setupAllButtons(client).catch((error) => {
          console.error('[UserInteractionService] ❌ Error in initial button setup:', error);
        });
      });
    }

    // Setup buttons every 3 minutes (same as leaderboard update)
    setInterval(() => {
      if (client.isReady()) {
        this.setupAllButtons(client).catch((error) => {
          console.error('[UserInteractionService] ❌ Error in periodic button setup:', error);
        });
      }
    }, 3 * 60 * 1000);
  }

  /**
   * Setup all persistent buttons in their respective channels
   */
  private async setupAllButtons(client: Client): Promise<void> {
    console.log('[UserInteractionService] Setting up all persistent buttons...');

    // Setup Profile button (honor-hall)
    await this.ensureButton(
      client,
      process.env.HALL_CHANNEL_ID,
      'profile',
      '🪪 View Profile',
      'Click the button below to view your honor points, rank, and statistics!',
      'profile_button',
      'View Profile',
      ButtonStyle.Primary,
      '🪪'
    );

    // Setup Tasks button (shows what's remaining to do today)
    await this.ensureButton(
      client,
      process.env.TASKS_CHANNEL_ID,
      'tasks',
      '📋 Today\'s Tasks',
      'Click the button below to see what tasks you still have remaining today!',
      'status_button',
      'Check Remaining Tasks',
      ButtonStyle.Secondary,
      '📋'
    );

    // Setup Coin Flip button
    await this.ensureButton(
      client,
      process.env.COIN_FLIP_CHANNEL_ID,
      'gamble',
      '🎰 Coin Flip Game',
      'Click the button below to play coin flip with your honor points!\n\n**Rules:**\n• Bet 1-5 points\n• Win: Double your bet\n• Lose: Lose your bet',
      'gamble_button',
      'Play Coin Flip',
      ButtonStyle.Danger,
      '🎰'
    );

    // Setup Instruction channel (honor-manual)
    await this.setupInstructionChannel(client);
  }

  /**
   * Ensure a button exists in a channel
   */
  private async ensureButton(
    client: Client,
    channelId: string | undefined,
    buttonType: string,
    title: string,
    description: string,
    customId: string,
    buttonLabel: string,
    buttonStyle: ButtonStyle,
    emoji: string
  ): Promise<void> {
    if (!channelId) {
      console.log(`[UserInteractionService] ${buttonType.toUpperCase()}_CHANNEL_ID not set, skipping ${buttonType} button setup.`);
      return;
    }

    // Validate channel ID
    if (!/^\d{17,19}$/.test(channelId)) {
      console.error(`[UserInteractionService] ❌ Invalid ${buttonType.toUpperCase()}_CHANNEL_ID format: "${channelId}"`);
      return;
    }

    if (!client.isReady()) {
      console.warn(`[UserInteractionService] Client is not ready yet, skipping ${buttonType} button setup.`);
      return;
    }

    try {
      const channel = await client.channels.fetch(channelId);

      if (!channel || !channel.isTextBased()) {
        console.error(`[UserInteractionService] ❌ Channel ${channelId} not found or not text-based.`);
        return;
      }

      const textChannel = channel as TextChannel;

      // Check permissions
      const botMember = await textChannel.guild.members.fetch(client.user!.id);
      const permissions = textChannel.permissionsFor(botMember);

      if (!permissions || !permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
        console.error(`[UserInteractionService] ❌ Bot lacks required permissions in ${buttonType} channel ${channelId}.`);
        return;
      }

      // Create the embed
      const embed = new EmbedBuilder()
        .setColor(0x8b0000)
        .setTitle(title)
        .setDescription(description)
        .setFooter({
          text: 'Use the button below to interact!',
        })
        .setTimestamp();

      // Create the button
      const button = new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(buttonLabel)
        .setStyle(buttonStyle)
        .setEmoji(emoji);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

      // Try to find existing button message
      let buttonMessage: Message | null = null;
      const storedMessageId = this.buttonMessageIds.get(channelId);

      if (storedMessageId) {
        try {
          const storedMessage = await textChannel.messages.fetch(storedMessageId);
          if (storedMessage && storedMessage.author.id === client.user?.id) {
            buttonMessage = storedMessage;
            console.log(`[UserInteractionService] ✓ Found existing ${buttonType} button message: ${storedMessageId}`);
          } else {
            this.buttonMessageIds.delete(channelId);
          }
        } catch (fetchError: any) {
          if (fetchError.code === 10008 || fetchError.code === 404) {
            console.log(`[UserInteractionService] Stored ${buttonType} button message ID ${storedMessageId} was deleted, clearing...`);
            this.buttonMessageIds.delete(channelId);
          }
        }
      }

      // If not found, search for it
      if (!buttonMessage) {
        console.log(`[UserInteractionService] Searching for existing ${buttonType} button message...`);
        const messages = await textChannel.messages.fetch({ limit: 50 });

        for (const [id, msg] of messages) {
          if (msg.author.id === client.user?.id && msg.components.length > 0) {
            // Check if this message has our button
            const hasButton = msg.components.some(row => {
              const components = (row as any).components;
              if (components && Array.isArray(components)) {
                return components.some((component: any) => {
                  return component.type === 2 && component.customId === customId;
                });
              }
              return false;
            });
            if (hasButton) {
              buttonMessage = msg;
              this.buttonMessageIds.set(channelId, id);
              console.log(`[UserInteractionService] ✓ Found ${buttonType} button message: ${id}`);
              break;
            }
          }
        }
      }

      if (buttonMessage) {
        // Edit existing message
        try {
          await buttonMessage.edit({ embeds: [embed], components: [row] });
          console.log(`[UserInteractionService] ✓ ${buttonType} button message updated successfully`);
        } catch (error) {
          console.error(`[UserInteractionService] ❌ Error editing ${buttonType} button message:`, error);
          this.buttonMessageIds.delete(channelId);
          buttonMessage = null;
        }
      }

      if (!buttonMessage) {
        // Send new message
        try {
          const newMessage = await textChannel.send({ embeds: [embed], components: [row] });
          this.buttonMessageIds.set(channelId, newMessage.id);
          console.log(`[UserInteractionService] ✓ ${buttonType} button message sent successfully`);
          console.log(`[UserInteractionService] Stored ${buttonType} button message ID: ${newMessage.id}`);
        } catch (error) {
          console.error(`[UserInteractionService] ❌ Error sending ${buttonType} button message:`, error);
        }
      }
    } catch (error) {
      console.error(`[UserInteractionService] ❌ Critical error setting up ${buttonType} button:`, error);
      if (error instanceof Error) {
        console.error(`[UserInteractionService] Error message: ${error.message}`);
      }
    }
  }

  /**
   * Setup Instruction channel (honor-manual) with guide on how to use all buttons
   */
  private async setupInstructionChannel(client: Client): Promise<void> {
    const channelId = process.env.MANUAL_CHANNEL_ID;

    if (!channelId) {
      console.log('[UserInteractionService] MANUAL_CHANNEL_ID not set, skipping instruction channel setup (honor-manual).');
      return;
    }

    // Validate channel ID
    if (!/^\d{17,19}$/.test(channelId)) {
      console.error(`[UserInteractionService] ❌ Invalid MANUAL_CHANNEL_ID format: "${channelId}"`);
      return;
    }

    if (!client.isReady()) {
      console.warn('[UserInteractionService] Client is not ready yet, skipping instruction channel setup.');
      return;
    }

    try {
      const channel = await client.channels.fetch(channelId);

      if (!channel || !channel.isTextBased()) {
        console.error(`[UserInteractionService] ❌ Channel ${channelId} not found or not text-based.`);
        return;
      }

      const textChannel = channel as TextChannel;

      // Check permissions
      const botMember = await textChannel.guild.members.fetch(client.user!.id);
      const permissions = textChannel.permissionsFor(botMember);

      if (!permissions || !permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
        console.error(`[UserInteractionService] ❌ Bot lacks required permissions in instruction channel ${channelId}.`);
        return;
      }

      // Get channel mentions for buttons
      const profileChannelMention = process.env.HALL_CHANNEL_ID ? `<#${process.env.HALL_CHANNEL_ID}>` : '#honor-hall';
      const tasksChannelMention = process.env.TASKS_CHANNEL_ID ? `<#${process.env.TASKS_CHANNEL_ID}>` : 'Tasks channel';
      const statusChannelMention = process.env.STATUS_CHANNEL_ID ? `<#${process.env.STATUS_CHANNEL_ID}>` : '#honor-status';
      const dailyChannelMention = process.env.DAILYCHECKING_CHANNEL_ID ? `<#${process.env.DAILYCHECKING_CHANNEL_ID}>` : 'Daily check-in channel';
      const coinFlipChannelMention = process.env.COIN_FLIP_CHANNEL_ID ? `<#${process.env.COIN_FLIP_CHANNEL_ID}>` : 'Coin Flip channel';
      const hallOfFameMention = process.env.LEADERBOARD_CHANNEL_ID ? `<#${process.env.LEADERBOARD_CHANNEL_ID}>` : 'Hall of Fame channel';

      // Create comprehensive manual embed (MANUAL_CHANNEL_ID)
      const embed = new EmbedBuilder()
        .setColor(0x8b0000)
        .setTitle('📖 Manual')
        .setDescription('**Welcome to HonorBot PBZ!**\n\nLearn how to use all the features and earn honor points in the Jianghu.')
        .addFields(
          {
            name: '🧘 Daily Check-in',
            value: `Go to ${dailyChannelMention} and click the **"Claim Daily"** button to claim your daily honor points reward!\n\n` +
                   `• Earn **1-10 random honor points** each day\n` +
                   `• Available once per day (resets at midnight UTC)\n` +
                   `• Weighted probability favors lower points`,
            inline: false,
          },
          {
            name: '💬 Chat Activity - Message Points System',
            value: `Earn **10 honor points** once per day from chatting\n\n` +
                   `**How to Check Status:**\n` +
                   `• Use ${tasksChannelMention} to check your daily quota\n` +
                   `• Check ${statusChannelMention} to see point distribution log\n\n` +
                   `**Rules:**\n` +
                   `• **1 message per day** = **10 points** (fixed)\n` +
                   `• Daily limit: **1 time per day** (resets at **midnight UTC+7**)\n` +
                   `• Bot messages are ignored\n` +
                   `• No reactions - check status via /status command or ${tasksChannelMention}`,
            inline: false,
          },
          {
            name: '🪪 View Profile',
            value: `Go to ${profileChannelMention} and click the **"View Profile"** button to see:\n\n` +
                   `• Your honor points and global rank\n` +
                   `• Daily message progress (Current: X / Max: 1)\n` +
                   `• Today's message points earned (0 or 10)\n` +
                   `• Daily check-in availability\n` +
                   `• Join date`,
            inline: false,
          },
          {
            name: '📋 Today\'s Tasks',
            value: `Go to ${tasksChannelMention} and click the **"Check Remaining Tasks"** button to see:\n\n` +
                   `• Current honor points\n` +
                   `• Daily message quota (Current: X / Max: 1)\n` +
                   `• Whether you've claimed today's 10-point chat reward\n` +
                   `• Daily check-in availability\n` +
                   `• What tasks you still have remaining today`,
            inline: false,
          },
          {
            name: '📊 Status Log',
            value: `Check ${statusChannelMention} to see the **point distribution log**!\n\n` +
                   `• Shows last 10 point distributions\n` +
                   `• Real-time updates as users earn points\n` +
                   `• Format: [Time] Username earned +X points (Daily: 1 msg = 10 pts)`,
            inline: false,
          },
          {
            name: '🏆 Hall of Fame (Leaderboard)',
            value: `Check ${hallOfFameMention} to see the **live leaderboard** that updates daily!\n\n` +
                   `• Shows top 10 warriors with rankings\n` +
                   `• Medal emojis for top 3 (🥇🥈🥉)\n` +
                   `• Auto-updates once every 24 hours (daily)`,
            inline: false,
          },
          {
            name: '🎰 Coin Flip Game',
            value: `Go to ${coinFlipChannelMention} and click the **"Play Coin Flip"** button to play!\n\n` +
                   `**How to Play:**\n` +
                   `1. Click the button\n` +
                   `2. Choose "heads" or "tails"\n` +
                   `3. Enter bet amount (1-5 points)\n` +
                   `4. Submit and see the result!\n\n` +
                   `**Rules:**\n` +
                   `• Bet 1-5 honor points\n` +
                   `• Win: Double your bet (get bet amount × 2)\n` +
                   `• Lose: Lose your bet amount\n` +
                   `• Daily limit: 5 plays per day`,
            inline: false,
          }
        )
        .setFooter({
          text: 'Use the buttons in each channel to interact with the bot!',
        })
        .setTimestamp();

      // Try to find existing instruction message
      let instructionMessage: Message | null = null;
      const storedMessageId = this.buttonMessageIds.get(channelId);

      if (storedMessageId) {
        try {
          const storedMessage = await textChannel.messages.fetch(storedMessageId);
          if (storedMessage && storedMessage.author.id === client.user?.id) {
            instructionMessage = storedMessage;
            console.log(`[UserInteractionService] ✓ Found existing instruction message: ${storedMessageId}`);
          } else {
            this.buttonMessageIds.delete(channelId);
          }
        } catch (fetchError: any) {
          if (fetchError.code === 10008 || fetchError.code === 404) {
            console.log(`[UserInteractionService] Stored instruction message ID ${storedMessageId} was deleted, clearing...`);
            this.buttonMessageIds.delete(channelId);
          }
        }
      }

      // If not found, search for it
      if (!instructionMessage) {
        console.log('[UserInteractionService] Searching for existing instruction message...');
        const messages = await textChannel.messages.fetch({ limit: 50 });

        for (const [id, msg] of messages) {
          if (msg.author.id === client.user?.id && msg.embeds.length > 0) {
            // Check if this message has our instruction embed (by title)
            const hasInstructionEmbed = msg.embeds.some(emb => 
              emb.title?.includes('Manual') || emb.title?.includes('Instruction Guide') || emb.title?.includes('📖')
            );
            if (hasInstructionEmbed) {
              instructionMessage = msg;
              this.buttonMessageIds.set(channelId, id);
              console.log(`[UserInteractionService] ✓ Found instruction message: ${id}`);
              break;
            }
          }
        }
      }

      if (instructionMessage) {
        // Edit existing message
        try {
          await instructionMessage.edit({ embeds: [embed] });
          console.log('[UserInteractionService] ✓ Instruction message updated successfully');
        } catch (error) {
          console.error('[UserInteractionService] ❌ Error editing instruction message:', error);
          this.buttonMessageIds.delete(channelId);
          instructionMessage = null;
        }
      }

      if (!instructionMessage) {
        // Send new message
        try {
          const newMessage = await textChannel.send({ embeds: [embed] });
          this.buttonMessageIds.set(channelId, newMessage.id);
          console.log('[UserInteractionService] ✓ Instruction message sent successfully');
          console.log(`[UserInteractionService] Stored instruction message ID: ${newMessage.id}`);
        } catch (error) {
          console.error('[UserInteractionService] ❌ Error sending instruction message:', error);
        }
      }
    } catch (error) {
      console.error('[UserInteractionService] ❌ Critical error setting up instruction channel:', error);
      if (error instanceof Error) {
        console.error('[UserInteractionService] Error message:', error.message);
      }
    }
  }

  /**
   * Stop the service
   */
  public stop(): void {
    console.log('[UserInteractionService] Stopping user interaction service...');
    this.buttonMessageIds.clear();
  }
}
