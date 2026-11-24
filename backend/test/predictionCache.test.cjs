const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCachedPredictor, PredictionRateLimitedError } = require('../lib/predictionCache');

const memoryStore = () => {
  const docs = new Map();
  return { docs, get: async id => docs.get(id), set: async (id, value) => { docs.set(id, value); } };
};
const upcoming = { matchId: 'm1', teamA: 'India', teamB: 'Australia', matchEnded: false, scoreText: '' };

test('one AI call per match phase, shared across users and concurrent requests', async () => {
  let calls = 0;
  const predict = createCachedPredictor(async () => { calls++; return { winner: 'India' }; }, memoryStore());
  await Promise.all([predict(upcoming), predict(upcoming), predict(upcoming)]);
  assert.equal(calls, 1);
  await predict({ ...upcoming, scoreText: '150/2 (18 ov)' });
  assert.equal(calls, 2);
  await predict({ ...upcoming, matchEnded: true });
  assert.equal(calls, 3);
});

test('live predictions expire after 5 minutes; stored results survive restarts', async () => {
  let now = 0;
  let calls = 0;
  const store = memoryStore();
  const ai = async () => { calls++; return { winner: 'India' }; };
  const live = { ...upcoming, scoreText: '150/2 (18 ov)' };
  await createCachedPredictor(ai, store, () => now)(live);
  now = 4 * 60 * 1000;
  await createCachedPredictor(ai, store, () => now)(live); // new process, same store
  assert.equal(calls, 1);
  now = 6 * 60 * 1000;
  await createCachedPredictor(ai, store, () => now)(live);
  assert.equal(calls, 2);
});

test('limits AI calls but never cache hits', async () => {
  const predict = createCachedPredictor(async data => ({ winner: data.matchId }), memoryStore());
  for (let i = 0; i < 30; i++) await predict({ ...upcoming, matchId: `m${i}` });
  await assert.rejects(predict({ ...upcoming, matchId: 'new' }), PredictionRateLimitedError);
  assert.deepEqual(await predict({ ...upcoming, matchId: 'm0' }), { winner: 'm0' });
});

test('AI failures are not cached', async () => {
  let fail = true;
  const predict = createCachedPredictor(async () => {
    if (fail) throw Error('groq down');
    return { winner: 'India' };
  }, memoryStore());
  await assert.rejects(predict(upcoming), /groq down/);
  fail = false;
  assert.deepEqual(await predict(upcoming), { winner: 'India' });
});
