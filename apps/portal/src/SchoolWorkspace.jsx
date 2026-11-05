import React, { useEffect, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  BookOpen,
  CalendarDays,
  Users,
  GraduationCap,
  FileText,
  Receipt,
  MapPin,
  ShieldCheck,
  ClipboardList,
  History,
  LockKeyhole,
  RefreshCw,
} from 'lucide-react';
import { PageHeading, Notice, ErrorNotice, Status } from './UiParts.jsx';
import { formatDate } from './format.js';
import { INTEGRATIONS, portalApi } from './services/api.js';
import { DocumentsPanel } from './DocumentsPanel.jsx';
import { ChangeHistory, CoverSummary } from './MembershipCover.jsx';
import { GUILD_PHONE } from './insuranceInputs.js';
import { upgradeLink } from './membershipUpgrade.js';
import {
  attentionItems,
  headerLine,
  manageActions,
  overviewFields,
  resolveSection,
  sectionFromTab,
} from './membershipManage.js';
import { QualificationForm, SessionForm, TutorForm, BookingForm } from './SchoolActionForms.jsx';
import ManagementLayout from './ManagementLayout.jsx';
import SchoolProfilePanel from './SchoolProfilePanel.jsx';
import SchoolVerification from './SchoolVerification.jsx';
import VenuesTab from './VenuesTab.jsx';
import CourseGroups from './components/CourseGroups.jsx';

const GROUPS = [
  {
    label: 'Overview',
    items: [
      ['profile', 'School profile', Building2],
      ['verification', 'Verification', ShieldCheck],
    ],
  },
  {
    label: 'Teaching',
    items: [
      ['courses', 'Courses', BookOpen],
      ['sessions', 'Course dates', CalendarDays],
      ['tutors', 'Tutors', Users],
      ['qualifications', 'Qualifications', GraduationCap],
      ['venues', 'Venues', MapPin],
    ],
  },
  {
    label: 'Records',
    items: [
      ['documents', 'Documents', FileText],
      ['invoices', 'Invoices', Receipt],
    ],
  },
];
const sections = GROUPS.flatMap(g => g.items);
const SCHOOL_GROUPS = GROUPS.map(g => ({
  label: g.label,
  items: g.items.map(([key, label, icon]) => ({ key, label, icon })),
}));
function useLoad(load, keys) {
  const [data, setData] = useState({ loading: true, error: '', value: null });
  useEffect(() => {
    let active = true;
    setData({ loading: true, error: '', value: null });
    load()
      .then(value => active && setData({ loading: false, error: '', value }))
      .catch(e => active && setData({ loading: false, error: e.message, value: null }));
    return () => {
      active = false;
    };
  }, keys);
  return data;
}
function Empty({ children }) {
  return <p className="school-empty-text">{children}</p>;
}
function SimpleTable({ columns, rows }) {
  return (
    <div className="school-table-scroll">
      <table className="record-table">
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i}>
              {columns.map(c => (
                <td key={c.key}>{c.render ? c.render(r) : (r[c.key] ?? '—')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const col = (key, label, render) => ({ key, label, ...(render ? { render } : {}) });
const dateCol = (key, label, opts) => col(key, label, r => formatDate(r[key], opts));
export function SchoolsList() {
  const state = useLoad(() => portalApi.listSchools(), []);
  return (
    <div className="page">
      <PageHeading
        eyebrow="TRAINING CENTRES"
        title="My schools"
        description="Manage accredited courses, venues, tutors, qualifications, dates and invoices."
      />
      {!INTEGRATIONS.schoolServices ? (
        <Notice title="Coming soon">Managing your school online is coming soon.</Notice>
      ) : state.loading ? (
        <p role="status">Loading your schools…</p>
      ) : state.error ? (
        <ErrorNotice title="Schools unavailable" error={state.error} />
      ) : (
        <div className="school-list">
          {state.value.length ? (
            state.value.map(s => (
              <Link className="surface padded school-list-card" key={s.id} to={'/schools/' + s.id + '/profile'}>
                <Building2 size={29} />
                <div>
                  <h2>{s.name}</h2>
                  <p>
                    {s.level || 'Training centre'} ·{' '}
                    {s.validTo ? 'Valid until ' + formatDate(s.validTo) : 'Expiry date unavailable'}
                  </p>
                  <Status value={s.status} />
                </div>
                <ArrowRight size={18} />
              </Link>
            ))
          ) : (
            <Empty>No accredited schools are linked to your account yet.</Empty>
          )}
        </div>
      )}
    </div>
  );
}
// A Creator number is shown as #41; a Books number (INV-000123) already reads as a reference, so no #.
const numberLabel = r =>
  /^\d+$/.test(String(r.invoiceNumber || '')) || !r.invoiceNumber ? '#' + (r.invoiceNumber || r.id) : r.invoiceNumber;
export function InvoiceTable({ rows }) {
  const [selected, setSelected] = useState(null);
  return (
    <>
      {rows.length ? (
        <SimpleTable
          columns={[
            {
              key: 'invoiceNumber',
              label: 'Invoice',
              render: r => (
                <button type="button" className="text-button" onClick={() => setSelected(r)}>
                  {numberLabel(r)}
                </button>
              ),
            },
            col('type', 'Type'),
            dateCol('invoiceDate', 'Date'),
            dateCol('dueDate', 'Due'),
            {
              key: 'amount',
              label: 'Amount',
              render: r => (Number.isFinite(r.amount) ? '£' + r.amount.toFixed(2) : '—'),
            },
            { key: 'status', label: 'Status', render: r => <Status value={r.status || 'Unknown'} /> },
          ]}
          rows={rows}
        />
      ) : (
        <Empty>No invoices were returned for this account.</Empty>
      )}
      {selected && (
        <div className="school-dialog-overlay" role="presentation" onClick={() => setSelected(null)}>
          <section
            className="school-dialog surface padded"
            role="dialog"
            aria-modal="true"
            aria-label="Invoice details"
            onClick={e => e.stopPropagation()}
          >
            <div className="school-dialog-head">
              <h2>Invoice {numberLabel(selected)}</h2>
              <button className="btn btn-secondary" type="button" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
            <dl className="detail-list">
              {Object.entries({
                Type: selected.type,
                Status: selected.status,
                Amount: Number.isFinite(selected.amount) ? '£' + selected.amount.toFixed(2) : null,
                'Net amount': Number.isFinite(selected.netAmount) ? '£' + selected.netAmount.toFixed(2) : null,
                VAT: Number.isFinite(selected.vatAmount) ? '£' + selected.vatAmount.toFixed(2) : null,
                'Invoice date': formatDate(selected.invoiceDate),
                'Due date': formatDate(selected.dueDate),
                'Payment date': formatDate(selected.paymentDate),
              }).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v || '—'}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}
    </>
  );
}
function SchoolSection({ id, section }) {
  const [editing, setEditing] = useState(false),
    [reload, setReload] = useState(0);
  const state = useLoad(() => portalApi.getSchoolSection(id, section), [id, section, reload]);
  const saved = () => {
    setEditing(false);
    setReload(n => n + 1);
  };
  const [session, setSession] = useState(null),
    [addingBooking, setAddingBooking] = useState(false),
    [booksReload, setBooksReload] = useState(0);
  const books = useLoad(
    () => (session ? portalApi.getSessionBookings(id, session) : Promise.resolve({ bookings: [] })),
    [id, session, booksReload],
  );
  const bookingSaved = () => {
    setAddingBooking(false);
    setBooksReload(n => n + 1);
    setReload(n => n + 1);
  };
  if (state.loading) return <p role="status">Loading {section}…</p>;
  if (state.error) return <Notice title="Section unavailable">{state.error}</Notice>;
  const x = state.value;
  switch (section) {
    case 'profile':
      return <SchoolProfilePanel data={x} schoolId={id} onDone={saved} />;
    case 'courses':
      return (
        <>
          <h2>Accredited courses</h2>
          <SimpleTable rows={x.courses || []} columns={[col('name', 'Course')]} />
          <h3>Other available GTi courses</h3>
          <p>Contact the Guild to add a new course to this accreditation.</p>
          <CourseGroups courses={x.available || []} searchable emptyText="There are no other GTi courses to add." />
        </>
      );
    case 'venues':
      return <VenuesTab schoolId={id} data={x} onChanged={saved} />;
    case 'tutors':
      return (
        <>
          <div className="school-dialog-head">
            <h2>Accredited tutors</h2>
            {INTEGRATIONS.schoolWrites && (
              <button type="button" className="btn btn-primary" onClick={() => setEditing(v => !v)}>
                {editing ? 'Cancel' : 'Add tutor'}
              </button>
            )}
          </div>
          <p>Tutors should hold current Guild membership, appropriate qualifications and insurance.</p>
          {editing && <TutorForm schoolId={id} onDone={saved} />}
          <SimpleTable
            rows={(x.tutors || []).filter(t => t.active)}
            columns={[
              col('name', 'Tutor'),
              col('membershipNumber', 'Membership number'),
              dateCol('membershipExpiry', 'Membership expiry'),
              col('status', 'Membership'),
            ]}
          />
          <h3>Inactive tutors</h3>
          <p>
            These tutors have been added but are not active yet. They become active once they hold a current Guild
            membership.
          </p>
          <SimpleTable
            rows={(x.tutors || []).filter(t => !t.active)}
            columns={[
              col('name', 'Tutor'),
              col('membershipNumber', 'Membership number'),
              dateCol('membershipExpiry', 'Membership expiry'),
              col('status', 'Membership'),
            ]}
          />
        </>
      );
    case 'qualifications':
      return (
        <>
          <div className="school-dialog-head">
            <h2>Your Qualifications</h2>
            {INTEGRATIONS.schoolWrites && (
              <button type="button" className="btn btn-primary" onClick={() => setEditing(v => !v)}>
                {editing ? 'Cancel' : 'Add qualification'}
              </button>
            )}
          </div>
          {editing && <QualificationForm schoolId={id} onDone={saved} />}
          <SimpleTable
            rows={x.qualifications || []}
            columns={[
              col('name', 'Qualification'),
              {
                key: 'month',
                label: 'Completed',
                render: r =>
                  [
                    [
                      'January',
                      'February',
                      'March',
                      'April',
                      'May',
                      'June',
                      'July',
                      'August',
                      'September',
                      'October',
                      'November',
                      'December',
                    ][Number(r.month) - 1],
                    r.year,
                  ]
                    .filter(Boolean)
                    .join(' ') || '—',
              },
              col('status', 'Verification'),
            ]}
          />
        </>
      );
    case 'sessions':
      return (
        <>
          <div className="school-dialog-head">
            <h2>Course dates and bookings</h2>
            {INTEGRATIONS.schoolWrites && (
              <button type="button" className="btn btn-primary" onClick={() => setEditing(v => !v)}>
                {editing ? 'Cancel' : 'Create session'}
              </button>
            )}
          </div>
          <p>Your published fixed and flexible course dates, with the places booked so far.</p>
          {editing && <SessionForm schoolId={id} onDone={saved} />}
          <SimpleTable
            rows={x.sessions || []}
            columns={[
              col('name', 'Course / session'),
              col('availabilityType', 'Availability'),
              dateCol('start', 'Date', { time: true }),
              {
                key: 'placesBooked',
                label: 'Places booked',
                render: r =>
                  r.maximumPlaces == null ? String(r.placesBooked) : r.placesBooked + ' / ' + r.maximumPlaces,
              },
              col('status', 'Status'),
              {
                key: 'id',
                label: 'Bookings',
                render: r => (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setSession(r.id);
                      setAddingBooking(false);
                    }}
                  >
                    View bookings
                  </button>
                ),
              },
            ]}
          />
          {session && (
            <div className="school-dialog-overlay" role="presentation" onClick={() => setSession(null)}>
              <section
                className="school-dialog surface padded"
                role="dialog"
                aria-modal="true"
                aria-label="Session bookings"
                onClick={e => e.stopPropagation()}
              >
                <div className="school-dialog-head">
                  <h2>Session bookings</h2>
                  <div>
                    {INTEGRATIONS.schoolWrites && (
                      <button type="button" className="btn btn-primary" onClick={() => setAddingBooking(v => !v)}>
                        {addingBooking ? 'Cancel' : 'Add booking'}
                      </button>
                    )}{' '}
                    <button type="button" className="btn btn-secondary" onClick={() => setSession(null)}>
                      Close
                    </button>
                  </div>
                </div>
                {addingBooking && (
                  <BookingForm
                    schoolId={id}
                    session={
                      (x.sessions || []).find(s => s.id === session) || { id: session, availabilityType: 'Fixed Date' }
                    }
                    onDone={bookingSaved}
                  />
                )}
                {books.loading ? (
                  <p>Loading bookings…</p>
                ) : books.error ? (
                  <Notice title="Bookings unavailable">{books.error}</Notice>
                ) : (
                  <SimpleTable
                    rows={books.value?.bookings || []}
                    columns={[
                      col('name', 'Student'),
                      col('places', 'Places'),
                      col('status', 'Status'),
                      col('message', 'Notes'),
                    ]}
                  />
                )}
              </section>
            </div>
          )}
        </>
      );
    case 'verification':
      return <SchoolVerification data={x} />;
    case 'invoices':
      return (
        <>
          <h2>Invoices</h2>
          <Notice title="All your invoices">
            This list shows every invoice on your account, not only this school's.
          </Notice>
          <InvoiceTable rows={x.invoices || []} />
        </>
      );
    default:
      return <Empty>Section unavailable.</Empty>;
  }
}
export function SchoolWorkspace() {
  const { id, section: requested } = useParams(),
    [search, setSearch] = useSearchParams();
  const section = sections.some(s => s[0] === requested) ? requested : 'profile';
  const current = useLoad(() => portalApi.listSchools(), [id]);
  const school = current.value?.find(s => s.id === id);
  const notice = !INTEGRATIONS.schoolServices ? (
    <Notice title="Coming soon">Managing your school online is coming soon.</Notice>
  ) : current.loading ? (
    <p>Loading school…</p>
  ) : current.error ? (
    <Notice title="Unable to load school">{current.error}</Notice>
  ) : !school ? (
    <Notice title="School unavailable">No school linked to your account matches this reference.</Notice>
  ) : null;
  return (
    <ManagementLayout
      back={{ to: '/schools', label: 'Back to schools' }}
      eyebrow="SCHOOL MANAGEMENT"
      title={school?.name || 'Training centre'}
      description={school ? school.level + ' · ' + school.status : 'Manage your school'}
      navLabel="School sections"
      groups={SCHOOL_GROUPS}
      active={section}
      hrefFor={key => '/schools/' + id + '/' + key}
      notice={notice}
    >
      {section === 'documents' ? (
        <DocumentsPanel kind="accreditation" id={id} />
      ) : (
        <SchoolSection key={id + '/' + section} id={id} section={section} />
      )}
    </ManagementLayout>
  );
}
export function AccountInvoices() {
  const state = useLoad(() => portalApi.getAccountInvoices(), []);
  return (
    <div className="page">
      <PageHeading
        eyebrow="YOUR ACCOUNT"
        title="My invoices"
        description="Your invoices for membership, accreditation and additional venues."
      />
      {!INTEGRATIONS.schoolServices ? (
        <Notice title="Coming soon">Your invoices will appear here soon.</Notice>
      ) : state.loading ? (
        <p role="status">Loading invoices…</p>
      ) : state.error ? (
        <ErrorNotice title="Invoices unavailable" error={state.error} />
      ) : (
        <section className="surface padded">
          <InvoiceTable rows={state.value} />
        </section>
      )}
    </div>
  );
}
// What the member sees first: what needs attention, then the labelled facts about the membership. Nothing here is editable, because membership
// details change through renewals and changes, so it carries the same "managed by the Guild" note as the school profile.
function MembershipOverview({ cover, record, today }) {
  if (cover.loading && record.loading) return <p>Loading membership…</p>;
  if (cover.error && record.error) return <Notice title="Unavailable">{record.error}</Notice>;
  const membership = cover.value?.membership,
    row = record.value;
  const attention = attentionItems(
    {
      membership: { endDate: membership?.endDate || row?.endDate },
      paymentStatus: row?.paymentStatus,
      revisions: cover.value?.revisions?.items,
    },
    today,
  );
  return (
    <>
      <h2>Overview</h2>
      {attention.length > 0 && (
        <div className="manage-attention" role="status">
          <strong>Needs your attention</strong>
          <ul>
            {attention.map(text => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
      )}
      <dl className="detail-list">
        {overviewFields(membership, row).map(f => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
      <div className="manage-locked">
        <LockKeyhole size={18} aria-hidden="true" /> These details change when you renew or make a change, so they
        cannot be edited here. To correct something, call the Guild on {GUILD_PHONE}.
      </div>
    </>
  );
}
export function MembershipManagement() {
  const { id, section: requested } = useParams(),
    [query] = useSearchParams();
  const cover = useLoad(() => portalApi.getMembershipCover(id), [id]);
  const extension = useLoad(() => portalApi.getMembershipExtensions(id), [id]);
  const invoices = useLoad(() => portalApi.getMembershipInvoices(id), [id]);
  const record = useLoad(() => portalApi.getRecord('membership', id), [id]);
  // Links from before the redesign used ?tab=; they land on the matching section.
  const legacy = !requested && sectionFromTab(query.get('tab'));
  if (legacy) return <Navigate to={'/membership/manage/' + id + '/' + legacy} replace />;
  const today = new Date().toISOString().slice(0, 10),
    membership = cover.value?.membership,
    row = record.value;
  const section = resolveSection(requested);
  const facts = {
    type: membership?.type || row?.type,
    status: membership?.status || row?.status,
    endDate: membership?.endDate || row?.endDate,
  };
  const actions = manageActions(facts, {
    today,
    canBuy: INTEGRATIONS.stripeCheckout,
    upgradeOn: INTEGRATIONS.membershipUpgrade,
  });
  const groups = [
    {
      label: 'Membership',
      items: [
        { key: 'overview', label: 'Overview', icon: ClipboardList },
        { key: 'extras', label: 'Branches and extras', icon: MapPin },
      ],
    },
    {
      label: 'Insurance',
      items: [
        { key: 'cover', label: 'Your cover', icon: ShieldCheck },
        { key: 'history', label: 'Changes and history', icon: History },
      ],
    },
    {
      label: 'Records',
      items: [
        ...(INTEGRATIONS.workdrive && INTEGRATIONS.crmRecords
          ? [{ key: 'documents', label: 'Documents', icon: FileText }]
          : []),
        { key: 'invoices', label: 'Invoices', icon: Receipt },
      ],
    },
    ...(actions.length
      ? [
          {
            label: 'Actions',
            items: actions.map(a =>
              a === 'renew'
                ? { key: 'renew', label: 'Renew membership', icon: RefreshCw, to: '/membership/buy?renew=' + id }
                : { key: 'upgrade', label: 'Upgrade to Full', icon: ArrowUpRight, to: upgradeLink(id) },
            ),
          },
        ]
      : []),
  ];
  return (
    <ManagementLayout
      back={{ to: '/records', label: 'Back to records' }}
      eyebrow="MEMBERSHIP"
      title={membership?.title || row?.title || 'Membership details'}
      description={headerLine(facts) || 'Manage your membership'}
      navLabel="Membership sections"
      groups={groups}
      active={section}
      hrefFor={key => '/membership/manage/' + id + '/' + key}
      notice={
        !INTEGRATIONS.schoolServices ? (
          <Notice title="Coming soon">Your membership services will appear here soon.</Notice>
        ) : null
      }
    >
      {section === 'overview' ? (
        <MembershipOverview cover={cover} record={record} today={today} />
      ) : section === 'extras' ? (
        <>
          <h2>Branches and extras</h2>
          {extension.loading ? (
            <p>Loading extras…</p>
          ) : extension.error ? (
            <Notice title="Unavailable">{extension.error}</Notice>
          ) : (
            <>
              {membership?.branches?.length > 0 && (
                <p>Branches on this membership: {membership.branches.join(', ')}.</p>
              )}
              <SimpleTable
                rows={extension.value || []}
                columns={[
                  col('type', 'Extra'),
                  col('branch', 'Branch'),
                  col('quantity', 'Quantity'),
                  col('finalPrice', 'Amount'),
                  col('status', 'Status'),
                ]}
              />
              {INTEGRATIONS.stripeCheckout && (
                <p>
                  {INTEGRATIONS.membershipChanges ? (
                    <Link className="btn btn-primary" to={'/pay/membership_change/' + id}>
                      Add a branch or buy add-ons
                    </Link>
                  ) : (
                    <Link className="btn btn-primary" to={'/pay/membership_addon/' + id}>
                      Buy add-ons
                    </Link>
                  )}
                </p>
              )}
            </>
          )}
        </>
      ) : section === 'cover' ? (
        <>
          <h2>Your cover</h2>
          <CoverSummary state={cover} id={id} />
        </>
      ) : section === 'history' ? (
        <>
          <h2>Changes and history</h2>
          <ChangeHistory state={cover} />
        </>
      ) : section === 'documents' ? (
        <DocumentsPanel kind="membership" id={id} />
      ) : (
        <>
          <h2>Invoices</h2>
          {invoices.loading ? (
            <p>Loading invoices…</p>
          ) : invoices.error ? (
            <Notice title="Unavailable">{invoices.error}</Notice>
          ) : (
            <InvoiceTable rows={invoices.value || []} />
          )}
        </>
      )}
    </ManagementLayout>
  );
}

export function AccountDocuments() {
  if (!INTEGRATIONS.workdrive)
    return (
      <div className="page">
        <PageHeading eyebrow="YOUR ACCOUNT" title="My documents" />
        <Notice title="Coming soon">You will be able to view and download your documents here soon.</Notice>
      </div>
    );
  // The server picks the member's own membership folder ("current"): the active membership that has a WorkDrive folder.
  return (
    <div className="page">
      <PageHeading
        eyebrow="YOUR ACCOUNT"
        title="My documents"
        description="Documents linked to your Guild membership."
      />
      <DocumentsPanel kind="membership" id="current" />
    </div>
  );
}
