import AsyncStorage from '@react-native-async-storage/async-storage';
import { LAST_FETCH_TIME_KEY, ONE_HOUR_IN_MS } from '../constants/Keys';

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

export const shouldRefetchMatches = async (): Promise<boolean> => {
  try {
    const premium = isPremiumWindow();
    // console.log('[ShouldRefetch] Premium mode:', premium);

    // 🔥 PREMIUM → always fetch (no delay)
    if (premium) {
      // console.log('[ShouldRefetch] Premium: always refetch');
      return true;
    }

    // 🔹 NON-PREMIUM → use time restriction
    const lastFetchTime = await AsyncStorage.getItem(LAST_FETCH_TIME_KEY);
    // console.log('[ShouldRefetch] Last fetch time:', lastFetchTime);

    if (!lastFetchTime) {
      // console.log('[ShouldRefetch] No last fetch time: refetch');
      return true;
    }

    const lastFetchTimestamp = parseInt(lastFetchTime, 10);
    const currentTime = new Date().getTime();
    const timeDifference = currentTime - lastFetchTimestamp;
    const should = timeDifference > ONE_HOUR_IN_MS;
    // console.log('[ShouldRefetch] Time diff:', timeDifference / 1000, 's, should refetch:', should);
    return should;

  } catch (error) {
    // console.error('[ShouldRefetch] Error:', error);
    return true;
  }
};