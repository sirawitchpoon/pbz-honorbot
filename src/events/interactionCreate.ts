import { Events, Interaction, ButtonInteraction, EmbedBuilder, MessageFlags, ChatInputCommandInteraction, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import * as dailyCommand from '../commands/daily';
import { getWeightedRandomDailyPoints } from '../commands/daily';
import * as profileCommand from '../commands/profile';
import * as leaderboardCommand from '../commands/leaderboard';
import * as backupCommand from '../commands/backup';
// /reset database removed to prevent accidental data loss
import * as statusCommand from '../commands/status';
import * as gambleCommand from '../commands/gamble';
// PVP system temporarily disabled
// import * as pvpCommand from '../commands/pvp';
// TODO: Lucky Draw feature postponed - will be implemented in future update alongside PvP Rock-Paper-Scissors
// import { LuckyDrawService } from '../services/LuckyDrawService';
import { User } from '../models/User';
import mongoose from 'mongoose';
import { MONGODB_CONNECTED } from '../utils/connectDB';
import { serviceRegistry } from '../services/ServiceRegistry';
import { sendBotsLog } from '../utils/botsLogger';

export const name = Events.InteractionCreate;

export async function execute(interaction: Interaction): Promise<void> {
  // Handle button interactions first
  if (interaction.isButton()) {
    if (interaction.customId === 'daily_claim_button') {
      await handleDailyButton(interaction);
      return;
    }
    if (interaction.customId === 'profile_button') {
      await handleProfileButton(interaction);
      return;
    }
    if (interaction.customId === 'status_button') {
      await handleStatusButton(interaction);
      return;
    }
    if (interaction.customId === 'gamble_button') {
      await handleGambleButton(interaction);
      return;
    }
    // TODO: Lucky Draw feature postponed - will be implemented in future update alongside PvP Rock-Paper-Scissors
    // if (interaction.customId === 'luckydraw_claim_button') {
    //   await LuckyDrawService.handleLuckyDrawButton(interaction);
    //   return;
    // }
    // PVP system temporarily disabled
    // // Handle PVP accept challenge button
    // if (interaction.customId.startsWith('pvp_accept_')) {
    //   await pvpCommand.handleAcceptButton(interaction);
    //   return;
    // }
    // // Handle PVP move buttons (rock, paper, scissors)
    // if (interaction.customId.startsWith('pvp_move_')) {
    //   await pvpCommand.handleMoveButton(interaction);
    //   return;
    // }
  }

  // Handle modal submissions (for coin flip)
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'gamble_modal') {
      await handleGambleModal(interaction);
      return;
    }
  }

  // Handle slash commands
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const commandName = interaction.commandName;
  console.log(`[InteractionCreate] Received command: ${commandName} from ${interaction.user.tag}`);

  // Check if user command (should be blocked for non-admins)
  const userCommands = ['daily', 'profile', 'leaderboard', 'status', 'gamble'];
  if (userCommands.includes(commandName)) {
    // Check if user is admin
    const isAdmin = interaction.member && 
      (interaction.member.permissions as any)?.has?.(PermissionFlagsBits.Administrator);
    
    if (!isAdmin) {
      // Block user commands - show message to use buttons instead
      await interaction.reply({
        content: '⚠️ This command is disabled. Please use the buttons in the designated channels instead!',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  // Handle slash commands (only admin commands or admin using user commands)
  try {
    switch (commandName) {
      case 'daily':
        await dailyCommand.execute(interaction);
        break;
      case 'profile':
        await profileCommand.execute(interaction);
        break;
      case 'leaderboard':
        await leaderboardCommand.execute(interaction);
        break;
      case 'backup':
        // Admin only - check permission
        if (!interaction.member || !(interaction.member.permissions as any)?.has?.(PermissionFlagsBits.Administrator)) {
          await interaction.reply({
            content: '❌ This command is only available for administrators.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await backupCommand.execute(interaction);
        break;
      // /reset database removed to prevent accidental score reset
      case 'status':
        await statusCommand.execute(interaction);
        break;
      case 'gamble':
        await gambleCommand.execute(interaction);
        break;
      // PVP system temporarily disabled
      // case 'pvp':
      //   await pvpCommand.execute(interaction);
      //   break;
      default:
        console.warn(`[InteractionCreate] Unknown command: ${commandName}`);
    }
  } catch (error) {
    console.error(`[InteractionCreate] Error executing command ${commandName}:`, error);
    if (error instanceof Error) {
      console.error(`[InteractionCreate] Error message: ${error.message}`);
      console.error(`[InteractionCreate] Error stack: ${error.stack}`);
    }

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: 'An error occurred while executing this command.',
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content: 'An error occurred while executing this command.',
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (replyError) {
      console.error(`[InteractionCreate] Could not send error reply:`, replyError);
    }
  }
}

/**
 * Handle the daily claim button interaction
 */
async function handleDailyButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    // Check MongoDB connection
    if (mongoose.connection.readyState !== MONGODB_CONNECTED) {
      await interaction.editReply({
        content: '❌ Database connection is not available. Please try again later.',
      });
      return;
    }

    // Fetch or create user from DB
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
        lastDailyReset: new Date(0), // Set to epoch to allow first daily
        dailyCheckinStreak: 0,
        lastCheckinDate: new Date(0), // Set to epoch
      });
    } else {
      // Update username in case it changed
      if (user.username !== interaction.user.username) {
        user.username = interaction.user.username;
      }
    }

    const now = new Date();

    // Check if already claimed today (compare dates without time, using UTC to avoid timezone issues)
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // Handle case where lastDailyReset might be null, invalid, or epoch (new users)
    let lastResetDate: Date;
    if (!user.lastDailyReset || user.lastDailyReset.getTime() === 0) {
      // New user or reset to epoch - allow claim
      lastResetDate = new Date(0);
    } else {
      lastResetDate = new Date(user.lastDailyReset);
    }

    const lastReset = new Date(Date.UTC(
      lastResetDate.getUTCFullYear(),
      lastResetDate.getUTCMonth(),
      lastResetDate.getUTCDate()
    ));

    // Only block if lastDailyReset is today (and not epoch)
    if (user.lastDailyReset && user.lastDailyReset.getTime() !== 0 && today.getTime() === lastReset.getTime()) {
      // Already claimed today, calculate next reset time (tomorrow at midnight)
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextResetTimestamp = Math.floor(tomorrow.getTime() / 1000);

      const embed = new EmbedBuilder()
        .setColor(0x8b0000)
        .setTitle('⏳ Daily Meditation Already Completed')
        .setDescription(
          `You have already claimed your daily reward today. Please come back tomorrow.`
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      sendBotsLog({
        botId: 'honorbot-pbz',
        category: 'daily',
        action: 'daily_already_claimed',
        userId: interaction.user.id,
        username: interaction.user.username,
      });
      return;
    }

    // Generate weighted random honor points between 1 and 10
    // Lower points have higher probability, higher points have lower probability
    const pointsGained = getWeightedRandomDailyPoints();

    // Update user
    user.honorPoints += pointsGained;
    user.lastDailyReset = now;
    await user.save();

    // Trigger leaderboard update (non-blocking)
    const leaderboardService = serviceRegistry.getLeaderboardService();
    if (leaderboardService) {
      leaderboardService.triggerUpdate().catch((error) => {
        console.error('[Daily] Error triggering leaderboard update:', error);
      });
    }

    // Update #honor-status log (1/1 = one daily claim per day)
    const statusLogService = serviceRegistry.getStatusLogService();
    if (statusLogService) {
      statusLogService.addLogEntry(
        interaction.user.username,
        interaction.user.id,
        pointsGained,
        1,
        1,
        'Daily check-in'
      ).catch((error) => {
        console.error('[Daily] Error updating status log:', error);
      });
    }

    // Create embed response
    const embed = new EmbedBuilder()
      .setColor(0x8b0000)
      .setTitle('🧘 Daily Meditation Complete')
      .setDescription(
        `**${interaction.user.username}**, your cultivation session has ended.\n\n` +
        `**Honor Points Gained:** ${pointsGained} ⚔️\n\n` +
        `**Total Honor Points:** ${user.honorPoints} 🏆`
      )
      .setFooter({
        text: 'Return tomorrow to claim your daily reward!',
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    sendBotsLog({
      botId: 'honorbot-pbz',
      category: 'daily',
      action: 'daily_claim',
      userId: interaction.user.id,
      username: interaction.user.username,
      details: { pointsGained, totalPoints: user.honorPoints },
    });
  } catch (error) {
    console.error('Error processing daily button:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Error')
      .setDescription('An error occurred while processing your daily check-in. Please try again later.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

/**
 * Handle the profile button interaction
 */
async function handleProfileButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  sendBotsLog({
    botId: 'honorbot-pbz',
    category: 'hall',
    action: 'profile_button',
    userId: interaction.user.id,
    username: interaction.user.username,
  });
  const fakeInteraction = {
    ...interaction,
    isChatInputCommand: () => true,
    commandName: 'profile',
    options: {
      getString: () => null,
      getInteger: () => null,
      getBoolean: () => null,
    },
    deferReply: interaction.deferReply.bind(interaction),
    editReply: interaction.editReply.bind(interaction),
    reply: interaction.reply.bind(interaction),
  } as any;
  try {
    await profileCommand.execute(fakeInteraction);
  } catch (err) {
    console.error('[ProfileButton] Error:', err);
    try {
      if ((interaction as any).deferred) {
        await interaction.editReply({ content: '❌ Could not load profile. Please try again later.' });
      } else {
        await interaction.reply({
          content: '❌ Could not load profile. Please try again later.',
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (_) {}
  }
}

/**
 * Handle the status button interaction (Tasks – Check Remaining Tasks)
 */
async function handleStatusButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  sendBotsLog({
    botId: 'honorbot-pbz',
    category: 'tasks',
    action: 'check_remaining_tasks',
    userId: interaction.user.id,
    username: interaction.user.username,
  });
  const fakeInteraction = {
    ...interaction,
    isChatInputCommand: () => true,
    commandName: 'status',
    options: {
      getString: () => null,
      getInteger: () => null,
      getBoolean: () => null,
    },
    deferReply: interaction.deferReply.bind(interaction),
    editReply: interaction.editReply.bind(interaction),
    reply: interaction.reply.bind(interaction),
  } as any;
  
  await statusCommand.execute(fakeInteraction);
}

/**
 * Handle the coin flip button interaction - show modal for bet input
 */
async function handleGambleButton(interaction: ButtonInteraction): Promise<void> {
  // Create modal for coin flip input
  const modal = new ModalBuilder()
    .setCustomId('gamble_modal')
    .setTitle('🎰 Coin Flip Game');

  const choiceInput = new TextInputBuilder()
    .setCustomId('gamble_choice')
    .setLabel('Choice (heads or tails)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Type: heads or tails')
    .setRequired(true)
    .setMaxLength(5)
    .setMinLength(4);

  const betInput = new TextInputBuilder()
    .setCustomId('gamble_bet')
    .setLabel('Bet Amount (1-5 points)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter amount between 1-5')
    .setRequired(true)
    .setMaxLength(1)
    .setMinLength(1);  const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(choiceInput);
  const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(betInput);  modal.addComponents(firstActionRow, secondActionRow);
  sendBotsLog({
    botId: 'honorbot-pbz',
    category: 'button',
    action: 'gamble_button_open_modal',
    userId: interaction.user.id,
    username: interaction.user.username,
  });
  await interaction.showModal(modal);
}/**
 * Handle the coin flip modal submission
 */
async function handleGambleModal(interaction: any): Promise<void> {
  // Use ephemeral reply so only the user who played can see the result
  await interaction.deferReply({ ephemeral: true });  try {
    // Check MongoDB connection
    if (mongoose.connection.readyState !== MONGODB_CONNECTED) {
      await interaction.editReply({
        content: '❌ Database connection is not available. Please try again later.',
      });
      return;
    }    const choice = interaction.fields.getTextInputValue('gamble_choice')?.toLowerCase().trim();
    const betAmountStr = interaction.fields.getTextInputValue('gamble_bet')?.trim();

    // Validate choice
    if (choice !== 'heads' && choice !== 'tails') {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Invalid Choice')
        .setDescription('Choice must be either "heads" or "tails"')
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Validate bet amount
    const betAmount = parseInt(betAmountStr, 10);
    if (isNaN(betAmount) || betAmount < 1 || betAmount > 5) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Invalid Bet Amount')
        .setDescription('Bet amount must be between 1-5 points')
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    const DAILY_LUCKY_DRAW_LIMIT = 5;
    const userChoice = choice as 'heads' | 'tails';

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

    // Check if user has enough points
    if (user.honorPoints < betAmount) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Insufficient Honor Points')
        .setDescription(
          `You don't have enough honor points to bet ${betAmount} points.\n\n` +
          `**Current Balance:** ${user.honorPoints} ⚔️\n` +
          `**Required:** ${betAmount} ⚔️`
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Daily reset logic for lucky draw
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
    if (user.dailyLuckyDrawCount >= DAILY_LUCKY_DRAW_LIMIT) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextResetTimestamp = Math.floor(tomorrow.getTime() / 1000);

      const errorEmbed = new EmbedBuilder()
        .setColor(0xffaa00)
        .setTitle('⏳ Daily Limit Reached')
        .setDescription(
          `You have already played **${DAILY_LUCKY_DRAW_LIMIT}** times today.\n\n` +
          `Come back <t:${nextResetTimestamp}:R> to play again!`
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Coin flip: Randomly choose heads or tails
    const coinResult: 'heads' | 'tails' = Math.random() < 0.5 ? 'heads' : 'tails';
    const didWin = userChoice === coinResult;

    // Update user points and daily count
    if (didWin) {
      // Win: Get double the bet amount (net profit = bet amount)
      user.honorPoints += betAmount;
    } else {
      // Lose: Lose the bet amount
      user.honorPoints -= betAmount;
    }

    user.dailyLuckyDrawCount += 1;
    user.lastLuckyDrawDate = now;
    await user.save();

    // Trigger leaderboard update (non-blocking)
    const leaderboardService = serviceRegistry.getLeaderboardService();
    if (leaderboardService) {
      leaderboardService.triggerUpdate().catch((error) => {
        console.error('[Gamble] Error triggering leaderboard update:', error);
      });
    }

    // Create result embed
    const userChoiceText = userChoice === 'heads' ? 'Heads' : 'Tails';
    const coinResultText = coinResult === 'heads' ? 'Heads' : 'Tails';
    
    const embed = new EmbedBuilder()
      .setColor(didWin ? 0x00ff00 : 0xff0000)
      .setTitle(didWin ? '🎉 You Won!' : '❌ You Lost')
      .setDescription(
        `**Your Choice:** ${userChoiceText} 🪙\n` +
        `**Coin Result:** ${coinResultText} 🪙\n\n` +
        `**Result:** ${didWin ? '**WIN** 🍀' : '**LOSE** 💔'}\n\n` +
        `**Bet Amount:** ${betAmount} ⚔️\n` +
        `${didWin ? `**Winnings:** +${betAmount * 2} ⚔️\n**Net Profit:** +${betAmount} ⚔️` : `**Loss:** -${betAmount} ⚔️`}\n\n` +
        `**New Balance:** ${user.honorPoints} ⚔️\n\n` +
        `**Daily Plays:** ${user.dailyLuckyDrawCount}/${DAILY_LUCKY_DRAW_LIMIT}`
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    sendBotsLog({
      botId: 'honorbot-pbz',
      category: 'gamble',
      action: 'coin_flip',
      userId: interaction.user.id,
      username: interaction.user.username,
      details: {
        choice: userChoice,
        result: coinResult,
        won: didWin,
        betAmount,
        newBalance: user.honorPoints,
        dailyPlays: user.dailyLuckyDrawCount,
      },
    });

    console.log(
      `[Coin Flip] User ${user.username} (${interaction.user.id}) bet ${betAmount} points. ` +
      `Choice: ${userChoice}, Result: ${coinResult}, ${didWin ? 'WIN' : 'LOSE'}. ` +
      `New balance: ${user.honorPoints}. Daily plays: ${user.dailyLuckyDrawCount}/${DAILY_LUCKY_DRAW_LIMIT}`
    );
  } catch (error) {
    console.error('Error processing coin flip modal:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Error')
      .setDescription('An error occurred while processing your coin flip. Please try again later.')
      .setTimestamp();

    try {
      await interaction.editReply({ embeds: [errorEmbed] });
    } catch (replyError) {
      // If editReply fails, try followUp
      try {
        await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      } catch (followUpError) {
        console.error('Could not send error message:', followUpError);
      }
    }
  }
}
