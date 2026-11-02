const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.GOOGLE_CLOUD_PROJECT = 'local-test-project';
const admin = require('firebase-admin');
const axios = require('axios');
const { getCricApiKey, predictMatch } = require('../lib/cricket');
const originalPost = axios.post;
after(async () => {
  axios.post = originalPost;
  await admin.app().delete();
});

test('uses runtime Cric key changes and rejects missing configuration', () => {
  delete process.env.CRIC_API_KEY;
  assert.throws(getCricApiKey, /CRIC_API_KEY/);
  process.env.CRIC_API_KEY = ' first-key ';
  assert.equal(getCricApiKey(), 'first-key');
  process.env.CRIC_API_KEY = 'rotated-key';
  assert.equal(getCricApiKey(), 'rotated-key');
});

test('migrated prediction keeps match context and uses the server Groq credential', async () => {
  process.env.GROQ_API_KEY = 'test-groq-key';
  delete process.env.GROQ_MODEL;
  delete process.env.GROQ_REASONING_EFFORT;
  const expected = { winner: 'India', confidence: 'High', reason: 'A strong position' };
  axios.post = async (url, body, config) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(body.model, 'openai/gpt-oss-20b');
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.equal(body.reasoning_effort, 'low');
    assert.equal(body.include_reasoning, false);
    assert.equal(body.max_completion_tokens, 1536);
    assert.match(body.messages[1].content, /70–100 words/);
    assert.equal(config.headers.Authorization, 'Bearer test-groq-key');
    assert.equal(config.timeout, 25000);
    assert.match(body.messages[1].content, /India vs Australia/);
    assert.match(body.messages[1].content, /150\/2/);
    return { data: { choices: [{ message: { content: JSON.stringify(expected) } }] } };
  };
  assert.deepEqual(await predictMatch({ matchId: '123', teamA: 'India', teamB: 'Australia', scoreText: '150/2' }), expected);
});

test('missing Groq credential fails before an outbound AI call', async () => {
  delete process.env.GROQ_API_KEY;
  axios.post = async () => { assert.fail('must not call Groq without a key'); };
  await assert.rejects(predictMatch({ matchId: '123', teamA: 'India', teamB: 'Australia' }), /Prediction failed/);
});

test('allows the Groq model to be configured without changing code', async () => {
  process.env.GROQ_API_KEY = 'test-groq-key';
  process.env.GROQ_MODEL = 'custom-available-model';
  axios.post = async (_url, body) => {
    assert.equal(body.model, 'custom-available-model');
    assert.equal(body.reasoning_effort, undefined);
    assert.equal(body.include_reasoning, undefined);
    return { data: { choices: [{ message: { content: JSON.stringify({ winner: 'India', confidence: 'Low', reason: 'Close match' }) } }] } };
  };
  try {
    assert.equal((await predictMatch({ matchId: '123', teamA: 'India', teamB: 'Australia' })).winner, 'India');
  } finally {
    delete process.env.GROQ_MODEL;
  }
});

test('supports explicitly configured GPT-OSS reasoning effort', async () => {
  process.env.GROQ_API_KEY = 'test-groq-key';
  process.env.GROQ_MODEL = 'openai/gpt-oss-20b';
  process.env.GROQ_REASONING_EFFORT = 'medium';
  axios.post = async (_url, body) => {
    assert.equal(body.reasoning_effort, 'medium');
    return { data: { choices: [{ message: { content: JSON.stringify({ winner: 'India', confidence: 'Low', reason: 'Close match' }) } }] } };
  };
  try {
    await predictMatch({ matchId: '123', teamA: 'India', teamB: 'Australia' });
  } finally {
    delete process.env.GROQ_MODEL;
    delete process.env.GROQ_REASONING_EFFORT;
  }
});

test('snapshot merge lets fresh data win and drops matches older than 4 days', () => {
  const { mergeMatches } = require('../lib/cricket');
  const now = Date.UTC(2026, 9, 31, 12);
  const merged = mergeMatches(
    [
      { id: 'a', status: 'Starts at 2pm', dateTimeGMT: '2026-10-31T14:00:00', teamInfo: [{ name: 'India' }] },
      { id: 'old', status: 'Ended', dateTimeGMT: '2026-10-20T14:00:00' },
    ],
    [{ id: 'a', status: 'Live', dateTimeGMT: '2026-10-31T14:00:00' }, { id: 'b', status: 'Upcoming', dateTimeGMT: '2026-11-01T09:00:00' }],
    now,
  );
  assert.deepEqual(merged.map(m => m.id), ['a', 'b']);
  assert.equal(merged[0].status, 'Live');
  assert.deepEqual(merged[0].teamInfo, [{ name: 'India' }]);
});

test('end checks: priority first, one hit each, a sweep when 4+ finish together, within budget', () => {
  const { planEndChecks } = require('../lib/cricket');
  const now = Date.UTC(2026, 9, 31, 16);
  const startedAgo = mins => new Date(now - mins * 60000).toISOString().slice(0, 19);
  const t20 = (id, teams, extra = {}) => ({ id, name: id, matchType: 't20', teams, dateTimeGMT: startedAgo(170), ...extra });
  const budget = { now, resetAt: now + 8 * 3600000, hitsUsed: 0, hitsLimit: 2000 };
  const india = t20('ind', ['India', 'Australia']);
  const club = t20('club', ['Club A', 'Club B']);
  const early = { ...t20('early', ['India', 'England']), dateTimeGMT: startedAgo(60) };
  const ended = t20('done', ['India', 'Sri Lanka'], { matchEnded: true });

  assert.deepEqual(planEndChecks([club, india, early, ended], {}, now, budget), { sweep: false, ids: ['ind', 'club'] });
  // checked 3 min ago: priority is due again (2 min), others wait (5 min)
  assert.deepEqual(planEndChecks([club, india], { ind: now - 180000, club: now - 180000 }, now, budget).ids, ['ind']);
  const many = ['a', 'b', 'c', 'd'].map(id => t20(id, ['X', 'Y']));
  assert.equal(planEndChecks(many, {}, now, budget).sweep, true);
  // spending ahead of pace → nothing
  assert.deepEqual(planEndChecks([india], {}, now, { ...budget, hitsUsed: 1999 }).ids, []);
});

test('empty squads and scorecards count as not available', () => {
  const { hasDetailData } = require('../lib/cricket');
  assert.equal(hasDetailData('squad', []), false);
  assert.equal(hasDetailData('squad', [{ teamName: 'A', players: [] }]), false);
  assert.equal(hasDetailData('squad', [{ teamName: 'A', players: [{ name: 'X' }] }]), true);
  assert.equal(hasDetailData('scorecard', { scorecard: [] }), false);
  assert.equal(hasDetailData('scorecard', { scorecard: [{ inning: '1' }] }), true);
  assert.equal(hasDetailData('scorecard', null), false);
});
