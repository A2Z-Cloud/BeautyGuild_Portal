/* Staff Workspace shared interface pieces: status pills, status tiles, list rows, panel groups, header band.
 * One set of building blocks so every page looks like the same product. Pure string builders, no CRM calls. */
(function (root) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TONES = ['success', 'warning', 'danger', 'info', 'draft', 'neutral', 'missing'];
  const tone = t => (TONES.includes(t) ? t : 'neutral');
  const pill = (text, t) => '<span class="bg-state bg-state-' + tone(t) + '">' + esc(text) + '</span>';
  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    return (parts.slice(0, 2).map(p => p[0]).join('') || '?').toUpperCase();
  }
  function niceDate(v) {
    if (!v) return '';
    const d = new Date(String(v).slice(0, 10) + 'T00:00:00');
    return isNaN(d) ? String(v) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  // How long is left on a membership, as a plain sentence, a tone and a 0 to 100 bar.
  function expiry(date, now) {
    const d = date ? new Date(String(date).slice(0, 10) + 'T00:00:00') : null;
    if (!d || isNaN(d)) return { tone: 'warning', value: 'Not recorded', sub: 'No expiry date on this membership', pct: null, days: null };
    const t = new Date(now || Date.now());
    t.setHours(0, 0, 0, 0);
    const days = Math.round((d - t) / 86400000), nice = niceDate(date);
    if (days < 0) return { tone: 'danger', value: 'Expired', sub: 'Ended ' + nice + ' (' + -days + (-days === 1 ? ' day' : ' days') + ' ago)', pct: 0, days };
    if (days === 0) return { tone: 'warning', value: 'Expires today', sub: nice, pct: 0, days };
    return { tone: days <= 60 ? 'warning' : 'success', value: days + (days === 1 ? ' day left' : ' days left'), sub: 'Expires ' + nice, pct: Math.max(0, Math.min(100, Math.round((days / 365) * 100))), days };
  }
  function tile(o) {
    return '<div class="bg-tile bg-tile--' + tone(o.tone) + '"><span class="bg-tile-icon" aria-hidden="true">' + (o.icon || '') + '</span><div class="bg-tile-body"><span class="bg-tile-label">' + esc(o.label) + '</span><strong class="bg-tile-value">' + esc(o.value) + '</strong>' +
      (o.sub ? '<small>' + esc(o.sub) + '</small>' : '') +
      (o.pct === null || o.pct === undefined ? '' : '<span class="bg-bar" role="img" aria-label="' + esc(o.pct + ' per cent of a year left') + '"><span style="width:' + Number(o.pct) + '%"></span></span>') +
      '</div></div>';
  }
  // A whole row that is the link, so there is no separate button to hunt for.
  function row(o) {
    return '<button type="button" class="bg-row" ' + (o.attrs || '') + '><span class="bg-row-main"><span class="bg-row-title">' + esc(o.title) + (o.tag ? ' <span class="bg-tag">' + esc(o.tag) + '</span>' : '') + '</span>' +
      '<span class="bg-row-pills">' + (o.pills || []).filter(Boolean).map(p => pill(p[0], p[1])).join('') + '</span></span>' +
      '<span class="bg-row-aside">' + esc(o.aside || '') + '</span><span class="bg-row-chev" aria-hidden="true">' + (o.chevron || '&rsaquo;') + '</span></button>';
  }
  function group(o) {
    return '<section class="bg-group' + (o.compact ? ' bg-group--compact' : '') + '"><header class="bg-group-head"><span class="bg-group-icon" aria-hidden="true">' + (o.icon || '') + '</span><h4>' + esc(o.title) + '</h4>' +
      (o.count !== null && o.count !== undefined ? '<span class="bg-count">' + esc(o.count) + '</span>' : '') + '</header><div class="bg-group-body">' + (o.body || '') + '</div>' +
      (o.footer ? '<footer class="bg-group-foot">' + o.footer + '</footer>' : '') + '</section>';
  }
  function empty(o) {
    return '<div class="bg-empty"><strong>' + esc(o.title) + '</strong>' + (o.text ? '<p>' + esc(o.text) + '</p>' : '') + (o.action || '') + '</div>';
  }
  function header(o) {
    return '<header class="bg-band"><span class="bg-avatar" aria-hidden="true">' + esc(initials(o.name)) + '</span><div class="bg-band-main"><span class="bg-kicker">' + esc(o.kicker || '') + '</span><h3>' + esc(o.name) + '</h3>' +
      '<div class="bg-chips">' + (o.badge ? '<span class="bg-badge">' + esc(o.badge) + '</span>' : '') + (o.chips || []).filter(Boolean).map(c => '<span class="bg-chip">' + esc(c) + '</span>').join('') + '</div></div>' +
      '<div class="bg-band-actions">' + (o.actions || '') + '</div></header>';
  }
  root.BGUI = { esc, pill, tone, initials, niceDate, expiry, tile, row, group, empty, header };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BGUI;
})(typeof window !== 'undefined' ? window : globalThis);
