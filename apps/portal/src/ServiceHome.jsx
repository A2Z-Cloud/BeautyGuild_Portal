import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DEMO_SERVICES } from './data/demo.js';
import { IconFor, Notice, PageHeading } from './UiParts.jsx';
import { INTEGRATIONS } from './services/api.js';
import { CourseCatalogue } from './components/CourseCatalogue.jsx';
import { MyServiceRecords, useServiceRecords, isExpired } from './MyServiceRecords.jsx';
import { AccreditationStatusBanner, useAccreditationState } from './AccreditationStatus.jsx';
import { MANAGE_TEXT } from './accreditationState.js';
const paths = {
  membership: ['Membership option', 'Applicant details', 'Review information'],
  accreditation: ['Your training centre', 'Courses and tutors', 'Review information'],
  insurance: ['Business information', 'Cover options', 'Declarations', 'Review information'],
};
// Shown to someone with no membership (MEM-031, MEM-032).
export const NO_MEMBERSHIP_TEXT =
  "You don't currently have a Guild membership. Choose Associate Membership, or Full Membership with insurance, and start enjoying exclusive member perks, discounts and support.";
export default function ServiceHome({ kind }) {
  const service = DEMO_SERVICES.find(s => s.kind === kind),
    applyOnline = kind === 'accreditation' && INTEGRATIONS.crmAccreditation;
  const records = useServiceRecords(kind),
    has = Boolean(records?.length);
  const accState = useAccreditationState(); // eslint-disable-line react-hooks/rules-of-hooks
  const accHolds = kind === 'accreditation' && accState && accState.key !== 'none';
  const current = records?.find(r => !isExpired(r));
  // A member's own records come first. Someone holding a membership manages or renews it instead of joining again.
  const membershipButton =
    has && kind === 'membership' ? (
      <Link className="btn btn-primary" to={'/membership/manage/' + encodeURIComponent((current || records[0]).id)}>
        {current ? 'Manage membership' : 'Renew membership'} <ArrowRight size={16} />
      </Link>
    ) : (
      <Link className="btn btn-primary" to="/membership/buy">
        Join the Guild <ArrowRight size={16} />
      </Link>
    );
  return (
    <div className="page">
      <PageHeading
        eyebrow="GUILD SERVICES"
        title={service.title}
        description={
          kind === 'accreditation' && (has || accHolds)
            ? MANAGE_TEXT
            : has
              ? ''
              : kind === 'membership'
                ? NO_MEMBERSHIP_TEXT
                : service.description
        }
      >
        {kind === 'membership' && INTEGRATIONS.stripeCheckout ? (
          membershipButton
        ) : kind === 'insurance' && INTEGRATIONS.stripeCheckout ? (
          <Link className="btn btn-primary" to="/insurance/buy">
            {has ? 'Buy another policy' : 'Buy insurance'} <ArrowRight size={16} />
          </Link>
        ) : (
          <Link className="btn btn-primary" to={'/' + kind + '/new'}>
            {applyOnline ? (has ? 'Apply for a new accreditation' : 'Apply for accreditation') : 'View the form'}{' '}
            <ArrowRight size={16} />
          </Link>
        )}
      </PageHeading>
      {kind === 'accreditation' && <AccreditationStatusBanner state={accState} />}
      <MyServiceRecords kind={kind} rows={records} />
      {!has && (
        <div className={'service-banner ' + service.theme}>
          <div>
            <small className="eyebrow">A SIMPLER JOURNEY</small>
            <h2>
              {kind === 'insurance'
                ? 'Cover that works around you.'
                : kind === 'accreditation'
                  ? 'Support for your training centre.'
                  : 'Join the Guild Today'}
            </h2>
            <p>Look through the questions in our new online application.</p>
          </div>
          <IconFor kind={kind} size={70} />
        </div>
      )}
      {!has && (
        <div className="two-cols">
          <section className="surface padded">
            <small className="eyebrow">THE JOURNEY</small>
            <h2>Here's what to expect</h2>
            <ol className="process">
              {paths[kind].map((label, i) => (
                <li key={label}>
                  <b>{String(i + 1).padStart(2, '0')}</b>
                  <span>
                    <strong>{label}</strong>
                    <small>
                      {i === paths[kind].length - 1 ? 'Check your answers before you finish' : 'Questions to answer'}
                    </small>
                  </span>
                </li>
              ))}
            </ol>
            <Link className="btn btn-primary" to={'/' + kind + '/new'}>
              View the {kind} form <ArrowRight size={16} />
            </Link>
          </section>
          <section className="surface padded">
            <small className="eyebrow">BEFORE YOU START</small>
            {applyOnline ? (
              <>
                <h2>Apply online</h2>
                <Notice title="Save and finish later">
                  Sign in to start. You can save your application and finish it later from Saved applications. Nothing
                  is charged until you choose to pay.
                </Notice>
              </>
            ) : (
              <>
                <h2>Applications are opening soon</h2>
                <Notice title="Nothing is submitted yet">
                  You can look through the questions now, but your answers are not submitted or saved, and nothing is
                  charged. Online applications will open soon.
                </Notice>
              </>
            )}
            <div className="quick-links">
              <Link to="/records">
                View my records <ArrowRight size={16} />
              </Link>
              <Link to="/">
                Back to dashboard <ArrowRight size={16} />
              </Link>
            </div>
          </section>
        </div>
      )}
      {kind === 'accreditation' && (
        <>
          <p>
            <Link to="/schools" className="btn btn-secondary">
              Manage my schools <ArrowRight size={15} />
            </Link>
          </p>
          <CourseCatalogue />
        </>
      )}
    </div>
  );
}
