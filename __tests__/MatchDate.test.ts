import { getMatchDateKey, isLiveMatch, isMatchInRecentDays, isMatchOnCurrentDate, toLocalDateKey } from '../src/helpers/MatchDate';

describe('MatchDate helpers', () => {
  const now = new Date(2026, 3, 7, 12, 0, 0);

  it('matches a plain YYYY-MM-DD date against the current local date', () => {
    expect(isMatchOnCurrentDate({ date: '2026-04-07', dateTimeGMT: '' }, now)).toBe(true);
    expect(isMatchOnCurrentDate({ date: '2026-04-06', dateTimeGMT: '' }, now)).toBe(false);
  });

  it('falls back to parsing date strings that include timestamps', () => {
    expect(getMatchDateKey({ date: '2026-04-07T05:30:00.000Z', dateTimeGMT: '' })).toBe('2026-04-07');
  });

  it('falls back to dateTimeGMT when date is missing or invalid', () => {
    expect(isMatchOnCurrentDate({ date: '', dateTimeGMT: '2026-04-07T09:00:00.000Z' }, now)).toBe(true);
    expect(isMatchOnCurrentDate({ date: 'invalid-date', dateTimeGMT: '2026-04-05T09:00:00.000Z' }, now)).toBe(false);
  });

  it('creates a local YYYY-MM-DD key without using UTC conversion', () => {
    expect(toLocalDateKey(now)).toBe('2026-04-07');
  });

  it('treats started or in-progress matches as live', () => {
    expect(isLiveMatch({ status: 'Live', matchStarted: false, matchEnded: false })).toBe(true);
    expect(isLiveMatch({ status: 'In Progress', matchStarted: false, matchEnded: false })).toBe(true);
    expect(isLiveMatch({ status: 'Toss', matchStarted: true, matchEnded: false })).toBe(true);
    expect(isLiveMatch({ status: 'Result', matchStarted: true, matchEnded: true })).toBe(false);
  });

  it('matches recent days window correctly', () => {
    expect(isMatchInRecentDays({ date: '2026-04-07', dateTimeGMT: '' }, 5, now)).toBe(true);
    expect(isMatchInRecentDays({ date: '2026-04-03', dateTimeGMT: '' }, 5, now)).toBe(true);
    expect(isMatchInRecentDays({ date: '2026-04-01', dateTimeGMT: '' }, 5, now)).toBe(false);
  });
});
