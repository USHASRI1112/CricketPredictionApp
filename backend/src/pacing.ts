// Pure scheduling rules for CricAPI refreshes and push notifications.

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
export const LIST_REFRESH_MS = 2 * 60 * MINUTE; // full fixtures list
export const LIST_PAGES = 2;
const MIN_INTERVAL_ACTIVE_MS = 10 * MINUTE;   // users in app, or a match is live/soon
const MIN_INTERVAL_IDLE_MS = 30 * MINUTE;     // nothing happening; keep notifications roughly fresh
// Sweeps may use this share of the remaining quota; the rest is for 2-minute
// end-of-match checks, scorecards and squads.
const SWEEP_SHARE = 0.35;
// Spending may run this far ahead of an even pace (as a share of the daily limit).
const BUDGET_SLACK = 0.15;

export interface RefreshInput {
  now: number;
  resetAt: number;          // when the daily CricAPI quota resets
  hitsUsed: number;
  hitsLimit: number;
  pagesPerRefresh: number;  // hits one currentMatches refresh costs
  usersActive: boolean;
  hasLiveOrSoon: boolean;
}

// How long to wait between currentMatches refreshes. Never faster than the
// activity level needs, and never faster than the remaining daily quota allows,
// so the budget is spread over the whole day instead of burning out by noon.
export function currentRefreshIntervalMs(input: RefreshInput): number {
  const desired = input.usersActive || input.hasLiveOrSoon ? MIN_INTERVAL_ACTIVE_MS : MIN_INTERVAL_IDLE_MS;
  const msLeft = Math.max(MINUTE, input.resetAt - input.now);
  const remaining = input.hitsLimit - input.hitsUsed - listReserve(input.now, input.resetAt);
  const cost = Math.max(1, input.pagesPerRefresh);
  if (remaining < cost) return Infinity;
  return Math.max(desired, msLeft / ((remaining * SWEEP_SHARE) / cost));
}

// Hits kept back for the fixtures-list refreshes still due today.
function listReserve(now: number, resetAt: number): number {
  return Math.ceil(Math.max(MINUTE, resetAt - now) / LIST_REFRESH_MS) * LIST_PAGES + 2;
}

export interface BudgetInput {
  now: number;
  resetAt: number;
  hitsUsed: number;
  hitsLimit: number;
}

// For on-demand work (end-of-match checks, scorecards, squads): allowed while
// spending is not running ahead of an even pace across the day.
export function withinBudget(input: BudgetInput, cost: number): boolean {
  const dayElapsed = Math.min(1, Math.max(0, 1 - (input.resetAt - input.now) / DAY));
  const paceLine = input.hitsLimit * (dayElapsed + BUDGET_SLACK);
  const hardLine = input.hitsLimit - listReserve(input.now, input.resetAt);
  return input.hitsUsed + cost <= Math.min(paceLine, hardLine);
}

// ─── Notifications ────────────────────────────────────────────────────────
// Topics are broadcast, so quiet hours use IST (most of the audience).
const QUIET_START_HOUR_IST = 23;
const QUIET_END_HOUR_IST = 8;
const QUIET_HOURS_EXEMPT_TYPES = ['live_india'];

export function istHour(now: number): number {
  return new Date(now + 5.5 * 60 * MINUTE).getUTCHours();
}

export function istDayKey(now: number): string {
  return new Date(now + 5.5 * 60 * MINUTE).toISOString().slice(0, 10);
}

export function isQuietHours(now: number): boolean {
  const h = istHour(now);
  return h >= QUIET_START_HOUR_IST || h < QUIET_END_HOUR_IST;
}

export interface DailyNotifCounts {
  day: string;
  counts: Record<string, number>;
}

export function freshDailyCounts(daily: DailyNotifCounts | undefined, now: number): DailyNotifCounts {
  const day = istDayKey(now);
  return daily?.day === day ? { day, counts: { ...daily.counts } } : { day, counts: {} };
}

export function allowNotification(
  topic: string, type: string, daily: DailyNotifCounts, dailyCapPerTopic: number, now: number,
): boolean {
  if (isQuietHours(now) && !QUIET_HOURS_EXEMPT_TYPES.includes(type)) return false;
  return (daily.counts[topic] || 0) < dailyCapPerTopic;
}
