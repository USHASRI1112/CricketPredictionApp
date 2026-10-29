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

test('caps prediction requests before invoking the AI', async () => {
  let calls = 0;
  await withServer({ getKey: () => 'key', predict: async () => { calls++; return {}; } }, async url => {
    for (let i = 0; i < 30; i++) {
      assert.equal((await fetch(url + '/predictMatch', post({ data: match }))).status, 200);
    }
    assert.equal((await fetch(url + '/predictMatch', post({ data: match }))).status, 429);
    assert.equal(calls, 30);
  });
});
