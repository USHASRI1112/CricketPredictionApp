const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startScheduler } = require('../lib/scheduler');

test('does not overlap jobs and waits for the running job on shutdown', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let calls = 0;
  let finish;
  const stop = startScheduler(() => {
    calls++;
    return new Promise(resolve => { finish = resolve; });
  }, () => {});
  assert.equal(calls, 1);
  t.mock.timers.tick(180000);
  assert.equal(calls, 1);
  let stopped = false;
  const shutdown = stop().then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(stopped, false);
  finish();
  await shutdown;
  t.mock.timers.tick(60000);
  assert.equal(calls, 1);
});

test('reports a job failure and continues on the next tick', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let calls = 0;
  let errors = 0;
  const stop = startScheduler(async () => { calls++; throw Error('upstream unavailable'); }, () => { errors++; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(errors, 1);
  t.mock.timers.tick(60000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.equal(errors, 2);
  await stop();
});
