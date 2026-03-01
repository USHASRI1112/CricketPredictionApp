import AsyncStorage from '@react-native-async-storage/async-storage';
import { LAST_FETCH_TIME_KEY, ONE_HOUR_IN_MS } from '../constants/Keys';

export const shouldRefetchMatches = async (): Promise<boolean> => {
  try {
    const lastFetchTime = await AsyncStorage.getItem(LAST_FETCH_TIME_KEY);
    
    if (!lastFetchTime) {
      return true;
    }
    
    const lastFetchTimestamp = parseInt(lastFetchTime, 10);
    const currentTime = new Date().getTime();
    const timeDifference = currentTime - lastFetchTimestamp;
    return timeDifference > ONE_HOUR_IN_MS;
  } catch (error) {
    console.error('Error checking last fetch time:', error);
    return true;
  }
};
