/**
 * Recover honor points for 2026-03-03:
 * 1. Restore DB from phantom_backup_2026-03-03.json (state at 11:00 Thailand)
 * 2. Replay chat CSV with 1 point per message, max 5 per day, only messages after 11:00 Thailand (04:00 UTC)
 *
 * Run from project root:
 *   npx ts-node scripts/recover-points-2026-03-03.ts
 *
 * Or run steps manually:
 *   npx ts-node scripts/restore-from-json-backup.ts database-backups/incoming/phantom_backup_2026-03-03.json
 *   npx ts-node scripts/replay-chat-export-to-points.ts "database-backups/incoming/PBZ _ General Chat (EN) - 2026-03-03.csv" --base-date=2026-03-03 --after-date=2026-03-03T04:00:00.000Z --points-per-message=1
 */
import { execSync } from 'child_process';
import { resolve } from 'path';

const projectRoot = resolve(__dirname, '..');
const backupPath = resolve(projectRoot, 'database-backups/incoming/phantom_backup_2026-03-03.json');
const csvPath = resolve(projectRoot, 'database-backups/incoming/PBZ _ General Chat (EN) - 2026-03-03.csv');
// 11:00 Thailand (UTC+7) = 04:00 UTC
const afterDate = '2026-03-03T04:00:00.000Z';
const baseDate = '2026-03-03';

console.log('[Recovery] Step 1: Restore from backup', backupPath);
execSync(`npx ts-node scripts/restore-from-json-backup.ts "${backupPath}"`, {
  cwd: projectRoot,
  stdio: 'inherit',
});

console.log('\n[Recovery] Step 2: Replay chat CSV (1 pt/message, max 5/day, after 11:00 Thailand)');
execSync(
  `npx ts-node scripts/replay-chat-export-to-points.ts "${csvPath}" --base-date=${baseDate} --after-date=${afterDate} --points-per-message=1`,
  { cwd: projectRoot, stdio: 'inherit' }
);

console.log('\n[Recovery] Done. Points restored from backup and chat replay (1 pt/msg, max 5/day).');
