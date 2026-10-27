'use strict';
// Pro-rata over the rest of a term (Guild, 26 October 2026): the days remaining divided by the days the term runs, counting both the first
// and the last day, so a term of a year is 365 days (366 if it spans 29 February). Used for every mid-term charge and refund.
const DAY = 864e5;
const day = iso => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY;
};

// The whole term and what is left of it from `from` (the first day of the change). `days` is held between 0 and the whole term.
function prorata({ start, end, from }) {
  const total = day(end) - day(start) + 1;
  const left = day(end) - day(from) + 1;
  return { days: Math.max(0, Math.min(total, left)), total };
}

// A yearly price in pence for the days left, rounded to the penny.
const prorate = (pence, { days, total }) => (total > 0 ? Math.round((pence * days) / total) : 0);

module.exports = { prorata, prorate };
