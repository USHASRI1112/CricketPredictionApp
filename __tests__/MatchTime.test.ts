import { formatMatchTime, parseMatchStart } from '../src/helpers/MatchTime';
import { getMatchDateKey, toLocalDateKey } from '../src/helpers/MatchDate';

describe('Cric API UTC timestamps', () => {
  it('treats an unqualified dateTimeGMT as UTC', () => {
    expect(parseMatchStart('2026-10-23T08:30:00')?.toISOString()).toBe('2026-10-23T08:30:00.000Z');
  });
  it('converts India Women vs Zimbabwe Women start to 2 PM IST', () => {
    expect(formatMatchTime('2026-10-23T08:30:00', 'Asia/Kolkata')).toMatch(/02:00\s*pm/i);
  });
  it('preserves explicit UTC and offsets without applying UTC twice', () => {
    expect(parseMatchStart('2026-10-23T08:30:00Z')?.getTime()).toBe(parseMatchStart('2026-10-23T14:00:00+05:30')?.getTime());
    expect(parseMatchStart('2026-10-23 08:30:00')?.toISOString()).toBe('2026-10-23T08:30:00.000Z');
  });
  it('handles missing and invalid timestamps without inventing midnight starts', () => {
    for (const value of ['', 'invalid', '2026-10-23', '2026-10-23T99:00:00']) {
      expect(parseMatchStart(value)).toBeNull();
      expect(formatMatchTime(value)).toBeNull();
    }
  });
  it('uses the actual start instant for local-day grouping', () => {
    const raw = '2026-10-23T23:30:00';
    expect(getMatchDateKey({ date: '2026-10-23', dateTimeGMT: raw })).toBe(toLocalDateKey(new Date(raw + 'Z')));
  });
});
