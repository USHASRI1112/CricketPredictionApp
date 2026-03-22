import { CricketApiEndpoints } from '../constants/Api';
import { saveMatchesToStorage } from '../helpers/SaveMatchesToStorage';

import { Match } from '../types';
// import { combineMatches } from '../helpers/CombineMatches';
import { getMatchesFromStorage } from '../helpers/GetMatchesFromStorage';

import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX_DAILY_FULL_FETCH = 5;
const MAX_UNIQUE_TARGET = 29;


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
  try {
    // Fetch all matches
    // const allMatchesResponse = []
    // // if (!allMatchesResponse.ok) {
    // //   throw new Error(`HTTP Error: ${allMatchesResponse.status}`);
    // // }

    // const allMatches: Match[] =
    //   ((await allMatchesResponse.json()) as { data: Match[] }).data || [];

    // Fetch current matches using optimized sliding logic
    const currentMatches: Match[] = await fetchSlidingCurrentMatches();

    // Your existing validation (unchanged)
    if (currentMatches.length === 0 ) {
      throw new Error('No matches found in API response');
    }

    // Combine
    // const matches = combineMatches(allMatches, currentMatches);

    // Save to AsyncStorage
    saveMatchesToStorage(currentMatches);

    // Return or fallback
    return currentMatches.length > 0
      ? currentMatches
      : await getMatchesFromStorage();

  } catch (error: any) {
    console.error('Error fetching matches:', error.message || error);

    // Fallback from storage
    return await getMatchesFromStorage();
  }
};



const fetchSlidingCurrentMatches = async (): Promise<Match[]> => {
  try {
    const fetchCount = await getFetchCount();

    // 🔹 If limit exceeded → only 1 call
    if (fetchCount >= MAX_DAILY_FULL_FETCH) {
      console.log("Limit reached → minimal fetch");

      const res = await fetch(
        CricketApiEndpoints.CURRENT_MATCHES(0)
      );

      if (!res.ok) throw new Error("API error");

      const json = await res.json() as { data: Match[] };

      return json.data || [];
    }

    // 🔹 Otherwise → full optimized fetch
    const firstRes = await fetch(
      CricketApiEndpoints.CURRENT_MATCHES(0)
    );

    if (!firstRes.ok) throw new Error("API error");

    const firstJson = await firstRes.json() as {
      data: Match[];
      info?: { totalRows: number };
    };

    const firstMatches: Match[] = firstJson.data || [];
    const totalRows = firstJson.info?.totalRows || 0;

    let allMatches = [...firstMatches];

    const target = Math.min(totalRows, MAX_UNIQUE_TARGET);
    const additionalCallsNeeded = Math.max(0, target - firstMatches.length);

    const offsets = Array.from(
      { length: additionalCallsNeeded },
      (_, i) => i + 1
    );

    const requests = offsets.map(offset =>
      fetch(CricketApiEndpoints.CURRENT_MATCHES(offset))
        .then(res => {
          if (!res.ok) throw new Error("API error");
          return res.json();
        })
        .then(json => (json as { data: Match[] }).data || [])
        .catch(() => [])
    );

    const results = await Promise.all(requests);

    results.forEach(matches => {
      allMatches.push(...matches);
    });

    // 🔹 Increment ONLY when full fetch happens
    await incrementFetchCount();

    const uniqueMatches = Array.from(
      new Map(allMatches.map(m => [m.id, m])).values()
    );

    return uniqueMatches;

  } catch (error) {
    console.error("Sliding fetch error:", error);
    return [];
  }
};