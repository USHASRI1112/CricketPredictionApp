import { CricketApiEndpoints } from '../constants/Api';
import {
  FIFTEEN_MINUTES_IN_MS,
  LAST_CURRENT_FETCH_TIME_KEY,
  LAST_FETCH_TIME_KEY,
  ONE_HOUR_IN_MS,
  STORAGE_KEY,
} from '../constants/Keys';
import { getMatchDateKey } from '../helpers/MatchDate';
import { saveMatchesToStorage } from '../helpers/SaveMatchesToStorage';
import { Match } from '../types';
import { getMatchesFromStorage } from '../helpers/GetMatchesFromStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PollingSource =
  | 'API_FRESH'
  | 'CURRENT_API_15M'
  | 'CACHE_BASE_LIVE_API_30S'
  | 'CACHE_HOURLY_WINDOW_NO_LIVE'
  | 'CACHE_FALLBACK_EMPTY_API'
  | 'CACHE_FALLBACK_API_ERROR';

let lastPollingSource: PollingSource = 'API_FRESH';

export const getLastPollingSource = (): PollingSource => lastPollingSource;

const setLastPollingSource = (source: PollingSource) => {
  lastPollingSource = source;
};

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

const shouldRunCadence = async (key: string, intervalMs: number): Promise<boolean> => {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) {
    return true;
  }

  const ts = parseInt(raw, 10);
  if (Number.isNaN(ts)) {
    return true;
  }

  return Date.now() - ts >= intervalMs;
};

const markCadence = async (key: string): Promise<void> => {
  await AsyncStorage.setItem(key, Date.now().toString());
};

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

export const fetchMatches = async (): Promise<Match[]> => {
  try {
    const cachedMatches = await getMatchesFromStorage();
    let workingMatches = cachedMatches;
    setLastPollingSource('CACHE_HOURLY_WINDOW_NO_LIVE');
    console.log(
      '[Polling][Source] CACHE_HOURLY_WINDOW_NO_LIVE',
      new Date().toISOString(),
      '| cached:',
      cachedMatches.length,
    );

    const shouldDoFullFetch = await shouldRunCadence(LAST_FETCH_TIME_KEY, ONE_HOUR_IN_MS);
    const shouldDoCurrentFetch = await shouldRunCadence(
      LAST_CURRENT_FETCH_TIME_KEY,
      FIFTEEN_MINUTES_IN_MS,
    );

    if (shouldDoFullFetch) {
      await markCadence(LAST_FETCH_TIME_KEY);
      await markCadence(LAST_CURRENT_FETCH_TIME_KEY);

      const [allMatches, currentMatches] = await Promise.all([
        fetchAllMatches(),
        fetchSlidingCurrentMatches(),
      ]);

      const mergedMatches = mergeByMatchId(allMatches, currentMatches);
      if (mergedMatches.length > 0) {
        const visibleMatches = filterOlderThanDays(mergedMatches, 4);
        setLastPollingSource('API_FRESH');
        console.log(
          '[Polling][Source] API_FRESH',
          new Date().toISOString(),
          '| all:',
          allMatches.length,
          '| current:',
          currentMatches.length,
          '| merged:',
          mergedMatches.length,
          '| visible:',
          visibleMatches.length,
        );
        await saveMatchesToStorage(visibleMatches);
        return visibleMatches;
      }
    }

    if (shouldDoCurrentFetch) {
      await markCadence(LAST_CURRENT_FETCH_TIME_KEY);

      const currentMatches = await fetchSlidingCurrentMatches();
      if (currentMatches.length > 0) {
        const mergedWithCurrent = mergeByMatchId(workingMatches, currentMatches);
        const visibleMatches = filterOlderThanDays(mergedWithCurrent, 4);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(visibleMatches));
        setLastPollingSource('CURRENT_API_15M');
        console.log(
          '[Polling][Source] CURRENT_API_15M',
          new Date().toISOString(),
          '| current:',
          currentMatches.length,
          '| merged:',
          mergedWithCurrent.length,
          '| visible:',
          visibleMatches.length,
        );
        return visibleMatches;
      }
    }

    const visibleFromWorking = filterOlderThanDays(workingMatches, 4);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(visibleFromWorking));
    return visibleFromWorking;

  } catch {
    const cachedMatches = await getMatchesFromStorage();
    const visibleCachedMatches = filterOlderThanDays(cachedMatches || [], 4);
    setLastPollingSource('CACHE_FALLBACK_API_ERROR');
    console.log(
      '[Polling][Source] CACHE_FALLBACK_API_ERROR',
      new Date().toISOString(),
      '| cached:',
      cachedMatches?.length || 0,
      '| visible:',
      visibleCachedMatches.length,
    );
    return visibleCachedMatches;
  }
};
