import { fetchMatches } from '../src/services/Matches';
import { Match } from '../src/types';

jest.mock('../src/constants/Api', () => ({
  CricketApiEndpoints: { MATCHES: () => 'https://backend.example/matches' },
}));

const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key: string) => mockStorage.get(key) ?? null,
  multiSet: async (pairs: [string, string][]) => pairs.forEach(([k, v]) => mockStorage.set(k, v)),
}));

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;
const today = new Date().toISOString().slice(0, 10);
const match = (id: string, date: string): Match => ({
  id, name: `${id} match`, teams: ['India', 'Australia'], date, dateTimeGMT: '',
  status: 'Not started', venue: 'Mumbai', series_id: 's',
});

beforeEach(() => {
  mockStorage.clear();
  mockFetch.mockReset();
  globalThis.fetch = mockFetch;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

it('reads only the backend snapshot, never CricAPI, and caches it', async () => {
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ matches: [match('a', today), match('old', '2020-01-01')], updatedAt: 1 }) });
  const matches = await fetchMatches();
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockFetch.mock.calls[0][0]).toBe('https://backend.example/matches');
  expect(matches.map(m => m.id)).toEqual(['a']);
  expect(JSON.parse(mockStorage.get('ALL_MATCHES')!)).toHaveLength(1);
});

it('falls back to the saved matches when the backend fails or is empty', async () => {
  mockStorage.set('ALL_MATCHES', JSON.stringify([match('cached', today)]));
  mockFetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
  expect((await fetchMatches()).map(m => m.id)).toEqual(['cached']);
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ matches: [], updatedAt: 0 }) });
  expect((await fetchMatches()).map(m => m.id)).toEqual(['cached']);
});
