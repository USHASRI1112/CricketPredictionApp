import { backendUrl } from '../config/Backend';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
let cachedKey: string | undefined;
let refreshedAt = 0;
let pending: Promise<string> | undefined;

// This is remotely managed configuration, not a secret: clients can read the key.
export async function getCricApiKey(): Promise<string> {
  if (cachedKey && Date.now() - refreshedAt < REFRESH_INTERVAL_MS) {
    return cachedKey;
  }
  if (pending) {
    return pending;
  }

  pending = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(backendUrl('/config/cric-api'), { signal: controller.signal });
      if (!response.ok) throw new Error('Cric API configuration request failed');
      const config: { apiKey?: unknown } = await response.json();
      const key = config.apiKey;
      if (typeof key !== 'string' || !key.trim()) {
        throw new Error('Cric API configuration is missing apiKey');
      }
      cachedKey = key.trim();
      refreshedAt = Date.now();
      return cachedKey;
    } catch {
      // Keep an already running session usable during a temporary backend outage.
      // Do not reset refreshedAt: the next request should retry the server lookup.
      if (cachedKey) {
        return cachedKey;
      }
      throw new Error('Unable to load Cric API configuration from backend');
    } finally {
      clearTimeout(timeout);
    }
  })();

  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}
