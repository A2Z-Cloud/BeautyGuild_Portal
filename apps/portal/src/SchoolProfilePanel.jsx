import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Building2,
  Camera,
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  Info,
  LockKeyhole,
  MapPin,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import { Notice, Status } from './UiParts.jsx';
import { formatDate } from './format.js';
import { FACILITY_OPTIONS } from './facilities.js';
import { INTEGRATIONS, portalApi } from './services/api.js';
import './SchoolProfilePanel.css';

// Keys are the existing Training_Centres profile fields accepted by PUT /schools/:id/profile.
const editableFields = [
  'contactName', 'website', 'about', 'facebook', 'instagram', 'tiktok',
  'linkedIn', 'facilities', 'imageUrl', 'logoUrl',
];
const tabs = [
  { key: 'overview', label: 'Overview' },
  { key: 'media', label: 'Branding & media' },
  { key: 'contact', label: 'Contact & social' },
  { key: 'facilities', label: 'Facilities' },
  { key: 'registration', label: 'Registration' },
];
const socials = [
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'linkedIn', label: 'LinkedIn' },
];
function editableProfile(profile) {
  const data = {};
  for (const key of editableFields) {
    data[key] = key === 'facilities' ? [...(profile?.facilities || [])] : (profile?.[key] || '');
  }
  return data;
}
function externalUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('Could not read the image.'));
    reader.readAsDataURL(file);
  });
}
function Field({ label, value, onChange, disabled, maxLength = 255, type = 'text', hint }) {
  return (
    <label className="school-profile-field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}
function MediaUpload({ kind, label, value, state, onPick, onUpload, disabled }) {
  const url = externalUrl(value);
  const uploading = state.status === 'uploading';
  return (
    <section className="school-profile-media-item">
      <div className="school-profile-media-preview">
        {url ? (
          <img src={url} alt={label + ' currently saved for your school'} />
        ) : (
          <div className="school-profile-media-placeholder"><ImageIcon size={30} aria-hidden="true" /><span>No {label.toLowerCase()} yet</span></div>
        )}
      </div>
      <div className="school-profile-media-controls">
        <h4>{label}</h4>
        <p>{kind === 'logo' ? 'Your logo appears alongside your school listing.' : 'The main image represents your training centre.'}</p>
        {INTEGRATIONS.schoolMedia && !disabled ? (
          <>
            <label className="school-profile-file-picker">
              <Camera size={16} aria-hidden="true" />
              <span>Choose {kind === 'logo' ? 'logo' : 'image'}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploading}
                onChange={e => onPick(kind, e.target.files?.[0] || null)}
              />
            </label>
            {state.file && (
              <div className="school-profile-upload-row">
                <span className="school-profile-filename">{state.file.name}</span>
                <button type="button" className="btn btn-secondary" disabled={uploading} onClick={() => onUpload(kind)}>
                  <UploadCloud size={15} aria-hidden="true" />
                  {uploading ? 'Uploading…' : 'Upload image'}
                </button>
              </div>
            )}
            {state.status === 'done' && <span className="school-profile-media-success"><CheckCircle2 size={15} /> Uploaded. Save the profile to apply this image.</span>}
          </>
        ) : (
          <small>{disabled ? 'Image changes are not currently enabled.' : 'Media uploads are not enabled for this portal.'}</small>
        )}
        {state.error && <span className="school-profile-field-error" role="alert">{state.error}</span>}
        {url && <a href={url} target="_blank" rel="noopener noreferrer">View current image <ExternalLink size={13} aria-hidden="true" /></a>}
      </div>
    </section>
  );
}
function Detail({ label, value }) {
  return <div className="school-profile-detail"><dt>{label}</dt><dd>{value || '—'}</dd></div>;
}
export default function SchoolProfilePanel({ data, schoolId, onDone }) {
  const profile = data.profile;
  const [activeTab, setActiveTab] = useState('overview');
  const [initial] = useState(() => editableProfile(profile));
  const [values, setValues] = useState(() => editableProfile(profile));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mediaIds, setMediaIds] = useState({});
  const [media, setMedia] = useState({
    image: { file: null, status: 'idle', error: '' },
    logo: { file: null, status: 'idle', error: '' },
  });
  const canEdit = INTEGRATIONS.schoolWrites;
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const pendingUpload = Boolean(media.image.file || media.logo.file);
  const uploading = media.image.status === 'uploading' || media.logo.status === 'uploading';
  const set = (key, value) => setValues(previous => ({ ...previous, [key]: value }));

  useEffect(() => {
    if (!dirty && !pendingUpload) return;
    const warn = e => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pendingUpload]);

  const completion = [
    Boolean(values.about.trim()),
    Boolean(values.website.trim()),
    Boolean(values.contactName.trim()),
    Boolean(values.logoUrl),
    Boolean(values.imageUrl),
    values.facilities.length > 0,
    socials.some(({ key }) => Boolean(values[key].trim())),
  ];
  const count = completion.filter(Boolean).length;
  const percent = Math.round((count / completion.length) * 100);
  function pickMedia(kind, file) {
    setMedia(previous => ({ ...previous, [kind]: { file, status: 'idle', error: '' } }));
  }
  async function uploadMedia(kind) {
    const file = media[kind].file;
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setMedia(previous => ({
        ...previous,
        [kind]: { ...previous[kind], error: 'Choose a PNG, JPG or WebP image.' },
      }));
      return;
    }
    setMedia(previous => ({
      ...previous,
      [kind]: { ...previous[kind], status: 'uploading', error: '' },
    }));
    try {
      const dataBase64 = await fileToBase64(file);
      const result = await portalApi.uploadSchoolMedia(kind, {
        fileName: file.name, mimeType: file.type, dataBase64,
      });
      if (!result?.url || !result?.mediaId) throw new Error('The media upload did not return an image and attachment ID.');
      set(kind === 'logo' ? 'logoUrl' : 'imageUrl', result.url);
      setMediaIds(previous => ({ ...previous, [kind === 'logo' ? 'logoId' : 'imageId']: result.mediaId }));
      setMedia(previous => ({ ...previous, [kind]: { file: null, status: 'done', error: '' } }));
    } catch (e) {
      setMedia(previous => ({
        ...previous,
        [kind]: { ...previous[kind], status: 'error', error: e.message || 'Upload failed.' },
      }));
    }
  }
  function discard() {
    if ((dirty || pendingUpload) && !window.confirm('Discard your unsaved profile changes?')) return;
    setValues(editableProfile(profile));
    setMediaIds({});
    setMedia({
      image: { file: null, status: 'idle', error: '' },
      logo: { file: null, status: 'idle', error: '' },
    });
    setError('');
  }
  async function save(e) {
    e.preventDefault();
    if (!canEdit || busy || uploading || pendingUpload || !dirty) return;
    setBusy(true);
    setError('');
    try {
      // The only writable values are the current profile contract, plus existing WP media attachment IDs if replaced.
      await portalApi.updateSchoolProfile(schoolId, { ...values, ...mediaIds });
      onDone();
    } catch (e) {
      setError(e.message || 'Profile could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  const image = externalUrl(values.imageUrl);
  const logo = externalUrl(values.logoUrl);
  const publicUrl = externalUrl(profile.wordpressUrl);
  return (
    <div className="school-profile">
      <div className="school-profile-topline">
        <div>
          <span className="school-profile-eyebrow">SCHOOL PROFILE</span>
          <h2>Manage your school profile</h2>
          <p>Keep your training centre information accurate for prospective students.</p>
        </div>
        {publicUrl && (
          <a className="btn btn-secondary school-profile-public-link" href={publicUrl} target="_blank" rel="noopener noreferrer">
            View public profile <ExternalLink size={15} aria-hidden="true" />
          </a>
        )}
      </div>
      <div className="school-profile-hero">
        <div className="school-profile-cover">
          {image ? <img src={image} alt="" /> : <span><ImageIcon size={27} aria-hidden="true" /> No school image uploaded</span>}
        </div>
        <div className="school-profile-identity">
          <div className="school-profile-logo">
            {logo ? <img src={logo} alt={profile.name + ' logo'} /> : <Building2 size={31} aria-hidden="true" />}
          </div>
          <div className="school-profile-identity-text">
            <h3>{profile.name}</h3>
            <p><MapPin size={14} aria-hidden="true" /> {[profile.town, profile.county].filter(Boolean).join(', ') || 'Location not provided'}</p>
            <div className="school-profile-chips">
              <span><ShieldCheck size={14} aria-hidden="true" /> {profile.level || 'Training centre'}</span>
              <Status value={profile.status || 'Unknown'} />
            </div>
          </div>
        </div>
      </div>
      <div className="school-profile-summary">
        <div className="school-profile-progress">
          <div className="school-profile-progress-header"><strong>Profile content</strong><span>{count} of {completion.length} items completed</span></div>
          <div className="school-profile-progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile content completeness">
            <span style={{ width: percent + '%' }} />
          </div>
          <p>Optional guidance based on your existing profile information, not an accreditation score.</p>
        </div>
        <div className="school-profile-summary-note">
          <Info size={18} aria-hidden="true" />
          <span>Courses, tutors and venues are managed from their own school sections.</span>
        </div>
      </div>
      <form className="school-profile-form" onSubmit={save}>
        <div className="school-profile-tabs" role="tablist" aria-label="School profile sections">
          {tabs.map(tab => (
            <button
              type="button"
              key={tab.key}
              id={'school-profile-tab-' + tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              aria-controls={'school-profile-panel-' + tab.key}
              className={activeTab === tab.key ? 'active' : ''}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <section
          className="school-profile-tab-panel"
          role="tabpanel"
          id={'school-profile-panel-' + activeTab}
          aria-labelledby={'school-profile-tab-' + activeTab}
          tabIndex={0}
        >
          {activeTab === 'overview' && (
            <div className="school-profile-content">
              <div className="school-profile-section-head">
                <h3>About your school</h3>
                <p>Help prospective students understand what makes your academy different.</p>
              </div>
              <label className="school-profile-field">
                <span>About the school</span>
                <textarea rows={8} maxLength={2000} value={values.about} disabled={!canEdit} onChange={e => set('about', e.target.value)} />
                <small className="school-profile-count">{values.about.length}/2000 characters</small>
              </label>
              <div className="school-profile-guidance"><BookOpen size={18} aria-hidden="true" /> Describe your teaching approach, experience and the environment students can expect. This uses your existing About the School field.</div>
            </div>
          )}
          {activeTab === 'media' && (
            <div className="school-profile-content">
              <div className="school-profile-section-head">
                <h3>Branding & media</h3>
                <p>Choose your existing school logo and main school image. These are the two currently supported media fields.</p>
              </div>
              <div className="school-profile-media-list">
                <MediaUpload kind="logo" label="School logo" value={values.logoUrl} state={media.logo} onPick={pickMedia} onUpload={uploadMedia} disabled={!canEdit} />
                <MediaUpload kind="image" label="School image" value={values.imageUrl} state={media.image} onPick={pickMedia} onUpload={uploadMedia} disabled={!canEdit} />
              </div>
              <div className="school-profile-guidance"><Info size={18} aria-hidden="true" /> Upload the image first, then save your profile to apply it. Images upload to the existing WordPress media library.</div>
            </div>
          )}
          {activeTab === 'contact' && (
            <div className="school-profile-content">
              <div className="school-profile-section-head">
                <h3>Contact & social links</h3>
                <p>Maintain the contact information and social links already connected to your training centre.</p>
              </div>
              <div className="school-profile-fields-grid">
                <Field label="Main contact name" maxLength={100} value={values.contactName} onChange={v => set('contactName', v)} disabled={!canEdit} />
                <Field label="Website" value={values.website} onChange={v => set('website', v)} disabled={!canEdit} hint="Use the full address, including https://." />
              </div>
              <h4>Social media</h4>
              <div className="school-profile-fields-grid">
                {socials.map(({ key, label }) => (
                  <Field key={key} label={label} value={values[key]} onChange={v => set(key, v)} disabled={!canEdit} />
                ))}
              </div>
            </div>
          )}
          {activeTab === 'facilities' && (
            <div className="school-profile-content">
              <div className="school-profile-section-head">
                <h3>Training centre facilities</h3>
                <p>Select the facilities available at your school. These are the existing Guild facility options.</p>
              </div>
              <fieldset className="school-profile-facilities">
                <legend>Available facilities</legend>
                {FACILITY_OPTIONS.map(({ value, label }) => (
                  <label key={value} className={values.facilities.includes(value) ? 'selected' : ''}>
                    <input
                      type="checkbox"
                      checked={values.facilities.includes(value)}
                      disabled={!canEdit}
                      onChange={e => set('facilities', e.target.checked
                        ? [...values.facilities, value]
                        : values.facilities.filter(x => x !== value))}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
            </div>
          )}
          {activeTab === 'registration' && (
            <div className="school-profile-content">
              <div className="school-profile-section-head">
                <h3>Registration & accreditation</h3>
                <p>These details are managed by the Guild Accreditation team and cannot be edited here.</p>
              </div>
              <div className="school-profile-locked"><LockKeyhole size={18} aria-hidden="true" /> Need a correction to your registered details? Contact the Accreditation team.</div>
              <dl className="school-profile-details">
                <Detail label="Registered training centre" value={profile.name} />
                <Detail label="Town / city" value={profile.town} />
                <Detail label="County" value={profile.county} />
                <Detail label="Country" value={profile.country} />
                <Detail label="Postcode" value={profile.postcode} />
                <Detail label="Accreditation status" value={profile.status} />
                <Detail label="Accreditation level" value={profile.level} />
                <Detail label="Valid until" value={formatDate(profile.expires)} />
                <Detail label="Referral code" value={profile.referralCode} />
              </dl>
              {profile.referralCode && profile.referralActive && (
                <a className="school-profile-referral" href={'https://beautyguild.com/Join/' + encodeURIComponent(profile.referralCode)} target="_blank" rel="noopener noreferrer">
                  View school referral landing page <ExternalLink size={14} aria-hidden="true" />
                </a>
              )}
              {INTEGRATIONS.stripeCheckout && profile.payable && (
                <Link className="btn btn-primary" to={'/pay/accreditation/' + profile.id}>Pay for accreditation <ArrowRight size={15} aria-hidden="true" /></Link>
              )}
            </div>
          )}
        </section>
        {error && <Notice title="Profile not saved">{error}</Notice>}
        <div className="school-profile-actions">
          <span className={dirty ? 'school-profile-unsaved' : 'school-profile-saved'}>
            {dirty ? 'You have unsaved changes' : 'No unsaved changes'}
          </span>
          {canEdit ? (
            <div>
              <button type="button" className="btn btn-secondary" disabled={busy || uploading} onClick={discard}>Discard changes</button>
              <button type="submit" className="btn btn-primary" disabled={busy || uploading || pendingUpload || !dirty}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          ) : (
            <small><LockKeyhole size={14} aria-hidden="true" /> Profile editing is currently unavailable.</small>
          )}
        </div>
        {pendingUpload && <p className="school-profile-pending" role="status">Upload or clear the selected image before saving.</p>}
      </form>
    </div>
  );
}
