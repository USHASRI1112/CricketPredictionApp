import { backendUrl } from '../config/Backend';
import { getCricApiKey } from '../services/CricApiConfig';

const CricketApiBaseUrl = 'https://api.cricapi.com/v1';

async function cricketUrl(path: string, params: string): Promise<string> {
  const key = await getCricApiKey();
  return `${CricketApiBaseUrl}/${path}?apikey=${encodeURIComponent(key)}&${params}`;
}

export const CricketApiEndpoints = {
  MATCHES: () => cricketUrl('matches', 'offset=0'),
  COUNTRIES: () => cricketUrl('countries', 'offset=0'),
  CURRENT_MATCHES: (offset: number = 0) => cricketUrl('currentMatches', `offset=${offset}`),
  PREDICT: () => backendUrl('/predictMatch'),
  MATCH_DETAILS: (matchId: string) => cricketUrl('match_info', `id=${encodeURIComponent(matchId)}`),
  SERIES_DETAILS: (seriesId: string) => cricketUrl('series_info', `id=${encodeURIComponent(seriesId)}`),
};
