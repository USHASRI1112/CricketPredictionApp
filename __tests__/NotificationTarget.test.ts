import { applyNotificationHint, resolveNotificationTarget } from '../src/helpers/NotificationTarget';
import { Match } from '../src/types';

const match = (extra: Partial<Match> = {}): Match => ({
  id: 'm1', name: 'India vs Australia', teams: ['India', 'Australia'], date: '2026-11-16',
  dateTimeGMT: '2026-11-16T08:00:00', status: 'India need 20 runs', venue: 'Mumbai', series_id: 's',
  ...extra,
});

describe('notification target', () => {
  it('opens the match for a match alert', () => {
    const target = resolveNotificationTarget({ screen: 'Match', matchId: 'm1', type: 'live_india' }, match());
    expect(target).toEqual({ screen: 'Match', match: match() });
  });

  it('marks a stale live copy as ended for a result alert', () => {
    const target = resolveNotificationTarget(
      { screen: 'Match', matchId: 'm1', type: 'result', matchEnded: 'true', status: 'India won by 4 wickets' },
      match(),
    );
    expect(target).toEqual({
      screen: 'Match',
      match: match({ matchEnded: true, status: 'India won by 4 wickets' }),
    });
  });

  it('keeps an already-ended copy untouched', () => {
    const ended = match({ matchEnded: true, status: 'Australia won' });
    expect(applyNotificationHint(ended, { type: 'result', status: 'other' })).toBe(ended);
  });

  it('result alerts from older app payloads (no matchEnded field) still mark it ended', () => {
    expect(applyNotificationHint(match(), { type: 'result' }).matchEnded).toBe(true);
  });

  it('falls back to the right list tab when the match is not available', () => {
    expect(resolveNotificationTarget({ screen: 'Match', matchId: 'gone', type: 'result' }, undefined))
      .toEqual({ screen: 'AllMatches', focusFilter: 'ended', focusMatchId: undefined });
    expect(resolveNotificationTarget({ screen: 'Match', matchId: 'm9', type: 'live_any' }, undefined))
      .toEqual({ screen: 'AllMatches', focusFilter: 'live', focusMatchId: 'm9' });
    expect(resolveNotificationTarget({ screen: 'Match', matchId: 'm9', type: 'soon_ipl' }, undefined))
      .toEqual({ screen: 'AllMatches', focusFilter: undefined, focusMatchId: undefined });
  });

  it('handles list, unknown and malformed payloads', () => {
    expect(resolveNotificationTarget({ screen: 'AllMatches' }, undefined)).toEqual({ screen: 'AllMatches' });
    expect(resolveNotificationTarget({ screen: 'Match' }, undefined)).toEqual({ screen: 'Home' });
    expect(resolveNotificationTarget({}, undefined)).toEqual({ screen: 'Home' });
  });
});
