import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { User } from '../models/User';

/**
 * Get weighted random points for daily check-in (1-10)
 * Distribution favors lower points:
 * 1 point (30%), 2 points (20%), 3 points (15%), 4 points (12%), 5 points (10%),
 * 6 points (6%), 7 points (4%), 8 points (2%), 9 points (0.5%), 10 points (0.5%)
 * @returns Points from 1-10 with weighted probability
 */
export function getWeightedRandomDailyPoints(): number {
  const random = Math.random() * 100; // Generate random number 0-100
  
  if (random < 30) {
    return 1; // 30% chance
  } else if (random < 50) {
    return 2; // 20% chance (30-50)
  } else if (random < 65) {
    return 3; // 15% chance (50-65)
  } else if (random < 77) {
    return 4; // 12% chance (65-77)
  } else if (random < 87) {
    return 5; // 10% chance (77-87)
  } else if (random < 93) {
    return 6; // 6% chance (87-93)
  } else if (random < 97) {
    return 7; // 4% chance (93-97)
  } else if (random < 99) {
    return 8; // 2% chance (97-99)
  } else if (random < 99.5) {
    return 9; // 0.5% chance (99-99.5)
  } else {
    return 10; // 0.5% chance (99.5-100)
  }
}

export const data = new SlashCommandBuilder()
  .setName('daily')
  .setDescription('Claim your daily honor points meditation reward');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    // Block slash command usage - users must use the button in the daily-checkin channel
    const dailyChannelId = process.env.DAILYCHECKING_CHANNEL_ID;
    
    let channelMention = 'the daily check-in channel';
    if (dailyChannelId) {
      try {
        const channel = await interaction.client.channels.fetch(dailyChannelId);
        if (channel) {
          channelMention = `<#${dailyChannelId}>`;
        }
      } catch (error) {
        // Channel not found or not accessible, use default text
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x8b0000)
      .setTitle('⚠️ Please Use the Button')
      .setDescription(
        `**${interaction.user.username}**, please use the **"Claim Daily"** button in ${channelMention} to claim your daily reward.\n\n` +
        `The slash command \`/daily\` is disabled. You must click the button in the daily check-in channel to claim your honor points.`
      )
      .setFooter({
        text: 'Look for the "Claim Daily" button in the daily check-in channel!',
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  } catch (error) {
    console.error('Error processing daily command:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Error')
      .setDescription('An error occurred. Please try using the button in the daily check-in channel instead.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}
