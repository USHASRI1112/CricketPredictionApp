import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY } from '../constants/Keys';
import { Match } from '../types';

export const getMatchesFromStorage = async (): Promise<Match[]> => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    console.log('Loaded matches from storage', stored);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.log('Failed to load matches:', error);
    return [];
  }
};
