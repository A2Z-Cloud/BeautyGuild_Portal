'use strict';
// Which commit this deployment was built from. scripts/deploy-functions.sh writes build-info.json next to index.js just before it deploys
// and removes it afterwards, so a running function can say what it is (GET /health). Absent or invalid: no build is reported.
const fs = require('node:fs');
const path = require('node:path');

function readBuildInfo(file = path.join(__dirname, '..', 'build-info.json')) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!/^[0-9a-f]{7,40}$/.test(String(raw.commit))) return null;
    const at = typeof raw.builtAt === 'string' ? Date.parse(raw.builtAt) : NaN;
    return {
      commit: raw.commit,
      dirty: raw.dirty === true,
      builtAt: Number.isNaN(at) ? null : new Date(at).toISOString(),
    };
  } catch {
    return null;
  }
}

module.exports = { readBuildInfo };
