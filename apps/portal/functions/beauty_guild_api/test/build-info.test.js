'use strict';
// GET /health says which commit was deployed, so a stale deployment can be told from a current one (src/buildInfo.js, scripts/verify-function.sh).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readBuildInfo } = require('../src/buildInfo');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');

const write = text => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bi-')), 'build-info.json');
  fs.writeFileSync(file, text);
  return file;
};

test('a valid build file is read; anything else reports no build', () => {
  const good = readBuildInfo(write('{"commit":"0cc43361","dirty":false,"builtAt":"2026-10-28T14:54:00Z"}'));
  assert.deepEqual(good, { commit: '0cc43361', dirty: false, builtAt: '2026-10-28T14:54:00.000Z' });
  assert.equal(readBuildInfo(write('{"commit":"0cc43361","dirty":true}')).dirty, true);
  assert.equal(readBuildInfo(write('{"commit":"0cc43361"}')).builtAt, null);
  assert.equal(readBuildInfo(write('{"commit":"not a sha"}')), null);
  assert.equal(readBuildInfo(write('{"commit":"<script>"}')), null);
  assert.equal(readBuildInfo(write('not json')), null);
  assert.equal(readBuildInfo(path.join(os.tmpdir(), 'bi-does-not-exist', 'build-info.json')), null);
});

async function health(buildInfo) {
  const app = createApp({
    config: loadConfig({}),
    getCrmHeaders: async () => ({}),
    fetchImpl: async () => ({}),
    buildInfo,
  });
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    return await (await fetch('http://127.0.0.1:' + server.address().port + '/health')).json();
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('/health reports the build when there is one, and is just ok when there is not', async () => {
  assert.deepEqual(await health(null), { ok: true });
  const build = { commit: '0cc43361', dirty: false, builtAt: '2026-10-28T14:54:00.000Z' };
  assert.deepEqual(await health(build), { ok: true, build });
});
