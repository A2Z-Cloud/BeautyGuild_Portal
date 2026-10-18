'use strict';

// Best-effort fixed-window limiter. Catalyst may run several instances, each with its own
// counters, so this slows casual abuse of the billable Loqate key but is not a hard guarantee.
function createRateLimiter({ limit, windowMs, now = Date.now }) {
  const hits = new Map();
  return function check(key) {
    const t = now();
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
    }
    const entry = hits.get(key);
    if (!entry || t - entry.start >= windowMs) {
      hits.set(key, { start: t, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}

module.exports = { createRateLimiter };
