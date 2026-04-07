import { CricketApiEndpoints } from '../constants/Api';
import { saveMatchesToStorage } from '../helpers/SaveMatchesToStorage';
import { Match } from '../types';
import { getMatchesFromStorage } from '../helpers/GetMatchesFromStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX_DAILY_FULL_FETCH = 5;
const MAX_UNIQUE_TARGET = 29;

const isPremiumWindow = () => {
  const now = new Date();
  const start = new Date('2026-04-05');
  const end = new Date('2026-05-05');

  now.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  return now >= start && now <= end;
};

const getTodayKey = () => {
  const today = new Date().toISOString().split('T')[0];
  return `current_matches_fetch_${today}`;
};

const getFetchCount = async (): Promise<number> => {
  const key = getTodayKey();
  const value = await AsyncStorage.getItem(key);
  return value ? parseInt(value, 10) : 0;
};

const incrementFetchCount = async () => {
  const key = getTodayKey();
  const count = await getFetchCount();
  await AsyncStorage.setItem(key, (count + 1).toString());
};

const fetchAllMatches = async (): Promise<Match[]> => {
  const res = await fetch(CricketApiEndpoints.MATCHES);

  if (!res.ok) {
    return [];
  }

  const json = await res.json() as { data?: Match[] | null };
  const matches = json?.data || [];

  return Array.from(new Map(matches.map(match => [match.id, match])).values());
};

const fetchSlidingCurrentMatches = async (): Promise<Match[]> => {
  try {
    const premium = isPremiumWindow();
    const fetchCount = await getFetchCount();

    if (!premium && fetchCount >= MAX_DAILY_FULL_FETCH) {
      const res = await fetch(CricketApiEndpoints.CURRENT_MATCHES(0));

      if (!res.ok) {
        return [];
      }

      const json = await res.json() as { data?: Match[] | null };
      const matches = json?.data || [];
      return matches;
    }

    const firstRes = await fetch(CricketApiEndpoints.CURRENT_MATCHES(0));

    if (!firstRes.ok) {
      return [];
    }

    const firstJson = await firstRes.json() as {
      data?: Match[] | null;
      info?: { totalRows?: number };
    } | null;

    if (!firstJson) {
      return [];
    }

    const firstMatches: Match[] = firstJson.data || [];
    const totalRows = firstJson.info?.totalRows || 0;

    let allMatches = [...firstMatches];

    const maxTarget = premium ? 100 : MAX_UNIQUE_TARGET;
    const target = Math.min(totalRows, maxTarget);

    const pageSize = Math.max(firstMatches.length, 1);
    const additionalCallsNeeded = Math.max(
      0,
      Math.ceil((target - firstMatches.length) / pageSize)
    );

    const offsets = Array.from(
      { length: additionalCallsNeeded },
      (_, i) => firstMatches.length + i * pageSize
    );

    if (offsets.length > 0) {
      const requests = offsets.map(offset =>
        fetch(CricketApiEndpoints.CURRENT_MATCHES(offset))
          .then(res => {
            if (!res.ok) {
              return [];
            }
            return res.json();
          })
          .then((json: any) => {
            if (!json?.data) return [];
            return json.data || [];
          })
          .catch(() => {
            return [];
          })
      );

      const results = await Promise.all(requests);
      results.forEach(matches => {
        allMatches.push(...matches);
      });
    }

    if (!premium) {
      await incrementFetchCount();
    }

    return Array.from(new Map(allMatches.map(match => [match.id, match])).values());
  } catch {
    return [];
  }
};

const mergeByMatchId = (primary: Match[], secondary: Match[]): Match[] => {
  const merged = new Map<string, Match>();

  primary.forEach(match => {
    merged.set(match.id, match);
  });

  secondary.forEach(match => {
    merged.set(match.id, {
      ...(merged.get(match.id) || {}),
      ...match,
    } as Match);
  });

  return Array.from(merged.values());
};

export const fetchMatches = async (): Promise<Match[]> => {
  try {
    const [allMatches, currentMatches] = await Promise.all([
      fetchAllMatches(),
      fetchSlidingCurrentMatches(),
    ]);

    const mergedMatches = mergeByMatchId(allMatches, currentMatches);

    if (mergedMatches.length > 0) {
      await saveMatchesToStorage(mergedMatches);
      return mergedMatches;
    }

    const cachedMatches = await getMatchesFromStorage();
    return cachedMatches || [];

  } catch {
    const cachedMatches = await getMatchesFromStorage();
    return cachedMatches || [];
  }
};
