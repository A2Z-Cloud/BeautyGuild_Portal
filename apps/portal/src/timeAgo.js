// "3 days ago" from a time in milliseconds (the Guild's V1 document list read the same way).
export function timeAgo(ms, now = Date.now()) {
  if (!ms) return '';
  const seconds = Math.max(0, Math.floor((now - ms) / 1000));
  for (const [label, size] of [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]) {
    const count = Math.floor(seconds / size);
    if (count >= 1) return count + ' ' + label + (count === 1 ? '' : 's') + ' ago';
  }
  return 'Just now';
}
