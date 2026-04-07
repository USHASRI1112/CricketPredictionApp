import { Match } from '../types';

const pad = (value: number): string => value.toString().padStart(2, '0');

export const toLocalDateKey = (date: Date): string => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const toDateKeyFromString = (value?: string): string | null => {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return toLocalDateKey(parsed);
};

export const getMatchDateKey = (match: Pick<Match, 'date' | 'dateTimeGMT'>): string | null => {
  return toDateKeyFromString(match.date) ?? toDateKeyFromString(match.dateTimeGMT);
};

export const isMatchOnCurrentDate = (
  match: Pick<Match, 'date' | 'dateTimeGMT'>,
  now: Date = new Date(),
): boolean => {
  const matchDateKey = getMatchDateKey(match);
  if (!matchDateKey) {
    return false;
  }

  return matchDateKey === toLocalDateKey(now);
};

export const isMatchInRecentDays = (
  match: Pick<Match, 'date' | 'dateTimeGMT'>,
  days: number,
  now: Date = new Date(),
): boolean => {
  const matchDateKey = getMatchDateKey(match);
  if (!matchDateKey) {
    return false;
  }

  const matchDate = new Date(`${matchDateKey}T00:00:00`);
  if (Number.isNaN(matchDate.getTime())) {
    return false;
  }

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const windowStart = new Date(todayStart);
  windowStart.setDate(windowStart.getDate() - days);

  return matchDate >= windowStart && matchDate <= todayStart;
};

export const isLiveMatch = (
  match: Pick<Match, 'status' | 'matchStarted' | 'matchEnded'>,
): boolean => {
  const status = (match.status || '').toLowerCase();
  return !match.matchEnded && (
    status.includes('live') ||
    status.includes('progress') ||
    !!match.matchStarted
  );
};
