import { parseMatchStart } from './MatchTime';

// Mirrors backend/src/matchTiming.ts: a match counts as live from toss time
// (30 min before start) until the longest realistic duration for its format,
// unless CricAPI already says it ended.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const TOSS_BEFORE_START_MS = 30 * MINUTE;

const MAX_DURATION_MS: Record<string, number> = {
  t10: 3 * HOUR,
  t20: 6 * HOUR,
  odi: 11 * HOUR,
  test: 5 * DAY + 9 * HOUR,
  other: 9 * HOUR,
};

const maxDuration = (matchType?: string): number => {
  const t = (matchType || '').toLowerCase();
  if (t.includes('t10')) return MAX_DURATION_MS.t10;
  if (t.includes('t20')) return MAX_DURATION_MS.t20;
  if (t.includes('odi')) return MAX_DURATION_MS.odi;
  if (t.includes('test')) return MAX_DURATION_MS.test;
  return MAX_DURATION_MS.other;
};

export const isClockLive = (dateTimeGMT?: string, matchType?: string, now: number = Date.now()): boolean => {
  const start = parseMatchStart(dateTimeGMT)?.getTime();
  if (start === undefined) return false;
  return now >= start - TOSS_BEFORE_START_MS && now < start + maxDuration(matchType);
};
