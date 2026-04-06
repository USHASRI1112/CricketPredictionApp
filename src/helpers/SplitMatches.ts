import { Match } from '../types';
import { isToday } from './CombineMatches';
import { isMatchEnded, isMatchLive } from './MatchLifecycle';

export const splitMatches = (
  matches: Match[],
): { live: Match[]; today: Match[]; upcoming: Match[]; ended: Match[] } => {
  const live: Match[] = [];
  const upcoming: Match[] = [];
  const ended: Match[] = [];
  const today: Match[] = [];

  matches.forEach(match => {
    if (isMatchEnded(match)) {
      ended.push(match);
    } else if (isMatchLive(match)) {
      live.push(match);
    } else if (
      !match.matchStarted &&
      new Date(match.dateTimeGMT) > new Date()
    ) {
      upcoming.push(match);
    } else if (match.matchStarted && isToday(match.date)) {
      today.push(match);
    }
  });

  return { live, today, upcoming, ended };
};
