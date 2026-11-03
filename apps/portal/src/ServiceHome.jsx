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
import { upgradableRecord, upgradeLink } from './membershipUpgrade.js';
import { COMBINED_DESCRIPTION, COMBINED_TITLE } from './combinedFlow.js';
// The Guild's own words for the accreditation introduction (UAT round 1, S10 step 1).
export const ACCREDITATION_INTRO = {
  eyebrow: 'GUILD ACCREDITATION',
  heading: "Let's get your training centre accredited",
  lead: 'Apply online for Guild Accreditation for your training centre and courses.',
  text: "Tell us about your training centre, the courses you want to offer and the tutors who will teach them. We'll guide you through each stage.",
  stepsHeading: "What you'll need to do",
  steps: [
    ['Your training centre', 'Enter your business details and contact information.'],
    ['Courses and tutors', 'Choose your courses and provide details of your tutors and their qualifications.'],
    ['Review your application', 'Check your information before continuing.'],
  ],
};
const paths = {
  membership: ['Membership option', 'Applicant details', 'Review information'],
  accreditation: ACCREDITATION_INTRO.steps.map(([label]) => label),
  insurance: ['Business information', 'Cover options', 'Declarations', 'Review information'],
};
// The combined Membership and Insurance journey, as the member sees it.
const COMBINED_PATH = ['About you', 'Membership details', 'Extras', 'Review and pay'];
// Shown to someone with no membership (MEM-031, MEM-032).
export const NO_MEMBERSHIP_TEXT =
  "You don't currently have a Guild membership. Choose Associate Membership, or Full Membership with insurance, and start enjoying exclusive member perks, discounts and support.";
// The combined page says what the member can do without choosing a level: the answers decide it.
export const NO_MEMBERSHIP_TEXT_COMBINED = COMBINED_DESCRIPTION;

export default function ServiceHome({ kind }) {
  const service = DEMO_SERVICES.find(s => s.kind === kind),
    applyOnline = kind === 'accreditation' && INTEGRATIONS.crmAccreditation,
    // Membership and insurance open online once checkout is live; accreditation once its CRM drafts are.
    openOnline = applyOnline || (kind !== 'accreditation' && INTEGRATIONS.stripeCheckout);
  const records = useServiceRecords(kind),
    has = Boolean(records?.length);
  // An Associate member cannot buy insurance on its own: their route to cover is to upgrade to Full with insurance (the same quote journey).
  const combined = kind === 'membership' && INTEGRATIONS.combinedFlow;
  const memberships = useServiceRecords(
    (kind === 'insurance' || combined) && INTEGRATIONS.membershipUpgrade ? 'membership' : '',
  );
  // With the combined flow the member's policies sit on the same page as their membership.
  const policies = useServiceRecords(combined ? 'insurance' : '');
  const upgradable = upgradableRecord(memberships, new Date().toISOString().slice(0, 10));
  const ownMembership = memberships?.find(r => !isExpired(r));
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
        title={combined ? COMBINED_TITLE : service.title}
        description={
          combined && !has
            ? NO_MEMBERSHIP_TEXT_COMBINED
            : kind === 'accreditation' && (has || accHolds)
              ? MANAGE_TEXT
              : has
                ? ''
                : kind === 'membership'
                  ? NO_MEMBERSHIP_TEXT
                  : service.description
        }
      >
        {kind === 'membership' && INTEGRATIONS.stripeCheckout ? (
          <>
            {membershipButton}
            {combined && upgradable && (
              <Link className="btn btn-secondary" to={upgradeLink(upgradable.id)}>
                Upgrade to Membership with Insurance <ArrowRight size={16} />
              </Link>
            )}
          </>
        ) : kind === 'insurance' && INTEGRATIONS.stripeCheckout && upgradable ? (
          <Link className="btn btn-primary" to={upgradeLink(upgradable.id)}>
            Get an insurance quote <ArrowRight size={16} />
          </Link>
        ) : kind === 'insurance' && INTEGRATIONS.stripeCheckout && has ? (
          // One policy at a time: a member with a policy changes it from their membership instead of buying another.
          <Link
            className="btn btn-primary"
            to={ownMembership ? '/membership/manage/' + encodeURIComponent(ownMembership.id) + '/cover' : '/records'}
          >
            Change your cover <ArrowRight size={16} />
          </Link>
        ) : kind === 'insurance' && INTEGRATIONS.stripeCheckout ? (
          <Link className="btn btn-primary" to="/insurance/buy">
            Buy insurance <ArrowRight size={16} />
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
      {combined && <MyServiceRecords kind="insurance" rows={policies} />}
      {!has && (
        <div className={'service-banner ' + service.theme}>
          <div>
            <small className="eyebrow">
              {kind === 'accreditation' ? ACCREDITATION_INTRO.eyebrow : 'A SIMPLER JOURNEY'}
            </small>
            <h2>
              {kind === 'insurance'
                ? 'Cover that works around you.'
                : kind === 'accreditation'
                  ? ACCREDITATION_INTRO.heading
                  : 'Join the Guild Today'}
            </h2>
            {kind === 'accreditation' && <p>{ACCREDITATION_INTRO.lead}</p>}
            <p>
              {kind === 'accreditation'
                ? ACCREDITATION_INTRO.text
                : openOnline
                  ? 'Answer a few questions in our online application. You can save it and finish later.'
                  : 'Look through the questions in our new online application.'}
            </p>
          </div>
          <IconFor kind={kind} size={70} />
        </div>
      )}
      {!has && (
        <div className="two-cols">
          <section className="surface padded">
            <small className="eyebrow">THE JOURNEY</small>
            <h2>{kind === 'accreditation' ? ACCREDITATION_INTRO.stepsHeading : "Here's what to expect"}</h2>
            <ol className="process">
              {(combined ? COMBINED_PATH : paths[kind]).map((label, i) => (
                <li key={label}>
                  <b>{String(i + 1).padStart(2, '0')}</b>
                  <span>
                    <strong>{label}</strong>
                    <small>
                      {kind === 'accreditation'
                        ? ACCREDITATION_INTRO.steps[i][1]
                        : i === (combined ? COMBINED_PATH : paths[kind]).length - 1
                          ? 'Check your answers before you finish'
                          : 'Questions to answer'}
                    </small>
                  </span>
                </li>
              ))}
            </ol>
            <Link
              className="btn btn-primary"
              to={kind === 'membership' && combined ? '/membership/buy' : '/' + kind + '/new'}
            >
              {kind === 'membership' && combined
                ? 'Join the Guild'
                : openOnline
                  ? 'Start your application'
                  : 'View the ' + kind + ' form'}{' '}
              <ArrowRight size={16} />
            </Link>
          </section>
          <section className="surface padded">
            <small className="eyebrow">BEFORE YOU START</small>
            {openOnline ? (
              <>
                <h2>Apply online</h2>
                <Notice title="Save and finish later">
                  You can save your application and finish it later from Saved applications. Nothing is charged until
                  you choose to pay.
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
