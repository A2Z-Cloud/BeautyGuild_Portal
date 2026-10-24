import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { INTEGRATIONS, portalApi } from './services/api.js';
import { Status, IconFor } from './UiParts.jsx';
import { comingSoon, formatDate, isExpired, serviceLabel } from './format.js';

// Loads the member's own records for one service. Quiet when signed out, unmatched or unavailable: the page then shows the
// ordinary introduction, so a new customer sees no error.
export { isExpired };
export function useServiceRecords(kind) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!INTEGRATIONS.crmRecords) {
      setRows([]);
      return undefined;
    }
    let alive = true;
    portalApi
      .listRecords(kind)
      .then(x => alive && setRows(Array.isArray(x) ? x : []))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [kind]);
  return rows;
}
// Records first: what you hold, its dates and its status, each one a link to its page.
export function MyServiceRecords({ kind, rows }) {
  if (!rows?.length) return null;
  const ordered = [...rows].sort(
    (a, b) =>
      Number(isExpired(a)) - Number(isExpired(b)) || String(b.endDate || '').localeCompare(String(a.endDate || '')),
  );
  return (
    <section className="my-service-records" aria-label={'Your ' + serviceLabel(kind).toLowerCase()}>
      <div className="section-row">
        <div>
          <small className="eyebrow">YOUR {serviceLabel(kind).toUpperCase()}</small>
          <h2>What you hold</h2>
        </div>
        <Link className="text-link" to={'/records?type=' + kind}>
          All {serviceLabel(kind).toLowerCase()} records <ArrowRight size={15} />
        </Link>
      </div>
      <div className="service-record-list">
        {ordered.map(r => {
          const soon = comingSoon(r),
            expired = !soon && isExpired(r);
          return (
            <Link
              key={r.id}
              to={'/records/' + kind + '/' + encodeURIComponent(r.id)}
              className={'service-record' + (expired ? ' expired' : '')}
            >
              <span className="service-icon">
                <IconFor kind={kind} />
              </span>
              <span className="service-record-copy">
                <strong>{r.title}</strong>
                <small>
                  {[r.type, r.startDate && r.endDate ? formatDate(r.startDate) + ' to ' + formatDate(r.endDate) : null]
                    .filter(Boolean)
                    .join(' · ') || 'Open to see the details'}
                </small>
              </span>
              {soon ? (
                <span>
                  <Status value="Coming soon" />
                  <small>{soon.note}</small>
                </span>
              ) : (
                <span>
                  <Status value={expired && !/expired/i.test(r.status || '') ? 'Expired' : r.status} />
                  {r.endDate && !expired && <small>Ends {formatDate(r.endDate)}</small>}
                </span>
              )}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
