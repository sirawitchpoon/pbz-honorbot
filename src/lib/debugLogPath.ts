import path from 'path';

/**
 * Path for debug log file. When LOG_DIR is set (e.g. in Docker: /app/logs),
 * log is written there so it persists on host volume after restart.
 */
export function getDebugLogPath(): string {
  const base = process.env.LOG_DIR || process.cwd();
  return path.join(base, 'debug-62e255.log');
}
