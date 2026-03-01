import { CricketApiEndpoints } from '../constants/Api';
import { saveMatchesToStorage } from '../helpers/SaveMatchesToStorage';

import { Match } from '../types';
import { combineMatches } from '../helpers/CombineMatches';
import { getMatchesFromStorage } from '../helpers/GetMatchesFromStorage';

export const fetchMatches = async (): Promise<Match[]> => {
  try {
    const AllMatchesresponse = await fetch(CricketApiEndpoints.MATCHES);
    if (!AllMatchesresponse.ok) {
      throw new Error(`HTTP Error: ${AllMatchesresponse.status}`);
    }
    console.log('Fetched matches from API', AllMatchesresponse);
    const allMatches: Match[] =
      (
        (await AllMatchesresponse.json()) as {
          data: Match[];
        }
      ).data || [];

    const currentMatchesResponse = await fetch(
      CricketApiEndpoints.CURRENT_MATCHES,
    );
    if (!currentMatchesResponse.ok) {
      throw new Error(`HTTP Error: ${currentMatchesResponse.status}`);
    }
    const currentMatches: Match[] =
      (
        (await currentMatchesResponse.json()) as {
          data: Match[];
        }
      ).data || [];
    if (allMatches.length === 0 && currentMatches.length === 0) {
      throw new Error('No matches found in API response');
    }
    const matches = combineMatches(allMatches, currentMatches);
    saveMatchesToStorage(matches);
    return matches.length > 0 ? matches : await getMatchesFromStorage();
  } catch (error: any) {
    console.error('Error fetching matches:', error.message || error);
    return await getMatchesFromStorage();
  }
};
