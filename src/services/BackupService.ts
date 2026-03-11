import { appendFileSync } from 'fs';
import { getDebugLogPath } from '../lib/debugLogPath.js';
import { User, IUser } from '../models/User';

export class BackupService {
  /**
   * Export all user data from the database as JSON (always reads current state from MongoDB).
   * Used by /backup export and scheduled backup — both use this, so backup = latest data at export time.
   * @returns JSON string and user count for confirmation
   */
  static async exportDatabase(): Promise<{ jsonData: string; count: number }> {
    try {
      console.log('[BackupService] Starting database export...');

      // Always read current state from MongoDB (no cache). Same DB as leaderboard.
      const users = await User.find({}).lean();
      console.log(`[BackupService] Found ${users.length} users to export`);

      if (users.length === 0) {
        console.warn('[BackupService] ⚠️ No users in database — backup will be empty. Check that MONGO_URI points to the correct MongoDB.');
      }

      const jsonData = JSON.stringify(users, null, 2);
      console.log('[BackupService] Database export completed successfully');
      return { jsonData, count: users.length };
    } catch (error) {
      console.error('[BackupService] Error exporting database:', error);
      throw new Error(`Failed to export database: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Import user data from JSON into the database
   * @param jsonData - JSON string or object containing array of user data
   * @returns Object with success status and statistics
   */
  static async importDatabase(jsonData: string | object): Promise<{ success: boolean; imported: number; updated: number; errors: number }> {
    try {
      console.log('[BackupService] Starting database import...');

      // Parse JSON if it's a string
      let userData: any[];
      if (typeof jsonData === 'string') {
        try {
          userData = JSON.parse(jsonData);
        } catch (parseError) {
          throw new Error('Invalid JSON format');
        }
      } else {
        userData = jsonData as any[];
      }

      // Validate that it's an array
      if (!Array.isArray(userData)) {
        throw new Error('Backup data must be an array of users');
      }

      // SECURITY: Limit array size to prevent DoS attacks
      const MAX_RECORDS = 100000;
      if (userData.length > MAX_RECORDS) {
        throw new Error(`Backup file too large. Maximum ${MAX_RECORDS} records allowed.`);
      }

      console.log(`[BackupService] Processing ${userData.length} user records...`);

      // #region agent log
      const sampleTop = (userData as any[]).slice(0, 5).map((u: any) => ({ userId: u.userId, honorPoints: u.honorPoints }));
      (()=>{const p={sessionId:'62e255',hypothesisId:'H2',location:'BackupService.importDatabase:start',message:'importDatabase called',data:{recordCount:userData.length,sampleTop},timestamp:Date.now()};fetch('http://localhost:7830/ingest/3f16d42f-49f9-4cb1-8d99-27cc6072eb7c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'62e255'},body:JSON.stringify(p)}).catch(()=>{});try{appendFileSync(getDebugLogPath(),JSON.stringify(p)+'\n');}catch(_){}})();
      // #endregion

      let imported = 0;
      let updated = 0;
      let errors = 0;

      // Use bulkWrite for efficient batch operations
      const operations = userData.map((user, index) => {
        try {
          // SECURITY: Validate required fields and formats
          if (!user.userId) {
            console.warn(`[BackupService] Record ${index + 1}: Missing userId, skipping`);
            errors++;
            return null;
          }

          // SECURITY: Validate userId format (Discord snowflake: 17-19 digits)
          if (typeof user.userId !== 'string' || !/^\d{17,19}$/.test(user.userId)) {
            console.warn(`[BackupService] Record ${index + 1}: Invalid userId format: ${user.userId}, skipping`);
            errors++;
            return null;
          }

          // SECURITY: Validate and sanitize username
          let username = user.username || 'Unknown';
          if (typeof username !== 'string') {
            username = String(username);
          }
          // Limit username length to prevent DoS
          if (username.length > 100) {
            username = username.substring(0, 100);
          }

          // SECURITY: Validate and sanitize numeric fields
          const honorPoints = typeof user.honorPoints === 'number' && Number.isFinite(user.honorPoints) && user.honorPoints >= 0
            ? Math.min(Math.floor(user.honorPoints), Number.MAX_SAFE_INTEGER)
            : 0;

          const dailyPoints = typeof user.dailyPoints === 'number' && Number.isFinite(user.dailyPoints) && user.dailyPoints >= 0
            ? Math.min(Math.floor(user.dailyPoints), Number.MAX_SAFE_INTEGER)
            : 0;

          const dailyCheckinStreak = typeof user.dailyCheckinStreak === 'number' && Number.isFinite(user.dailyCheckinStreak) && user.dailyCheckinStreak >= 0
            ? Math.min(Math.floor(user.dailyCheckinStreak), Number.MAX_SAFE_INTEGER)
            : 0;

          // SECURITY: Validate dates (prevent invalid dates)
          let lastMessageDate: Date;
          try {
            lastMessageDate = user.lastMessageDate ? new Date(user.lastMessageDate) : new Date();
            if (isNaN(lastMessageDate.getTime())) {
              lastMessageDate = new Date();
            }
          } catch {
            lastMessageDate = new Date();
          }

          let lastMessagePointsReset: Date;
          try {
            lastMessagePointsReset = user.lastMessagePointsReset ? new Date(user.lastMessagePointsReset) : new Date();
            if (isNaN(lastMessagePointsReset.getTime())) {
              lastMessagePointsReset = new Date();
            }
          } catch {
            lastMessagePointsReset = new Date();
          }

          let lastDailyReset: Date;
          try {
            lastDailyReset = user.lastDailyReset ? new Date(user.lastDailyReset) : new Date(0);
            if (isNaN(lastDailyReset.getTime())) {
              lastDailyReset = new Date(0);
            }
          } catch {
            lastDailyReset = new Date(0);
          }

          let lastCheckinDate: Date;
          try {
            lastCheckinDate = user.lastCheckinDate ? new Date(user.lastCheckinDate) : new Date(0);
            if (isNaN(lastCheckinDate.getTime())) {
              lastCheckinDate = new Date(0);
            }
          } catch {
            lastCheckinDate = new Date(0);
          }

          const honorPointsAtMonthStart =
            typeof user.honorPointsAtMonthStart === 'number' && Number.isFinite(user.honorPointsAtMonthStart)
              ? Math.min(Math.floor(user.honorPointsAtMonthStart), Number.MAX_SAFE_INTEGER)
              : honorPoints;

          let lastMonthlySnapshotAt: Date;
          try {
            lastMonthlySnapshotAt = user.lastMonthlySnapshotAt ? new Date(user.lastMonthlySnapshotAt) : new Date(0);
            if (isNaN(lastMonthlySnapshotAt.getTime())) lastMonthlySnapshotAt = new Date(0);
          } catch {
            lastMonthlySnapshotAt = new Date(0);
          }

          // Prepare update data (exclude _id and mongoose internals)
          const updateData: Partial<IUser> = {
            userId: user.userId,
            username: username,
            honorPoints: honorPoints,
            lastMessageDate: lastMessageDate,
            dailyPoints: dailyPoints,
            lastMessagePointsReset: lastMessagePointsReset,
            lastDailyReset: lastDailyReset,
            dailyCheckinStreak: dailyCheckinStreak,
            lastCheckinDate: lastCheckinDate,
            honorPointsAtMonthStart,
            lastMonthlySnapshotAt,
          };

          return {
            updateOne: {
              filter: { userId: user.userId },
              update: { $set: updateData },
              upsert: true,
            },
          };
        } catch (error) {
          console.error(`[BackupService] Error processing record ${index + 1}:`, error);
          errors++;
          return null;
        }
      }).filter((op) => op !== null) as any[];

      console.log(`[BackupService] Executing ${operations.length} bulk operations...`);

      // #region agent log
      (()=>{const p={sessionId:'62e255',hypothesisId:'H2',location:'BackupService.importDatabase:beforeBulkWrite',message:'importDatabase about to bulkWrite',data:{operationsCount:operations.length},timestamp:Date.now()};fetch('http://localhost:7830/ingest/3f16d42f-49f9-4cb1-8d99-27cc6072eb7c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'62e255'},body:JSON.stringify(p)}).catch(()=>{});try{appendFileSync(getDebugLogPath(),JSON.stringify(p)+'\n');}catch(_){}})();
      // #endregion

      // Execute bulk write
      if (operations.length > 0) {
        const result = await User.bulkWrite(operations, { ordered: false });
        imported = result.upsertedCount || 0;
        updated = result.modifiedCount || 0;
        console.log(`[BackupService] Import completed: ${imported} imported, ${updated} updated`);
      }

      console.log('[BackupService] Database import completed successfully');
      return {
        success: true,
        imported,
        updated,
        errors,
      };
    } catch (error) {
      console.error('[BackupService] Error importing database:', error);
      throw new Error(`Failed to import database: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
