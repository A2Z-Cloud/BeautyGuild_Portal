// A school with more than one venue picks the venue first, then a course at that venue (Guild, 5 November 2026).
// An offering carries its venue's id and name from the course-options route.
const keyOf = o => String(o.trainingCentreId || o.trainingCentre || '');
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));
// The distinct venues that have a course, by name.
export function venuesOf(offerings = []) {
  const seen = new Map();
  for (const o of offerings)
    if (keyOf(o) && !seen.has(keyOf(o))) seen.set(keyOf(o), { id: keyOf(o), name: o.trainingCentre || 'Venue' });
  return [...seen.values()].sort(byName);
}
// The courses offered at one venue, by name.
export const coursesAt = (offerings = [], venueId = '') =>
  offerings.filter(o => keyOf(o) === String(venueId)).sort(byName);
