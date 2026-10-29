// Upgrading an Associate membership to Full with insurance (docs/delivery/cancellations-refunds-spec.md, sections 3.6 and 4.2). These are the
// rules for WHEN the portal offers it; the server decides eligibility and prices the credit, and refuses anything it cannot confirm.
export const isAssociate = type => /associate/i.test(String(type || ''));

// The upgrade page for one membership: the same journey as buying insurance for the first time, with the Associate membership named so the
// server credits its unused fee.
export const upgradeLink = id => '/membership/buy?renew=' + encodeURIComponent(id) + '&change=upgrade';

// Offered for a current Associate membership only. `status` is the CRM stage and `endDate` the end of the term (yyyy-mm-dd).
export function canUpgrade({ type, status, endDate }, today) {
  if (!isAssociate(type)) return false;
  // A record that has run out, been cancelled or is not yet a membership is not upgraded. (The server checks the CRM stage again.)
  if (/expired|lapsed|cancel|draft|pending|referred/i.test(String(status || ''))) return false;
  return !endDate || String(endDate).slice(0, 10) >= today;
}

// The Associate membership an insurance page should offer an upgrade for: the member's current (not expired) Associate record, if any.
export function upgradableRecord(rows, today) {
  return (
    (rows || []).find(r => canUpgrade({ type: r.type || r.title, status: r.status, endDate: r.endDate }, today)) || null
  );
}
