/* eslint-disable react-hooks/rules-of-hooks --
   These two screens return early on build-time flags (INTEGRATIONS, DATA_MODE) that never change while the app runs,
   so their hooks are always called in the same order. */
import React from 'react';
import { ArrowLeft, ArrowRight, CalendarClock, FileText, ListFilter } from 'lucide-react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { DEMO_RECORDS } from './data/demo.js';
import { IconFor, Notice, PageHeading, Status } from './UiParts.jsx';
import { DATA_MODE, INTEGRATIONS } from './services/api.js';
import { LiveRecords, LiveRecordDetail } from './LiveRecords.jsx';

const TYPES = [
  { value: 'all', label: 'All records' },
  { value: 'membership', label: 'Membership' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'accreditation', label: 'Accreditation' },
];
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
  { id: 'documents', label: 'Documents' },
];
const routeFor = (record, tab = 'overview') =>
  '/records/' + record.kind + '/' + encodeURIComponent(record.id) + '?tab=' + tab;
export function Records() {
  if (INTEGRATIONS.crmRecords) return <LiveRecords />;
  if (DATA_MODE === 'api')
    return (
      <div className="page">
        <PageHeading title="My records" />
        <Notice title="Coming soon">Your memberships, accreditations and insurance will appear here soon.</Notice>
      </div>
    );

  const [params, setParams] = useSearchParams();
  const type = TYPES.some(x => x.value === params.get('type')) ? params.get('type') : 'all';
  const records = DEMO_RECORDS.filter(x => type === 'all' || x.kind === type);
  const setType = value => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('type');
    else next.set('type', value);
    setParams(next);
  };
  return (
    <div className="page">
      <PageHeading
        eyebrow="MY GUILD"
        title="My records"
        description="Browse representative membership, insurance and accreditation records. These are demonstration examples, not your CRM data."
      />
      <Notice title="Sample records only">
        There is no live CRM connection, record editing or document retrieval in this release.
      </Notice>
      <section className="surface records-surface">
        <div className="record-toolbar">
          <div>
            <small className="eyebrow">RECORD DIRECTORY</small>
            <h2>Applications and services</h2>
          </div>
          <div className="filter-wrap">
            <ListFilter size={17} />
            <label htmlFor="record-type">Show</label>
            <select id="record-type" value={type} onChange={e => setType(e.target.value)}>
              {TYPES.map(t => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {records.length ? (
          <div className="table-scroll">
            <table className="record-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Service</th>
                  <th>Status</th>
                  <th>Last updated</th>
                  <th className="align-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id}>
                    <td>
                      <Link className="reference" to={routeFor(r) + '&from=' + type}>
                        {r.reference}
                      </Link>
                      <small>{r.subtitle}</small>
                    </td>
                    <td>
                      <strong>{r.title}</strong>
                      <small>{r.category}</small>
                    </td>
                    <td>
                      <Status value={r.status} />
                    </td>
                    <td className="muted">{r.updated}</td>
                    <td className="align-right">
                      <Link
                        aria-label={'View ' + r.reference}
                        to={routeFor(r) + '&from=' + type}
                        className="table-open"
                      >
                        <ArrowRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">No sample records for this filter.</div>
        )}
      </section>
    </div>
  );
}
export function RecordDetail({ kindOverride }) {
  if (INTEGRATIONS.crmRecords) return <LiveRecordDetail kindOverride={kindOverride} />;
  if (DATA_MODE === 'api')
    return (
      <div className="page">
        <PageHeading title="Record unavailable" />
        <Notice title="Not available yet">This record is not available to view online yet.</Notice>
      </div>
    );

  const path = useParams(),
    location = useLocation();
  const kind = kindOverride || path.kind;
  const id = path.id;
  const item = DEMO_RECORDS.find(x => x.kind === kind && x.id === id);
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(x => x.id === params.get('tab')) ? params.get('tab') : 'overview';
  const from = TYPES.some(x => x.value === params.get('from')) ? params.get('from') : 'all';
  const setTab = t => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };
  if (!item)
    return (
      <div className="page narrow-page">
        <Link className="back-link" to="/records">
          <ArrowLeft size={16} /> All sample records
        </Link>
        <PageHeading
          eyebrow="NOT FOUND"
          title="Record unavailable"
          description="This is not one of the sample records included with the preview."
        />
      </div>
    );
  const back = '/records' + (from !== 'all' ? '?type=' + encodeURIComponent(from) : '');
  return (
    <div className="page record-detail">
      <Link className="back-link" to={back}>
        <ArrowLeft size={17} /> Back to records
      </Link>
      <PageHeading eyebrow={'SAMPLE ' + item.category.toUpperCase()} title={item.title} description={item.subtitle}>
        <Status value={item.status} />
      </PageHeading>
      <Notice title="Demonstration record">
        Example reference {item.reference}. These details are not connected to Zoho CRM. Statuses and dates are
        illustrative only.
      </Notice>
      <div className="record-layout">
        <section className="surface record-main">
          <div className="record-tabs" role="tablist" aria-label="Record sections">
            {TABS.map(t => (
              <button
                key={t.id}
                id={'tab-' + t.id}
                type="button"
                role="tab"
                aria-controls="record-panel"
                aria-selected={tab === t.id}
                className={tab === t.id ? 'selected' : ''}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div id="record-panel" role="tabpanel" aria-labelledby={'tab-' + tab} className="record-tab-body">
            {tab === 'overview' && (
              <>
                <div className="subheading">
                  <IconFor kind={item.kind} />
                  <div>
                    <small className="eyebrow">RECORD INFORMATION</small>
                    <h2>Overview</h2>
                  </div>
                </div>
                <dl className="detail-list">
                  <div>
                    <dt>Reference</dt>
                    <dd>{item.reference}</dd>
                  </div>
                  <div>
                    <dt>Service</dt>
                    <dd>{item.category}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <Status value={item.status} />
                    </dd>
                  </div>
                  <div>
                    <dt>Last updated</dt>
                    <dd>{item.updated}</dd>
                  </div>
                  <div>
                    <dt>Example contact</dt>
                    <dd>{item.contact}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{item.email}</dd>
                  </div>
                  <div>
                    <dt>Territory</dt>
                    <dd>{item.country}</dd>
                  </div>
                  <div>
                    <dt>Application</dt>
                    <dd>{item.subtitle}</dd>
                  </div>
                </dl>
              </>
            )}
            {tab === 'activity' && (
              <>
                <div className="subheading">
                  <CalendarClock size={24} />
                  <h2>Activity history</h2>
                </div>
                <ol className="timeline">
                  {item.timeline.map((event, index) => (
                    <li key={index}>
                      <b>{String(index + 1).padStart(2, '0')}</b>
                      <div>
                        <strong>{event}</strong>
                        <small>Demonstration activity</small>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}
            {tab === 'documents' && (
              <>
                <div className="subheading">
                  <FileText size={24} />
                  <h2>Documents</h2>
                </div>
                <div className="empty-state">
                  <FileText size={28} />
                  <strong>No documents connected</strong>
                  <p>
                    Real document access will use authorised WorkDrive/CRM API links after backend integration. No files
                    can be downloaded in this preview.
                  </p>
                </div>
              </>
            )}
          </div>
        </section>
        <aside className="record-side">
          <div className="aside-card">
            <small className="eyebrow">APPLICATION STATUS</small>
            <h3>{item.status}</h3>
            <p>This is an example status. Guild decisions and CRM updates are not connected.</p>
          </div>
          <div className="aside-card">
            <small className="eyebrow">NEXT STEPS</small>
            <h3>Explore the journey</h3>
            <p>See how a new {kind} application is presented in the frontend preview.</p>
            <Link className="btn btn-secondary btn-block" to={'/' + kind + '/new'}>
              Start example journey <ArrowRight size={16} />
            </Link>
          </div>
          <div className="aside-card aside-warning">
            <strong>Read-only preview</strong>
            <p>No approvals, edits, payments or file uploads can be made from sample records.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
