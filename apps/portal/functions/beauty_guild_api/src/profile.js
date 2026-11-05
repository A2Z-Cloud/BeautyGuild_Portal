'use strict';
// The signed-in member's own contact preferences and contact details (UAT REV-1 and REV-10).
//   GET /portal/profile/preferences   how the Guild may contact the member, read from the Contact
//   PUT /portal/profile/preferences   save those choices (five true/false answers; the date is set here, never trusted from the browser)
//   PUT /portal/profile/details       phone, mobile and postal address only. Name and email stay with the Guild (the email is the sign-in).
// The member is always the Contact tied to the verified sign-in. Nothing here takes a record id from the browser.
const express = require('express');
const { HttpError } = require('./errors');
const { createCrmWriter } = require('./crmWrite');
const { createCrmClient, resolveContact } = require('./records');
const { phoneIssue } = require('./phone');
const { normalisePostcode } = require('./postcode');

// The Contact fields the Guild added for this, named after their labels with underscores for spaces.
const PREFERENCE_FIELDS = {
  email: 'Contact_by_Email',
  sms: 'Contact_by_SMS',
  post: 'Contact_by_Post',
  guildGazette: 'Guild_Gazette',
  newsAndOffers: 'News_and_Special_Offers',
};
const UPDATED_ON = 'Preferences_Updated_On';
const SOURCE = 'Preferences_Source';
const SOURCE_VALUE = 'Portal Account';
const UK_COUNTRIES = new Set(['united kingdom', 'england', 'scotland', 'wales', 'northern ireland']);
const uri = s => encodeURIComponent(String(s));
const text = v => (v == null ? '' : String(v).trim());

function mapPreferences(row) {
  const out = { updatedOn: text(row[UPDATED_ON]) };
  for (const [key, field] of Object.entries(PREFERENCE_FIELDS)) out[key] = row[field] === true;
  return out;
}
function bad(message, code = 'INVALID_PROFILE') {
  throw new HttpError(422, code, message);
}
function shortText(value, max, label, required = false) {
  const v = text(value);
  if (!v && required) bad(label + ' is required.');
  if (v.length > max) bad(label + ' is too long.');
  return v;
}
// Zoho date-time fields take an offset, not the trailing Z.
const crmDateTime = date => date.toISOString().replace(/\.\d{3}Z$/, '+00:00');

function registerProfileRoutes(
  app,
  { enabled, getCurrentUser, getCrmHeaders, crmApiDomain, fetchImpl = fetch, now = Date.now },
) {
  const router = express.Router();
  router.use(express.json({ limit: '8kb' }));
  const { call } = createCrmClient({ getCrmHeaders, crmApiDomain, fetchImpl });
  const writer = createCrmWriter({ getCrmHeaders, crmApiDomain, fetchImpl });
  router.use(async (req, res, next) => {
    try {
      if (!enabled) throw new HttpError(503, 'PROFILE_DISABLED', 'Profile changes are not available yet.');
      req.portalContact = await resolveContact(req, call, await getCurrentUser(req));
      next();
    } catch (e) {
      next(e);
    }
  });
  const safe = fn => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (e) {
      next(e);
    }
  };
  router.get(
    '/preferences',
    safe(async (req, res) => {
      const fields = [...Object.values(PREFERENCE_FIELDS), UPDATED_ON].join(',');
      const row = (await call(req, 'Contacts/' + req.portalContact.id + '?fields=' + uri(fields)))[0];
      if (!row || String(row.id) !== String(req.portalContact.id)) throw new HttpError(404, 'NOT_FOUND', 'Not found.');
      res.json({ preferences: mapPreferences(row) });
    }),
  );
  router.put(
    '/preferences',
    safe(async (req, res) => {
      const body = req.body || {};
      const record = {};
      for (const [key, field] of Object.entries(PREFERENCE_FIELDS)) {
        if (typeof body[key] !== 'boolean')
          bad('Choose yes or no for every contact preference.', 'INVALID_PREFERENCES');
        record[field] = body[key];
      }
      record[UPDATED_ON] = crmDateTime(new Date(now()));
      await writer.update(req, 'Contacts', req.portalContact.id, record);
      // Where the choice was made. A refused value (a missing picklist option) must not undo a saved consent.
      try {
        await writer.update(req, 'Contacts', req.portalContact.id, { [SOURCE]: SOURCE_VALUE });
      } catch {
        /* the consent itself is saved */
      }
      res.json({ preferences: { ...Object.fromEntries(Object.keys(PREFERENCE_FIELDS).map(k => [k, body[k]])) } });
    }),
  );
  router.put(
    '/details',
    safe(async (req, res) => {
      const body = req.body || {};
      const phone = shortText(body.phone, 40, 'Phone');
      const mobile = shortText(body.mobile, 40, 'Mobile');
      if (!phone && !mobile) bad('Enter a phone or mobile number.');
      for (const [value, label] of [
        [phone, 'Phone'],
        [mobile, 'Mobile'],
      ]) {
        const issue = phoneIssue(value);
        if (issue) bad(label + ': ' + issue, 'INVALID_PHONE');
      }
      const country = shortText(body.country, 60, 'Country', true);
      let postcode = shortText(body.postcode, 12, 'Postcode', true);
      if (UK_COUNTRIES.has(country.toLowerCase())) {
        const pc = normalisePostcode(postcode);
        if (!pc) bad('Enter a valid UK postcode.', 'INVALID_POSTCODE');
        postcode = pc.display;
      }
      const record = {
        Phone: phone || null,
        Mobile: mobile || null,
        Correspondence_Address_Line_1: shortText(body.addressLine1, 100, 'Address line 1', true),
        Correspondence_Address_Line_2: shortText(body.addressLine2, 100, 'Address line 2') || null,
        Correspondence_Address_Line_3: shortText(body.addressLine3, 100, 'Address line 3') || null,
        Correspondence_Town: shortText(body.town, 60, 'Town', true),
        Correspondence_County: shortText(body.county, 60, 'County') || null,
        Correspondence_Postcode: postcode,
        Correspondence_Country: country,
      };
      await writer.update(req, 'Contacts', req.portalContact.id, record);
      res.json({ ok: true });
    }),
  );
  app.use('/portal/profile', router);
}

module.exports = { registerProfileRoutes, PREFERENCE_FIELDS, mapPreferences };
