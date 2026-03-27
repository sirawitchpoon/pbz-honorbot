import { Client, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Message } from 'discord.js';

export class UserInteractionService {
  private client: Client | null = null;
  private pavilionMessageId: string | null = null;
  private arenaMessageId: string | null = null;

  public start(client: Client): void {
    this.client = client;
    console.log('[UserInteractionService] Initializing user interaction service...');

    if (client.isReady()) {
      this.setupAllPanels(client).catch((error) => {
        console.error('[UserInteractionService] ❌ Error in initial panel setup:', error);
      });
    } else {
      client.once('ready', () => {
        this.setupAllPanels(client).catch((error) => {
          console.error('[UserInteractionService] ❌ Error in initial panel setup:', error);
        });
      });
    }

    setInterval(() => {
      if (client.isReady()) {
        this.setupAllPanels(client).catch((error) => {
          console.error('[UserInteractionService] ❌ Error in periodic panel setup:', error);
        });
      }
    }, 3 * 60 * 1000);
  }

  private async setupAllPanels(client: Client): Promise<void> {
    console.log('[UserInteractionService] Setting up consolidated panels...');
    await this.setupPavilion(client);
    await this.setupArena(client);
  }

  /**
   * Honor Pavilion — Manual, Status Log, Profile, Tasks in one embed
   */
  private async setupPavilion(client: Client): Promise<void> {
    const channelId = process.env.HONOR_PAVILION_CHANNEL_ID;

    if (!channelId) {
      console.log('[UserInteractionService] HONOR_PAVILION_CHANNEL_ID not set, skipping Honor Pavilion setup.');
      return;
    }

    if (!/^\d{17,19}$/.test(channelId)) {
      console.error(`[UserInteractionService] ❌ Invalid HONOR_PAVILION_CHANNEL_ID format: "${channelId}"`);
      return;
    }

    if (!client.isReady()) {
      console.warn('[UserInteractionService] Client is not ready yet, skipping Honor Pavilion setup.');
      return;
    }

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.error(`[UserInteractionService] ❌ Pavilion channel ${channelId} not found or not text-based.`);
        return;
      }

      const textChannel = channel as TextChannel;
      const botMember = await textChannel.guild.members.fetch(client.user!.id);
      const permissions = textChannel.permissionsFor(botMember);

      if (!permissions || !permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
        console.error(`[UserInteractionService] ❌ Bot lacks permissions in Pavilion channel ${channelId}.`);
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x8b0000)
        .setTitle('📖 Honor Pavilion')
        .setDescription(
          'Your gateway to knowledge and status in the Jianghu.\n\n' +
          'Browse the **manual**, check recent **point distributions**, view your **profile**, or see today\'s remaining **tasks**. ' +
          'Each button opens as an ephemeral message (only you can see it).'
        )
        .setFooter({ text: 'Use the buttons below to interact!' })
        .setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('manual_button')
          .setLabel('Manual')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📖'),
        new ButtonBuilder()
          .setCustomId('status_log_button')
          .setLabel('Status Log')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📊'),
        new ButtonBuilder()
          .setCustomId('profile_button')
          .setLabel('Profile')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🪪'),
        new ButtonBuilder()
          .setCustomId('status_button')
          .setLabel('Tasks')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📋'),
      );

      this.pavilionMessageId = await this.ensureConsolidatedMessage(
        textChannel,
        client,
        this.pavilionMessageId,
        'Honor Pavilion',
        ['Honor Pavilion'],
        ['manual_button', 'status_log_button', 'profile_button', 'status_button'],
        embed,
        [row],
        'pavilion'
      );
    } catch (error) {
      console.error('[UserInteractionService] ❌ Critical error setting up Honor Pavilion:', error);
    }
  }

  /**
   * Honor Arena — Daily Check-in, Coin Flip in one embed
   */
  private async setupArena(client: Client): Promise<void> {
    const channelId = process.env.HONOR_ARENA_CHANNEL_ID;

    if (!channelId) {
      console.log('[UserInteractionService] HONOR_ARENA_CHANNEL_ID not set, skipping Honor Arena setup.');
      return;
    }

    if (!/^\d{17,19}$/.test(channelId)) {
      console.error(`[UserInteractionService] ❌ Invalid HONOR_ARENA_CHANNEL_ID format: "${channelId}"`);
      return;
    }

    if (!client.isReady()) {
      console.warn('[UserInteractionService] Client is not ready yet, skipping Honor Arena setup.');
      return;
    }

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.error(`[UserInteractionService] ❌ Arena channel ${channelId} not found or not text-based.`);
        return;
      }

      const textChannel = channel as TextChannel;
      const botMember = await textChannel.guild.members.fetch(client.user!.id);
      const permissions = textChannel.permissionsFor(botMember);

      if (!permissions || !permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
        console.error(`[UserInteractionService] ❌ Bot lacks permissions in Arena channel ${channelId}.`);
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x8b0000)
        .setTitle('⚔️ Honor Arena')
        .setDescription(
          'Test your fortune and earn honor points in the Jianghu!\n\n' +
          '• **Daily Check-in** — Claim **1-10** random honor points once per day\n' +
          '• **Coin Flip** — Bet 1-5 points, win double or lose your bet (5 plays/day)'
        )
        .setFooter({ text: 'Use the buttons below to interact!' })
        .setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('daily_claim_button')
          .setLabel('Claim Daily')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('⚔️'),
        new ButtonBuilder()
          .setCustomId('gamble_button')
          .setLabel('Coin Flip')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🎰'),
      );

      this.arenaMessageId = await this.ensureConsolidatedMessage(
        textChannel,
        client,
        this.arenaMessageId,
        'Honor Arena',
        ['Honor Arena'],
        ['daily_claim_button', 'gamble_button'],
        embed,
        [row],
        'arena'
      );
    } catch (error) {
      console.error('[UserInteractionService] ❌ Critical error setting up Honor Arena:', error);
    }
  }

  /**
   * Find, edit, or create a consolidated panel message in a channel.
   * Returns the stored message ID for future updates.
   */
  private async ensureConsolidatedMessage(
    textChannel: TextChannel,
    client: Client,
    storedMessageId: string | null,
    label: string,
    titleMatches: string[],
    buttonCustomIds: string[],
    embed: EmbedBuilder,
    components: ActionRowBuilder<ButtonBuilder>[],
    tag: string,
  ): Promise<string | null> {
    let targetMessage: Message | null = null;

    // Try stored message ID first
    if (storedMessageId) {
      try {
        const stored = await textChannel.messages.fetch(storedMessageId);
        if (stored && stored.author.id === client.user?.id) {
          targetMessage = stored;
          console.log(`[UserInteractionService] ✓ Found existing ${tag} message: ${storedMessageId}`);
        }
      } catch (fetchError: any) {
        if (fetchError.code === 10008 || fetchError.code === 404) {
          console.log(`[UserInteractionService] Stored ${tag} message was deleted, clearing...`);
        }
      }
    }

    // Search by embed title or button customIds
    if (!targetMessage) {
      console.log(`[UserInteractionService] Searching for existing ${tag} message...`);
      const messages = await textChannel.messages.fetch({ limit: 50 });

      for (const [id, msg] of messages) {
        if (msg.author.id !== client.user?.id) continue;

        const matchesTitle = msg.embeds.some(emb =>
          titleMatches.some(t => emb.title?.includes(t))
        );

        const matchesButton = msg.components.some(row => {
          const comps = (row as any).components;
          if (!Array.isArray(comps)) return false;
          return comps.some((c: any) => c.type === 2 && buttonCustomIds.includes(c.customId));
        });

        if (matchesTitle || matchesButton) {
          targetMessage = msg;
          console.log(`[UserInteractionService] ✓ Found ${tag} message: ${id}`);
          break;
        }
      }
    }

    // Edit or create
    if (targetMessage) {
      try {
        await targetMessage.edit({ embeds: [embed], components });
        console.log(`[UserInteractionService] ✓ ${label} message updated successfully`);
        return targetMessage.id;
      } catch (error) {
        console.error(`[UserInteractionService] ❌ Error editing ${tag} message:`, error);
        targetMessage = null;
      }
    }

    if (!targetMessage) {
      try {
        const newMessage = await textChannel.send({ embeds: [embed], components });
        console.log(`[UserInteractionService] ✓ ${label} message sent successfully (ID: ${newMessage.id})`);
        return newMessage.id;
      } catch (error) {
        console.error(`[UserInteractionService] ❌ Error sending ${tag} message:`, error);
      }
    }

    return null;
  }

  public stop(): void {
    console.log('[UserInteractionService] Stopping user interaction service...');
    this.pavilionMessageId = null;
    this.arenaMessageId = null;
  }
}
