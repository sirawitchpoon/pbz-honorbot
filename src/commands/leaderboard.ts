import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { User } from '../models/User';

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('View the top 10 warriors in the Honor Points leaderboard')
  .addSubcommand((sc) =>
    sc.setName('all').setDescription('All-time leaderboard (total honor points)')
  )
  .addSubcommand((sc) =>
    sc.setName('monthly').setDescription('This month\'s leaderboard (points earned this month only)')
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const subcommand = interaction.options.getSubcommand() ?? 'all';

  try {
    if (subcommand === 'monthly') {
      const allUsers = await User.find({}).lean();
      const now = new Date();
      const monthLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });

      const withMonthly = allUsers.map((u) => ({
        ...u,
        monthlyPoints: (u.honorPoints ?? 0) - (u.honorPointsAtMonthStart ?? 0),
      }));

      const topUsers = withMonthly
        .filter((u) => u.monthlyPoints > 0)
        .sort((a, b) => b.monthlyPoints - a.monthlyPoints)
        .slice(0, 10);

      if (topUsers.length === 0) {
        const embed = new EmbedBuilder()
          .setColor(0x5a3d2b)
          .setTitle(`📜 Jianghu Rankings – (${monthLabel}) (Top 10)`)
          .setDescription('*No points earned this month yet. Be the first!*')
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      let description = '';
      for (let i = 0; i < topUsers.length; i++) {
        const user = topUsers[i];
        const rank = i + 1;
        const pts = user.monthlyPoints;
        const emoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
        description += `${emoji} **${rank}.** <@${user.userId}> - **${pts.toLocaleString()}** Honor\n`;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5a3d2b)
        .setTitle(`📜 Jianghu Rankings – (${monthLabel}) (Top 10)`)
        .setDescription(description)
        .setFooter({ text: 'Points earned this month only. Total points never decrease.' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // All-time (default)
    const topUsers = await User.find({})
      .sort({ honorPoints: -1 })
      .limit(10)
      .lean();

    if (topUsers.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0x8b0000)
        .setTitle('🏆 Jianghu Rankings (Top 10)')
        .setDescription('*No warriors have earned honor points yet. Be the first!*')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    let description = '';
    for (let i = 0; i < topUsers.length; i++) {
      const user = topUsers[i];
      const rank = i + 1;
      const honorPoints = user.honorPoints || 0;
      const emoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
      description += `${emoji} **${rank}.** <@${user.userId}> - **${honorPoints.toLocaleString()}** Honor\n`;
    }

    const embed = new EmbedBuilder()
      .setColor(0x8b0000)
      .setTitle('🏆 Jianghu Rankings – All Time (Top 10)')
      .setDescription(description)
      .setFooter({ text: 'Use /daily to claim rewards and climb the ranks!' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error processing leaderboard command:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Error')
      .setDescription('An error occurred while fetching the leaderboard. Please try again later.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}
