import React, { useEffect, useState } from 'react';
import { LEGAL } from './legal.js';
import { PolicyDocuments } from './LegalLinks.jsx';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Notice, PageHeading, Stages } from './UiParts.jsx';
import { INTEGRATIONS, portalApi } from './services/api.js';
import PricePanel from './PricePanel.jsx';
import { useStoredState } from './storedState.js';
import { referralFrom, sameAnswers } from './referral.js';
import SaveApplication, { useSaveApplication } from './SaveApplication.jsx';
import { combinedDraft } from './savedDraft.js';
import { dueToday, offersCode } from './priceSummary.js';
import { COUNTRY_OPTIONS } from './JourneyConfig.js';
import { countryFor } from './prefill.js';
import { START_WINDOW_DAYS, startLimits } from './startDate.js';
import { validate } from './logic.mjs';
import { GUILD_PHONE, toRequest, visibleFields } from './insuranceInputs.js';
import { BlockedNotice, InsuranceForm, ReferralPanel, useInsuranceQuote } from './InsuranceForm.jsx';
import AddressLookup from './components/AddressLookup.jsx';
import { BRANCHES, branchName } from './branches.js';
import { EMPTY_DETAILS, DETAIL_LABELS, detailsRequest, missingDetails, tradingNameOf } from './membershipDetails.js';
import { DetailField } from './BuyMembership.jsx';
import {
  ADDITIONAL_BRANCHES_TEXT,
  BRANCH_TEXT,
  BUNDLE_INCLUDES_TEXT,
  EXTRAS_INTRO_TEXT,
  EXTRAS_ORDER_TEXT,
  EXTRAS_TEXT,
  INSURANCE_TEXT,
  SCHOOL_CODE_TEXT,
  UPGRADE_TEXT,
  startDateText,
} from './membershipText.js';
import {
  INTERESTS,
  STEP_TITLES,
  aboutYouErrors,
  answersRequest,
  defaultBranch,
  extrasErrors,
  inUkGroup,
  insuranceStepErrors,
  isInsuranceStep,
  outcomeText,
  planFor,
  stepIndex,
  suggestedBranches,
  toggleBranchChoice,
  ukOnce,
  workingList,
} from './membershipPlan.js';

const ADDONS = [
  ['bundle', 'Membership bundle'],
  ['certificate', 'Certificate'],
  ['badge', 'Badge'],
  ['sticker', 'Window sticker'],
];
const money = pence => '£' + (pence / 100).toFixed(2);
// England, Scotland, Wales and Northern Ireland are the United Kingdom, so the list shows it once.
const COUNTRIES = COUNTRY_OPTIONS.filter(c => ukOnce(c) === c);
const interestName = id => INTERESTS.find(i => i.id === id)?.name || id;
// What is being bought, with a way back to each part (UAT round 1). Prices are the server's, in the price panel.
function ReviewSummary({ f, d, plan, onEdit, onRemoveBranch, onRemoveAddon }) {
  const chosen = [f.branch, ...f.branches].filter(Boolean),
    addons = ADDONS.filter(([k]) => (f.addons[k] || 0) > 0),
    address = [d.address1, d.address2, d.town, d.county, d.postcode].filter(Boolean).join(', ');
  return (
    <div className="review-summary">
      <h3 className="buy-subtitle">What you are buying</h3>
      <section className="review-section">
        <div className="review-section-head">
          <h4>Membership branches</h4>
          <button type="button" className="text-button" onClick={() => onEdit('extras')}>
            Edit
          </button>
        </div>
        <ul className="review-items">
          {chosen.map((id, i) => (
            <li key={id}>
              <span>
                {branchName(id)} {i === 0 ? '(included)' : '(additional, £15)'}
              </span>
              {i > 0 && (
                <button type="button" className="text-button" onClick={() => onRemoveBranch(id)}>
                  Remove
                </button>
              )}
            </li>
          ))}
          {!chosen.length && <li className="muted">No branch chosen yet.</li>}
        </ul>
      </section>
      <section className="review-section">
        <div className="review-section-head">
          <h4>Membership extras</h4>
          <button type="button" className="text-button" onClick={() => onEdit('extras')}>
            Edit
          </button>
        </div>
        <ul className="review-items">
          {addons.map(([k, label]) => (
            <li key={k}>
              <span>
                {label} × {f.addons[k]}
              </span>
              <button type="button" className="text-button" onClick={() => onRemoveAddon(k)}>
                Remove
              </button>
            </li>
          ))}
          {!addons.length && <li className="muted">No extras.</li>}
        </ul>
      </section>
      {plan.insurance && (
        <section className="review-section">
          <div className="review-section-head">
            <h4>Insurance</h4>
            <button type="button" className="text-button" onClick={() => onEdit('how_you_work')}>
              Edit
            </button>
          </div>
          <p className="muted">Included with your membership. The price is shown on the right.</p>
        </section>
      )}
      <section className="review-section">
        <div className="review-section-head">
          <h4>About you</h4>
          <button type="button" className="text-button" onClick={() => onEdit('about_you')}>
            Edit
          </button>
        </div>
        <dl className="review-list">
          <div>
            <dt>Name</dt>
            <dd>{[d.firstName, d.lastName].filter(Boolean).join(' ') || '—'}</dd>
          </div>
          <div>
            <dt>Based in</dt>
            <dd>{f.country || '—'}</dd>
          </div>
          <div>
            <dt>Interests</dt>
            <dd>{f.interests.map(interestName).join(', ') || '—'}</dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>{address || '—'}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

// Join, renew or upgrade as one journey (docs/delivery/combined-membership-flow-spec.md, section 3). The customer never chooses a level: where they
// are based, whether they need insurance and how they work decide it on the server. This page sends those answers, shows the steps for them, and
// sends the member to Stripe. Every amount comes from the server. Behind VITE_PORTAL_COMBINED_FLOW.
export default function CombinedMembership() {
  const [query] = useSearchParams(),
    changeType = query.get('change') === 'upgrade' ? 'upgrade' : 'renewal';
  const [who, setWho] = useState({ state: 'loading', firstName: '', lastName: '' });
  const previousId = who.state === 'out' ? '' : query.get('renew') || '';
  const upgrading = Boolean(previousId) && changeType === 'upgrade' && INTEGRATIONS.membershipUpgrade;
  // The answers are kept in this tab so a visitor can leave to sign in or sign up and come back to them. Consent is never restored.
  const [f, setF] = useStoredState(
    'combined',
    {
      step: 'about_you',
      country: '',
      insuranceRequired: '',
      working: [],
      interests: ['beauty'],
      branch: '',
      branches: [],
      // Set once the member has chosen a branch themselves, so a change of interests no longer changes it.
      branchTouched: false,
      billing: 'annual',
      addons: {},
      accepted: false,
      start: '',
      code: '',
    },
    x => ({
      ...x,
      country: ukOnce(x.country),
      working: workingList(x.working),
      interests: Array.isArray(x.interests) ? x.interests : ['beauty'],
      branchTouched: Boolean(x.branchTouched || x.branch),
      accepted: false,
      start: x.start && x.start >= startLimits().min ? x.start : '',
    }),
  );
  const [kept, setKept] = useStoredState('combined_insurance', { iv: {} });
  // How you work lives in f.working; the insurance answers carry it as the one flag the server expects.
  const iv = { ...kept.iv, insWorking: workingList(f.working) };
  const setIv = next => setKept(o => ({ ...o, iv: typeof next === 'function' ? next(o.iv) : next }));
  const [d, setD] = useStoredState('membership_details', EMPTY_DETAILS),
    [showMissing, setShowMissing] = useState(false),
    [termsMissing, setTermsMissing] = useState(false);
  const missing = missingDetails(d),
    setDetail = patch => setD(o => ({ ...o, ...patch }));
  const [codeText, setCodeText] = useState(f.code || '');
  const [errors, setErrors] = useState({}),
    [iErrors, setIErrors] = useState({}),
    [busy, setBusy] = useState(false),
    [payError, setPayError] = useState('');
  const set = patch => setF(old => ({ ...old, ...patch }));

  // An upgrade is for someone who needs insurance, so that answer is already given.
  useEffect(() => {
    if (upgrading && f.insuranceRequired !== 'yes') set({ insuranceRequired: 'yes' });
  }, [upgrading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    portalApi
      .getIdentity()
      .then(
        u =>
          alive &&
          setWho(w => ({ state: 'in', firstName: u.firstName || w.firstName, lastName: u.lastName || w.lastName })),
      )
      .catch(() => alive && setWho({ state: 'out', firstName: '', lastName: '' }));
    return () => {
      alive = false;
    };
  }, []);
  // Use what the Guild holds: the country, and the name if the sign-in has none.
  useEffect(() => {
    if (!INTEGRATIONS.crmRecords) return undefined;
    let alive = true;
    portalApi
      .getMyDetails()
      .then(x => {
        if (!alive) return;
        setF(old => ({ ...old, country: old.country || ukOnce(countryFor(x, COUNTRY_OPTIONS)) }));
        setWho(w => (w.firstName || w.lastName ? w : { ...w, firstName: x.firstName, lastName: x.lastName }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Renewing asks the same questions, filled in from the current membership: insurance required from whether there is a policy, and a salon
  // policy for how you work. The member can change any of it (spec 3.4).
  useEffect(() => {
    if (!previousId || upgrading || who.state !== 'in' || !INTEGRATIONS.crmRecords) return undefined;
    let alive = true;
    portalApi
      .getMembershipCover(previousId)
      .then(cover => {
        if (!alive || !cover) return;
        setF(old => ({
          ...old,
          insuranceRequired: old.insuranceRequired || (cover.includesInsurance ? 'yes' : 'no'),
          working: workingList(old.working).length
            ? old.working
            : cover.insurance?.route === 'salon'
              ? ['insSalon']
              : [],
        }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [previousId, upgrading, who.state]); // eslint-disable-line react-hooks/exhaustive-deps
  // The name on the account fills the first and last name boxes until the member types their own.
  useEffect(() => {
    if (who.firstName || who.lastName)
      setD(o => ({ ...o, firstName: o.firstName || who.firstName || '', lastName: o.lastName || who.lastName || '' }));
  }, [who.firstName, who.lastName]); // eslint-disable-line react-hooks/exhaustive-deps

  // The first branch follows the interests, in the Guild's order, until the member chooses their own.
  useEffect(() => {
    if (f.branchTouched) return;
    const wanted = defaultBranch(f.interests);
    if (wanted && f.branch !== wanted) set({ branch: wanted, branches: f.branches.filter(b => b !== wanted) });
  }, [f.interests]); // eslint-disable-line react-hooks/exhaustive-deps

  const plan = planFor(f),
    steps = plan.steps,
    index = stepIndex(steps, f.step),
    key = steps[index];
  const guest = who.state === 'out' && INTEGRATIONS.publicQuotes;
  const loginTo = '/account/checkpoint?returnTo=' + encodeURIComponent('/membership/buy') + '&intent=complete';
  const international = plan.level === 'international';
  const request = () => ({
    service: 'membership',
    answers: answersRequest(f),
    branch: f.branch,
    billing: international ? 'annual' : f.billing,
    addons: f.addons,
    ...(f.branches.length ? { branches: f.branches.join(',') } : {}),
    // Cover starts on the chosen date, so only a membership with insurance asks for one. Otherwise the membership starts on payment.
    ...(f.start && plan.insurance ? { start: f.start } : {}),
    ...(previousId ? { previousId, changeType } : {}),
    ...(f.code && !previousId ? { code: f.code } : {}),
    ...(plan.insurance ? { country: f.country, insurance: toRequest(iv) } : {}),
  });
  const answersKey = JSON.stringify(request());
  const iq = useInsuranceQuote({
    enabled: INTEGRATIONS.stripeCheckout && (who.state === 'in' || guest) && plan.ready && Boolean(f.branch),
    send: guest ? portalApi.publicQuote : portalApi.checkoutQuotePost,
    request,
    key: answersKey,
  });
  const priced = iq.quote;
  // An insurance application the Insurance team now holds is kept with the answers it was for, so a refresh still shows it.
  const [sent, setSent] = useStoredState('combined_referral', { outcome: null });
  const referral = plan.insurance && sameAnswers(sent.outcome, answersKey) ? sent.outcome : null;
  const showCode = !previousId && (offersCode(priced) || Boolean(f.code));

  const saver = useSaveApplication({
    signedIn: who.state === 'in',
    route: '/membership/buy',
    canSave: Boolean(f.country),
    hint: 'Choose where you are based before saving.',
    build: () => ({
      ...combinedDraft({ f, d, iv }),
      names: {
        firstName: (d.firstName || who.firstName || '').trim(),
        lastName: (d.lastName || who.lastName || '').trim(),
      },
    }),
  });
  const go = target => {
    set({ step: target });
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  };
  const setI = (name, value) => {
    if (name === 'insWorking') set({ working: value || [] });
    else setIv(v => ({ ...v, [name]: value }));
    setIErrors(e => ({ ...e, [name]: undefined }));
  };
  const toggleBranch = id => {
    set({ ...toggleBranchChoice(f, id), branchTouched: true });
    setErrors(o => ({ ...o, branch: undefined }));
  };
  const toggleInterest = id => {
    set({ interests: f.interests.includes(id) ? f.interests.filter(i => i !== id) : [...f.interests, id] });
    setErrors(o => ({ ...o, interests: undefined }));
  };

  // The first step that still has something missing, for Next and for Pay.
  function problemsOn(target) {
    if (target === 'about_you') {
      const found = aboutYouErrors(f, { askInsurance: !upgrading });
      return { errors: found, details: Object.keys(missing).length > 0, bad: Object.keys(found).length > 0 };
    }
    if (target === 'extras') {
      const found = extrasErrors(f);
      return { errors: found, bad: Object.keys(found).length > 0 };
    }
    if (isInsuranceStep(target)) {
      const found = insuranceStepErrors(target, iv);
      return { iErrors: found, bad: Object.keys(found).length > 0 };
    }
    return { bad: false };
  }
  function next() {
    const p = problemsOn(key);
    if (key === 'about_you') {
      setErrors(p.errors);
      setShowMissing(true);
      if (p.bad || p.details) return;
    } else if (key === 'extras') {
      setErrors(p.errors);
      if (p.bad) return;
    } else if (p.bad) {
      setIErrors(p.iErrors);
      return;
    }
    go(steps[Math.min(index + 1, steps.length - 1)]);
  }
  async function pay() {
    if (busy) return;
    for (const target of steps.slice(0, -1)) {
      const p = problemsOn(target);
      if (p.bad || p.details) {
        if (target === 'about_you') {
          setErrors(p.errors);
          setShowMissing(true);
        } else if (target === 'extras') setErrors(p.errors);
        else setIErrors(p.iErrors);
        setPayError('Please complete the highlighted answers.');
        go(target);
        return;
      }
    }
    if (plan.insurance) {
      const found = validate(visibleFields(iv), iv);
      if (Object.keys(found).length) {
        setIErrors(found);
        setPayError('Please answer the highlighted insurance questions.');
        return;
      }
    }
    setBusy(true);
    setPayError('');
    try {
      const r = await portalApi.startCheckout({
        ...request(),
        accepted: 'yes',
        interests: f.interests,
        ...detailsRequest(d),
      });
      if (!/^https:\/\/checkout\.stripe\.com\//.test(r.checkoutUrl))
        throw new Error('We could not open the payment page. Please try again.');
      window.location.assign(r.checkoutUrl);
    } catch (e) {
      const outcome = plan.insurance ? referralFrom(e) : null;
      if (outcome) {
        setSent({ outcome: { ...outcome, key: answersKey } });
        setPayError('');
      } else setPayError(e.message);
      setBusy(false);
    }
  }
  // "Join as Associate instead": the Insurance team's record is marked first, so they stop chasing, then the journey carries on without insurance.
  const [joining, setJoining] = useState({ busy: false, error: '' });
  async function joinAsAssociate() {
    if (!referral || joining.busy) return;
    setJoining({ busy: true, error: '' });
    try {
      await portalApi.joinAsAssociate(referral.reference);
      setSent({ outcome: null });
      set({ insuranceRequired: 'no', working: [], accepted: false, step: 'extras' });
      setJoining({ busy: false, error: '' });
    } catch (e) {
      setJoining({ busy: false, error: e.message || 'We could not do that. Please try again or call the Guild.' });
    }
  }

  const heading = previousId
    ? changeType === 'upgrade'
      ? 'Upgrade your membership'
      : 'Renew your membership'
    : 'Join the Guild';
  const outcome = outcomeText(plan);
  const nav = (
    <div className="journey-nav">
      {index > 0 && (
        <button type="button" className="btn btn-secondary" onClick={() => go(steps[index - 1])}>
          Back
        </button>
      )}
      {key !== 'review' && (
        <button type="button" className="btn btn-primary" onClick={next}>
          Next
        </button>
      )}
    </div>
  );

  return (
    <div className="page buy-page membership-journey">
      <Link to="/membership" className="back-link">
        <ArrowLeft size={16} /> Back to membership
      </Link>
      <PageHeading
        eyebrow="GUILD MEMBERSHIP"
        title={heading}
        description="Answer a few questions and we will work out the right membership for you, then pay securely on Stripe. We never see your card details."
      />
      {!INTEGRATIONS.stripeCheckout ? (
        <Notice title="Not available yet">Online membership purchase is not available yet.</Notice>
      ) : who.state === 'loading' ? (
        <p role="status">Checking your account…</p>
      ) : who.state === 'out' && !INTEGRATIONS.publicQuotes ? (
        <Notice title="Please sign in">
          Sign in or create an account to buy a membership.{' '}
          <Link className="text-link" to="/login">
            Sign in
          </Link>
        </Notice>
      ) : (
        <>
          <Stages steps={steps.map(k => ({ title: STEP_TITLES[k] }))} current={index} />
          <div className="buy-layout">
            <div className="buy-main">
              {guest && key === 'about_you' && (
                <Notice title="No account needed to look">
                  Answer the questions and see the price as you go. You sign in or create an account when you are ready
                  to pay, and your answers are kept while you do.
                </Notice>
              )}
              {upgrading && key === 'about_you' && (
                <Notice title="Upgrade to Full membership with insurance">{UPGRADE_TEXT}</Notice>
              )}
              {key === 'about_you' && (
                <>
                  <section className="surface padded buy-section">
                    <h2>About you</h2>
                    <div className={'field' + (errors.country ? ' invalid' : '')}>
                      <label htmlFor="country">Where are you based? *</label>
                      <select
                        id="country"
                        value={f.country}
                        aria-invalid={Boolean(errors.country)}
                        onChange={e => {
                          set({ country: e.target.value });
                          setErrors(o => ({ ...o, country: undefined }));
                        }}
                      >
                        <option value="">Choose a country</option>
                        {COUNTRIES.map(c => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      {errors.country && (
                        <small className="error" role="alert">
                          {errors.country}
                        </small>
                      )}
                    </div>
                    <fieldset className={'buy-fieldset' + (errors.interests ? ' invalid' : '')}>
                      <legend>Your interests *</legend>
                      <p className="muted">
                        Choose as many as you like. We use them to suggest your membership branch.
                      </p>
                      <div className="interest-grid">
                        {INTERESTS.map(i => (
                          <label key={i.id} className="check-choice">
                            <input
                              type="checkbox"
                              checked={f.interests.includes(i.id)}
                              onChange={() => toggleInterest(i.id)}
                            />
                            {i.name}
                          </label>
                        ))}
                      </div>
                      {errors.interests && (
                        <small className="error" role="alert">
                          {errors.interests}
                        </small>
                      )}
                    </fieldset>
                    {f.country && !inUkGroup(f.country) && <Notice title="International membership">{outcome}</Notice>}
                    {inUkGroup(f.country) && !upgrading && (
                      <fieldset className="buy-fieldset">
                        <legend>Do you require insurance?</legend>
                        <p className="muted">{INSURANCE_TEXT}</p>
                        <div className="buy-options">
                          {[
                            ['yes', 'Yes, include insurance', 'Add insurance cover to your membership.'],
                            ['no', 'No, membership only', 'Continue with membership without insurance.'],
                          ].map(([value, name, hint]) => (
                            <label
                              key={value}
                              className={'radio-choice' + (f.insuranceRequired === value ? ' selected' : '')}
                            >
                              <input
                                type="radio"
                                name="insuranceRequired"
                                checked={f.insuranceRequired === value}
                                onChange={() => {
                                  set({ insuranceRequired: value });
                                  setErrors(o => ({ ...o, insuranceRequired: undefined }));
                                }}
                              />
                              <span>
                                <strong>{name}</strong>
                                <small>{hint}</small>
                              </span>
                            </label>
                          ))}
                        </div>
                        {errors.insuranceRequired && (
                          <small className="error" role="alert">
                            {errors.insuranceRequired}
                          </small>
                        )}
                      </fieldset>
                    )}
                    {inUkGroup(f.country) && !upgrading && f.insuranceRequired === 'yes' && (
                      <div className="field">
                        <label htmlFor="start">Start date</label>
                        <input
                          id="start"
                          type="date"
                          value={f.start || startLimits().min}
                          min={startLimits().min}
                          max={startLimits().max}
                          onChange={e => set({ start: e.target.value === startLimits().min ? '' : e.target.value })}
                        />
                        <small>{startDateText(START_WINDOW_DAYS, true)}</small>
                      </div>
                    )}
                    {inUkGroup(f.country) && outcome && plan.level === 'associate' && (
                      <p className="muted">{outcome}</p>
                    )}
                  </section>
                  <section className="surface padded buy-section" id="details-section">
                    <h2>Your Details</h2>
                    <div className="fields-grid">
                      {[
                        ['firstName', 'given-name'],
                        ['lastName', 'family-name'],
                      ].map(([k, ac]) => (
                        <DetailField
                          key={k}
                          name={k}
                          value={d[k]}
                          onChange={v => setDetail({ [k]: v })}
                          error={showMissing && missing[k]}
                          autoComplete={ac}
                        />
                      ))}
                      <DetailField
                        name="tradingName"
                        value={tradingNameOf(d)}
                        onChange={v => setDetail({ tradingName: v, tradingEdited: v !== '' })}
                        error={showMissing && missing.tradingName}
                        hint="Filled in from your name. Change it if you trade under another name."
                      />
                    </div>
                    <h3 className="buy-subtitle">Your address</h3>
                    {INTEGRATIONS.address && !d.manual && (
                      <div className="field">
                        <label htmlFor="lookup">Postcode or start typing your address</label>
                        <input
                          id="lookup"
                          value={d.lookup}
                          autoComplete="postal-code"
                          onChange={e => setDetail({ lookup: e.target.value })}
                        />
                        <AddressLookup
                          query={d.lookup}
                          onSelect={a =>
                            setDetail({
                              address1: a.addressLine1 || '',
                              address2: a.addressLine2 || '',
                              town: a.town || '',
                              county: a.county || '',
                              postcode: a.postcode || '',
                              manual: true,
                            })
                          }
                        />
                        {showMissing && missing.postcode && (
                          <span className="error" role="alert">
                            Find your address, or enter it manually.
                          </span>
                        )}
                      </div>
                    )}
                    {(!INTEGRATIONS.address || d.manual) && (
                      <div className="fields-grid">
                        <DetailField
                          name="postcode"
                          value={d.postcode}
                          onChange={v => setDetail({ postcode: v })}
                          error={showMissing && missing.postcode}
                          autoComplete="postal-code"
                        />
                        <DetailField
                          name="address1"
                          value={d.address1}
                          onChange={v => setDetail({ address1: v })}
                          error={showMissing && missing.address1}
                          autoComplete="address-line1"
                        />
                        <DetailField
                          name="address2"
                          label="Address line 2 (optional)"
                          value={d.address2}
                          onChange={v => setDetail({ address2: v })}
                          autoComplete="address-line2"
                        />
                        <DetailField
                          name="town"
                          value={d.town}
                          onChange={v => setDetail({ town: v })}
                          error={showMissing && missing.town}
                          autoComplete="address-level2"
                        />
                        <DetailField
                          name="county"
                          label="County (optional)"
                          value={d.county}
                          onChange={v => setDetail({ county: v })}
                          autoComplete="address-level1"
                        />
                      </div>
                    )}
                    {INTEGRATIONS.address && (
                      <button type="button" className="text-button" onClick={() => setDetail({ manual: !d.manual })}>
                        {d.manual ? 'Search for my address instead' : 'Enter your address manually'}
                      </button>
                    )}
                    {showMissing && Object.keys(missing).length > 0 && (
                      <p className="error" role="alert">
                        Still to complete:{' '}
                        {Object.keys(missing)
                          .map(k => DETAIL_LABELS[k].charAt(0).toUpperCase() + DETAIL_LABELS[k].slice(1).toLowerCase())
                          .join(', ')}
                        .
                      </p>
                    )}
                  </section>
                </>
              )}
              {isInsuranceStep(key) && (
                <section className="surface padded buy-section">
                  <h2>{STEP_TITLES[key]}</h2>
                  {key === 'how_you_work' && outcome && plan.level && <p className="muted">{outcome}</p>}
                  <InsuranceForm
                    values={iv}
                    onChange={setI}
                    errors={iErrors}
                    country={f.country}
                    stepKey={key}
                    showCountry={false}
                    hideTitle={key === 'how_you_work'}
                  />
                </section>
              )}
              {key === 'extras' && (
                <section className="surface padded buy-section">
                  <h2>Personalise Your Membership</h2>
                  <h3 className="buy-subtitle">Membership Branches</h3>
                  <p className="muted">
                    {BRANCH_TEXT} {ADDITIONAL_BRANCHES_TEXT}
                  </p>
                  <fieldset className={'buy-fieldset' + (errors.branch ? ' invalid' : '')}>
                    <legend className="sr-only">Membership Branches</legend>
                    <div className="branch-boxes">
                      {BRANCHES.map(b => {
                        const ticked = b.id === f.branch || f.branches.includes(b.id),
                          suggested = !ticked && suggestedBranches(f.interests, f).includes(b.id);
                        return (
                          <label key={b.id} className="check-choice">
                            <input type="checkbox" checked={ticked} onChange={() => toggleBranch(b.id)} />
                            {b.logo ? (
                              <img className="branch-logo branch-logo-small" src={b.logo} alt={b.name} height="30" />
                            ) : (
                              b.name
                            )}
                            {ticked && <small className="branch-note">{b.id === f.branch ? 'Included' : '£15'}</small>}
                            {suggested && <small className="branch-note">Suggested additional branch</small>}
                          </label>
                        );
                      })}
                    </div>
                    {errors.branch && (
                      <small className="error" role="alert">
                        {errors.branch}
                      </small>
                    )}
                  </fieldset>
                  <h3 className="buy-subtitle">Membership Extras</h3>
                  <p className="muted">{EXTRAS_INTRO_TEXT}</p>
                  <p className="muted">{EXTRAS_TEXT}</p>
                  <p className="muted">{EXTRAS_ORDER_TEXT}</p>
                  {ADDONS.map(([k, label]) => (
                    <React.Fragment key={k}>
                      <label className="addon-row">
                        <span>{label}</span>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          inputMode="numeric"
                          value={f.addons[k] || 0}
                          onChange={e =>
                            set({
                              addons: { ...f.addons, [k]: Math.max(0, Math.min(10, Number(e.target.value) || 0)) },
                            })
                          }
                        />
                      </label>
                      {k === 'bundle' && <p className="muted addon-note">{BUNDLE_INCLUDES_TEXT}</p>}
                    </React.Fragment>
                  ))}
                </section>
              )}
              {key === 'review' && (
                <section className="surface padded buy-section">
                  <h2>Review and pay</h2>
                  {outcome && <p>{outcome}</p>}
                  <ReviewSummary
                    f={f}
                    d={d}
                    plan={plan}
                    onEdit={go}
                    onRemoveBranch={id => set({ branches: f.branches.filter(b => b !== id), branchTouched: true })}
                    onRemoveAddon={k => set({ addons: { ...f.addons, [k]: 0 } })}
                  />
                  {showCode && (
                    <div className="code-box">
                      <h3 className="buy-subtitle">Have a code?</h3>
                      <div className="field">
                        <label htmlFor="school-code" className="sr-only">
                          School code
                        </label>
                        <input
                          id="school-code"
                          value={codeText}
                          maxLength={40}
                          autoComplete="off"
                          onChange={e => setCodeText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              set({ code: codeText.trim() });
                            }
                          }}
                        />
                        <small>{SCHOOL_CODE_TEXT}</small>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={!codeText.trim() || codeText.trim() === f.code}
                        onClick={() => set({ code: codeText.trim() })}
                      >
                        Apply code
                      </button>
                      {f.code && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            setCodeText('');
                            set({ code: '' });
                          }}
                        >
                          Remove code
                        </button>
                      )}
                      {f.code && priced?.discount && (
                        <p className="muted" role="status">
                          {priced.discount.label}.
                          {priced.discount.indicative ? ' We check your code when you sign in.' : ''}
                        </p>
                      )}
                      {f.code && priced?.codeResult && (
                        <p className="error" role="alert">
                          {priced.codeResult.message}
                        </p>
                      )}
                    </div>
                  )}
                  {!plan.ready || !f.branch ? (
                    <p className="muted">Answer the questions at the start to see your price.</p>
                  ) : !priced ? (
                    <p className="muted" role="status">
                      {iq.error ? iq.error : 'Working out your price…'}
                    </p>
                  ) : (
                    <>
                      {plan.insurance && <BlockedNotice quote={priced} />}
                      {!referral && <p className="muted">You pay {money(dueToday(priced))} today.</p>}
                      {plan.insurance && !referral && <PolicyDocuments values={iv} />}
                      {referral ? (
                        <ReferralPanel outcome={referral}>
                          <p>
                            Your membership has not been taken either. You can talk to the Guild, or join as an
                            Associate.
                          </p>
                          <p className="referral-actions">
                            <a className="btn btn-secondary" href={'tel:' + GUILD_PHONE.replace(/\s/g, '')}>
                              Contact the Guild
                            </a>{' '}
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={joining.busy}
                              onClick={joinAsAssociate}
                            >
                              {joining.busy ? 'Updating…' : 'Join as Associate instead'}
                            </button>
                          </p>
                          <p className="muted">
                            To contact the Guild, call {GUILD_PHONE}. Joining as an Associate means you join without
                            insurance, and the Insurance team stops working on this application.
                          </p>
                          {joining.error && <Notice title="We could not do that">{joining.error}</Notice>}
                        </ReferralPanel>
                      ) : (
                        <>
                          <label className={'check-choice' + (termsMissing && !f.accepted ? ' check-missing' : '')}>
                            <input
                              type="checkbox"
                              checked={f.accepted}
                              onChange={e => {
                                set({ accepted: e.target.checked });
                                setTermsMissing(false);
                              }}
                            />
                            <span>
                              I accept the{' '}
                              <a href={LEGAL.ethics.href} target="_blank" rel="noopener noreferrer">
                                Code of Ethics
                              </a>{' '}
                              and the Guild's{' '}
                              <a href={LEGAL.terms.href} target="_blank" rel="noopener noreferrer">
                                Terms of Business
                              </a>{' '}
                              and{' '}
                              <a href={LEGAL.privacy.href} target="_blank" rel="noopener noreferrer">
                                Privacy Policy
                              </a>
                              .
                            </span>
                          </label>
                          {termsMissing && !f.accepted && (
                            <small className="error" role="alert">
                              Please accept the Code of Ethics, Terms of Business and Privacy Policy to continue.
                            </small>
                          )}
                          {payError && <Notice title="Payment unavailable">{payError}</Notice>}
                          {guest ? (
                            <>
                              <p className="muted">
                                To pay you need an account. Your answers are kept while you sign in or sign up. Final
                                checks, including any insurance checks, are done when you pay.
                              </p>
                              <Link className="btn btn-primary btn-block" to={loginTo}>
                                <LockKeyhole size={16} /> Sign in or create an account to continue
                              </Link>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-primary btn-block"
                              disabled={busy || priced.payable === false}
                              onClick={() => (f.accepted ? pay() : setTermsMissing(true))}
                            >
                              <LockKeyhole size={16} />
                              {busy
                                ? 'Opening secure payment…'
                                : 'Pay ' + money(dueToday(priced)) + ' securely with Stripe'}
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
                </section>
              )}
              {nav}
              {!previousId && <SaveApplication saver={saver} className="save-main" />}
            </div>
            <div className="buy-side">
              {!previousId && <SaveApplication saver={saver} className="save-side" />}
              <PricePanel
                quote={priced}
                loading={iq.loading}
                error={iq.error}
                ready={plan.ready && Boolean(f.branch)}
                emptyText="Answer the questions to see your price."
                note={plan.insurance && !priced ? 'Insurance is not included yet. Answer how you work to add it.' : ''}
                billing={f.billing}
                onBilling={international ? undefined : b => set({ billing: b })}
                start={plan.insurance ? f.start : ''}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
