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
