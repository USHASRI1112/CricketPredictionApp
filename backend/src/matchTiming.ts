// When a match is "live" by the clock, and when its finish is close enough to
// check every couple of minutes. Mirrored in the app's src/helpers/MatchTiming.ts.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const TOSS_BEFORE_START_MS = 30 * MINUTE;

interface FormatTiming {
  trackEndFrom: number; // earliest realistic finish, measured from scheduled start
  maxDuration: number;  // after this, stop assuming it is live
}

const TIMING: Record<string, FormatTiming> = {
  t10:   { trackEndFrom: 75 * MINUTE,        maxDuration: 3 * HOUR },
  t20:   { trackEndFrom: 2 * HOUR + 45 * MINUTE, maxDuration: 6 * HOUR },
  odi:   { trackEndFrom: 7 * HOUR,           maxDuration: 11 * HOUR },
  test:  { trackEndFrom: 4 * DAY + 4 * HOUR, maxDuration: 5 * DAY + 9 * HOUR },
  other: { trackEndFrom: 2 * HOUR + 45 * MINUTE, maxDuration: 9 * HOUR },
};

export function formatTiming(matchType?: string): FormatTiming {
  const t = (matchType || '').toLowerCase();
  if (t.includes('t10')) return TIMING.t10;
  if (t.includes('t20')) return TIMING.t20;
  if (t.includes('odi')) return TIMING.odi;
  if (t.includes('test')) return TIMING.test;
  return TIMING.other;
}

// From toss time until the format's longest realistic duration.
export function isClockLive(startMs: number, matchType: string | undefined, now: number): boolean {
  if (!Number.isFinite(startMs)) return false;
  return now >= startMs - TOSS_BEFORE_START_MS && now < startMs + formatTiming(matchType).maxDuration;
}

export function isInEndWindow(startMs: number, matchType: string | undefined, now: number): boolean {
  if (!Number.isFinite(startMs)) return false;
  const timing = formatTiming(matchType);
  return now >= startMs + timing.trackEndFrom && now < startMs + timing.maxDuration;
}
