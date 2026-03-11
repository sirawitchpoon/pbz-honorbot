/**
 * Send action logs to discord-bots-logger API for Google Sheet sync.
 * Fire-and-forget; does not block. Requires BOTS_LOGGER_URL and BOTS_LOGGER_API_KEY in .env.
 */

const LOGGER_URL = (process.env.BOTS_LOGGER_URL ?? '').replace(/\/$/, '');
const LOGGER_API_KEY = process.env.BOTS_LOGGER_API_KEY ?? '';

export function isBotsLoggerEnabled(): boolean {
  return Boolean(LOGGER_URL && LOGGER_API_KEY);
}

export interface BotsLogPayload {
  botId: string;
  category: string;
  action: string;
  userId: string;
  username?: string;
  details?: Record<string, unknown>;
}

/**
 * Send a single log entry to the logger API. Non-blocking; errors are logged only.
 */
export function sendBotsLog(payload: BotsLogPayload): void {
  if (!isBotsLoggerEnabled()) return;

  const url = `${LOGGER_URL}/api/logs`;
  const body = JSON.stringify({
    botId: payload.botId,
    category: payload.category,
    action: payload.action,
    userId: payload.userId,
    username: payload.username ?? undefined,
    details: payload.details ?? undefined,
  });

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': LOGGER_API_KEY,
    },
    body,
  }).catch((err) => {
    console.error('[BotsLogger] Failed to send log:', err);
  });
}
