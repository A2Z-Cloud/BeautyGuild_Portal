// Groups GTi courses by category (or by treatment group when `by` is 'treatmentGroup') (alphabetical, "Other" last) and filters by a search word.
export function groupCourses(courses, query = '', by = 'category') {
  const q = String(query).trim().toLowerCase();
  const map = new Map();
  for (const c of courses || []) {
    const name = String(c.name || 'Unnamed course');
    if (
      q &&
      !name.toLowerCase().includes(q) &&
      !String(c.treatmentGroup || '')
        .toLowerCase()
        .includes(q)
    )
      continue;
    const key = String(c[by] || 'Other').trim() || 'Other';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ ...c, name });
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)))
    .map(([category, items]) => ({ category, items: items.sort((x, y) => x.name.localeCompare(y.name)) }));
}
