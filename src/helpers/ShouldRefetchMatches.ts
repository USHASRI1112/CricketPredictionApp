import AsyncStorage from '@react-native-async-storage/async-storage';
import { LAST_FETCH_TIME_KEY, TWO_MINUTES_IN_MS } from '../constants/Keys';

// Matches come from our backend's shared snapshot (no CricAPI cost per user),
// so refreshing every couple of minutes is cheap.
export const shouldRefetchMatches = async (): Promise<boolean> => {
  try {
    const lastFetchTime = await AsyncStorage.getItem(LAST_FETCH_TIME_KEY);
    if (!lastFetchTime) {
      return true;
    }
    const lastFetchTimestamp = parseInt(lastFetchTime, 10);
    return Number.isNaN(lastFetchTimestamp) || Date.now() - lastFetchTimestamp > TWO_MINUTES_IN_MS;
  } catch {
    return true;
  }
};
