import { Match } from '../types';
import { getMatchDateKey, isLiveMatch, toLocalDateKey } from './MatchDate';

const sortByTimestamp = (matches: Match[]): Match[] => {
  return [...matches].sort((a, b) => {
    const aTime = a.dateTimeGMT ? new Date(a.dateTimeGMT).getTime() : 0;
    const bTime = b.dateTimeGMT ? new Date(b.dateTimeGMT).getTime() : 0;
    return aTime - bTime;
  });
};

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

  return {
    live: sortByTimestamp(live),
    today,
    upcoming: sortByTimestamp(upcoming),
    ended: sortByTimestamp(ended),
  };
};
