import React, { useEffect, useState } from 'react';
import { LEGAL } from './legal.js';
import { PolicyDocuments } from './LegalLinks.jsx';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Notice, PageHeading } from './UiParts.jsx';
import { INTEGRATIONS, portalApi } from './services/api.js';
import PricePanel from './PricePanel.jsx';
import { useStoredState } from './storedState.js';
import { referralFrom, sameAnswers } from './referral.js';
import SaveApplication, { useSaveApplication } from './SaveApplication.jsx';
import { joinDraft } from './savedDraft.js';
import { dueToday, offersCode } from './priceSummary.js';
import { COUNTRY_OPTIONS } from './JourneyConfig.js';
import { countryFor } from './prefill.js';
import { START_WINDOW_DAYS, isFuture, startLimits } from './startDate.js';
import { formatDate } from './format.js';
import { validate } from './logic.mjs';
import { toRequest, visibleFields } from './insuranceInputs.js';
import { BlockedNotice, InsuranceForm, ReferralPanel, useInsuranceQuote } from './InsuranceForm.jsx';
import AddressLookup from './components/AddressLookup.jsx';
import { BRANCHES } from './branches.js';
import { EMPTY_DETAILS, DETAIL_LABELS, detailsRequest, missingDetails, tradingNameOf } from './membershipDetails.js';

const LEVELS = [
  ['associate', 'Associate Member', 'Guild membership without insurance.'],
  ['full_non_salon', 'Full Member (Non-Salon)', 'Full membership for practitioners who do not own a salon.'],
  ['full_salon', 'Full Member (Salon)', 'Full membership for salon owners.'],
];
const ADDONS = [
  ['bundle', 'Membership bundle'],
  ['certificate', 'Certificate'],
  ['badge', 'Badge'],
  ['sticker', 'Window sticker'],
];
const INSURANCE_TEXT =
  'Our standard insurance policy covers you for treatment, public and product liability. This covers any injuries caused to your clients by the treatments you provide, accidental damage to property that doesn’t belong to you and any accidental injury to your customers, visitors, people you visit or members of the public. It would include things like slips and trips. You will be able to add on additional covers you may require, later on.';
const BRANCH_TEXT =
  'There are 4 branches of Guild membership. Select the branch which is best suited to your qualifications and the area you work in. Please note, the branch you choose does not affect your insurance where applicable and the membership element is not regulated by the Financial Conduct Authority.';
const EXTRAS_TEXT =
  'On completion of your application, your Membership Certificate will be available to download for free from your account, along with the relevant Guild logos which you can use on your website and social media.';
const money = pence => '£' + (pence / 100).toFixed(2);

// Buy or renew a membership. The server decides every amount from the Stripe prices; this page
// only sends choices, shows the server's summary, and sends the member to Stripe.
// A required details field. A missing one is outlined and named, with the reason announced to screen readers.
function DetailField({ name, label, value, onChange, error, hint, autoComplete }) {
  const id = 'd-' + name;
  return (
    <div className={'field' + (error ? ' invalid' : '')}>
      <label htmlFor={id}>{label || DETAIL_LABELS[name]}</label>
      <input
        id={id}
        value={value}
        autoComplete={autoComplete}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? id + '-e' : undefined}
        onChange={e => onChange(e.target.value)}
      />
      {hint && !error && <small>{hint}</small>}
      {error && (
        <span className="error" id={id + '-e'} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
export default function BuyMembership() {
  const [query] = useSearchParams(),
    changeType = query.get('change') === 'upgrade' ? 'upgrade' : 'renewal';
  const [who, setWho] = useState({ state: 'loading', firstName: '', lastName: '' });
  // Renewing or upgrading needs the member's own account; a guest is always buying new.
  const previousId = who.state === 'out' ? '' : query.get('renew') || '';
  // The answers are kept in this tab, so a visitor can leave to sign in or sign up and come back to them. Consent is never restored.
  const [f, setF] = useStoredState(
    'membership',
    {
      level: '',
      branch: '',
      branches: [],
      billing: 'annual',
      addons: {},
      accepted: false,
      insurance: false,
      start: '',
      code: '',
    },
    x => ({ ...x, accepted: false, start: x.start && x.start >= startLimits().min ? x.start : '' }),
  );
  const [kept, setKept] = useStoredState('membership_insurance', { iv: {}, country: '' });
  const iv = kept.iv,
    country = kept.country;
  const setIv = next => setKept(o => ({ ...o, iv: typeof next === 'function' ? next(o.iv) : next }));
  const setCountry = next => setKept(o => ({ ...o, country: typeof next === 'function' ? next(o.country) : next }));
  const [d, setD] = useStoredState('membership_details', EMPTY_DETAILS),
    [showMissing, setShowMissing] = useState(false);
  const missing = missingDetails(d),
    setDetail = patch => setD(o => ({ ...o, ...patch }));
  const [codeText, setCodeText] = useState(f.code || ''),
    [codeOpen, setCodeOpen] = useState(Boolean(f.code));
  const [iErrors, setIErrors] = useState({}),
    [countryError, setCountryError] = useState('');
  const saver = useSaveApplication({
    signedIn: who.state === 'in',
    route: '/membership/buy',
    canSave: Boolean(f.level),
    hint: 'Choose your membership level before saving.',
    build: () => ({
      ...joinDraft({ f, d, iv, country }),
      names: {
        firstName: (d.firstName || who.firstName || '').trim(),
        lastName: (d.lastName || who.lastName || '').trim(),
      },
    }),
  });
  const guest = who.state === 'out' && INTEGRATIONS.publicQuotes;
  const loginTo = '/account/checkpoint?returnTo=' + encodeURIComponent('/membership/buy') + '&intent=complete';
  const [q, setQ] = useState({ loading: false, quote: null, error: '' }),
    [busy, setBusy] = useState(false),
    [payError, setPayError] = useState('');
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
  // Use what the Guild holds: the country for the insurance questions, and the name if the sign-in has none.
  useEffect(() => {
    if (!INTEGRATIONS.crmRecords) return undefined;
    let alive = true;
    portalApi
      .getMyDetails()
      .then(d => {
        if (!alive) return;
        setCountry(c => c || countryFor(d, COUNTRY_OPTIONS));
        setWho(w => (w.firstName || w.lastName ? w : { ...w, firstName: d.firstName, lastName: d.lastName }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  // The name on the account fills the first and last name boxes until the member types their own.
  useEffect(() => {
    if (who.firstName || who.lastName)
      setD(o => ({ ...o, firstName: o.firstName || who.firstName || '', lastName: o.lastName || who.lastName || '' }));
  }, [who.firstName, who.lastName]); // eslint-disable-line react-hooks/exhaustive-deps
  const addonText = Object.entries(f.addons)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => k + ':' + n)
    .join(',');
  const ready = f.level && f.branch,
    branchKey = f.branches.join(',');
  const base = () => ({
    service: 'membership',
    level: f.level,
    branch: f.branch,
    billing: f.billing,
    ...(f.branches.length ? { branches: f.branches.join(',') } : {}),
    ...(f.start ? { start: f.start } : {}),
    ...(previousId ? { previousId, changeType } : {}),
    ...(f.code && !previousId ? { code: f.code } : {}),
  });
  useEffect(() => {
    if (!INTEGRATIONS.stripeCheckout || (who.state !== 'in' && !guest) || !ready) {
      setQ({ loading: false, quote: null, error: '' });
      return undefined;
    }
    let alive = true;
    setQ(s => ({ ...s, loading: true, error: '' }));
    (guest
      ? portalApi.publicQuote({ ...base(), addons: f.addons })
      : portalApi.checkoutQuote({ ...base(), ...(addonText ? { addons: addonText } : {}) })
    )
      .then(quote => alive && setQ({ loading: false, quote, error: '' }))
      .catch(e => alive && setQ({ loading: false, quote: null, error: e.message }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who.state, f.level, f.branch, f.billing, f.start, branchKey, addonText, previousId, f.insurance, f.code]);
  // With insurance the answers are too large for a query string, so the server prices them from a POST.
  const ins = toRequest(iv);
  // An insurance application the Insurance team now holds is kept with the answers it was for, so a refresh still shows it.
  const [sent, setSent] = useStoredState('membership_referral', { outcome: null });
  const answersKey = JSON.stringify([
      f.level,
      f.branch,
      f.billing,
      f.start,
      f.branches,
      f.addons,
      previousId,
      country,
      ins,
      f.code,
    ]),
    referral = f.insurance && sameAnswers(sent.outcome, answersKey) ? sent.outcome : null;
  const iq = useInsuranceQuote({
    enabled:
      INTEGRATIONS.stripeCheckout &&
      (who.state === 'in' || guest) &&
      ready &&
      f.insurance &&
      Boolean(country) &&
      (iv.insWorking || []).length > 0,
    send: guest ? portalApi.publicQuote : portalApi.checkoutQuotePost,
    request: () => ({ ...base(), addons: f.addons, country, insurance: toRequest(iv) }),
    key: JSON.stringify([
      f.level,
      f.branch,
      f.billing,
      f.start,
      f.branches,
      f.addons,
      previousId,
      country,
      ins,
      f.code,
    ]),
  });
  const setI = (name, value) => {
    setIv(v => ({ ...v, [name]: value }));
    setIErrors(e => ({ ...e, [name]: undefined }));
  };
  const set = patch =>
    setF(old => ({ ...old, ...patch, ...(patch.level === 'associate' ? { insurance: false } : {}) }));
  const toggleBranch = id =>
    set({ branches: f.branches.includes(id) ? f.branches.filter(b => b !== id) : [...f.branches, id] });
  async function pay() {
    if (busy) return;
    if (Object.keys(missing).length) {
      setShowMissing(true);
      setPayError('Please complete the highlighted details.');
      document.getElementById('details-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (f.insurance) {
      const found = validate(visibleFields(iv), iv);
      setIErrors(found);
      setCountryError(country ? '' : 'Choose where you are based.');
      if (Object.keys(found).length || !country) {
        setPayError('Please answer the highlighted insurance questions.');
        return;
      }
    }
    setBusy(true);
    setPayError('');
    try {
      const r = await portalApi.startCheckout({
        ...base(),
        addons: f.addons,
        accepted: 'yes',
        ...detailsRequest(d),
        ...(f.insurance ? { country, insurance: ins } : {}),
      });
      if (!/^https:\/\/checkout\.stripe\.com\//.test(r.checkoutUrl))
        throw new Error('We could not open the payment page. Please try again.');
      window.location.assign(r.checkoutUrl);
    } catch (e) {
      const outcome = f.insurance ? referralFrom(e) : null;
      if (outcome) {
        setSent({ outcome: { ...outcome, key: answersKey } });
        setPayError('');
      } else setPayError(e.message);
      setBusy(false);
    }
  }
  // With insurance ticked the payable price is the one that includes it; until that is ready the panel shows the membership alone.
  const priced = f.insurance ? iq.quote : q.quote,
    quote = priced || q.quote,
    shown = quote,
    // The code box is for the Join page only (not a renewal) and only while a joining fee applies, or a code is already in.
    showCode = !previousId && (offersCode(quote) || Boolean(f.code)),
    insuranceWaiting = f.insurance && !iq.quote;
  return (
    <div className="page buy-page membership-journey">
      <Link to="/membership" className="back-link">
        <ArrowLeft size={16} /> Back to membership
      </Link>
      <PageHeading
        eyebrow="GUILD MEMBERSHIP"
        title={
          previousId
            ? changeType === 'upgrade'
              ? 'Upgrade your membership'
              : 'Renew your membership'
            : 'Join the Guild'
        }
        description="Choose your membership, then pay securely on Stripe. We never see your card details."
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
        <div className="buy-layout">
          <div className="buy-main">
            {guest && (
              <Notice title="No account needed to look">
                Choose your membership and see the price as you go. You sign in or create an account when you are ready
                to pay, and your answers are kept while you do.
              </Notice>
            )}
            <section className="surface padded buy-section">
              <h2>About Your Work</h2>
              <fieldset className="buy-fieldset">
                <legend>Your membership</legend>
                <div className="buy-options">
                  {LEVELS.map(([id, name, hint]) => (
                    <label key={id} className={'radio-choice' + (f.level === id ? ' selected' : '')}>
                      <input type="radio" name="level" checked={f.level === id} onChange={() => set({ level: id })} />
                      <span>
                        <strong>{name}</strong>
                        <small>{hint}</small>
                      </span>
                    </label>
                  ))}
                  <p className="muted">
                    International membership is priced individually. Please contact the Guild to join from outside the
                    UK.
                  </p>
                </div>
              </fieldset>
              <fieldset className="buy-fieldset">
                <legend>Primary branch</legend>
                <p className="muted">{BRANCH_TEXT}</p>
                <div className="branch-grid">
                  {BRANCHES.map(b => (
                    <label key={b.id} className={'radio-choice branch-card' + (f.branch === b.id ? ' selected' : '')}>
                      <input
                        type="radio"
                        name="branch"
                        checked={f.branch === b.id}
                        onChange={() => set({ branch: b.id, branches: f.branches.filter(x => x !== b.id) })}
                      />
                      {b.logo ? (
                        <img className="branch-logo" src={b.logo} alt={b.name} height="44" />
                      ) : (
                        <span>
                          <strong>{b.name}</strong>
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="buy-fieldset">
                <legend>Do you require insurance?</legend>
                <p className="muted">{INSURANCE_TEXT}</p>
                <div className="buy-options">
                  {[
                    [true, 'Yes, include insurance', 'Add insurance cover to your membership.'],
                    [false, 'No, membership only', 'Continue with membership without insurance.'],
                  ].map(([yes, name, hint]) => (
                    <label key={name} className={'radio-choice' + (f.insurance === yes ? ' selected' : '')}>
                      <input
                        type="radio"
                        name="insurance"
                        checked={f.insurance === yes}
                        disabled={yes && f.level === 'associate'}
                        onChange={() => set({ insurance: yes })}
                      />
                      <span>
                        <strong>{name}</strong>
                        <small>{hint}</small>
                      </span>
                    </label>
                  ))}
                </div>
                {f.level === 'associate' && (
                  <p className="muted">
                    Insurance is included with Full membership. Choose a Full membership level to add it.
                  </p>
                )}
              </fieldset>
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
                <small>
                  Starts today unless you choose a later date, up to {START_WINDOW_DAYS} days ahead.
                  {f.insurance ? ' Your insurance starts on the same date.' : ''} You pay now, and it shows as Coming
                  soon until it starts.
                </small>
              </div>
              <fieldset className="buy-fieldset">
                <legend>Pay</legend>
                {[
                  ['annual', 'Annually'],
                  ['monthly', 'Monthly'],
                ].map(([id, name]) => (
                  <label key={id} className="check-choice">
                    <input
                      type="radio"
                      name="billing"
                      checked={f.billing === id}
                      onChange={() => set({ billing: id })}
                    />
                    {name}
                  </label>
                ))}
              </fieldset>
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
                    .map(k => DETAIL_LABELS[k].toLowerCase())
                    .join(', ')}
                  .
                </p>
              )}
            </section>
            <section className="surface padded buy-section">
              <h2>Personalise Your Membership</h2>
              <h3 className="buy-subtitle">Additional Branches</h3>
              <p className="muted">
                If you would like to add any additional branches, these are chargeable at £15 per branch
              </p>
              <fieldset className="buy-fieldset">
                <legend className="sr-only">Additional Branches</legend>
                {BRANCHES.filter(b => b.id !== f.branch).map(b => (
                  <label key={b.id} className="check-choice">
                    <input type="checkbox" checked={f.branches.includes(b.id)} onChange={() => toggleBranch(b.id)} />
                    {b.logo ? (
                      <img className="branch-logo branch-logo-small" src={b.logo} alt={b.name} height="30" />
                    ) : (
                      b.name
                    )}
                  </label>
                ))}
              </fieldset>
              <h3 className="buy-subtitle">Membership Extras</h3>
              <p className="muted">
                Showcase your professional credentials, strengthen client confidence and proudly display your Guild
                membership with our range of membership extras.
              </p>
              <p className="muted">{EXTRAS_TEXT}</p>
              <p className="muted">
                You can order any of the following marketing and branding items from the options below:
              </p>
              {ADDONS.map(([key, label]) => (
                <label key={key} className="addon-row">
                  <span>{label}</span>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    inputMode="numeric"
                    value={f.addons[key] || 0}
                    onChange={e =>
                      set({ addons: { ...f.addons, [key]: Math.max(0, Math.min(10, Number(e.target.value) || 0)) } })
                    }
                  />
                </label>
              ))}
            </section>
            {f.insurance && (
              <section className="surface padded buy-section">
                <h2>Insurance</h2>
                <InsuranceForm
                  values={iv}
                  onChange={setI}
                  errors={iErrors}
                  country={country}
                  onCountry={v => {
                    setCountry(v);
                    setCountryError('');
                  }}
                  countryError={countryError}
                />
              </section>
            )}
            <section className="surface padded buy-section">
              <h2>Review and pay</h2>
              {showCode && (
                <div className="code-box">
                  {!codeOpen ? (
                    <button type="button" className="text-button" onClick={() => setCodeOpen(true)}>
                      Have a code?
                    </button>
                  ) : (
                    <>
                      <div className="field">
                        <label htmlFor="school-code">School code</label>
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
                        <small>If your school gave you a code, enter it to have your joining fee waived.</small>
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
                      {f.code && quote?.discount && (
                        <p className="muted" role="status">
                          {quote.discount.label}.
                          {quote.discount.indicative ? ' We check your code when you sign in.' : ''}
                        </p>
                      )}
                      {f.code && quote?.codeResult && (
                        <p className="error" role="alert">
                          {quote.codeResult.message}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
              {!ready ? (
                <p className="muted">Choose a membership level and branch to see your price.</p>
              ) : insuranceWaiting ? (
                <p className="muted">
                  Answer the insurance questions, including where you are based, so your price includes them.
                </p>
              ) : !priced ? (
                <p className="muted" role="status">
                  {q.error ? q.error : 'Working out your price…'}
                </p>
              ) : (
                <>
                  {f.insurance && <BlockedNotice quote={priced} />}
                  {!referral && <p className="muted">You pay {money(dueToday(priced))} today.</p>}
                  {f.insurance && !referral && <PolicyDocuments values={iv} />}
                  {referral ? (
                    <ReferralPanel outcome={referral}>
                      <p>
                        Your membership has not been taken either. To join now, choose "No, membership only" above, or
                        change your insurance answers.
                      </p>
                    </ReferralPanel>
                  ) : (
                    <>
                      <label className="check-choice">
                        <input
                          type="checkbox"
                          checked={f.accepted}
                          onChange={e => set({ accepted: e.target.checked })}
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
                          disabled={busy || !f.accepted || priced.payable === false}
                          onClick={pay}
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
            {!previousId && <SaveApplication saver={saver} className="save-main" />}
          </div>
          <div className="buy-side">
            {!previousId && <SaveApplication saver={saver} className="save-side" />}
            <PricePanel
              quote={shown}
              loading={q.loading || (f.insurance && iq.loading)}
              error={f.insurance && iq.error ? iq.error : q.error}
              ready={Boolean(ready)}
              emptyText="Choose a membership level and branch to see your price."
              note={insuranceWaiting ? 'Insurance is not included yet. Answer the insurance questions to add it.' : ''}
              billing={f.billing}
              onBilling={b => set({ billing: b })}
              start={f.start}
            />
          </div>
        </div>
      )}
    </div>
  );
}
