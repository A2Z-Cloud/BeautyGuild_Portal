import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Field, Notice } from './UiParts.jsx';
import AddressLookup from './components/AddressLookup.jsx';
import { INTEGRATIONS, portalApi } from './services/api.js';
import {
  VENUE_FIELDS,
  VENUE_STATE_TEXT,
  confirmingKey,
  emptyVenue,
  isConfirming,
  isUkVenue,
  venueErrors,
  venueFromDetails,
  venuePayload,
} from './venueInputs.js';

const readPaidAt = id => {
  try {
    return sessionStorage.getItem(confirmingKey(id));
  } catch {
    return null;
  }
};
// The venue form: the main centre's details plus the courses that run there. Saving keeps it as a draft, so the member can come back and pay.
function VenueForm({ schoolId, courses, venue, onSaved, onCancel }) {
  const [values, setValues] = useState(venue ? venueFromDetails(venue.details) : emptyVenue()),
    [errors, setErrors] = useState({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const update = (name, value) => {
    setValues(v => ({ ...v, [name]: value }));
    setErrors(e => ({ ...e, [name]: undefined }));
  };
  const toggle = id =>
    update(
      'courseIds',
      values.courseIds.includes(id) ? values.courseIds.filter(x => x !== id) : [...values.courseIds, id],
    );
  async function save() {
    const found = venueErrors(values);
    setErrors(found);
    if (Object.keys(found).length) {
      setError('Please complete the highlighted answers.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await portalApi.saveSchoolVenue(schoolId, venuePayload(values, venue?.id));
      onSaved(saved);
    } catch (e) {
      setError(e.message || 'We could not save the venue. Please try again.');
      setBusy(false);
    }
  }
  const fill = a => {
    for (const [name, key] of [
      ['address1', 'addressLine1'],
      ['address2', 'addressLine2'],
      ['address3', 'addressLine3'],
      ['town', 'town'],
      ['county', 'county'],
      ['postcode', 'postcode'],
    ])
      if (typeof a[key] === 'string') update(name, a[key]);
  };
  return (
    <form
      className="venue-form"
      onSubmit={e => {
        e.preventDefault();
        save();
      }}
    >
      <h3>{venue ? 'Edit venue' : 'Add a venue'}</h3>
      <p className="muted">
        Tell us about the venue and which of your accredited courses run there. Save it now and come back later to pay.
        The venue stays hidden until the Guild has verified it.
      </p>
      <div className="fields-grid">
        {VENUE_FIELDS.filter(f => !f.when || f.when(values)).map(f => (
          <React.Fragment key={f.name}>
            <Field
              field={typeof f.required === 'function' ? { ...f, required: Boolean(f.required(values)) } : f}
              value={values[f.name]}
              onChange={update}
              error={errors[f.name]}
              values={values}
            />
            {f.name === 'postcode' && INTEGRATIONS.address && isUkVenue(values) && (
              <AddressLookup query={values.postcode} onSelect={fill} />
            )}
          </React.Fragment>
        ))}
      </div>
      <fieldset className={'buy-fieldset' + (errors.courseIds ? ' invalid' : '')}>
        <legend>Courses that run at this venue *</legend>
        {courses.length ? (
          courses.map(c => (
            <label key={c.id} className="check-choice">
              <input type="checkbox" checked={values.courseIds.includes(c.id)} onChange={() => toggle(c.id)} />
              {c.name}
            </label>
          ))
        ) : (
          <p className="muted">Your school has no accredited courses yet.</p>
        )}
        {errors.courseIds && (
          <small className="error" role="alert">
            {errors.courseIds}
          </small>
        )}
      </fieldset>
      {error && <Notice title="Not saved">{error}</Notice>}
      <div className="journey-nav">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save venue'}
        </button>
      </div>
    </form>
  );
}
// The Venues tab: the school's centres with where each one has got to, and the form to add another.
export default function VenuesTab({ schoolId, data, onChanged }) {
  const [mode, setMode] = useState(null), // null, 'new', or a venue being edited
    [message, setMessage] = useState(''),
    [confirmRemove, setConfirmRemove] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const venues = data.venues || [];
  async function remove(id) {
    setBusy(true);
    setError('');
    try {
      await portalApi.removeSchoolVenue(schoolId, id);
      setConfirmRemove('');
      setMessage('The venue has been removed.');
      onChanged();
    } catch (e) {
      setError(e.message || 'We could not remove the venue. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  if (mode)
    return (
      <VenueForm
        schoolId={schoolId}
        courses={data.courses || []}
        venue={mode === 'new' ? null : mode}
        onCancel={() => setMode(null)}
        onSaved={() => {
          setMode(null);
          setMessage('Your venue has been saved. You can pay for it now, or come back later.');
          onChanged();
        }}
      />
    );
  return (
    <>
      <div className="school-dialog-head">
        <h2>Accredited venues</h2>
        {INTEGRATIONS.addVenue && data.canAdd && (
          <button type="button" className="btn btn-primary" onClick={() => setMode('new')}>
            Add a venue
          </button>
        )}
      </div>
      <p>
        {INTEGRATIONS.addVenue
          ? data.canAdd
            ? 'Add another venue, pay for it, and the Guild will verify it. It stays hidden until then.'
            : 'You can add a venue once your school has been verified.'
          : 'Adding a venue is subject to a separate Guild approval and payment process.'}
      </p>
      {message && <Notice title="Done">{message}</Notice>}
      {error && <Notice title="Not done">{error}</Notice>}
      <div className="school-table-scroll">
        <table className="record-table">
          <thead>
            <tr>
              <th>Venue</th>
              <th>Town</th>
              <th>Courses</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {venues.map(v => {
              const confirming = v.state === 'draft' && isConfirming(readPaidAt(v.id));
              return (
                <tr key={v.id}>
                  <td>{v.name}</td>
                  <td>{v.town || '—'}</td>
                  <td>{v.courseCount}</td>
                  <td>
                    {confirming
                      ? 'Payment received, we are confirming it'
                      : VENUE_STATE_TEXT[v.state] || VENUE_STATE_TEXT.other}
                  </td>
                  <td>
                    {v.state === 'draft' && !confirming && INTEGRATIONS.addVenue && (
                      <span className="venue-actions">
                        <Link
                          className="btn btn-primary"
                          to={
                            '/pay/additional_venue/' +
                            encodeURIComponent(schoolId) +
                            '?centreId=' +
                            encodeURIComponent(v.id)
                          }
                        >
                          Pay for this venue
                        </Link>
                        <button type="button" className="text-button" onClick={() => setMode(v)}>
                          Edit
                        </button>
                        {confirmRemove === v.id ? (
                          <>
                            <button type="button" className="text-button" disabled={busy} onClick={() => remove(v.id)}>
                              {busy ? 'Removing…' : 'Yes, remove it'}
                            </button>
                            <button type="button" className="text-button" onClick={() => setConfirmRemove('')}>
                              Keep it
                            </button>
                          </>
                        ) : (
                          <button type="button" className="text-button" onClick={() => setConfirmRemove(v.id)}>
                            Remove
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
