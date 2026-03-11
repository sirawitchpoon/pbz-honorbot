import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { BackupService } from '../services/BackupService';
import { getDebugLogPath } from '../lib/debugLogPath.js';
import { serviceRegistry } from '../services/ServiceRegistry';

const AUDIT_LOG_DIR = resolve(process.cwd(), 'database-backups');
const IMPORT_AUDIT_LOG = resolve(AUDIT_LOG_DIR, 'import-audit.log');

function writeImportAuditLog(entry: { timestamp: string; userId: string; username: string; filename: string; imported: number; updated: number; errors: number }): void {
  try {
    if (!existsSync(AUDIT_LOG_DIR)) {
      mkdirSync(AUDIT_LOG_DIR, { recursive: true });
    }
    const line = `${entry.timestamp}\t${entry.userId}\t${entry.username}\t${entry.filename}\timported=${entry.imported}\tupdated=${entry.updated}\terrors=${entry.errors}\n`;
    appendFileSync(IMPORT_AUDIT_LOG, line);
  } catch (e) {
    console.error('[Backup] Failed to write import audit log:', e);
  }
}

export const data = new SlashCommandBuilder()
  .setName('backup')
  .setDescription('Backup or restore database (Administrator only)')
  // Note: We check permissions in execute() to allow visibility but enforce admin requirement
  .addSubcommand((subcommand) =>
    subcommand
      .setName('export')
      .setDescription('Export database to JSON → ส่งลงช่อง backup (หรือ DM ถ้าไม่ได้ตั้งช่อง)')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('import')
      .setDescription('Import database from JSON file attachment')
      .addAttachmentOption((option) =>
        option
          .setName('file')
          .setDescription('JSON backup file to import')
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('export-monthly')
      .setDescription('Send last month\'s Top 10 leaderboard to BACKUP_LEADERBOARD_CHANNEL_ID (Bangkok time)')
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  // Check if user has Administrator permission
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: '❌ You need Administrator permissions to use this command.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const subcommand = interaction.options.getSubcommand();

  try {
    if (subcommand === 'export') {
      console.log(`[Backup] Export requested by ${interaction.user.tag} (${interaction.user.id})`);

      const apiUrl = (process.env.HONOR_POINTS_API_URL ?? '').replace(/\/$/, '');
      const apiKey = process.env.HONOR_POINTS_API_KEY ?? '';
      if (apiUrl && apiKey) {
        try {
          const res = await fetch(`${apiUrl}/api/backup/export`, {
            method: 'POST',
            headers: { 'X-API-Key': apiKey },
          });
          const data = (await res.json().catch(() => ({}))) as { success?: boolean; count?: number; error?: string };
          if (res.ok && data.success) {
            await interaction.editReply({
              content: `✅ Backup export ส่งให้ **Honor Points Service** ส่งไปช่อง backup แล้ว (${data.count ?? '?'} users)`,
            });
            return;
          }
          await interaction.editReply({
            content: `❌ Honor Points Service ตอบกลับไม่สำเร็จ: ${data.error ?? res.statusText}`,
          });
          return;
        } catch (err) {
          console.error('[Backup] Honor Points Service request failed:', err);
          await interaction.editReply({
            content: `❌ เรียก Honor Points Service ไม่ได้ (ตรวจสอบ HONOR_POINTS_API_URL และให้ service รันอยู่)`,
          });
          return;
        }
      }

      await interaction.editReply({
        content: '❌ ตั้งค่า `HONOR_POINTS_API_URL` และ `HONOR_POINTS_API_KEY` ใน .env เพื่อให้ backup export ทำงาน (จัดการโดย Honor Points Service)',
      });
    } else if (subcommand === 'import') {
      const attachment = interaction.options.getAttachment('file');

      if (!attachment) {
        await interaction.editReply({
          content: '❌ No file attachment provided.',
        });
        return;
      }

      // Validate file type
      if (!attachment.name?.endsWith('.json')) {
        await interaction.editReply({
          content: '❌ Invalid file type. Please upload a .json file.',
        });
        return;
      }

      // Check file size (limit to 10MB)
      if (attachment.size > 10 * 1024 * 1024) {
        await interaction.editReply({
          content: '❌ File too large. Maximum size is 10MB.',
        });
        return;
      }

      console.log(`[Backup] Import requested by ${interaction.user.tag} (${interaction.user.id})`);
      console.log(`[Backup] File: ${attachment.name}, Size: ${attachment.size} bytes`);

      // #region agent log
      (()=>{const p={sessionId:'62e255',hypothesisId:'H1',location:'backup.ts:import-requested',message:'Discord backup import requested',data:{userId:interaction.user.id,userTag:interaction.user.tag,filename:attachment.name??'unknown',size:attachment.size},timestamp:Date.now()};fetch('http://localhost:7830/ingest/3f16d42f-49f9-4cb1-8d99-27cc6072eb7c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'62e255'},body:JSON.stringify(p)}).catch(()=>{});try{appendFileSync(getDebugLogPath(),JSON.stringify(p)+'\n');}catch(_){}});
      // #endregion

      // Fetch file content
      try {
        const response = await fetch(attachment.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.statusText}`);
        }

        const jsonText = await response.text();

        // Import database
        const result = await BackupService.importDatabase(jsonText);

        // #region agent log
        (()=>{const p={sessionId:'62e255',hypothesisId:'H1',location:'backup.ts:import-completed',message:'Discord backup import completed',data:{imported:result.imported,updated:result.updated,errors:result.errors},timestamp:Date.now()};fetch('http://localhost:7830/ingest/3f16d42f-49f9-4cb1-8d99-27cc6072eb7c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'62e255'},body:JSON.stringify(p)}).catch(()=>{});try{appendFileSync(getDebugLogPath(),JSON.stringify(p)+'\n');}catch(_){}});
        // #endregion

        writeImportAuditLog({
          timestamp: new Date().toISOString(),
          userId: interaction.user.id,
          username: interaction.user.tag,
          filename: attachment.name ?? 'unknown.json',
          imported: result.imported,
          updated: result.updated,
          errors: result.errors,
        });

        await interaction.editReply({
          content: `✅ Database import completed!\n\n` +
            `📥 **Imported:** ${result.imported} users\n` +
            `🔄 **Updated:** ${result.updated} users\n` +
            `❌ **Errors:** ${result.errors} records`,
        });

        console.log(`[Backup] Import completed: ${result.imported} imported, ${result.updated} updated, ${result.errors} errors`);
      } catch (fetchError) {
        console.error('[Backup] Error fetching file:', fetchError);
        await interaction.editReply({
          content: '❌ Failed to download the backup file. Please try again.',
        });
      }
    } else if (subcommand === 'export-monthly') {
      const channelId = (process.env.BACKUP_LEADERBOARD_CHANNEL_ID ?? '').trim();
      if (!channelId || !/^\d{17,19}$/.test(channelId)) {
        await interaction.editReply({
          content: '❌ `BACKUP_LEADERBOARD_CHANNEL_ID` is not set or invalid in .env',
        });
        return;
      }
      const leaderboardService = serviceRegistry.getLeaderboardService();
      if (!leaderboardService) {
        await interaction.editReply({
          content: '❌ Leaderboard service is not available.',
        });
        return;
      }
      const ok = await leaderboardService.exportMonthlyLeaderboardNow();
      if (ok) {
        await interaction.editReply({
          content: `✅ ส่งตารางคะแนนรายเดือน (เดือนที่เพิ่งจบ ตามเวลาไทย) ไปที่ <#${channelId}> แล้ว`,
        });
      } else {
        await interaction.editReply({
          content: '❌ ส่งตารางรายเดือนไม่สำเร็จ ดู log ใน console',
        });
      }
    }
  } catch (error) {
    console.error('[Backup] Error executing backup command:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    await interaction.editReply({
      content: `❌ Error: ${errorMessage}\n\nPlease check the console for details.`,
    });
  }
}
