import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { User } from '../models/User';

const DAILY_LUCKY_DRAW_LIMIT = 5;
const MAX_BET_AMOUNT = 5; // Maximum bet amount per play

export const data = new SlashCommandBuilder()
  .setName('gamble')
  .setDescription('Play coin flip with honor points (Honor-coin-flip)')
  .addStringOption((option) =>
    option
      .setName('choice')
      .setDescription('Choose heads or tails')
      .setRequired(true)
      .addChoices(
        { name: 'Heads', value: 'heads' },
        { name: 'Tails', value: 'tails' }
      )
  )
  .addIntegerOption((option) =>
    option
      .setName('bet_amount')
      .setDescription(`Amount of honor points to bet (max ${MAX_BET_AMOUNT})`)
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(MAX_BET_AMOUNT)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  // Only defer if not already deferred (for modal submissions)
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }

  try {
    const betAmount = interaction.options.getInteger('bet_amount', true);
    const userChoice = interaction.options.getString('choice', true) as 'heads' | 'tails';

    // Validate bet amount
    if (betAmount <= 0 || betAmount > MAX_BET_AMOUNT) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Invalid Bet Amount')
        .setDescription(`Bet amount must be between 1-${MAX_BET_AMOUNT} points`)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
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

    console.log(
      `[Coin Flip] User ${user.username} (${interaction.user.id}) bet ${betAmount} points. ` +
      `Choice: ${userChoice}, Result: ${coinResult}, ${didWin ? 'WIN' : 'LOSE'}. ` +
      `New balance: ${user.honorPoints}. Daily plays: ${user.dailyLuckyDrawCount}/${DAILY_LUCKY_DRAW_LIMIT}`
    );
  } catch (error) {
    console.error('[Coin Flip] Error processing coin flip:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Error')
      .setDescription('An error occurred while processing your coin flip. Please try again later.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}
