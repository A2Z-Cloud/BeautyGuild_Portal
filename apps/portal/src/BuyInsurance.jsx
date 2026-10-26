import React, { useEffect, useState } from 'react';
import { LEGAL } from './legal.js';
import { PolicyDocuments } from './LegalLinks.jsx';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Notice, PageHeading } from './UiParts.jsx';
import { INTEGRATIONS, portalApi } from './services/api.js';
import { dueToday } from './priceSummary.js';
import { COUNTRY_OPTIONS } from './JourneyConfig.js';
import { countryFor } from './prefill.js';
import { START_WINDOW_DAYS, isFuture, startLimits } from './startDate.js';
import { formatDate } from './format.js';
import { validate } from './logic.mjs';
import { stopMessages, toRequest, visibleFields } from './insuranceInputs.js';
import { BlockedNotice, CoverSummary, InsuranceForm, ReferralPanel, useInsuranceQuote } from './InsuranceForm.jsx';
import { useStoredState } from './storedState.js';
import { referralFrom, sameAnswers } from './referral.js';
import SaveApplication, { useSaveApplication } from './SaveApplication.jsx';
import { buyDraft, noConfirmations, validStart } from './savedDraft.js';

const money = pence => '£' + (pence / 100).toFixed(2);

// Buy Beauty Guild insurance on its own. Premiums are rated by the server from these answers; cover that
// needs the Insurance team, or cannot be offered online, is explained here and cannot be paid for.
export default function BuyInsurance() {
  const [who, setWho] = useState({ state: 'loading', firstName: '', lastName: '' });
  // The answers are kept in this tab (and saved to the account on request). Confirmation boxes are never restored.
  const [kept, setKept] = useStoredState('insurance', { values: {}, country: '', start: '' }, x => ({
    ...x,
    values: noConfirmations(x.values),
    start: validStart(x.start),
  }));
  const { values, country, start } = kept,
    [accepted, setAccepted] = useState(false);
  // An application the Insurance team now holds is kept with the answers it was for, so a refresh still shows it.
  const [sent, setSent] = useStoredState('insurance_referral', { outcome: null });
  const answersKey = JSON.stringify([country, start, toRequest(values)]),
    referral = sameAnswers(sent.outcome, answersKey) ? sent.outcome : null;
  const field = name => next => setKept(o => ({ ...o, [name]: typeof next === 'function' ? next(o[name]) : next }));
  const setValues = field('values'),
    setCountry = field('country'),
    setStart = field('start');
  const [errors, setErrors] = useState({}),
    [countryError, setCountryError] = useState(''),
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
  const saver = useSaveApplication({
    signedIn: who.state === 'in',
    route: '/insurance/buy',
    canSave: Boolean(country) || Object.keys(values).length > 0,
    hint: 'Answer at least one question before saving.',
    build: () => ({
      ...buyDraft({ values, country, start }),
      names: { firstName: who.firstName, lastName: who.lastName },
    }),
  });
  const ins = toRequest(values),
    enabled =
      INTEGRATIONS.stripeCheckout && who.state === 'in' && Boolean(country) && (values.insWorking || []).length > 0;
  const q = useInsuranceQuote({
    enabled,
    request: () => ({ service: 'insurance', country, ...(start ? { start } : {}), insurance: toRequest(values) }),
    key: JSON.stringify([country, start, ins]),
  });
  const set = (name, value) => {
    setValues(v => ({ ...v, [name]: value }));
    setErrors(e => ({ ...e, [name]: undefined }));
  };
  const remove = patch => setValues(v => ({ ...v, ...patch }));
  async function pay() {
    if (busy) return;
    const found = validate(visibleFields(values), values);
    setErrors(found);
    setCountryError(country ? '' : 'Choose where you are based.');
    if (Object.keys(found).length || !country) {
      setPayError('Please answer the highlighted questions.');
      return;
    }
    const stops = stopMessages(values);
    if (stops.length) {
      setPayError(stops[0]);
      return;
    }
    setBusy(true);
    setPayError('');
    try {
      const r = await portalApi.startCheckout({
        service: 'insurance',
        country,
        ...(start ? { start } : {}),
        insurance: ins,
        accepted: 'yes',
        firstName: who.firstName,
        lastName: who.lastName,
      });
      if (!/^https:\/\/checkout\.stripe\.com\//.test(r.checkoutUrl))
        throw new Error('We could not open the payment page. Please try again.');
      window.location.assign(r.checkoutUrl);
    } catch (e) {
      const outcome = referralFrom(e);
      if (outcome) {
        setSent({ outcome: { ...outcome, key: answersKey } });
        setPayError('');
      } else setPayError(e.message);
      setBusy(false);
    }
  }
  const quote = q.quote,
    payable = quote && quote.payable;
  return (
    <div className="page buy-page">
      <Link to="/insurance" className="back-link">
        <ArrowLeft size={16} /> Back to insurance
      </Link>
      <PageHeading
        eyebrow="BEAUTY GUILD INSURANCE"
        title="Buy insurance"
        description="Answer a few questions, see your price, then pay securely on Stripe. We never see your card details."
      />
      {!INTEGRATIONS.stripeCheckout ? (
        <Notice title="Not available yet">Online insurance purchase is not available yet.</Notice>
      ) : who.state === 'loading' ? (
        <p role="status">Checking your account…</p>
      ) : who.state === 'out' ? (
        <Notice title="Insurance comes with Full membership">
          Insurance is included with Full membership. If you are not a member yet,{' '}
          <Link className="text-link" to="/membership/buy">
            join as a Full member and add insurance
          </Link>
          . If you already are one,{' '}
          <Link className="text-link" to="/login">
            sign in
          </Link>{' '}
          to buy it here.
        </Notice>
      ) : (
        <div className="buy-main">
          <section className="surface padded buy-section">
            <h2>About your business</h2>
            <InsuranceForm
              values={values}
              onChange={set}
              errors={errors}
              country={country}
              onCountry={v => {
                setCountry(v);
                setCountryError('');
              }}
              countryError={countryError}
            />
          </section>
          <section className="surface padded buy-section">
            <h2>When should your cover start?</h2>
            <div className="field">
              <label htmlFor="ins-start">Start date</label>
              <input
                id="ins-start"
                type="date"
                value={start || startLimits().min}
                min={startLimits().min}
                max={startLimits().max}
                onChange={e => setStart(e.target.value === startLimits().min ? '' : e.target.value)}
              />
              <small>
                Cover starts today unless you choose a later date, up to {START_WINDOW_DAYS} days ahead. You pay now,
                and it shows as Coming soon until it starts.
              </small>
            </div>
          </section>
          <section className="surface padded buy-section">
            <h2>Review and pay</h2>
            {!enabled ? (
              <p className="muted">Choose where you are based and how you work to see your price.</p>
            ) : q.error && !quote ? (
              <Notice title="Unable to price this">{q.error}</Notice>
            ) : !quote ? (
              <p className="muted" role="status">
                Working out your price…
              </p>
            ) : (
              <>
                <BlockedNotice quote={quote} />
                {quote.lines.length > 0 && (
                  <>
                    <CoverSummary quote={quote} values={values} onRemove={remove} />
                    {q.loading && (
                      <p className="muted" role="status">
                        Updating your price…
                      </p>
                    )}
                  </>
                )}
                {payable &&
                  (referral ? (
                    <ReferralPanel outcome={referral} />
                  ) : (
                    <>
                      <p className="muted">You pay {money(dueToday(quote))} today, including Insurance Premium Tax.</p>
                      {start && isFuture(start) && (
                        <p className="muted">Starts on {formatDate(start)}. It shows as Coming soon until then.</p>
                      )}
                      <PolicyDocuments values={values} />
                      <label className="check-choice">
                        <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />
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
                      <button
                        type="button"
                        className="btn btn-primary btn-block"
                        disabled={busy || !accepted || !(who.firstName || who.lastName)}
                        onClick={pay}
                      >
                        <LockKeyhole size={16} />
                        {busy ? 'Opening secure payment…' : 'Pay ' + money(dueToday(quote)) + ' securely with Stripe'}
                      </button>
                      {!(who.firstName || who.lastName) && (
                        <p className="muted">Add your name to your account before buying.</p>
                      )}
                    </>
                  ))}
              </>
            )}
          </section>
          <SaveApplication saver={saver} className="save-inline" />
        </div>
      )}
    </div>
  );
}
