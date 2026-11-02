const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApiServer } = require('../lib/http');

async function withServer(deps, run) {
  const server = createApiServer(deps);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
const match = { matchId: '123', teamA: 'India', teamB: 'Australia', matchEnded: false };
const post = body => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('health check never returns credentials; config is uncached and rotates', async () => {
  let key = 'first-key';
  await withServer({ getKey: () => key, predict: async () => ({}) }, async url => {
    assert.deepEqual(await (await fetch(url + '/health')).json(), { status: 'ok' });
    let response = await fetch(url + '/config/cric-api');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { apiKey: 'first-key' });
    key = 'new-key';
    assert.deepEqual(await (await fetch(url + '/config/cric-api')).json(), { apiKey: 'new-key' });
  });
});

test('preserves callable-style prediction request and response', async () => {
  const prediction = { winner: 'India', confidence: 'High', reason: 'Strong bowling' };
  await withServer({ getKey: () => 'key', predict: async data => {
    assert.deepEqual(data, match);
    return prediction;
  } }, async url => {
    const response = await fetch(url + '/predictMatch', post({ data: match }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { result: prediction });
  });
});

test('rejects invalid input before calling paid AI', async () => {
  let called = false;
  await withServer({ getKey: () => 'key', predict: async () => { called = true; } }, async url => {
    assert.equal((await fetch(url + '/predictMatch', post({ data: {} }))).status, 400);
    assert.equal((await fetch(url + '/predictMatch', post({ data: { ...match, matchEnded: 'false' } }))).status, 400);
    assert.equal((await fetch(url + '/predictMatch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })).status, 400);
    assert.equal((await fetch(url + '/predictMatch', { method: 'POST', body: '{}' })).status, 415);
    assert.equal((await fetch(url + '/predictMatch')).status, 405);
    assert.equal(called, false);
  });
});

test('rejects oversized payloads and unknown routes', async () => {
  await withServer({ getKey: () => 'key', predict: async () => ({}) }, async url => {
    const response = await fetch(url + '/predictMatch', post({ data: { ...match, scoreText: 'x'.repeat(40000) } }));
    assert.equal(response.status, 413);
    assert.equal((await fetch(url + '/unknown')).status, 404);
  });
});

test('redacts dependency failures and handles missing configuration', async () => {
  await withServer({ getKey: () => { throw Error('private-key'); }, predict: async () => { throw Error('private-token'); } }, async url => {
    const config = await fetch(url + '/config/cric-api');
    assert.equal(config.status, 503);
    assert.doesNotMatch(await config.text(), /private-key/);
    const prediction = await fetch(url + '/predictMatch', post({ data: match }));
    assert.equal(prediction.status, 502);
    assert.doesNotMatch(await prediction.text(), /private-token/);
  });
});

test('maps the predictor rate limit to 429 without leaking details', async () => {
  const { PredictionRateLimitedError } = require('../lib/predictionCache');
  await withServer({ predict: async () => { throw new PredictionRateLimitedError('busy'); } }, async url => {
    const response = await fetch(url + '/predictMatch', post({ data: match }));
    assert.equal(response.status, 429);
    assert.doesNotMatch(await response.text(), /busy/);
  });
});

test('serves the shared matches snapshot gzipped and records activity', async () => {
  let activity = 0;
  let snapshot = { matches: [{ id: 'm1' }], updatedAt: 1 };
  await withServer({ predict: async () => ({}), getMatches: async () => snapshot, onActivity: () => { activity++; } }, async url => {
    let response = await fetch(url + '/matches');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-encoding'), 'gzip');
    assert.equal(response.headers.get('cache-control'), 'public, max-age=60');
    assert.deepEqual(await response.json(), snapshot);
    snapshot = { matches: [{ id: 'm2' }], updatedAt: 2 };
    response = await fetch(url + '/matches', { headers: { 'accept-encoding': 'identity' } });
    assert.equal(response.headers.get('content-encoding'), null);
    assert.deepEqual(await response.json(), snapshot);
    assert.equal(activity, 2);
  });
  await withServer({ predict: async () => ({}), getMatches: async () => { throw Error('firestore down'); } }, async url => {
    const response = await fetch(url + '/matches');
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /firestore/);
  });
});

test('serves app-ads.txt and can disable the legacy key endpoint', async () => {
  const appAdsTxt = 'google.com, pub-1, DIRECT, f08c47fec0942fa0\n';
  await withServer({ predict: async () => ({}), appAdsTxt }, async url => {
    const response = await fetch(url + '/app-ads.txt');
    assert.match(response.headers.get('content-type'), /text\/plain/);
    assert.equal(await response.text(), appAdsTxt);
    assert.equal((await fetch(url + '/config/cric-api')).status, 404);
  });
});

test('serves cached scorecards and squads; unavailable maps to 404', async () => {
  const { MatchDetailUnavailableError } = require('../lib/errors');
  const calls = [];
  const getMatchDetail = async (kind, id) => {
    calls.push(`${kind}:${id}`);
    if (id === 'none') throw new MatchDetailUnavailableError('no data');
    if (id === 'down') throw Error('cricapi timeout');
    return { kind };
  };
  await withServer({ predict: async () => ({}), getMatchDetail }, async url => {
    assert.deepEqual(await (await fetch(url + '/matches/abc-123/scorecard')).json(), { data: { kind: 'scorecard' } });
    assert.deepEqual(await (await fetch(url + '/matches/abc-123/squad')).json(), { data: { kind: 'squad' } });
    assert.equal((await fetch(url + '/matches/none/squad')).status, 404);
    const down = await fetch(url + '/matches/down/scorecard');
    assert.equal(down.status, 503);
    assert.doesNotMatch(await down.text(), /cricapi/);
    assert.equal((await fetch(url + '/matches/..%2F/scorecard')).status, 404);
    assert.deepEqual(calls, ['scorecard:abc-123', 'squad:abc-123', 'squad:none', 'scorecard:down']);
  });
});
