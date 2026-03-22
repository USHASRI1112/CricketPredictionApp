const CricketApiBaseUrl = 'https://api.cricapi.com';
const CricketApiVersion = 'v1';
const CricketApiSubPath = {
  MATCHES: 'matches',
  COUNTRIES: 'countries',
  CURRENT_MATCHES: 'currentMatches',
  MATCH_INFO: 'match_info',
  SERIES_INFO: 'series_info',
};

const API_KEY = '46e9b267-ff97-43e0-a615-2f5ce700571c';

const PredictionApiBaseUrl = 'https://predictmatch-bln23it7tq-uc.a.run.app';

export const CricketApiEndpoints = {
  MATCHES: `${CricketApiBaseUrl}/${CricketApiVersion}/${CricketApiSubPath.MATCHES}?apikey=${API_KEY}&offset=0`,
  COUNTRIES: `${CricketApiBaseUrl}/${CricketApiVersion}/${CricketApiSubPath.COUNTRIES}?apikey=${API_KEY}&offset=0`,
  CURRENT_MATCHES: (offset: number = 0) => `${CricketApiBaseUrl}/${CricketApiVersion}/${CricketApiSubPath.CURRENT_MATCHES}?apikey=${API_KEY}&offset=${offset}`,
  PREDICT: PredictionApiBaseUrl,
  MATCH_DETAILS: (matchId: string) =>
    `${CricketApiBaseUrl}/${CricketApiVersion}/${CricketApiSubPath.MATCH_INFO}?apikey=${API_KEY}&id=${matchId}`,
  SERIES_DETAILS: (seriesId: string) =>
    `${CricketApiBaseUrl}/${CricketApiVersion}/${CricketApiSubPath.SERIES_INFO}?apikey=${API_KEY}&id=${seriesId}`,
};


