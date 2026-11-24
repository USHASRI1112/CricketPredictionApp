import { CricketApiEndpoints } from '../constants/Api';
import { getMatchDateKey } from '../helpers/MatchDate';
import { saveMatchesToStorage } from '../helpers/SaveMatchesToStorage';
import { Match } from '../types';
import { getMatchesFromStorage } from '../helpers/GetMatchesFromStorage';

const filterOlderThanDays = (matches: Match[], days: number): Match[] => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const windowStart = new Date(todayStart);
  windowStart.setDate(windowStart.getDate() - days);

  return matches.filter(match => {
    const key = getMatchDateKey(match);
    if (!key) {
      return true;
    }

    const date = new Date(`${key}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return true;
    }

    return date >= windowStart;
  });
};

const fetchSnapshot = async (): Promise<Match[]> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(CricketApiEndpoints.MATCHES(), { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Matches request failed (${res.status})`);
    }
    const json = await res.json() as { matches?: Match[] | null };
    return json?.matches || [];
  } finally {
    clearTimeout(timeout);
  }
};

// Backend snapshot first; the last saved copy if the backend is unreachable or
// has nothing yet (e.g. right after a deploy, before its first CricAPI fetch).
export const fetchMatches = async (): Promise<Match[]> => {
  try {
    const matches = await fetchSnapshot();
    if (matches.length > 0) {
      const visibleMatches = filterOlderThanDays(matches, 4);
      await saveMatchesToStorage(visibleMatches);
      return visibleMatches;
    }
  } catch (error) {
    console.warn('[Matches] Backend fetch failed; using cached matches', error);
  }
  const cachedMatches = await getMatchesFromStorage();
  return filterOlderThanDays(cachedMatches || [], 4);
};
