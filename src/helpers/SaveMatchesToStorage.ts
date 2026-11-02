import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY, LAST_FETCH_TIME_KEY } from '../constants/Keys';
import { Match } from '../types';

export const saveMatchesToStorage = async (matches: Match[]) => {
  try {
    const timestamp = new Date().getTime().toString();
    await AsyncStorage.multiSet([
      [STORAGE_KEY, JSON.stringify(matches)],
      [LAST_FETCH_TIME_KEY, timestamp],
    ]);
    const updatedMatches = await AsyncStorage.getItem(STORAGE_KEY);
    // console.log('Saved matches and timestamp to storage',updatedMatches);
  } catch (error) {
    // console.log('Failed to save matches:', error);
  }
};
