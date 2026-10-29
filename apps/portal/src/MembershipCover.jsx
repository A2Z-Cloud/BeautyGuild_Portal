import React, { useEffect, useState } from 'react';
import { Notice } from './UiParts.jsx';
import { formatDate } from './format.js';
import { Link } from 'react-router-dom';
import { INTEGRATIONS, portalApi } from './services/api.js';
import { eligibility } from './insuranceChangeForm.js';
import { canUpgrade, upgradeLink } from './membershipUpgrade.js';

const money = pence => '£' + (pence / 100).toFixed(2);
const GUILD_PHONE = '01332 224830';
const ROUTES = { salon: 'Salon', non_salon: 'Non-Salon' };

function Table({ columns, rows }) {
  return (
    <div className="school-table-scroll">
      <table className="record-table">
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.label}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              {columns.map(c => (
                <td key={c.label}>{c.value(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// What is shown while the cover is loading, or could not be read.
function Waiting({ state, what }) {
  if (state.loading) return <p>Loading {what}…</p>;
  if (state.error) return <Notice title="Unavailable">{state.error}</Notice>;
  return null;
}

// The member's current membership and insurance, read only. Changes are not offered online yet.
export function CoverSummary({ state, id }) {
  const wait = Waiting({ state, what: 'your cover' });
  if (wait) return wait;
  const cover = state.value;
  if (!cover) return null;
  const { membership, insurance } = cover;
  return (
    <>
      <h3>Your membership</h3>
      <dl className="detail-list">
        <div>
          <dt>Membership</dt>
          <dd>{membership.type || membership.title}</dd>
        </div>
        <div>
          <dt>Term</dt>
          <dd>
            {formatDate(membership.startDate)} to {formatDate(membership.endDate)}
          </dd>
        </div>
        <div>
          <dt>Branches</dt>
          <dd>{membership.branches.length ? membership.branches.join(', ') : '—'}</dd>
        </div>
      </dl>
      {membership.extras.length > 0 && (
        <Table
          rows={membership.extras}
          columns={[
            { label: 'Extra', value: r => r.type || '—' },
            { label: 'Branch', value: r => r.branch || '—' },
            { label: 'Quantity', value: r => r.quantity ?? '—' },
          ]}
        />
      )}
      <h3>Your insurance</h3>
      {insurance ? (
        <>
          <dl className="detail-list">
            <div>
              <dt>Policy</dt>
              <dd>{ROUTES[insurance.route] || insurance.type || 'Insurance'}</dd>
            </div>
            <div>
              <dt>Period of insurance</dt>
              <dd>
                {formatDate(insurance.startDate)} to {formatDate(insurance.endDate)}
              </dd>
            </div>
            <div>
              <dt>Premises</dt>
              <dd>{insurance.premises.length ? insurance.premises.map(p => p.address.join(', ')).join('; ') : '—'}</dd>
            </div>
          </dl>
          <Table
            rows={insurance.covers}
            columns={[
              { label: 'Cover', value: r => r.label },
              { label: 'Yearly price including IPT', value: r => (r.grossPence == null ? '—' : money(r.grossPence)) },
            ]}
          />
          {insurance.people.length > 0 && (
            <>
              <h3>People on your policy</h3>
              <Table
                rows={insurance.people}
                columns={[
                  { label: 'Name', value: r => r.name || '—' },
                  { label: 'Role', value: r => (r.type === 'subcontractor' ? 'Subcontractor' : 'Employee') },
                ]}
              />
            </>
          )}
        </>
      ) : (
        <>
          <p className="school-empty-text">
            {/associate/i.test(membership.type || '')
              ? 'Associate membership does not include insurance.'
              : 'We could not find a current insurance policy on this membership.'}
          </p>
          {INTEGRATIONS.membershipUpgrade &&
            canUpgrade(
              { type: membership.type, status: membership.status, endDate: membership.endDate },
              new Date().toISOString().slice(0, 10),
            ) && (
              <p>
                <Link className="btn btn-primary" to={upgradeLink(id)}>
                  Upgrade to Membership with Insurance
                </Link>{' '}
                <small className="muted">The unused part of your Associate membership fee is credited.</small>
              </p>
            )}
        </>
      )}
      {INTEGRATIONS.insuranceChanges && insurance && eligibility(cover).online ? (
        <p>
          <Link className="btn btn-primary" to={'/membership/manage/' + id + '/changes/new'}>
            Make changes to my insurance
          </Link>
        </p>
      ) : (
        !cover.canChange && (
          <p className="price-vat">
            To change your membership or cover, please call the office on {GUILD_PHONE}.
            {INTEGRATIONS.insuranceChanges ? '' : ' Changes online are coming soon.'}
          </p>
        )
      )}
    </>
  );
}

// Every change made to the membership or policy, newest first. Documents for each change will be linked here.
export function ChangeHistory({ state }) {
  const wait = Waiting({ state, what: 'your change history' });
  if (wait) return wait;
  const items = state.value?.revisions?.items || [];
  if (!items.length) return <p className="school-empty-text">No changes have been made to this membership yet.</p>;
  return (
    <Table
      rows={items}
      columns={[
        { label: 'Requested', value: r => formatDate(r.requested) },
        { label: 'Starts', value: r => formatDate(r.effectiveDate) },
        { label: 'Change', value: r => [r.type, r.scope].filter(Boolean).join(': ') || '—' },
        { label: 'Status', value: r => r.status || '—' },
      ]}
    />
  );
}

// Loads the cover only when the member opens one of these tabs, not every time the membership page opens.
export function MembershipCoverPanel({ id, view }) {
  const [state, setState] = useState({ loading: true, error: '', value: null });
  useEffect(() => {
    let active = true;
    setState({ loading: true, error: '', value: null });
    portalApi
      .getMembershipCover(id)
      .then(value => active && setState({ loading: false, error: '', value }))
      .catch(e => active && setState({ loading: false, error: e.message, value: null }));
    return () => {
      active = false;
    };
  }, [id]);
  return view === 'history' ? <ChangeHistory state={state} /> : <CoverSummary state={state} id={id} />;
}
