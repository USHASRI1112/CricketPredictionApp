import AsyncStorage from '@react-native-async-storage/async-storage';
import { Match } from '../types';

export const fetchMatchesFromLocal = async () => {
  try {
    const rawMatches = await AsyncStorage.getItem('ALL_MATCHES');
    return rawMatches ? (JSON.parse(rawMatches) as Match[]) : null;
  } catch (error) {
    console.error('Error fetching matches from local storage:', error);
    return null;
  }
};
