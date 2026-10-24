import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// A node_modules link committed by mistake replaces the real folder on checkout and breaks every install, test and deploy.
test('no node_modules folder or link is tracked by git', () => {
  const tracked = execFileSync('git', ['ls-files', '-s'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean);
  const bad = tracked.filter(line => /(^|\/)node_modules(\/|$)/.test(line.split('\t')[1] || ''));
  assert.deepEqual(bad, []);
});
