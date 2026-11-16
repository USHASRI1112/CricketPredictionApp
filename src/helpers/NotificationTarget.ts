import { Match } from '../types';

export type NotificationData = Record<string, string | undefined>;

export type NotificationTarget =
  | { screen: 'Match'; match: Match }
  | { screen: 'AllMatches'; focusFilter?: 'live' | 'upcoming' | 'ended'; focusMatchId?: string }
  | { screen: 'Home' };

// A result alert can arrive before the copy on the phone knows the match ended
// (offline, or the snapshot refresh hasn't reached us), so trust the alert.
export function applyNotificationHint(match: Match, data: NotificationData): Match {
  const ended = data.matchEnded === 'true' || data.type === 'result';
  if (!ended || match.matchEnded) {
    return match;
  }
  return { ...match, matchEnded: true, status: data.status || match.status };
}

// Where a tapped notification should land. Unknown or missing matches (e.g. older
// than the app's 4-day window) fall back to the list, focused on the right tab.
export function resolveNotificationTarget(
  data: NotificationData,
  match: Match | undefined,
): NotificationTarget {
  if (data.screen === 'Match' && data.matchId) {
    if (match) {
      return { screen: 'Match', match: applyNotificationHint(match, data) };
    }
    const ended = data.matchEnded === 'true' || data.type === 'result';
    const live = data.type?.startsWith('live');
    return {
      screen: 'AllMatches',
      focusFilter: ended ? 'ended' : live ? 'live' : undefined,
      focusMatchId: live ? data.matchId : undefined,
    };
  }
  if (data.screen === 'AllMatches') {
    return { screen: 'AllMatches' };
  }
  return { screen: 'Home' };
}
