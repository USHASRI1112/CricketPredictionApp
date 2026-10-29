import { fetchPrediction } from '../src/services/Prediction';
import { Match } from '../src/types';

jest.mock('../src/constants/Api', () => ({
  CricketApiEndpoints: { PREDICT: () => 'https://backend.example/predictMatch' },
}));

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;
const match: Match = {
  id: '123', name: 'India vs Australia', teams: ['India', 'Australia'],
  matchType: 'T20', date: '2026-10-23', dateTimeGMT: '', status: 'Not started',
  venue: 'Mumbai', series_id: 'series',
};
const prediction = { winner: 'India', confidence: 'Medium', reason: 'A close match.' };

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('returns a valid prediction for rendering', async () => {
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ result: prediction }) });
  expect(await fetchPrediction(match)).toEqual(prediction);
});

it.each([
  {}, { result: null }, { result: { ...prediction, winner: { name: 'India' } } },
  { result: { ...prediction, reason: [] } }, { result: { ...prediction, confidence: 'invalid' } },
])('rejects malformed response instead of returning empty or unrenderable data: %j', async payload => {
  mockFetch.mockResolvedValue({ ok: true, json: async () => payload });
  await expect(fetchPrediction(match)).rejects.toThrow('Please try again');
});

it('handles a gateway failure without trying to render its response', async () => {
  mockFetch.mockResolvedValue({ ok: false });
  await expect(fetchPrediction(match)).rejects.toThrow('Please try again');
});

it('times out a stalled request and permits a subsequent retry', async () => {
  jest.useFakeTimers();
  mockFetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const timedOut = expect(fetchPrediction(match)).rejects.toThrow('Prediction took too long');
  await jest.advanceTimersByTimeAsync(30000);
  await timedOut;
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ result: prediction }) });
  expect(await fetchPrediction(match)).toEqual(prediction);
});
