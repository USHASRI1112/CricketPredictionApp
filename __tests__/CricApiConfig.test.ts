const mockFetch = jest.fn();
jest.mock('../src/config/Backend', () => ({
  backendUrl: (path: string) => `https://backend.example${path}`,
}));

describe('remote Cric API configuration', () => {
  let getKey: typeof import('../src/services/CricApiConfig').getCricApiKey;

  beforeEach(() => {
    jest.resetModules();
    mockFetch.mockReset();
    globalThis.fetch = mockFetch;
    jest.spyOn(Date, 'now').mockReturnValue(1000000);
    getKey = require('../src/services/CricApiConfig').getCricApiKey;
  });

  afterEach(() => jest.restoreAllMocks());

  it('rejects HTTP failures without using an error response as a key', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ apiKey: 'invalid' }) });
    await expect(getKey()).rejects.toThrow('Unable to load Cric API configuration');
  });

  it('shares concurrent reads and picks up a rotated key after five minutes', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ apiKey: ' first-key ' }) });
    expect(await Promise.all([getKey(), getKey()])).toEqual(['first-key', 'first-key']);
    expect(await getKey()).toBe('first-key');
    expect(mockFetch).toHaveBeenCalledWith('https://backend.example/config/cric-api', expect.any(Object));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    jest.spyOn(Date, 'now').mockReturnValue(1300001);
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ apiKey: 'rotated-key' }) });
    expect(await getKey()).toBe('rotated-key');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('rejects missing configuration and retries rather than caching failure', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(getKey()).rejects.toThrow('Unable to load Cric API configuration');
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ apiKey: 'valid-key' }) });
    expect(await getKey()).toBe('valid-key');
  });

  it('keeps a previously loaded key during an outage, then retries the server', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ apiKey: 'first-key' }) });
    await getKey();
    jest.spyOn(Date, 'now').mockReturnValue(1300001);
    mockFetch.mockRejectedValue(new Error('offline'));
    expect(await getKey()).toBe('first-key');
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ apiKey: 'new-key' }) });
    expect(await getKey()).toBe('new-key');
  });

  it('builds direct API URLs using remote configuration and encodes IDs', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ apiKey: 'key&value' }) });
    const { CricketApiEndpoints } = require('../src/constants/Api');
    expect(await CricketApiEndpoints.MATCHES()).toBe('https://api.cricapi.com/v1/matches?apikey=key%26value&offset=0');
    expect(await CricketApiEndpoints.CURRENT_MATCHES(25)).toContain('&offset=25');
    expect(await CricketApiEndpoints.MATCH_DETAILS('a&b')).toContain('&id=a%26b');
    expect(CricketApiEndpoints.PREDICT()).toBe('https://backend.example/predictMatch');
  });
});
