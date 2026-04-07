import { Match } from '../types';
import { getMatchDateKey, isLiveMatch, toLocalDateKey } from './MatchDate';

export const splitMatches = (
  matches: Match[],
): { live: Match[]; today: Match[]; upcoming: Match[]; ended: Match[] } => {
  const live: Match[] = [];
  const upcoming: Match[] = [];
  const ended: Match[] = [];
  const today: Match[] = [];

  const now = Date.now();
  const todayKey = toLocalDateKey(new Date());

  matches.forEach(match => {
    if (match.matchEnded) {
      ended.push(match);
      return;
    }

    if (isLiveMatch(match)) {
      live.push(match);
      return;
    }

    const parsedStartTime = Date.parse(match.dateTimeGMT || '');
    const hasValidStartTime = Number.isFinite(parsedStartTime);
    const isFutureByTime = hasValidStartTime && parsedStartTime > now;

    const matchDateKey = getMatchDateKey(match);
    const isTodayOrFutureByDate = !!matchDateKey && matchDateKey >= todayKey;

    if (isFutureByTime || isTodayOrFutureByDate) {
      upcoming.push(match);
      return;
    }

    ended.push(match);
  });

  return { live, today, upcoming, ended };
};
