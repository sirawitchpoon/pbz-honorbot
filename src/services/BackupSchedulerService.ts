import * as cron from 'node-cron';
import { Client, TextChannel, AttachmentBuilder } from 'discord.js';
import { BackupService } from './BackupService';

export class BackupSchedulerService {
  private cronJob: cron.ScheduledTask | null = null;
  private client: Client | null = null;

  public start(client: Client): void {
    this.client = client;
    const channelId = process.env.BACKUP_DATABASE_CHANNEL_ID;

    if (!channelId || !/^\d{17,19}$/.test(channelId)) {
      console.warn('[BackupScheduler] BACKUP_DATABASE_CHANNEL_ID not set or invalid. Scheduled backup disabled.');
      return;
    }

    // ทุกชั่วโมงเวลาไทย (นาทีที่ 0)
    this.cronJob = cron.schedule(
      '0 * * * *',
      () => {
        this.runScheduledBackup();
      },
      { timezone: 'Asia/Bangkok' }
    );

    const mongoUri = process.env.MONGO_URI ?? '';
    const mongoHint = mongoUri ? mongoUri.replace(/\/\/[^@]+@/, '//***@') : '(not set)';
    console.log('[BackupScheduler] Started. Backup every hour (Asia/Bangkok) → channel', channelId, '| MONGO_URI:', mongoHint);
  }

  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    this.client = null;
    console.log('[BackupScheduler] Stopped.');
  }

  public runScheduledBackup(): void {
    const channelId = process.env.BACKUP_DATABASE_CHANNEL_ID;
    const client = this.client;
    if (!client || !channelId) return;

    const mongoHint = (process.env.MONGO_URI ?? '').replace(/\/\/[^@]+@/, '//***@') || '(not set)';
    console.log('[BackupScheduler] ⏰ Running scheduled database backup... MONGO_URI:', mongoHint);
    BackupService.exportDatabase()
      .then(({ jsonData, count }) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const filename = `phantom_backup_${timestamp}.json`;
        const isEmpty = count === 0;
        return client.channels.fetch(channelId).then((ch) => ({ ch, jsonData, filename, count, isEmpty }));
      })
      .then(({ ch, jsonData, filename, count, isEmpty }) => {
        if (!ch?.isTextBased()) {
          console.error('[BackupScheduler] Channel not found or not text channel:', channelId);
          return;
        }
        const attachment = new AttachmentBuilder(Buffer.from(jsonData, 'utf-8'), { name: filename });
        const warning = isEmpty
          ? '\n⚠️ **Backup is empty (0 users).** Bot may be connected to a different/empty MongoDB. Check `MONGO_URI` on this server.'
          : '';
        return (ch as TextChannel).send({
          content: `📦 **Scheduled Database Backup**\n\`${filename}\`\n*ทุกชั่วโมง (เวลาไทย)*\n📊 **ข้อมูลล่าสุดจาก DB ตอน export:** ${count} users${warning}`,
          files: [attachment],
        });
      })
      .then(() => console.log('[BackupScheduler] ✓ Backup sent to channel', channelId))
      .catch((err) => console.error('[BackupScheduler] ❌ Scheduled backup failed:', err));
  }
}
