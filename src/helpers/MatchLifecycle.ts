import { Match } from '../types';

const ENDED_STATUS_HINTS = [
  'won',
  'complete',
  'completed',
  'finished',
  'finish',
  'result',
  'abandon',
  'abandoned',
  'cancel',
  'cancelled',
  'postponed',
  'postpone',
  'no result',
  'tie',
  'draw',
];

export const isMatchEnded = (match: Match): boolean => {
  const status = (match.status || '').toLowerCase();
  if (match.matchEnded) {
    return true;
  }

  return ENDED_STATUS_HINTS.some(hint => status.includes(hint));
};

export const isMatchLive = (match: Match): boolean => {
  const status = (match.status || '').toLowerCase();
  return !isMatchEnded(match) && (
    status.includes('live') ||
    status.includes('progress') ||
    !!match.matchStarted
  );
};

export const mergeFreshLiveMatches = (
  previous: Match[],
  fresh: Match[],
): Match[] => {
  if (!previous || previous.length === 0) {
    console.info('[MatchLifecycle] mergeFreshLiveMatches using fresh snapshot only', { fresh: fresh.length });
    return fresh;
  }

  const staleRemoved = previous.filter(existing => isMatchLive(existing) && !fresh.some(match => match.id === existing.id)).map(m => m.id);
  console.info('[MatchLifecycle] mergeFreshLiveMatches start', {
    previous: previous.length,
    fresh: fresh.length,
    staleRemoved,
  });

  const freshIds = new Set(fresh.map(match => match.id));
  const merged = new Map(previous.map(match => [match.id, match]));

  fresh.forEach(match => {
    const existing = merged.get(match.id);
    merged.set(match.id, {
      ...existing,
      ...match,
      status: match.status ?? existing?.status,
      score: match.score ?? existing?.score,
      matchEnded: match.matchEnded ?? existing?.matchEnded,
      matchStarted: match.matchStarted ?? existing?.matchStarted,
    });
  });

  previous.forEach(existing => {
    if (!freshIds.has(existing.id) && isMatchLive(existing)) {
      merged.set(existing.id, {
        ...existing,
        matchEnded: true,
        status: 'Match Ended',
      });
      console.info('[MatchLifecycle] marked stale live match as ended', { id: existing.id, status: existing.status });
    }
  });

  console.info('[MatchLifecycle] mergeFreshLiveMatches done', { result: merged.size });
  return Array.from(merged.values());
};
