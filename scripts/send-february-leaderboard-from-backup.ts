/**
 * Send February 2026 leaderboard (from backup 28 Feb 7:22 AM) to BACKUP_LEADERBOARD_CHANNEL_ID.
 * Use when the auto-export at month end had the wrong month label but the data was actually February.
 *
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/send-february-leaderboard-from-backup.ts [path-to-backup.json]
 * Default: database-backups/incoming/phantom_backup_2026-02-28.json
 */
import dotenv from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { Client, GatewayIntentBits, TextChannel, EmbedBuilder, AttachmentBuilder } from 'discord.js';

dotenv.config({ path: resolve(__dirname, '../.env') });

const MONTH_LABEL = 'February 2026';
const FILE_MONTH = '2026-02';

function main() {
  const backupPath = process.argv[2] || resolve(__dirname, '../database-backups/incoming/phantom_backup_2026-02-28.json');
  console.log('Using backup:', backupPath);

  const raw = readFileSync(backupPath, 'utf-8').trim();
  const users = JSON.parse(raw);
  if (!Array.isArray(users)) {
    console.error('Backup must be a JSON array of users');
    process.exit(1);
  }

  const withMonthly = users.map((u: any) => ({
    userId: u.userId,
    username: u.username || 'Unknown',
    honorPoints: u.honorPoints ?? 0,
    monthlyPoints: (u.honorPoints ?? 0) - (u.honorPointsAtMonthStart ?? 0),
  }));

  const top10 = withMonthly
    .filter((u: any) => u.monthlyPoints > 0)
    .sort((a: any, b: any) => b.monthlyPoints - a.monthlyPoints)
    .slice(0, 10)
    .map((u: any, i: number) => ({ rank: i + 1, ...u }));

  const now = new Date();
  const payload = {
    month: MONTH_LABEL,
    exportedAt: now.toISOString(),
    top10,
  };
  const json = JSON.stringify(payload, null, 2);
  const attachment = new AttachmentBuilder(Buffer.from(json, 'utf-8'), {
    name: `leaderboard_${FILE_MONTH}.json`,
  });

  const desc =
    top10.length === 0
      ? `*No points earned in ${MONTH_LABEL}*`
      : top10
          .map((u: any) => {
            const emoji = u.rank === 1 ? '🥇' : u.rank === 2 ? '🥈' : u.rank === 3 ? '🥉' : '';
            return `${emoji} ${u.rank}. <@${u.userId}> - **${Number(u.monthlyPoints).toLocaleString()}** Honor`;
          })
          .join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x5a3d2b)
    .setTitle(`📜 Jianghu Rankings – (${MONTH_LABEL}) (Top 10)`)
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

  const channelId = (process.env.BACKUP_LEADERBOARD_CHANNEL_ID ?? '').trim();
  const token = process.env.DISCORD_TOKEN;
  if (!channelId || !/^\d{17,19}$/.test(channelId)) {
    console.error('BACKUP_LEADERBOARD_CHANNEL_ID not set or invalid in .env');
    process.exit(1);
  }
  if (!token) {
    console.error('DISCORD_TOKEN not set in .env');
    process.exit(1);
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once('ready', async () => {
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel?.isTextBased()) {
        await (channel as TextChannel).send({ embeds: [embed], files: [attachment] });
        console.log('✓ Sent February 2026 leaderboard to channel', channelId);
      } else {
        console.error('Channel is not text-based');
      }
    } catch (err) {
      console.error('Failed to send:', err);
    } finally {
      client.destroy();
      process.exit(0);
    }
  });

  client.login(token).catch((err) => {
    console.error('Login failed:', err);
    process.exit(1);
  });
}

main();
