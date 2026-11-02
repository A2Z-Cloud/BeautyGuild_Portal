// What changes in the portal's shell when the combined Membership and Insurance flow is on
// (docs/delivery/combined-membership-flow-spec.md, section 5). Pure rules, so the pages stay thin and the redirects are tested.

// The standalone insurance pages and where each one goes. Records at /insurance/:id are policies and stay where they are.
const REDIRECTS = {
  '/insurance': '/membership',
  '/insurance/buy': '/membership/buy',
  '/insurance/new': '/membership/buy',
};
export function insuranceRedirect(pathname, combined) {
  if (!combined) return null;
  return REDIRECTS[String(pathname || '').replace(/\/+$/, '') || '/'] || null;
}

export const COMBINED_TITLE = 'Membership and Insurance';
export const COMBINED_DESCRIPTION =
  'Join the Guild with or without insurance, and manage your membership and cover in one place.';

// Dashboard cards: the insurance card goes, and the membership card carries both.
export function liveServices(services, combined) {
  if (!combined) return services;
  return services
    .filter(s => s.kind !== 'insurance')
    .map(s =>
      s.kind === 'membership'
        ? { ...s, title: COMBINED_TITLE, description: COMBINED_DESCRIPTION, action: 'Go to membership and insurance' }
        : s,
    );
}

// Side navigation: one entry for both, named for both.
export function navItems(items, combined) {
  if (!combined) return items;
  return items
    .filter(i => i.path !== '/insurance')
    .map(i => (i.path === '/membership' ? { ...i, label: COMBINED_TITLE } : i));
}
