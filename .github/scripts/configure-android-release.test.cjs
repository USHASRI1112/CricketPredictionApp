const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/configure-android-release.cjs', 'utf8');
function run(env = {}, backend = "const PRODUCTION_BACKEND_URL = 'https://cricket.example/';", gradle = 'versionCode = (findProperty("APP_VERSION_CODE") ?: "3").toInteger()') {
  const writes = {};
  const fakeFs = {
    readFileSync: path => path === 'src/config/Backend.ts' ? backend : gradle,
    writeFileSync: (path, text) => { writes[path] = text; },
    appendFileSync: (path, text) => { writes[path] = (writes[path] || '') + text; },
  };
  vm.runInNewContext(source, { URL, console: { log() {} }, process: { env }, require: () => fakeFs });
  return writes;
}
test('uses committed production URL and version 3 when variables are absent', () => {
  const writes = run({ GITHUB_ENV: 'github-env' });
  assert.equal(writes['src/config/Backend.ts'], 'const PRODUCTION_BACKEND_URL = "https://cricket.example";');
  assert.equal(writes['github-env'], 'RELEASE_VERSION_CODE=3\nRELEASE_VERSION_NAME=1.0.2\n');
});
test('explicit release settings override committed defaults', () => {
  const writes = run({ BACKEND_URL: 'https://override.example/', VERSION_CODE: '4', VERSION_NAME: '1.0.3', GITHUB_ENV: 'github-env' });
  assert.match(writes['src/config/Backend.ts'], /https:\/\/override.example/);
  assert.match(writes['github-env'], /RELEASE_VERSION_CODE=4/);
});
test('fails clearly when neither variables nor source provide configuration', () => {
  assert.throws(() => run({}, "const PRODUCTION_BACKEND_URL = '';"), /RELEASE_BACKEND_URL/);
  assert.throws(() => run({}, undefined, ''), /Missing RELEASE_VERSION_CODE/);
});
test('rejects local URLs, credentials, invalid versions, and environment injection', () => {
  for (const env of [
    { BACKEND_URL: 'http://localhost:3000' },
    { BACKEND_URL: 'https://localhost' },
    { BACKEND_URL: 'https://user:password@cricket.example' },
    { VERSION_CODE: '0' },
    { VERSION_CODE: '2100000001' },
    { VERSION_CODE: '3\nINJECTED=yes' },
    { VERSION_NAME: '1.0.2\nINJECTED=yes' },
  ]) assert.throws(() => run(env));
});
