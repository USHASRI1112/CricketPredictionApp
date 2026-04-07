import { CricketApiEndpoints } from '../constants/Api';
import { saveMatchesToStorage } from '../helpers/SaveMatchesToStorage';
import { Match } from '../types';
import { getMatchesFromStorage } from '../helpers/GetMatchesFromStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX_DAILY_FULL_FETCH = 5;
const MAX_UNIQUE_TARGET = 29;

// ✅ Premium window (no limits)
const isPremiumWindow = () => {
  const now = new Date();
  const start = new Date('2026-04-05');
  const end = new Date('2026-05-05');

  // normalize to avoid timezone issues
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

export const fetchMatches = async (): Promise<Match[]> => {
  // console.log('[fetchMatches] Starting fetch');
  try {
    const currentMatches: Match[] = await fetchSlidingCurrentMatches();

    // If we got matches, save them
    if (currentMatches.length > 0) {
      saveMatchesToStorage(currentMatches);
      console.log('[fetchMatches] ✅ API matches saved:', currentMatches.length);
      return currentMatches;
    }

    console.warn('[fetchMatches] ⚠ API returned no matches; falling back to cache');

    // If API is empty, silently load from storage (no error)
    const cachedMatches = await getMatchesFromStorage();
    if (cachedMatches && cachedMatches.length > 0) {
      console.log('[fetchMatches] 📦 Using cached matches:', cachedMatches.length);
      return cachedMatches;
    }

    // console.log('[fetchMatches] No matches from API or cache');
    return [];

  } catch {
    // console.error('[fetchMatches] Error fetching matches:', error);
    // Silent catch - just use storage, no error logging
    const cachedMatches = await getMatchesFromStorage();
    return cachedMatches || [];
  }
};

const fetchSlidingCurrentMatches = async (): Promise<Match[]> => {
  // console.log('[fetchSlidingCurrentMatches] Starting');
  try {
    const premium = isPremiumWindow();
    const fetchCount = await getFetchCount();
    // console.log('[fetchSlidingCurrentMatches] Premium:', premium, 'fetchCount:', fetchCount);

    // 🔹 Limit applies ONLY outside premium window
    if (!premium && fetchCount >= MAX_DAILY_FULL_FETCH) {
      // console.log("⏱️ Daily limit reached → minimal fetch");

      const res = await fetch(
        CricketApiEndpoints.CURRENT_MATCHES(0)
      );

      if (!res.ok) {
        return [];
      }

      const json = await res.json() as { data?: Match[] | null };
      const matches = json?.data || [];
      if (matches.length > 0) // console.log(`✅ Minimal fetch got ${matches.length} matches`);
      return matches;
    }

    // 🔹 First call
    // console.log('[fetchSlidingCurrentMatches] Making first API call');
    const firstRes = await fetch(
      CricketApiEndpoints.CURRENT_MATCHES(0)
    );

    if (!firstRes.ok) {
      const text = await firstRes.text();
      console.error('[fetchSlidingCurrentMatches] First API call failed:', firstRes.status, text);
      return [];
    }

    const firstJson = await firstRes.json() as {
      data?: Match[] | null;
      info?: { totalRows?: number };
    } | null;

    if (!firstJson) {
      // console.log('[fetchSlidingCurrentMatches] First API returned null');
      return [];
    }

    const firstMatches: Match[] = firstJson.data || [];
    const totalRows = firstJson.info?.totalRows || 0;
    // console.log(`🏏 First API call got ${firstMatches.length}/${totalRows} matches`);

    let allMatches = [...firstMatches];

    // 🔹 Dynamic target
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
      // console.log(`🔄 Making ${offsets.length} additional API calls...`);
      const requests = offsets.map(offset =>
        fetch(CricketApiEndpoints.CURRENT_MATCHES(offset))
          .then(res => {
            if (!res.ok) {
              console.warn(`⚠️ Offset ${offset} returned ${res.status}`);
              return [];
            }
            return res.json();
          })
          .then((json: any) => {
            if (!json?.data) return [];
            return json.data || [];
          })
          .catch(err => {
            console.warn(`⚠️ Failed to fetch offset ${offset}:`, err.message);
            return [];
          })
      );

      const results = await Promise.all(requests);
      results.forEach(matches => {
        allMatches.push(...matches);
      });
    }

    // 🔹 Increment ONLY outside premium window
    if (!premium) {
      await incrementFetchCount();
      // console.log(`📊 Daily fetch count incremented`);
    }

    const uniqueMatches = Array.from(
      new Map(allMatches.map(m => [m.id, m])).values()
    );

    // console.log(`✅ Total unique matches fetched: ${uniqueMatches.length} (Premium: ${premium})`);
    return uniqueMatches;

  } catch {
    // console.error('[fetchSlidingCurrentMatches] Error:', error);
    // Silent error handling - return empty array
    return [];
  }
};
