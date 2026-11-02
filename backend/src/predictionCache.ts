import type { PredictRequest, PredictionResponse } from './cricket';

// One Groq call per match phase, shared by every user (and by the
// "prediction ready" notification), instead of one call per tap.
const TTL_MS = {
  upcoming: 6 * 60 * 60 * 1000,
  live: 5 * 60 * 1000,
  ended: Infinity,
};
const MAX_MISSES_PER_MINUTE = 30;
const MAX_CONCURRENT_MISSES = 5;

export class PredictionRateLimitedError extends Error {}

export interface CachedPrediction {
  phase: keyof typeof TTL_MS;
  createdAt: number;
  result: PredictionResponse;
}

export interface PredictionStore {
  get(matchId: string): Promise<CachedPrediction | undefined>;
  set(matchId: string, value: CachedPrediction): Promise<void>;
}

export function predictionPhase(data: PredictRequest): CachedPrediction['phase'] {
  if (data.matchEnded) return 'ended';
  return data.scoreText?.trim() ? 'live' : 'upcoming';
}

export function createCachedPredictor(
  predict: (data: PredictRequest) => Promise<PredictionResponse>,
  store: PredictionStore,
  now: () => number = Date.now,
) {
  const memory = new Map<string, CachedPrediction>();
  const inFlight = new Map<string, Promise<PredictionResponse>>();
  let active = 0;
  let windowStart = now();
  let misses = 0;

  const isFresh = (entry: CachedPrediction | undefined, phase: CachedPrediction['phase']) =>
    !!entry && entry.phase === phase && now() - entry.createdAt < TTL_MS[phase];

  return async function cachedPredict(data: PredictRequest): Promise<PredictionResponse> {
    const phase = predictionPhase(data);
    const key = `${data.matchId}:${phase}`;

    let entry = memory.get(data.matchId);
    if (!isFresh(entry, phase)) {
      entry = await store.get(data.matchId).catch(() => undefined);
      if (entry) memory.set(data.matchId, entry);
    }
    if (entry && isFresh(entry, phase)) return entry.result;

    const pending = inFlight.get(key);
    if (pending) return pending;

    if (now() - windowStart >= 60000) {
      windowStart = now();
      misses = 0;
    }
    // Global guard protects the paid AI API; cache hits are never limited.
    if (active >= MAX_CONCURRENT_MISSES || misses >= MAX_MISSES_PER_MINUTE) {
      throw new PredictionRateLimitedError('Too many prediction requests');
    }
    misses++;
    active++;
    const run = (async () => {
      try {
        const result = await predict(data);
        const fresh: CachedPrediction = { phase, createdAt: now(), result };
        if (memory.size >= 500) memory.delete(memory.keys().next().value as string);
        memory.set(data.matchId, fresh);
        await store.set(data.matchId, fresh).catch(() => undefined);
        return result;
      } finally {
        active--;
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, run);
    return run;
  };
}
