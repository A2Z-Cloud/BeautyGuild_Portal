import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Notice } from './UiParts.jsx';
import { referralCopy } from './referral.js';
import { Blocks, InsField } from './InsuranceFields.jsx';
import { COUNTRY_OPTIONS } from './JourneyConfig.js';
import { coverAction, demandsAndNeeds, visibleSteps } from './insuranceInputs.js';
import { portalApi } from './services/api.js';

const money = pence => '£' + (pence / 100).toFixed(2);
// The insurance questions as sections of one page, for the buy pages. The answers are collected here;
// the server rates them, applies the STOP and REFER rules and decides whether they can be paid for online.
export function InsuranceForm({ values, onChange, errors, country, onCountry, countryError }) {
  return (
    <>
      <div className="field">
        <label htmlFor="ins-country">Where are you based? *</label>
        <select
          id="ins-country"
          value={country}
          onChange={e => onCountry(e.target.value)}
          aria-invalid={Boolean(countryError)}
        >
          <option value="">Choose a country</option>
          {COUNTRY_OPTIONS.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {countryError && (
          <small className="error" role="alert">
            {countryError}
          </small>
        )}
      </div>
      {visibleSteps(values).map(step => {
        const intro = typeof step.intro === 'function' ? step.intro(values) : step.intro,
          demands = step.demands && demandsAndNeeds(values);
        return (
          <fieldset key={step.id} id={'ins-step-' + step.id} className="buy-fieldset ins-step">
            <legend>{step.title}</legend>
            {step.description && <p className="muted">{step.description}</p>}
            {intro && (
              <div className="ins-intro">
                <Blocks blocks={intro} />
              </div>
            )}
            {demands && (
              <div className="ins-intro">
                <p>{demands.intro}</p>
                <ul>
                  {demands.items.map(x => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
            {step.fields.length > 0 && (
              <div className="fields-grid">
                {step.fields
                  .filter(f => !f.when || f.when(values))
                  .map(f => (
                    <InsField
                      key={f.name}
                      field={f}
                      value={values[f.name]}
                      onChange={onChange}
                      error={errors[f.name]}
                      values={values}
                    />
                  ))}
              </div>
            )}
          </fieldset>
        );
      })}
    </>
  );
}
// The server's price for the answers so far, refreshed shortly after they stop changing. `extra` is the rest of the request.
export function useInsuranceQuote({ enabled, request, key, send = portalApi.checkoutQuotePost }) {
  const [state, setState] = useState({ loading: false, quote: null, error: '' }),
    latest = useRef(0);
  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, quote: null, error: '' });
      return undefined;
    }
    const mine = ++latest.current;
    setState(s => ({ ...s, loading: true, error: '' }));
    const timer = setTimeout(() => {
      send(request())
        .then(quote => mine === latest.current && setState({ loading: false, quote, error: '' }))
        .catch(e => mine === latest.current && setState({ loading: false, quote: null, error: e.message }));
    }, 500);
    return () => clearTimeout(timer);
  }, [enabled, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
export function BlockedNotice({ quote }) {
  if (!quote || quote.payable !== false) return null;
  const refer = quote.blocked?.status === 'REFER',
    incomplete = quote.blocked?.status === 'INCOMPLETE';
  return (
    <Notice
      title={
        incomplete
          ? 'A few more answers needed'
          : refer
            ? 'Our Insurance team needs to review this'
            : 'We cannot offer this cover online'
      }
    >
      {(quote.blocked?.reasons || []).join(' ')}
      {!incomplete &&
        ' You cannot pay for this cover online. Please contact the Guild Insurance team and we will help you.'}
    </Notice>
  );
}
// Shown in place of Pay once the server has recorded a REFER or STOP application: what happened, the reference, and where to see it.
// `children` is extra wording for the page (for example, that nothing has been charged).
export function ReferralPanel({ outcome, children }) {
  const c = referralCopy(outcome);
  if (!c) return null;
  return (
    <section className={'referral-panel' + (c.stopped ? ' stopped' : '')} role="status" aria-live="polite">
      <h3>{c.title}</h3>
      {c.lines.map(l => (
        <p key={l}>{l}</p>
      ))}
      <p className="referral-reference">
        <span>Reference</span> <strong>{outcome.reference}</strong> <small>{c.referenceNote}</small>
      </p>
      <p>Nothing has been charged. Your answers are kept on this page.</p>
      {children}
      {!c.stopped && (
        <p>
          <Link className="btn btn-secondary" to="/records?type=insurance">
            View it in My records
          </Link>
        </p>
      )}
    </section>
  );
}
export const InsuranceLines = ({ quote }) => (
  <>
    {(quote.lines || []).map(l => (
      <div key={l.name}>
        <span>{l.name}</span>
        <strong>{money(l.totalPence)}</strong>
      </div>
    ))}
  </>
);
// The quote summary: each cover with its price and, where it can be changed, Edit (back to its section) and Remove (takes it off the quote).
export function CoverSummary({ quote, values, onRemove }) {
  const goTo = section => {
    const el = document.getElementById('ins-step-' + section);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const first = el.querySelector('input,select,button');
      if (first) first.focus({ preventScroll: true });
    }
  };
  return (
    <ul className="cover-summary">
      {(quote.lines || []).map(l => {
        const a = coverAction(l.name, values);
        return (
          <li key={l.name}>
            <span>{l.name.replace(/^Insurance - /, '')}</span>
            <strong>{money(l.totalPence)}</strong>
            {a && (
              <span className="cover-actions">
                <button type="button" className="text-button" onClick={() => goTo(a.section)}>
                  Edit
                </button>
                {a.remove && (
                  <button type="button" className="text-button" onClick={() => onRemove(a.remove())}>
                    Remove
                  </button>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
