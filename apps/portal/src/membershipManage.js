// Rules for the manage membership page (docs/delivery/combined-membership-flow-spec.md, section 9). Pure, so the page stays thin.
import { formatDate } from './format.js';
import { canUpgrade } from './membershipUpgrade.js';

export const SECTION_KEYS = ['overview', 'extras', 'cover', 'history', 'documents', 'invoices'];
// Sections that only make sense for a member who holds a policy.
const POLICY_SECTIONS = ['cover', 'history'];

// Links from before the redesign used /membership/manage/:id?tab=... and must keep working (emails, saved bookmarks).
const LEGACY_TABS = { details: 'overview', cover: 'cover', history: 'history', addons: 'extras', invoices: 'invoices' };
export const sectionFromTab = tab => LEGACY_TABS[tab] || null;

// The section to show: the requested one if it exists and applies, otherwise the overview. `hasPolicy` is false only once the cover has loaded
// and shows no policy (Associate and International hold none), so a section is never hidden just because the cover is still loading.
export function resolveSection(requested, hasPolicy = true) {
  if (!SECTION_KEYS.includes(requested)) return 'overview';
  return !hasPolicy && POLICY_SECTIONS.includes(requested) ? 'overview' : requested;
}

const DAY = 86400000;
const dayNumber = iso => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY) : null;
};
// Whole days from `today` to the end date (negative once it has passed), or null when there is no end date.
export function daysUntil(endDate, today) {
  const end = dayNumber(endDate),
    now = dayNumber(today);
  return end === null || now === null ? null : end - now;
}
export const RENEWAL_WINDOW_DAYS = 60;
// Renew shows from 60 days before the end of the term, and after it. With no end date it stays available rather than hiding the way to renew.
export function renewalOpen(endDate, today) {
  const days = daysUntil(endDate, today);
  return days === null || days <= RENEWAL_WINDOW_DAYS;
}

// The actions this member can take now: only what applies, in order.
export function manageActions({ type, status, endDate }, { today, canBuy, upgradeOn }) {
  const actions = [];
  if (canBuy && renewalOpen(endDate, today)) actions.push('renew');
  if (upgradeOn && canUpgrade({ type, status, endDate }, today)) actions.push('upgrade');
  return actions;
}

// "Full Member (Non-Salon) · Active · to 30 Nov 2026"
export function headerLine({ type, status, endDate }) {
  return [type, status, endDate ? 'to ' + formatDate(endDate) : ''].filter(Boolean).join(' · ');
}

// The labelled fields on the overview. Raw CRM keys are never shown: only these, and only the ones with a value.
export function overviewFields(membership, record) {
  const m = membership || {},
    r = record || {};
  const rows = [
    ['Membership', m.title || r.title],
    ['Level', m.type || r.type],
    ['Status', m.status || r.status],
    ['Start date', m.startDate || r.startDate ? formatDate(m.startDate || r.startDate) : ''],
    ['Expiry date', m.endDate || r.endDate ? formatDate(m.endDate || r.endDate) : ''],
    ['Branches', Array.isArray(m.branches) && m.branches.length ? m.branches.join(', ') : ''],
    ['Payment status', r.paymentStatus],
    ['Reference', m.id || r.id],
  ];
  return rows
    .filter(([, value]) => String(value || '').trim())
    .map(([label, value]) => ({ label, value: String(value) }));
}

// What needs the member's attention: a renewal due or an ended term, a payment that has not gone through, a change waiting to be paid.
export function attentionItems({ membership, paymentStatus, revisions }, today) {
  const items = [];
  const end = membership?.endDate || null,
    days = daysUntil(end, today);
  if (days !== null && days < 0) items.push('Your membership ended on ' + formatDate(end) + '. You can renew it.');
  else if (days !== null && days <= RENEWAL_WINDOW_DAYS)
    items.push('Your membership ends on ' + formatDate(end) + '. You can renew it now.');
  if (/fail|overdue|unpaid|declin/i.test(String(paymentStatus || ''))) items.push('A payment has not gone through.');
  if ((revisions || []).some(x => /awaiting|pending/i.test(String(x.status || ''))))
    items.push('A change to your cover is waiting for payment.');
  return items;
}
