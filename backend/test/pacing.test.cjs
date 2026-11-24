const { test } = require('node:test');
const assert = require('node:assert/strict');
const { allowNotification, currentRefreshIntervalMs, freshDailyCounts, isQuietHours, withinBudget } = require('../lib/pacing');
const { isClockLive, isInEndWindow } = require('../lib/matchTiming');

const MIN = 60 * 1000;
const base = { now: 0, resetAt: 24 * 60 * MIN, hitsUsed: 0, hitsLimit: 100000, pagesPerRefresh: 2 };

test('sweeps every 10 min when anything is live or users are in the app, else 30', () => {
  assert.equal(currentRefreshIntervalMs({ ...base, usersActive: true, hasLiveOrSoon: true }), 10 * MIN);
  assert.equal(currentRefreshIntervalMs({ ...base, usersActive: false, hasLiveOrSoon: true }), 10 * MIN);
  assert.equal(currentRefreshIntervalMs({ ...base, usersActive: false, hasLiveOrSoon: false }), 30 * MIN);
});

test('sweeps use only a share of the quota so end checks keep the rest', () => {
  // 2000/day plan: ~1980 usable × 35% ÷ 3 pages ≈ 231 sweeps → ~6 min; 10 min wins
  assert.equal(currentRefreshIntervalMs({ ...base, hitsLimit: 2000, usersActive: true, hasLiveOrSoon: true }), 10 * MIN);
  // free plan: ~74 usable × 35% ÷ 3 ≈ 8.6 sweeps a day → ~2.8 h
  const free = currentRefreshIntervalMs({ ...base, pagesPerRefresh: 3, hitsLimit: 100, usersActive: true, hasLiveOrSoon: true });
  assert.ok(free > 2.5 * 60 * MIN && free < 3 * 60 * MIN, String(free));
  assert.equal(currentRefreshIntervalMs({ ...base, hitsLimit: 100, hitsUsed: 75, usersActive: true, hasLiveOrSoon: true }), Infinity);
});

test('on-demand spending follows an even pace through the day', () => {
  const day = { resetAt: 24 * 60 * MIN, hitsLimit: 2000 };
  // 6 h in (25%) + 15% slack → 800 allowed so far
  assert.equal(withinBudget({ ...day, now: 6 * 60 * MIN, hitsUsed: 799 }, 1), true);
  assert.equal(withinBudget({ ...day, now: 6 * 60 * MIN, hitsUsed: 800 }, 1), false);
  // never into the hits reserved for fixture refreshes
  assert.equal(withinBudget({ ...day, now: 23 * 60 * MIN, hitsUsed: 1996 }, 1), false);
});

test('clock: live from toss (30 min before start) and end checks per format', () => {
  const start = 10 * 60 * MIN;
  assert.equal(isClockLive(start, 't20', start - 31 * MIN), false);
  assert.equal(isClockLive(start, 't20', start - 30 * MIN), true);
  assert.equal(isClockLive(start, 't20', start + 6 * 60 * MIN), false);
  assert.equal(isInEndWindow(start, 't20', start + 2 * 60 * MIN), false);
  assert.equal(isInEndWindow(start, 't20', start + 165 * MIN), true);
  assert.equal(isInEndWindow(start, 'odi', start + 165 * MIN), false);
  assert.equal(isInEndWindow(start, 'odi', start + 7 * 60 * MIN), true);
  assert.equal(isInEndWindow(start, 'test', start + 2 * 24 * 60 * MIN), false);
  assert.equal(isInEndWindow(start, undefined, NaN), false);
});

test('quiet hours run 23:00–08:00 IST and only exempt live India alerts', () => {
  const istToUtc = hour => Date.UTC(2026, 9, 31, hour) - 5.5 * 60 * MIN;
  assert.equal(isQuietHours(istToUtc(23)), true);
  assert.equal(isQuietHours(istToUtc(7)), true);
  assert.equal(isQuietHours(istToUtc(8)), false);
  const daily = freshDailyCounts(undefined, istToUtc(2));
  assert.equal(allowNotification('ipl_matches', 'live_ipl', daily, 6, istToUtc(2)), false);
  assert.equal(allowNotification('india_matches', 'live_india', daily, 6, istToUtc(2)), true);
});

test('daily cap is per topic and resets on a new IST day', () => {
  const noon = Date.UTC(2026, 9, 31, 6, 30);
  const daily = freshDailyCounts({ day: '2026-10-31', counts: { ipl_matches: 6 } }, noon);
  assert.equal(allowNotification('ipl_matches', 'soon_ipl', daily, 6, noon), false);
  assert.equal(allowNotification('india_matches', 'soon_india', daily, 6, noon), true);
  const tomorrow = freshDailyCounts(daily, noon + 24 * 60 * MIN);
  assert.equal(allowNotification('ipl_matches', 'soon_ipl', tomorrow, 6, noon + 24 * 60 * MIN), true);
});
