import React, { useEffect, useState } from 'react';
import { Mail, UserRound } from 'lucide-react';
import { portalApi } from './services/api.js';
import { COUNTRY_OPTIONS } from './JourneyConfig.js';
import { LEGAL } from './legal.js';

// Contact preferences and contact details on the live Account page (UAT REV-1 and REV-10). Both read and write the signed-in member's own
// Contact on the server. Nothing is ticked for a member who has not chosen: consent is an active choice.
const METHODS = [
  ['email', 'E-Mail'],
  ['sms', 'SMS'],
  ['post', 'By Post'],
];
const NEWSLETTERS = [
  [
    'guildGazette',
    'Guild Gazette',
    'Get email notifications when the latest edition of Guild Gazette and our online Guild G@zette is published.',
  ],
  [
    'newsAndOffers',
    'News and Special Offers',
    'Be the first to hear about industry news, information and special offers from carefully selected partners straight to your inbox.',
  ],
];
const BLANK_PREFS = { email: false, sms: false, post: false, guildGazette: false, newsAndOffers: false };
const messageOf = err => (err && err.message ? err.message : 'Something went wrong. Please try again.');

export function ContactPreferences() {
  const [prefs, setPrefs] = useState(null);
  const [state, setState] = useState({ busy: false, ok: false, message: '' });
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    let live = true;
    portalApi
      .getContactPreferences()
      .then(p => live && setPrefs({ ...BLANK_PREFS, ...p }))
      .catch(err => live && setLoadError(messageOf(err)));
    return () => {
      live = false;
    };
  }, []);
  const set = (key, value) => setPrefs(old => ({ ...old, [key]: value }));
  const save = async e => {
    e.preventDefault();
    if (state.busy) return;
    setState({ busy: true, ok: false, message: '' });
    try {
      await portalApi.saveContactPreferences(
        Object.fromEntries(Object.keys(BLANK_PREFS).map(k => [k, prefs[k] === true])),
      );
      setState({ busy: false, ok: true, message: 'Your contact preferences are saved.' });
    } catch (err) {
      setState({ busy: false, ok: false, message: messageOf(err) });
    }
  };
  return (
    <section className="account-profile" aria-labelledby="prefs-heading">
      <h3 id="prefs-heading">
        <Mail size={17} /> Your contact preferences
      </h3>
      {loadError && (
        <div className="auth-unavailable" role="alert">
          {loadError}
        </div>
      )}
      {!prefs && !loadError && <p role="status">Loading your preferences…</p>}
      {prefs && (
        <form onSubmit={save}>
          <p>
            We take your privacy seriously and you can view our{' '}
            <a href={LEGAL.privacy.href} target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
            . We may have legitimate reasons to contact you in relation to certain membership and insurance services
            where applicable which we have been contracted to provide you. If you would like to receive news and
            marketing information, you need to give us your permission to contact you by one of the following methods.
          </p>
          <fieldset className="pref-group">
            <legend>How we contact you</legend>
            {METHODS.map(([key, label]) => (
              <label key={key} className="auth-checkbox">
                <input type="checkbox" checked={prefs[key]} onChange={e => set(key, e.target.checked)} /> {label}
              </label>
            ))}
          </fieldset>
          <fieldset className="pref-group">
            <legend>Email newsletters</legend>
            <p className="muted">
              These newsletters are free to receive and are packed full of useful information, advice and industry news.
            </p>
            {NEWSLETTERS.map(([key, label, hint]) => (
              <label key={key} className="auth-checkbox pref-newsletter">
                <input type="checkbox" checked={prefs[key]} onChange={e => set(key, e.target.checked)} />
                <span>
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <button className="btn btn-primary" disabled={state.busy}>
            {state.busy ? 'Saving…' : 'Save preferences'}
          </button>
          {state.message && (
            <div className={state.ok ? 'notice' : 'auth-unavailable'} role={state.ok ? 'status' : 'alert'}>
              {state.message}
            </div>
          )}
        </form>
      )}
    </section>
  );
}

const BLANK_DETAILS = {
  phone: '',
  mobile: '',
  addressLine1: '',
  addressLine2: '',
  addressLine3: '',
  town: '',
  county: '',
  postcode: '',
  country: 'United Kingdom',
};
const FIELDS = [
  ['mobile', 'Mobile', 'tel'],
  ['phone', 'Phone', 'tel'],
  ['addressLine1', 'Address line 1', 'text'],
  ['addressLine2', 'Address line 2', 'text'],
  ['addressLine3', 'Address line 3', 'text'],
  ['town', 'Town', 'text'],
  ['county', 'County', 'text'],
  ['postcode', 'Postcode', 'text'],
];

export function ContactDetails() {
  const [form, setForm] = useState(null);
  const [fixed, setFixed] = useState({ name: '', email: '' });
  const [state, setState] = useState({ busy: false, ok: false, message: '' });
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    let live = true;
    portalApi
      .getMyDetails()
      .then(d => {
        if (!live) return;
        setFixed({ name: [d.title, d.firstName, d.lastName].filter(Boolean).join(' '), email: d.email });
        setForm(Object.fromEntries(Object.keys(BLANK_DETAILS).map(k => [k, d[k] || BLANK_DETAILS[k]])));
      })
      .catch(err => live && setLoadError(messageOf(err)));
    return () => {
      live = false;
    };
  }, []);
  const set = (key, value) => setForm(old => ({ ...old, [key]: value }));
  const save = async e => {
    e.preventDefault();
    if (state.busy) return;
    setState({ busy: true, ok: false, message: '' });
    try {
      await portalApi.saveContactDetails(form);
      setState({ busy: false, ok: true, message: 'Your contact details are saved.' });
    } catch (err) {
      setState({ busy: false, ok: false, message: messageOf(err) });
    }
  };
  return (
    <section className="account-profile" aria-labelledby="details-heading">
      <h3 id="details-heading">
        <UserRound size={17} /> Your contact details
      </h3>
      {loadError && (
        <div className="auth-unavailable" role="alert">
          {loadError}
        </div>
      )}
      {!form && !loadError && <p role="status">Loading your details…</p>}
      {form && (
        <form onSubmit={save}>
          <dl className="detail-list">
            <div>
              <dt>Name</dt>
              <dd>{fixed.name || 'Not recorded'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{fixed.email}</dd>
            </div>
          </dl>
          <p className="muted">
            To change your name or email address, please email{' '}
            <a href="mailto:info@beautyguild.com">info@beautyguild.com</a>.
          </p>
          <div className="fields-grid">
            {FIELDS.map(([key, label, type]) => (
              <div className="field" key={key}>
                <label htmlFor={'cd-' + key}>{label}</label>
                <input id={'cd-' + key} type={type} value={form[key]} onChange={e => set(key, e.target.value)} />
              </div>
            ))}
            <div className="field">
              <label htmlFor="cd-country">Country</label>
              <select id="cd-country" value={form.country} onChange={e => set('country', e.target.value)}>
                {[...new Set([form.country, ...COUNTRY_OPTIONS])].map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn btn-primary" disabled={state.busy}>
            {state.busy ? 'Saving…' : 'Save details'}
          </button>
          {state.message && (
            <div className={state.ok ? 'notice' : 'auth-unavailable'} role={state.ok ? 'status' : 'alert'}>
              {state.message}
            </div>
          )}
        </form>
      )}
    </section>
  );
}
