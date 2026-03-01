const CricketApiBaseUrl = 'https://api.cricapi.com';
const CricketApiVersion = 'v1';
const CricketApiSubPath = {
  MATCHES: 'matches',
  COUNTRIES: 'countries',
  CURRENT_MATCHES: 'currentMatches',
  MATCH_INFO: 'match_info',
  SERIES_INFO: 'series_info',
};

const API_KEY = '367de2b8-0e82-49c2-b1d0-45c9a7faa598';

const PredictionApiBaseUrl = 'https://predictmatch-bln23it7tq-uc.a.run.app';

export const CricketApiEndpoints = {
  MATCHES: `${CricketApiBaseUrl}/${CricketApiVersion}/${CricketApiSubPath.MATCHES}?apikey=${API_KEY}&offset=0`,
  COUNTRIES: `${CricketApiBaseUrl}/${CricketApiVersion}/${CricketApiSubPath.COUNTRIES}?apikey=${API_KEY}&offset=0`,
  CURRENT_MATCHES: `${CricketApiBaseUrl}/${CricketApiVersion}/${CricketApiSubPath.CURRENT_MATCHES}?apikey=${API_KEY}&offset=0`,
  PREDICT: PredictionApiBaseUrl,
  MATCH_DETAILS: (matchId: string) =>
    `${CricketApiBaseUrl}/${CricketApiVersion}/${CricketApiSubPath.MATCH_INFO}?apikey=${API_KEY}&id=${matchId}`,
  SERIES_DETAILS: (seriesId: string) =>
    `${CricketApiBaseUrl}/${CricketApiVersion}/${CricketApiSubPath.SERIES_INFO}?apikey=${API_KEY}&id=${seriesId}`,
};