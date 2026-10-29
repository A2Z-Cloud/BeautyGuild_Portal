import React, { useState } from 'react';
import { portalApi } from './services/api.js';
import { Notice } from './UiParts.jsx';

const DELIVERY = ['Face to Face In the Classroom', 'Face to Face via Live Video Link', 'Online only', 'Other'];
const ASSESS = [
  'Face to Face In the Classroom',
  'Face to Face via Live Video Link',
  'Case Studies - Submitting Photographs',
  'Case Studies - Submitting Videos',
  'Other',
];
const MONTHS = [
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
];
const formField = (k, v, set) => <input value={v || ''} onChange={e => set(k, e.target.value)} />;
function MultiOptions({ label, values, options, onChange }) {
  const items = options.map(o => (typeof o === 'string' ? { value: o, label: o } : o));
  return (
    <fieldset className="school-multi">
      <legend>{label}</legend>
      {items.map(o => (
        <label key={o.value}>
          <input
            type="checkbox"
            checked={values.includes(o.value)}
            onChange={e => onChange(e.target.checked ? [...values, o.value] : values.filter(v => v !== o.value))}
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}
export function QualificationForm({ schoolId, onDone }) {
  const [values, setValues] = useState({
    name: '',
    trainingCentre: '',
    month: '',
    year: '',
    delivery: [],
    assessment: [],
    deliveryOther: '',
    assessmentOther: '',
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const set = (key, value) => setValues(p => ({ ...p, [key]: value }));
  const thisYear = new Date().getFullYear(),
    thisMonth = new Date().getMonth() + 1;
  const years = Array.from({ length: thisYear - 1969 }, (_, i) => thisYear - i);
  const future = Number(values.year) === thisYear && Number(values.month) > thisMonth;
  async function submit(e) {
    e.preventDefault();
    if (busy || future) return;
    setBusy(true);
    setError('');
    try {
      await portalApi.saveSchoolQualification(schoolId, values);
      onDone();
    } catch (err) {
      setError(err.message || 'Qualification could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="school-ops-form" onSubmit={submit}>
      <h3>Add a qualification</h3>
      <p>Qualifications are submitted for Guild verification; they are not automatically approved.</p>
      <label>Qualification name *{formField('name', values.name, set)}</label>
      <label>
        Training Centre *
        <input
          required
          maxLength={200}
          placeholder="Where you completed your qualification"
          value={values.trainingCentre}
          onChange={e => set('trainingCentre', e.target.value)}
        />
      </label>
      <div className="auth-double">
        <label>
          Completion month *
          <select value={values.month} onChange={e => set('month', e.target.value)} required>
            <option value="">Choose month</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option value={i + 1} key={i}>
                {MONTHS[i]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Completion year *
          <select value={values.year} onChange={e => set('year', e.target.value)} required>
            <option value="">Choose year</option>
            {years.map(y => (
              <option value={y} key={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>
      {future && (
        <p className="field-error" role="alert">
          The completion date cannot be in the future.
        </p>
      )}
      <MultiOptions
        label="Practical delivery *"
        values={values.delivery}
        options={DELIVERY}
        onChange={v => set('delivery', v)}
      />
      {values.delivery.includes('Other') && (
        <label>Other delivery{formField('deliveryOther', values.deliveryOther, set)}</label>
      )}
      <MultiOptions
        label="Practical assessment *"
        values={values.assessment}
        options={ASSESS}
        onChange={v => set('assessment', v)}
      />
      {values.assessment.includes('Other') && (
        <label>Other assessment{formField('assessmentOther', values.assessmentOther, set)}</label>
      )}
      {error && <Notice title="Not saved">{error}</Notice>}
      <button
        type="submit"
        className="btn btn-primary"
        disabled={
          busy ||
          future ||
          !values.name ||
          !values.trainingCentre.trim() ||
          !values.month ||
          !values.year ||
          !values.delivery.length ||
          !values.assessment.length
        }
      >
        {busy ? 'Saving…' : 'Save qualification'}
      </button>
    </form>
  );
}
export function SessionForm({ schoolId, onDone }) {
  const [state, setState] = useState({ loading: true, offerings: [], tutors: [], error: '' });
  React.useEffect(() => {
    let active = true;
    portalApi
      .getCourseOptions(schoolId)
      .then(
        r => active && setState({ loading: false, offerings: r.offerings || [], tutors: r.tutors || [], error: '' }),
      )
      .catch(e => active && setState({ loading: false, offerings: [], tutors: [], error: e.message }));
    return () => {
      active = false;
    };
  }, [schoolId]);
  const [values, setValues] = useState({
    courseOfferingId: '',
    tutorId: '',
    availabilityType: 'Fixed Date',
    sessionStart: '',
    sessionEnd: '',
    maximumPlaces: '',
    totalAdvertisedPrice: '',
    instantBookingAvailable: true,
    requestADateAvailable: true,
    flexibleDescription: '',
    availableDays: [],
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const set = (key, value) => setValues(p => ({ ...p, [key]: value }));
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await portalApi.createCourseSession(schoolId, values);
      onDone();
    } catch (err) {
      setError(err.message || 'Session could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="school-ops-form" onSubmit={submit}>
      <h3>Publish a course session</h3>
      {state.loading ? (
        <p>Loading approved course offerings…</p>
      ) : state.error ? (
        <Notice title="Unable to load options">{state.error}</Notice>
      ) : (
        <>
          <label>
            Accredited course *
            <select required value={values.courseOfferingId} onChange={e => set('courseOfferingId', e.target.value)}>
              <option value="">Choose a course</option>
              {state.offerings.map(o => (
                <option value={o.id} key={o.id}>
                  {o.name} · {o.trainingCentre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tutor{' '}
            <select value={values.tutorId} onChange={e => set('tutorId', e.target.value)}>
              <option value="">Not assigned</option>
              {state.tutors.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Availability type *
            <select value={values.availabilityType} onChange={e => set('availabilityType', e.target.value)}>
              {['Fixed Date', 'Flexible Availability', 'Request-a-Date'].map(v => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          {values.availabilityType === 'Fixed Date' ? (
            <div className="auth-double">
              <label>
                Start date and time *
                <input
                  type="datetime-local"
                  required
                  value={values.sessionStart}
                  onChange={e => set('sessionStart', e.target.value)}
                />
              </label>
              <label>
                End date and time{' '}
                <input
                  type="datetime-local"
                  value={values.sessionEnd}
                  onChange={e => set('sessionEnd', e.target.value)}
                />
              </label>
            </div>
          ) : (
            <label>Availability description{formField('flexibleDescription', values.flexibleDescription, set)}</label>
          )}
          <div className="auth-double">
            <label>
              Maximum places{' '}
              <input
                type="number"
                min="1"
                max="1000"
                value={values.maximumPlaces}
                onChange={e => set('maximumPlaces', e.target.value)}
              />
            </label>
            <label>
              Advertised price (£){' '}
              <input
                type="number"
                min="0"
                step=".01"
                value={values.totalAdvertisedPrice}
                onChange={e => set('totalAdvertisedPrice', e.target.value)}
              />
            </label>
          </div>
          <label className="auth-checkbox">
            <input
              type="checkbox"
              checked={values.instantBookingAvailable}
              onChange={e => set('instantBookingAvailable', e.target.checked)}
            />
            Instant booking available
          </label>
          {error && <Notice title="Not saved">{error}</Notice>}
          <button className="btn btn-primary" type="submit" disabled={busy || !values.courseOfferingId}>
            {busy ? 'Publishing…' : 'Create session'}
          </button>
        </>
      )}
    </form>
  );
}

export function TutorForm({ schoolId, onDone }) {
  const [values, setValues] = useState({ name: '', email: '' });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState(null);
  const set = (k, v) => setValues(p => ({ ...p, [k]: v }));
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const r = await portalApi.addSchoolTutor(schoolId, values);
      setResult(r);
      if (!r.alreadyLinked) setTimeout(onDone, 1800);
    } catch (err) {
      setError(err.message || 'The tutor could not be added.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="school-ops-form" onSubmit={submit}>
      <h3>Add a tutor</h3>
      <p>
        Tutors need a current Guild membership to be active. If they do not have one yet they are added as inactive
        until they join.
      </p>
      <label>Full name *{formField('name', values.name, set)}</label>
      <label>
        Email address *<input type="email" required value={values.email} onChange={e => set('email', e.target.value)} />
      </label>
      {error && <Notice title="Not added">{error}</Notice>}
      {result && (
        <Notice title={result.alreadyLinked ? 'Already added' : 'Tutor added'}>
          {result.alreadyLinked ? 'This tutor is already linked to your school.' : 'Status: ' + result.status + '.'}
        </Notice>
      )}
      <button type="submit" className="btn btn-primary" disabled={busy || !values.name || !values.email}>
        {busy ? 'Adding…' : 'Add tutor'}
      </button>
    </form>
  );
}
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export function BookingForm({ schoolId, session, onDone }) {
  const flexible = session.availabilityType !== 'Fixed Date';
  const [values, setValues] = useState({
    studentName: '',
    studentEmail: '',
    numberOfStudents: '1',
    message: '',
    preferredDateFrom: '',
    preferredDateTo: '',
    preferredDays: [],
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const set = (k, v) => setValues(p => ({ ...p, [k]: v }));
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const body = { ...values, numberOfStudents: Number(values.numberOfStudents) || 1 };
      if (!flexible) {
        delete body.preferredDateFrom;
        delete body.preferredDateTo;
        delete body.preferredDays;
      }
      await portalApi.createSessionBooking(schoolId, session.id, body);
      onDone();
    } catch (err) {
      setError(err.message || 'The booking could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="school-ops-form" onSubmit={submit}>
      <h3>Add a booking</h3>
      <label>Student name *{formField('studentName', values.studentName, set)}</label>
      <label>
        Student email *
        <input type="email" required value={values.studentEmail} onChange={e => set('studentEmail', e.target.value)} />
      </label>
      <label>
        Places{' '}
        <input
          type="number"
          min="1"
          max="50"
          value={values.numberOfStudents}
          onChange={e => set('numberOfStudents', e.target.value)}
        />
      </label>
      {flexible && (
        <>
          <div className="auth-double">
            <label>
              Earliest date
              <input
                type="date"
                value={values.preferredDateFrom}
                onChange={e => set('preferredDateFrom', e.target.value)}
              />
            </label>
            <label>
              Latest date
              <input
                type="date"
                value={values.preferredDateTo}
                onChange={e => set('preferredDateTo', e.target.value)}
              />
            </label>
          </div>
          <MultiOptions
            label="Preferred days"
            values={values.preferredDays}
            options={DAYS}
            onChange={v => set('preferredDays', v)}
          />
        </>
      )}
      <label>Notes or special requirements{formField('message', values.message, set)}</label>
      {error && <Notice title="Not saved">{error}</Notice>}
      <button type="submit" className="btn btn-primary" disabled={busy || !values.studentName || !values.studentEmail}>
        {busy ? 'Saving…' : 'Save booking'}
      </button>
    </form>
  );
}
