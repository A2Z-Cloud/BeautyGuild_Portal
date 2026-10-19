'use strict';
// What members can pay for. Books is the source of truth for prices and keeps Stripe in step, so
// nothing here holds an amount: each ITEM points at a Stripe price ID, supplied per environment as
// an env var, and the checkout reads the live amount from Stripe. To add a new item, add it here
// and set its STRIPE_PRICE_* env var. To add a new service, add an entry to SERVICES: it says who
// may pay (ownership), which items to charge, and the metadata Creator expects after payment.
const {HttpError} = require('./errors');

const ID = /^\d{10,25}$/;
const ITEMS = Object.freeze({
  accreditation: {name: 'Accreditation', env: 'STRIPE_PRICE_ACCREDITATION'},
  accreditation_associate_bundle: {name: 'Accreditation and Associate Membership', env: 'STRIPE_PRICE_ASSOCIATE_MEMBERSHIP'},
  additional_venue: {name: 'Additional venue', env: 'STRIPE_PRICE_ADDITIONAL_VENUE'},
  addon_bundle: {name: 'Membership bundle', env: 'STRIPE_PRICE_ADDON_BUNDLE'},
  addon_certificate: {name: 'Additional certificate', env: 'STRIPE_PRICE_ADDON_CERTIFICATE'},
  addon_badge: {name: 'Additional badge', env: 'STRIPE_PRICE_ADDON_BADGE'},
  addon_sticker: {name: 'Additional window sticker', env: 'STRIPE_PRICE_ADDON_STICKER'},
});
const ADDONS = Object.freeze({bundle: 'addon_bundle', certificate: 'addon_certificate', badge: 'addon_badge', sticker: 'addon_sticker'});
const PAID = new Set(['paid', 'succeeded', 'completed', 'payment received']);
const INTERNATIONAL = 'International Accreditation Annual';
const esc = encodeURIComponent;
const bad = (message, status = 422, code = 'INVALID_REQUEST') => { throw new HttpError(status, code, message); };
const notFound = what => bad(what + ' not found.', 404, 'NOT_FOUND');
const pounds = pence => (pence / 100).toFixed(2);

// Each service gets {crm(req,path), contact, input} and returns what the checkout needs.
const SERVICES = {
  accreditation: {
    title: 'Accreditation',
    async prepare({req, crm, contact, input}) {
      const id = String(input.recordId || '');
      if (!ID.test(id)) notFound('Accreditation');
      const acc = (await crm(req, 'Training_Centre_Accred/' + id + '?fields=' + esc('Applicant_Contact,Accreditation_Level,Payment_Status,Stripe_Checkout_Session_ID')))[0];
      if (!acc || String(acc.Applicant_Contact?.id) !== String(contact.id)) notFound('Accreditation');
      if (PAID.has(String(acc.Payment_Status || '').toLowerCase())) return {alreadyPaid: true};
      const international = acc.Accreditation_Level === INTERNATIONAL;
      const membership = await activeMembership(req, crm, contact.id);
      // A school without a current membership pays the combined accreditation and Associate price.
      const bundle = !membership && !international;
      const label = bundle ? 'Accreditation + Associate Membership' : international ? 'International Accreditation' : 'Accreditation';
      return {
        lines: [{item: bundle ? 'accreditation_associate_bundle' : 'accreditation', quantity: 1}],
        existingSessionId: acc.Stripe_Checkout_Session_ID || null,
        record: {module: 'Training_Centre_Accred', id},
        metadata: ({total}) => ({
          type: 'accreditation', accreditation_id: id, application_id: id, contact_id: contact.id,
          product_amount: total, product_details: label, product_name: bundle ? label : international ? 'International Accreditation' : 'Standard Accreditation',
          membership_required: bundle ? 'true' : 'false', membership_id: membership?.profileId || '',
          membership_details: JSON.stringify({required: bundle, type: bundle ? 'Associate' : null,
            start_date: membership?.start || null, expiry_date: membership?.expiry || null}),
        }),
      };
    },
  },
  additional_venue: {
    title: 'Additional venue',
    async prepare({req, crm, contact, input}) {
      const id = String(input.recordId || ''), centre = String(input.centreId || '');
      if (!ID.test(id) || !ID.test(centre)) notFound('Venue');
      const acc = (await crm(req, 'Training_Centre_Accred/' + id + '?fields=Applicant_Contact'))[0];
      if (!acc || String(acc.Applicant_Contact?.id) !== String(contact.id)) notFound('Venue');
      const links = await crm(req, 'Accreditation_Centre_Link/search?criteria=' + esc('((Accreditation:equals:' + id + ')and(Training_Centre:equals:' + centre + '))') + '&fields=Training_Centre');
      if (!links.some(l => String(l.Training_Centre?.id) === centre)) notFound('Venue');
      return {
        lines: [{item: 'additional_venue', quantity: 1}],
        metadata: () => ({type: 'additional_venue', centre_id: centre, accreditation_id: id, contact_id: contact.id}),
      };
    },
  },
  membership_addon: {
    title: 'Membership add-ons',
    async prepare({req, crm, contact, input}) {
      const id = String(input.recordId || '');
      if (!ID.test(id)) notFound('Membership');
      const deal = (await crm(req, 'Deals/' + id + '?fields=Contact_Name'))[0];
      if (!deal || String(deal.Contact_Name?.id) !== String(contact.id)) notFound('Membership');
      const asked = input.addons && typeof input.addons === 'object' ? input.addons : {};
      const lines = [], quantities = {};
      for (const [key, raw] of Object.entries(asked)) {
        if (!ADDONS[key]) bad('Unknown add-on: ' + key + '.');
        const quantity = Number(raw);
        if (!Number.isInteger(quantity) || quantity < 0 || quantity > 10) bad('Choose between 0 and 10 of each add-on.');
        if (quantity) { lines.push({item: ADDONS[key], quantity}); quantities[key] = quantity; }
      }
      if (!lines.length) bad('Choose at least one add-on.');
      return {
        lines,
        metadata: ({amounts, total}) => ({
          type: 'membership_addon', membership_deal_id: id, contact_id: contact.id,
          addons: JSON.stringify(quantities),
          bundle_amount: amounts.addon_bundle || '0.00', certificate_amount: amounts.addon_certificate || '0.00',
          badge_amount: amounts.addon_badge || '0.00', sticker_amount: amounts.addon_sticker || '0.00',
          total_amount: total,
        }),
      };
    },
  },
};

// A current membership is an Active Deal that has started and not expired.
async function activeMembership(req, crm, contactId) {
  const today = new Date().toISOString().slice(0, 10);
  const deals = await crm(req, 'Deals/search?criteria=' + esc('(Contact_Name:equals:' + contactId + ')') + '&fields=' + esc('Stage,Membership_Type,Start_Date,Expiry_Date'));
  const current = deals.filter(d => String(d.Contact_Name?.id || contactId) === String(contactId) && d.Stage === 'Active' && d.Membership_Type
    && !(d.Start_Date && d.Start_Date > today) && !(d.Expiry_Date && d.Expiry_Date < today))
    .sort((a, b) => String(b.Start_Date || '').localeCompare(String(a.Start_Date || '')))[0];
  if (!current) return null;
  const full = (await crm(req, 'Deals/' + current.id))[0];
  return {id: current.id, start: current.Start_Date || null, expiry: current.Expiry_Date || null, profileId: full?.Member_Profile?.id || null};
}

module.exports = {ITEMS, SERVICES, ADDONS, pounds, ID};
