'use strict';
// What members can pay for. Books is the source of truth for prices and keeps Stripe in step, so
// nothing here holds an amount: each ITEM points at a Stripe price by its lookup key (the price list code),
// and the checkout reads the live amount from Stripe. To add a new item, add it here and give its Stripe
// price the matching lookup key. To add a new service, add an entry to SERVICES: it says who
// may pay (ownership), which items to charge, and the metadata Creator expects after payment.
const { HttpError } = require('./errors');
const { prorata } = require('./prorata');
const { loadCover } = require('./cover');
const insChange = require('./insuranceChange');
const { saveRevision, markAwaitingPayment } = require('./insuranceRevisions');
const insurance = require('./insurance');

const ID = /^\d{10,25}$/;
// How far ahead a start date may be, per service (UAT AL-INS-001). The same limit is used by the date pickers.
const START_WINDOW_DAYS = Object.freeze({ membership: 30, insurance: 30 });
// The Payment_Status value each CRM module accepts while a payment is in progress. A module with no entry has no such value
// (Deals use Pending, Paid, Not Paid and Failed), so nothing is written there.
const PROCESSING_STATUS = Object.freeze({ Training_Centre_Accred: 'Payment Processing' });
// Each item names the Stripe price by its lookup key, which is the price list code (the same code is the SKU in Books).
// A price change is a new Stripe price that takes over the lookup key, so nothing here or in the environment changes.
const ITEMS = Object.freeze({
  accreditation: { name: 'Accreditation', code: 'ACC-STD' },
  accreditation_associate_bundle: { name: 'Accreditation and Associate Membership', code: 'ACC-ASSOC' },
  // International schools pay a flat, VAT-free fee (V1: £350, or £405 with the £55 International membership).
  accreditation_international: { name: 'International Accreditation', code: 'ACC-INTL', vatFree: true },
  accreditation_international_bundle: {
    name: 'International Accreditation and International Membership',
    code: 'ACC-INTL-MEM',
    vatFree: true,
  },
  additional_venue: { name: 'Additional venue', code: 'ACC-VENUE' },
  addon_bundle: { name: 'Membership bundle', code: 'MEM-BUNDLE' },
  addon_certificate: { name: 'Certificate', code: 'MEM-CERT' },
  addon_badge: { name: 'Badge', code: 'MEM-BADGE' },
  addon_sticker: { name: 'Window sticker', code: 'MEM-STICKER' },
  joining_fee: { name: 'Membership joining fee', code: 'MEM-JOIN' },
  membership_branch: { name: 'Additional branch', code: 'MEM-BRANCH' },
  // The GBP 5 adjustment fee on an insurance change (including VAT; no IPT). Its Stripe price must exist, with this lookup key.
  mta_fee: { name: 'Adjustment fee', code: 'FEE-MTA' },
  // Yearly memberships are subscriptions (the interval is checked). Every level is £55 today but has its own price so they can differ later.
  // zeroRatedPence is the zero-rated part of the fee, used only to split net from gross for Creator.
  membership_associate_annual: {
    name: 'Associate Member membership (annual)',
    code: 'MEM-ASSOC-Y',
    interval: 'year',
    zeroRatedPence: 3800,
  },
  membership_full_non_salon_annual: {
    name: 'Full Member (Non-Salon) membership (annual)',
    code: 'MEM-FULLNS-Y',
    interval: 'year',
    zeroRatedPence: 3800,
  },
  membership_full_salon_annual: {
    name: 'Full Member (Salon) membership (annual)',
    code: 'MEM-FULLS-Y',
    interval: 'year',
    zeroRatedPence: 3800,
  },
  // On every monthly plan, once, whatever the plan is for. A monthly subscription at £1.50.
  admin_fee_monthly: { name: 'Monthly payment admin fee', code: 'MEM-ADMIN', interval: 'month' },
  // What a named employee pays as their membership fee on an insurance policy. Read live from the membership price, charged once.
  employee_fee_non_salon: {
    name: 'Named employee membership fee',
    code: 'MEM-FULLNS-Y',
    interval: 'year',
    zeroRatedPence: 3800,
    oneOff: true,
  },
  employee_fee_salon: {
    name: 'Named employee membership fee',
    code: 'MEM-FULLS-Y',
    interval: 'year',
    zeroRatedPence: 3800,
    oneOff: true,
  },
});
const ADDONS = Object.freeze({
  bundle: 'addon_bundle',
  certificate: 'addon_certificate',
  badge: 'addon_badge',
  sticker: 'addon_sticker',
});
const LEVELS = Object.freeze({
  associate: 'Associate Member',
  full_non_salon: 'Full Member (Non-Salon)',
  full_salon: 'Full Member (Salon)',
});
const BRANCHES = Object.freeze({
  beauty: 'Guild of Beauty Therapists',
  holistic: 'Guild of Holistic Therapists',
  nails: 'Guild of Nail Technicians',
  hair: 'Guild of Hairdressers & Barbers',
});
const PAID = new Set(['paid', 'succeeded', 'completed', 'payment received']);
const INTERNATIONAL = 'International Accreditation Annual';
// An accreditation can be paid for only while it is waiting for payment and has not been paid.
const PAYABLE_STAGES = new Set(['Awaiting Payment', 'Payment Failed', 'Payment Processing']);
const isPaidStatus = status => PAID.has(String(status || '').toLowerCase());
const isPayableAccreditation = acc =>
  !isPaidStatus(acc?.Payment_Status) && PAYABLE_STAGES.has(String(acc?.Application_Stage || ''));
const esc = encodeURIComponent;
const bad = (message, status = 422, code = 'INVALID_REQUEST') => {
  throw new HttpError(status, code, message);
};
const notFound = what => bad(what + ' not found.', 404, 'NOT_FOUND');
const pounds = pence => (pence / 100).toFixed(2);

// Each service gets {crm(req,path), contact, input} and returns what the checkout needs.
const SERVICES = {
  accreditation: {
    title: 'Accreditation',
    async prepare({ req, crm, contact, input }) {
      const id = String(input.recordId || '');
      if (!ID.test(id)) notFound('Accreditation');
      const acc = (
        await crm(
          req,
          'Training_Centre_Accred/' +
            id +
            '?fields=' +
            esc('Applicant_Contact,Accreditation_Level,Payment_Status,Stripe_Checkout_Session_ID'),
        )
      )[0];
      if (!acc || String(acc.Applicant_Contact?.id) !== String(contact.id)) notFound('Accreditation');
      if (PAID.has(String(acc.Payment_Status || '').toLowerCase())) return { alreadyPaid: true };
      const international = acc.Accreditation_Level === INTERNATIONAL;
      const membership = await activeMembership(req, crm, contact.id);
      // A school without a current membership pays the combined accreditation and Associate price.
      const bundle = !membership;
      const label = international
        ? bundle
          ? 'International Accreditation + International Membership'
          : 'International Accreditation'
        : bundle
          ? 'Accreditation + Associate Membership'
          : 'Accreditation';
      const item = international
        ? bundle
          ? 'accreditation_international_bundle'
          : 'accreditation_international'
        : bundle
          ? 'accreditation_associate_bundle'
          : 'accreditation';
      // Yearly or monthly, and either way it renews by itself: a yearly subscription, or a monthly plan of 12 payments (plans.js).
      const billing = input.billing === 'monthly' ? 'monthly' : 'annual';
      return {
        lines: [{ item, quantity: 1, term: 'ongoing' }],
        monthly: billing === 'monthly',
        renews: true,
        billing,
        existingSessionId: acc.Stripe_Checkout_Session_ID || null,
        record: {
          module: 'Training_Centre_Accred',
          id,
          update: sessionId => ({
            Stripe_Checkout_Session_ID: sessionId,
            Payment_Status: PROCESSING_STATUS.Training_Centre_Accred,
          }),
        },
        metadata: ({ total, annualPence }) => ({
          type: 'accreditation',
          accreditation_id: id,
          application_id: id,
          contact_id: contact.id,
          subscription_type: billing,
          // product_amount is what is charged now (the first payment on a monthly plan); product_yearly_amount is the yearly price either way.
          product_amount: total,
          product_yearly_amount: pounds(annualPence),
          product_details: label,
          product_name: bundle || international ? label : 'Standard Accreditation',
          membership_required: bundle ? 'true' : 'false',
          membership_id: membership?.profileId || '',
          membership_details: JSON.stringify({
            required: bundle,
            type: bundle ? (international ? 'International' : 'Associate') : null,
            start_date: membership?.start || null,
            expiry_date: membership?.expiry || null,
          }),
        }),
      };
    },
  },
  additional_venue: {
    title: 'Additional venue',
    async prepare({ req, crm, contact, input }) {
      const id = String(input.recordId || ''),
        centre = String(input.centreId || '');
      if (!ID.test(id) || !ID.test(centre)) notFound('Venue');
      const acc = (await crm(req, 'Training_Centre_Accred/' + id + '?fields=Applicant_Contact'))[0];
      if (!acc || String(acc.Applicant_Contact?.id) !== String(contact.id)) notFound('Venue');
      const links = await crm(
        req,
        'Accreditation_Centre_Link/search?criteria=' +
          esc('((Accreditation:equals:' + id + ')and(Training_Centre:equals:' + centre + '))') +
          '&fields=Training_Centre',
      );
      if (!links.some(l => String(l.Training_Centre?.id) === centre)) notFound('Venue');
      return {
        lines: [{ item: 'additional_venue', quantity: 1 }],
        metadata: () => ({ type: 'additional_venue', centre_id: centre, accreditation_id: id, contact_id: contact.id }),
      };
    },
  },
  membership_addon: {
    title: 'Membership add-ons',
    async prepare({ req, crm, contact, input }) {
      const id = String(input.recordId || '');
      if (!ID.test(id)) notFound('Membership');
      const deal = (await crm(req, 'Deals/' + id + '?fields=Contact_Name'))[0];
      if (!deal || String(deal.Contact_Name?.id) !== String(contact.id)) notFound('Membership');
      const asked = input.addons && typeof input.addons === 'object' ? input.addons : {};
      const lines = [],
        quantities = {};
      for (const [key, raw] of Object.entries(asked)) {
        if (!ADDONS[key]) bad('Unknown add-on: ' + key + '.');
        const quantity = Number(raw);
        if (!Number.isInteger(quantity) || quantity < 0 || quantity > 10)
          bad('Choose between 0 and 10 of each add-on.');
        if (quantity) {
          lines.push({ item: ADDONS[key], quantity });
          quantities[key] = quantity;
        }
      }
      if (!lines.length) bad('Choose at least one add-on.');
      return {
        lines,
        metadata: ({ amounts, total }) => ({
          type: 'membership_addon',
          membership_deal_id: id,
          contact_id: contact.id,
          addons: JSON.stringify(quantities),
          bundle_amount: amounts.addon_bundle || '0.00',
          certificate_amount: amounts.addon_certificate || '0.00',
          badge_amount: amounts.addon_badge || '0.00',
          sticker_amount: amounts.addon_sticker || '0.00',
          total_amount: total,
        }),
      };
    },
  },
};

// Net (ex VAT) pounds for a priced line: standard rate 20%, except the zero-rated part of a membership fee.
function netPounds(item, totalPence, quantity = 1, scale = 1) {
  if (ITEMS[item].vatFree) return (totalPence / 100).toFixed(2);
  // scale is 1/12 for a monthly payment: the zero-rated part of the share is the same fraction of the yearly zero-rated part.
  const zr = (ITEMS[item].zeroRatedPence || 0) * quantity * scale;
  return ((zr + (totalPence - zr) / 1.2) / 100).toFixed(2);
}
const isoDay = d => d.toISOString().slice(0, 10);
function annualPeriodEnd(start) {
  const d = new Date(start + 'T00:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return isoDay(d);
}

// The start and end of a membership or policy year. No date means today. A date outside the window is refused with a message,
// never silently changed. UTC days are used throughout so the server and the date picker agree.
function resolveStart(wanted, service) {
  const today = isoDay(new Date());
  if (!wanted) return { start: today, end: annualPeriodEnd(today) };
  const latest = isoDay(new Date(Date.now() + START_WINDOW_DAYS[service] * 864e5)),
    text = String(wanted);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || text < today || text > latest || Number.isNaN(Date.parse(text)))
    bad('Choose a start date from today up to ' + latest + '.');
  return { start: text, end: annualPeriodEnd(text) };
}

// A current membership is an Active Deal that has started and not expired.
async function activeMembership(req, crm, contactId) {
  const today = new Date().toISOString().slice(0, 10);
  const deals = await crm(
    req,
    'Deals/search?criteria=' +
      esc('(Contact_Name:equals:' + contactId + ')') +
      '&fields=' +
      esc('Stage,Membership_Type,Start_Date,Expiry_Date'),
  );
  const current = deals
    .filter(
      d =>
        String(d.Contact_Name?.id || contactId) === String(contactId) &&
        d.Stage === 'Active' &&
        d.Membership_Type &&
        !(d.Start_Date && d.Start_Date > today) &&
        !(d.Expiry_Date && d.Expiry_Date < today),
    )
    .sort((a, b) => String(b.Start_Date || '').localeCompare(String(a.Start_Date || '')))[0];
  if (!current) return null;
  const full = (await crm(req, 'Deals/' + current.id))[0];
  return {
    id: current.id,
    type: current.Membership_Type,
    start: current.Start_Date || null,
    expiry: current.Expiry_Date || null,
    profileId: full?.Member_Profile?.id || null,
  };
}

// The same calendar day one month on, held to the end of a short month (31 January plus a month is 28 or 29 February).
function oneMonthOn(day) {
  const [y, m, d] = day.split('-').map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return isoDay(new Date(Date.UTC(y, m, Math.min(d, last))));
}

// The joining fee is charged on a new purchase and on a renewal alike, unless the new membership starts within one month of the end
// of the member's last membership of any kind (Associate, International, Full Non-Salon or Full Salon): a gap of more than a month
// pays it again (Guild, 26 October 2026). A membership still running has no gap. With no Contact, or no earlier membership, it is due.
// Only Active Deals count as cover: a saved draft is not one.
async function joiningFeeDue(req, crm, contactId, start) {
  if (!contactId) return true;
  const deals = await crm(
    req,
    'Deals/search?criteria=' +
      esc('(Contact_Name:equals:' + contactId + ')') +
      '&fields=' +
      esc('Stage,Membership_Type,Start_Date,Expiry_Date'),
  );
  const ends = deals
    .filter(
      d =>
        String(d.Contact_Name?.id || contactId) === String(contactId) &&
        d.Stage === 'Active' &&
        d.Membership_Type &&
        d.Expiry_Date,
    )
    .map(d => d.Expiry_Date)
    .sort();
  const last = ends[ends.length - 1];
  return !last || start > oneMonthOn(last);
}

// Insurance is rated here, not read from Stripe: each cover row and the IPT become inline price_data lines.
// Nothing is created in the CRM until the member pays (beforePay runs on checkout only, never on a quote),
// and a quote that needs the Insurance team (REFER) or cannot be offered online (STOP) is never payable.
async function insuranceLines({ req, contact, input, member, risk, start, end, monthly = false }) {
  const country = String(input.country || '')
    .trim()
    .slice(0, 60);
  if (!country) bad('Tell us where you are based.');
  const ins = insurance.clean(input.insurance);
  const quote = insurance.calculateQuote(ins);
  const rules = insurance.evaluateRules(ins, country, { complete: !input.quote });
  // Risk checks (sanctions, flood, subsidence) add findings to the rules; one that cannot run is a REFER.
  const screening = risk
    ? await risk.screen({ req, ins, country, contact, input, premises: insurance.propertyRequired(ins) })
    : { ran: false, results: [], audits: [], riskMessage: null };
  const merged = insurance.summarise([...rules.results, ...screening.results]);
  const blocked =
    merged.overall === 'PASS'
      ? null
      : {
          status: merged.overall,
          reasons: [...new Set(merged.results.map(r => r.customerMessage))],
          riskMessage: screening.riskMessage,
        };
  const summary = blocked
    ? merged.results
        .map(r => r.code + ': ' + r.customerMessage)
        .join('; ')
        .slice(0, 1900)
    : '';
  if (!quote.rows.length && !blocked) bad('Choose the insurance cover you need.');
  /** @type {{ name: string, unitPence?: number, priceItem?: string, quantity: number, sku: string }[]} */
  const inline = quote.rows.map(r => ({
    name: 'Insurance - ' + r.label,
    unitPence: r.premiumPence,
    quantity: 1,
    sku: r.sku,
  }));
  if (quote.iptPence)
    inline.push({
      name: 'Insurance Premium Tax (' + Math.round(insurance.IPT_RATE * 100) + '%)',
      unitPence: quote.iptPence,
      quantity: 1,
      sku: insurance.IPT_SKU,
    });
  // Each named employee also pays a membership fee, read live from the membership price (build() fills in the amount).
  const employees = insurance.employeeCount(ins),
    feeItem = ins.insRoute === 'salon' ? 'employee_fee_salon' : 'employee_fee_non_salon';
  if (employees)
    inline.push({ name: ITEMS[feeItem].name, priceItem: feeItem, quantity: employees, sku: ITEMS[feeItem].code });
  return {
    inline,
    blocked,
    quote,
    fingerprint: JSON.stringify([country, ins, start]),
    beforePay: (create, extra = {}) =>
      insurance.createRecords(create, {
        contactId: contact?.id || '',
        membershipDealId: member?.id || null,
        ins,
        quote,
        start,
        end,
        entryRoute: contact && !contact.createdNow ? 'Existing Member' : 'Public Prospect',
        termsAccepted: input.accepted === 'yes',
        audits: screening.audits,
        frequency: monthly ? 'Monthly' : 'Annual',
        ...extra,
      }),
    // A REFER or STOP is recorded in the CRM for the Insurance team, never sent to Stripe (INCOMPLETE is the member's to fix).
    refer:
      blocked && blocked.status !== 'INCOMPLETE'
        ? create =>
            insurance.createRecords(create, {
              contactId: contact?.id || '',
              membershipDealId: member?.id || null,
              ins,
              quote,
              start,
              end,
              entryRoute: contact && !contact.createdNow ? 'Existing Member' : 'Public Prospect',
              termsAccepted: input.accepted === 'yes',
              audits: screening.audits,
              frequency: monthly ? 'Monthly' : 'Annual',
              referral: { status: blocked.status === 'STOP' ? 'Stopped' : 'Referred', summary },
            })
        : null,
    metadata: (ids, fees = { count: 0, grossPence: 0, netPence: 0 }) => ({
      insurance_start_date: start,
      insurance_end_date: end,
      insurance_amount: pounds(quote.totalPence),
      insurance_net_amount: pounds(quote.netPence),
      insurance_ipt_amount: pounds(quote.iptPence),
      insurance_route: ins.insRoute,
      // One key, because Stripe allows 50 metadata keys and a membership with insurance is close to the limit.
      named_employee_membership: JSON.stringify({
        count: fees.count,
        amount: pounds(fees.grossPence),
        amount_net: pounds(fees.netPence),
      }),
      insurance_policy_id: ids?.policyId || '',
      insured_premises_id: ids?.premisesId || '',
      insured_people_ids: (ids?.insuredPeopleIds || []).join(','),
      insurance_extension_ids: (ids?.extensionIds || []).join(','),
      insurance_declarations_id: ids?.declarationsId || '',
    }),
  };
}
// Insurance is included with Full membership only; Associate has none.
const NEEDS_FULL = () =>
  new HttpError(
    409,
    'INSURANCE_NEEDS_FULL_MEMBERSHIP',
    'Insurance is included with Full membership. You can add it when you join as a Full member or when you upgrade your membership.',
  );
// What the member typed on the Join page, kept short enough for Stripe metadata. Empty values are left out.
const tidy = (v, n = 100) =>
  String(v || '')
    .trim()
    .slice(0, n);
const detailsMeta = input =>
  Object.fromEntries(
    [
      ['business_name', input.businessName],
      ['address_line_1', input.address1],
      ['address_line_2', input.address2],
      ['town', input.town],
      ['county', input.county],
      ['postcode', input.postcode],
    ]
      .map(([k, v]) => [k, tidy(v)])
      .filter(([, v]) => v),
  );
const isFullType = type => /^full\b/i.test(String(type || ''));
const fullName = (contact, input) =>
  contact
    ? [contact.First_Name, contact.Last_Name].filter(Boolean).join(' ')
    : [input.firstName, input.lastName]
        .map(x =>
          String(x || '')
            .trim()
            .slice(0, 60),
        )
        .filter(Boolean)
        .join(' ');

SERVICES.insurance = {
  title: 'Insurance',
  allowNoContact: true,
  async prepare({ req, crm, contact, input, risk }) {
    if (!input.insurance) bad('Tell us about the cover you need.');
    if (!input.quote && input.accepted !== 'yes') bad('Please accept the Code of Ethics and terms to continue.');
    const name = fullName(contact, input);
    if (!name && !input.quote) bad('Enter your first name and surname.');
    const member = contact ? await activeMembership(req, crm, contact.id) : null;
    if (!member || !isFullType(member.type)) throw NEEDS_FULL();
    const { start, end } = resolveStart(input.start, 'insurance');
    const ins = await insuranceLines({ req, contact, input, member, risk, start, end });
    return {
      renews: true,
      lines: [],
      inline: ins.inline,
      blocked: ins.blocked,
      beforePay: ins.beforePay,
      refer: ins.refer,
      fingerprint: ins.fingerprint,
      noContact: !contact,
      metadata: ({ total, insuranceIds, fees }) => ({
        type: 'insurance',
        quote_reference: 'BGP-' + Date.now().toString(36).toUpperCase(),
        entry_point: contact && !contact.createdNow ? 'member' : 'public',
        contact_id: contact?.id || '',
        membership_deal_id: member?.id || '',
        membership_profile_id: member?.profileId || '',
        name,
        insurance_requested: 'true',
        ...ins.metadata(insuranceIds, fees),
        total_amount: total,
        // Premiums are VAT exempt, so only the employee membership fees have a VAT part to take off.
        total_amount_net: (Number(total) - fees.grossPence / 100 + fees.netPence / 100).toFixed(2),
      }),
    };
  },
};

SERVICES.membership = {
  title: 'Membership',
  allowNoContact: true,
  async prepare({ req, crm, contact, input, user, risk }) {
    const level = String(input.level || ''),
      branch = String(input.branch || '');
    if (level === 'international')
      bad('International membership has no fixed price. Please contact the Guild to join.');
    if (!LEVELS[level]) bad('Choose a membership level.');
    if (!BRANCHES[branch]) bad('Choose your professional branch.');
    const secondary = list(input.branches);
    for (const b of secondary)
      if (!BRANCHES[b] || b === branch) bad('Choose each additional branch once, other than your main branch.');
    if (new Set(secondary).size !== secondary.length) bad('Choose each additional branch once.');
    const billing =
      input.billing === 'monthly'
        ? 'monthly'
        : input.billing === 'annual'
          ? 'annual'
          : bad('Choose annual or monthly payment.');
    const asked = input.addons && typeof input.addons === 'object' ? input.addons : {};
    const addons = {};
    for (const [key, raw] of Object.entries(asked)) {
      if (!ADDONS[key]) bad('Unknown add-on: ' + key + '.');
      const quantity = Number(raw);
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 10) bad('Choose between 0 and 10 of each add-on.');
      if (quantity) addons[key] = quantity;
    }
    // A quote is only a summary; paying needs the consents and a name.
    if (!input.quote && input.accepted !== 'yes') bad('Please accept the Code of Ethics and terms to continue.');
    const name = fullName(contact, input);
    if (!name && !input.quote) bad('Enter your first name and surname.');

    const today = isoDay(new Date());
    const member = contact ? await activeMembership(req, crm, contact.id) : null;
    let previous = null,
      change = 'new';
    if (input.previousId) {
      if (!contact || !ID.test(String(input.previousId))) notFound('Membership');
      const deal = (await crm(req, 'Deals/' + input.previousId + '?fields=Contact_Name'))[0];
      if (!deal || String(deal.Contact_Name?.id) !== String(contact.id)) notFound('Membership');
      previous = String(input.previousId);
      change = input.changeType === 'upgrade' ? 'upgrade' : 'renewal';
    } else if (member)
      bad(
        'You already have an active membership. Renew or upgrade it instead of buying a new one.',
        409,
        'MEMBERSHIP_EXISTS',
      );
    const { start, end: expiry } = resolveStart(input.start, 'membership');

    // On a monthly plan the yearly price is divided by 12. The joining fee and the add-ons are spread over the first 12 payments only
    // (term year_one); the membership and any extra branches carry on (see plans.js).
    const lines = [{ item: 'membership_' + level + '_annual', quantity: 1, term: 'ongoing' }];
    if (await joiningFeeDue(req, crm, contact?.id, start))
      lines.push({ item: 'joining_fee', quantity: 1, term: 'year_one' });
    if (secondary.length) lines.push({ item: 'membership_branch', quantity: secondary.length, term: 'ongoing' });
    for (const [key, quantity] of Object.entries(addons)) lines.push({ item: ADDONS[key], quantity, term: 'year_one' });
    if (input.insurance && level === 'associate') throw NEEDS_FULL();
    // One date covers both: the membership and its insurance start together.
    const ins = input.insurance
      ? await insuranceLines({ req, contact, input, member, risk, start, end: expiry, monthly: billing === 'monthly' })
      : null;
    return {
      lines,
      monthly: billing === 'monthly',
      renews: true,
      noContact: !contact,
      inline: ins?.inline || [],
      blocked: ins?.blocked || null,
      beforePay: ins?.beforePay,
      refer: ins?.refer,
      fingerprint: ins?.fingerprint,
      metadata: ({ lines: priced, total, insuranceIds, fees }) => {
        const by = item => priced.find(l => l.item === item);
        const gross = item => (by(item) ? pounds(by(item).totalPence) : '0.00');
        const netOf = l => netPounds(l.item, l.totalPence, l.origQuantity ?? l.quantity, l.scale ?? 1);
        const net = item => (by(item) ? netOf(by(item)) : '0.00');
        const base = priced[0].item;
        const totalNet = priced.reduce((t, l) => t + Number(netOf(l)), 0).toFixed(2);
        return {
          type: ins ? 'membership_insurance' : 'membership',
          quote_reference: 'BGP-' + Date.now().toString(36).toUpperCase(),
          entry_point: contact && !contact.createdNow ? 'member' : 'public',
          contact_id: contact?.id || '',
          membership_profile_id: member?.profileId || '',
          existing_membership: member
            ? JSON.stringify({
                type: member.type,
                start_date: member.start,
                expiry_date: member.expiry,
                deal_id: member.id,
              })
            : '',
          previous_membership_id: previous || '',
          change_type: change,
          name,
          ...detailsMeta(input),
          membership_level: level,
          primary_branch: branch,
          secondary_branches: secondary.join(','),
          addons: JSON.stringify(addons),
          insurance_requested: ins ? 'true' : 'false',
          subscription_type: billing,
          membership_start: start,
          membership_expiry: expiry,
          base_membership_amount: gross(base),
          base_membership_amount_net: net(base),
          joining_fee_amount: gross('joining_fee'),
          joining_fee_amount_net: net('joining_fee'),
          branch_addon_amount: gross('membership_branch'),
          branch_addon_amount_net: net('membership_branch'),
          bundle_amount: gross('addon_bundle'),
          bundle_amount_net: net('addon_bundle'),
          certificate_amount: gross('addon_certificate'),
          certificate_amount_net: net('addon_certificate'),
          badge_amount: gross('addon_badge'),
          badge_amount_net: net('addon_badge'),
          sticker_amount: gross('addon_sticker'),
          sticker_amount_net: net('addon_sticker'),
          ...(ins
            ? ins.metadata(insuranceIds, fees)
            : {
                insurance_amount: 'not_requested',
                insurance_net_amount: '',
                insurance_ipt_amount: '',
                insurance_route: '',
                insurance_policy_id: '',
                insured_premises_id: '',
                insured_people_ids: '',
                insurance_extension_ids: '',
                insurance_declarations_id: '',
              }),
          total_amount: total,
          total_amount_net: (Number(totalNet) + (ins ? ins.quote.totalPence / 100 + fees.netPence / 100 : 0)).toFixed(
            2,
          ),
        };
      },
    };
  },
};
// ---- Membership changes (MTA R2): a pro-rated extra branch and flat items on a current membership ----
const norm = v =>
  String(v || '')
    .trim()
    .toLowerCase();
const branchKey = label => Object.entries(BRANCHES).find(([, v]) => norm(v) === norm(label))?.[0] || null;

// The member's current membership as a change can see it: owned, Active and within its term. Also which branches it already holds (the
// main one, and any extra branch already bought) so a branch cannot be bought twice. Ownership comes from the search by Contact.
async function membershipForChange(req, crm, contactId, dealId) {
  if (!ID.test(String(dealId || ''))) notFound('Membership');
  const today = isoDay(new Date());
  const deals = await crm(
    req,
    'Deals/search?criteria=' +
      esc('(Contact_Name:equals:' + contactId + ')') +
      '&fields=' +
      esc('Stage,Membership_Type,Start_Date,Expiry_Date,Membership_Branch,Application_Status'),
  );
  const deal = deals.find(
    d => String(d.id) === String(dealId) && String(d.Contact_Name?.id || contactId) === String(contactId),
  );
  if (!deal) notFound('Membership');
  if (
    deal.Stage !== 'Active' ||
    !deal.Start_Date ||
    !deal.Expiry_Date ||
    deal.Start_Date > today ||
    deal.Expiry_Date < today
  )
    bad(
      'Only a current membership can be changed online. Please call the office if you need help.',
      409,
      'MEMBERSHIP_NOT_CURRENT',
    );
  const [extras, full] = await Promise.all([
    crm(req, 'Membership_Extension/search?criteria=' + esc('(Membership_Extension:equals:' + dealId + ')')),
    crm(req, 'Deals/' + dealId),
  ]);
  const held = new Set(
    [
      ...(Array.isArray(deal.Membership_Branch) ? deal.Membership_Branch : [deal.Membership_Branch]),
      ...extras.filter(x => /branch/i.test(String(x.Extension_Type || ''))).map(x => x.Membership_Branch),
    ]
      .map(branchKey)
      .filter(Boolean),
  );
  return {
    id: String(dealId),
    type: deal.Membership_Type,
    start: deal.Start_Date,
    expiry: deal.Expiry_Date,
    profileId: full[0]?.Member_Profile?.id || null,
    held,
  };
}

// What the member can choose: each branch, and whether they already have it.
async function membershipChangeOptions(req, crm, contactId, dealId) {
  const m = await membershipForChange(req, crm, contactId, dealId);
  return {
    term: { start: m.start, expiry: m.expiry },
    branches: Object.entries(BRANCHES).map(([key, label]) => ({ key, label, held: m.held.has(key) })),
  };
}

SERVICES.membership_change = {
  title: 'Membership changes',
  async prepare({ req, crm, contact, input }) {
    const m = await membershipForChange(req, crm, contact.id, input.recordId);
    const asked = list(input.branches);
    if (new Set(asked).size !== asked.length) bad('Choose each additional branch once.');
    for (const b of asked) {
      if (!BRANCHES[b]) bad('Unknown branch: ' + b + '.');
      if (m.held.has(b)) bad('You already have ' + BRANCHES[b] + '.');
    }
    if (asked.length > Object.keys(BRANCHES).length - 1) bad('Choose up to three additional branches.');
    const addonsAsked = input.addons && typeof input.addons === 'object' ? input.addons : {};
    const lines = [],
      quantities = {};
    for (const [key, raw] of Object.entries(addonsAsked)) {
      if (!ADDONS[key]) bad('Unknown add-on: ' + key + '.');
      const quantity = Number(raw);
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 10) bad('Choose between 0 and 10 of each add-on.');
      if (quantity) {
        lines.push({ item: ADDONS[key], quantity });
        quantities[key] = quantity;
      }
    }
    if (!lines.length && !asked.length) bad('Choose a branch or at least one item.');
    // An extra branch is its yearly price for the days left in the term, from today (both end days counted). It is charged once now;
    // renewals are the Creator's side (MTA-D20, D21). Flat items are not pro-rated and carry no adjustment fee.
    const today = isoDay(new Date());
    const term = prorata({ start: m.start, end: m.expiry, from: today > m.start ? today : m.start });
    const inline = asked.map(b => ({
      name:
        BRANCHES[b] + ': additional branch, ' + term.days + ' of ' + term.total + ' days to the end of your membership',
      quantity: 1,
      priceItem: 'membership_branch',
      prorata: term,
      sku: ITEMS.membership_branch.code,
      branch: b,
    }));
    return {
      lines,
      inline,
      metadata: ({ amounts, total, lines: priced, inline: charged }) => {
        const branchLines = (charged || []).filter(l => l.sku === ITEMS.membership_branch.code);
        const branchPence = branchLines.reduce((t, l) => t + l.totalPence, 0);
        const yearlyPence = branchLines.reduce((t, l) => t + (l.fullUnitPence || 0) * l.quantity, 0);
        const net = key => {
          const l = (priced || []).find(x => x.item === ADDONS[key]);
          return l ? netPounds(l.item, l.totalPence, l.quantity) : '0.00';
        };
        const branchNet = branchLines.length ? netPounds('membership_branch', branchPence, branchLines.length) : '0.00';
        const totalNet = (Number(branchNet) + Object.keys(ADDONS).reduce((t, k) => t + Number(net(k)), 0)).toFixed(2);
        return {
          type: 'membership_change',
          contact_id: contact.id,
          quote_reference: 'BGP-' + Date.now().toString(36).toUpperCase(),
          membership_deal_id: m.id,
          membership_profile_id: m.profileId || '',
          change_type: 'mta',
          mta_scope: 'membership',
          effective_date: today,
          membership_start: m.start,
          membership_expiry: m.expiry,
          prorata_days: String(term.days),
          prorata_total_days: String(term.total),
          secondary_branches: asked.join(','),
          branch_addon_amount: pounds(branchPence),
          branch_addon_amount_net: branchNet,
          branch_yearly_amount: pounds(yearlyPence),
          addons: JSON.stringify(quantities),
          bundle_amount: amounts.addon_bundle || '0.00',
          bundle_amount_net: net('bundle'),
          certificate_amount: amounts.addon_certificate || '0.00',
          certificate_amount_net: net('certificate'),
          badge_amount: amounts.addon_badge || '0.00',
          badge_amount_net: net('badge'),
          sticker_amount: amounts.addon_sticker || '0.00',
          sticker_amount_net: net('sticker'),
          total_amount: total,
          total_amount_net: totalNet,
        };
      },
    };
  },
};

// ---- Insurance changes (MTA R3-1): a quote for a change to a Non-Salon policy. Read only: nothing is written and nothing is paid. ----
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (iso, n) => isoDay(new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5));

// The day as the member reads it ("7 Oct 2026"), for the names of the lines.
const dayName = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  return (
    d + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] + ' ' + y
  );
};

SERVICES.insurance_change = {
  title: 'Insurance changes',
  async prepare({ req, crm, contact, input, risk }) {
    if (!ID.test(String(input.recordId || ''))) notFound('Membership');
    const cover = await loadCover({
      call: crm,
      req,
      contactId: contact.id,
      dealId: String(input.recordId || ''),
      isDraft: row => row.Application_Status === 'Draft',
    });
    const policy = cover.insurance;
    // One change, or a basket of changes with their own start dates (one revision, and one GBP 5, for each date).
    const asks = Array.isArray(input.changes) && input.changes.length ? input.changes : [input.change];
    const cleaned = asks.map(insChange.cleanChange);
    const today = isoDay(new Date());
    // The start date is from today up to 30 days ahead and never after the end of the policy (Guild, 26 October). No back-dating online.
    const latest =
      policy && policy.endDate && addDays(today, 30) > policy.endDate ? policy.endDate : addDays(today, 30);
    for (const c of cleaned)
      if (!ISO.test(c.effectiveDate) || c.effectiveDate < today || c.effectiveDate > latest)
        bad('Choose a start date from today up to ' + latest + '.');
    const revisions = insChange.quoteBasket({ cover, changes: cleaned, today });
    if (revisions.length > insChange.MAX_REVISIONS)
      bad('Choose up to ' + insChange.MAX_REVISIONS + ' different start dates at a time.');

    // A renewal can already exist (renewals open 30 days before the end): a later policy in force on the membership, or a renewed membership
    // that starts after this policy ends. A change in the last month then also affects it, so it goes to the office (MTA-D23).
    let renewed = Boolean(policy && policy.renewal);
    if (
      !renewed &&
      policy &&
      policy.endDate &&
      revisions.some(r => r.change.effectiveDate > addDays(policy.endDate, -30))
    ) {
      const deals = await crm(
        req,
        'Deals/search?criteria=' +
          esc('(Contact_Name:equals:' + contact.id + ')') +
          '&fields=' +
          esc('Stage,Start_Date'),
      );
      renewed = deals.some(d => d.Stage === 'Active' && d.Start_Date && d.Start_Date > policy.endDate);
    }
    const country = (policy && policy.premises && policy.premises[0] && policy.premises[0].country) || 'United Kingdom';
    const inline = [];
    const out = [];
    for (const rev of revisions) {
      const { change: asked, quote } = rev;
      const reasons = [...quote.reasons];
      if (renewed && asked.effectiveDate > addDays(policy.endDate, -30))
        reasons.push({
          code: 'RENEWED',
          message:
            'Your policy has already been renewed, so this change also affects your renewal. The office will make it for you: save your request and they will be in touch.',
        });
      // The underwriting rules on the policy as it will be, and the risk checks on any name being added.
      const ins = insChange.afterIns({ cover: rev.cover, change: asked });
      const rules = policy ? insurance.evaluateRules(ins, country, { complete: !input.quote }) : { results: [] };
      // The answers still missing before a change can be saved as payable (the repeated declarations and confirmations).
      const incomplete = policy
        ? insurance
            .evaluateRules(ins, country, { complete: true })
            .results.filter(r => r.status === 'INCOMPLETE')
            .map(r => r.customerMessage)
        : [];
      let screening = { results: [], riskMessage: null };
      if (risk && asked.addPeople.length)
        screening = await risk.screen({
          req,
          ins: { ...ins, insNamedPeople: asked.addPeople },
          country,
          contact,
          input,
          premises: false,
        });
      const merged = insurance.summarise([
        ...rules.results,
        ...screening.results,
        ...reasons.map(r => ({ status: 'REFER', code: r.code, customerMessage: r.message })),
      ]);
      const blocked =
        merged.overall === 'PASS' || (merged.overall === 'INCOMPLETE' && input.quote)
          ? null
          : {
              status: merged.overall,
              reasons: [...new Set(merged.results.map(r => r.customerMessage))],
              riskMessage: screening.riskMessage,
            };
      const details = {
        quoteId: policy ? insChange.quoteId({ cover: rev.cover, change: asked, quote }) : null,
        rulesVersion: quote.rulesVersion,
        incomplete,
        outcome: blocked ? blocked.status : 'PASS',
        effectiveDate: asked.effectiveDate,
        term: quote.term || null,
        items: quote.items.map(i => ({
          label: i.label,
          premiumPence: i.premiumPence,
          creditPence: i.creditPence,
          netPence: i.netPence,
        })),
        premiumNetPence: quote.premiumNetPence,
        iptPence: quote.iptPence,
        needsDeclarations: !insChange.isEmpty(asked),
      };
      const when = ' from ' + dayName(asked.effectiveDate);
      if (!blocked) {
        for (const it of quote.items)
          if (it.netPence > 0)
            inline.push({
              name: 'Insurance - ' + it.label + ' (' + it.days + ' of ' + it.totalDays + ' days)',
              unitPence: it.netPence,
              quantity: 1,
              sku: it.sku,
              rev: rev.index,
            });
        if (quote.iptPence)
          inline.push({
            name: 'Insurance Premium Tax (' + Math.round(insurance.IPT_RATE * 100) + '%)' + when,
            unitPence: quote.iptPence,
            quantity: 1,
            sku: insurance.IPT_SKU,
            rev: rev.index,
          });
        if (quote.employeesCharged)
          inline.push({
            name: ITEMS.employee_fee_non_salon.name + ' (pro-rata)' + when,
            priceItem: 'employee_fee_non_salon',
            quantity: quote.employeesCharged,
            prorata: quote.term,
            sku: ITEMS.employee_fee_non_salon.code,
            rev: rev.index,
          });
        if (quote.feeApplies)
          inline.push({
            name: ITEMS.mta_fee.name + when,
            priceItem: 'mta_fee',
            quantity: 1,
            sku: ITEMS.mta_fee.code,
            rev: rev.index,
          });
      }
      out.push({ rev, blocked, details, reasons, ins });
    }
    // Any revision that cannot be paid for online stops the whole basket: the member takes it out, or the office handles it.
    const worst = out.find(o => o.blocked);
    const blocked = worst
      ? {
          status: out.some(o => o.blocked && o.blocked.status === 'STOP')
            ? 'STOP'
            : out.some(o => o.blocked && o.blocked.status === 'REFER')
              ? 'REFER'
              : 'INCOMPLETE',
          reasons: [...new Set(out.flatMap(o => (o.blocked ? o.blocked.reasons : [])))],
          riskMessage: worst.blocked.riskMessage,
        }
      : null;
    const all = out.map(o => o.details);
    const details =
      all.length === 1
        ? all[0]
        : {
            ...all[0],
            quoteId: null,
            outcome: blocked ? blocked.status : 'PASS',
            revisionCount: all.length,
            premiumNetPence: all.reduce((t, d) => t + d.premiumNetPence, 0),
            iptPence: all.reduce((t, d) => t + d.iptPence, 0),
            incomplete: [...new Set(all.flatMap(d => d.incomplete))],
          };
    const revisionData = out.map(o => ({
      index: o.rev.index,
      cover: o.rev.cover,
      asked: o.rev.change,
      quote: o.rev.quote,
      details: o.details,
      outcome: o.details.outcome,
      reasons: o.blocked ? o.blocked.reasons : [],
    }));
    // A basket already waiting for payment (every revision Awaiting Payment on one open session) is resumed, not made again. Read only when
    // paying.
    let existingSessionId = null;
    if (!input.quote && policy && !blocked) {
      const rows = await crm(
        req,
        'Policy_Revisions/search?criteria=' +
          esc('(Policy:equals:' + policy.id + ')') +
          '&fields=' +
          esc('Revision_Status,After_Quote_ID,Stripe_Checkout_Session_ID'),
      );
      const found = revisionData.map(r =>
        rows.find(
          x =>
            x.After_Quote_ID === r.details.quoteId &&
            x.Revision_Status === 'Awaiting Payment' &&
            x.Stripe_Checkout_Session_ID,
        ),
      );
      const sessions = new Set(found.map(f => f && f.Stripe_Checkout_Session_ID));
      if (found.every(Boolean) && sessions.size === 1) existingSessionId = [...sessions][0];
    }
    return {
      lines: [],
      inline: blocked ? [] : inline,
      blocked,
      details,
      revisionDetails: all,
      // Set by the checkout from the writes and payment switches.
      payable: false,
      existingSessionId,
      createFailure: 'We could not save your change. Please try again.',
      revisions: revisionData,
      fingerprint: JSON.stringify([out.map(o => o.rev.change), out.map(o => o.details.quoteId)]),
      // Before the session: one revision for each start date, in order, each with its draft rows (or the one already saved for the same quote).
      beforePay: async (create, extra) => {
        const ids = new Map();
        const saved = [];
        for (const r of revisionData)
          saved.push(
            await saveRevision({
              ...r,
              ids,
              read: path => crm(req, path),
              create,
              update: extra.update,
              contactId: contact.id,
              dealId: String(input.recordId),
              lines: extra.lines,
              namePrefix: extra.namePrefix,
            }),
          );
        return { revisions: saved };
      },
      // After the session: each revision is Awaiting Payment with the session id.
      afterSession: (sessionId, ids, update) => markAwaitingPayment({ update, saved: ids.revisions, sessionId }),
      metadata: ({ total, inline: charged, insuranceIds }) => {
        const saved = (insuranceIds && insuranceIds.revisions) || [];
        const sum = pred => (charged || []).filter(pred).reduce((t, l) => t + l.totalPence, 0);
        const premium = sum(
          l =>
            l.sku !== ITEMS.mta_fee.code && l.sku !== ITEMS.employee_fee_non_salon.code && l.sku !== insurance.IPT_SKU,
        );
        const ipt = sum(l => l.sku === insurance.IPT_SKU);
        const fee = sum(l => l.sku === ITEMS.mta_fee.code);
        const feeNet = (charged || [])
          .filter(l => l.sku === ITEMS.mta_fee.code)
          .reduce((t, l) => t + Number(netPounds('mta_fee', l.totalPence, l.quantity)) * 100, 0);
        const employees = (charged || []).filter(l => l.sku === ITEMS.employee_fee_non_salon.code);
        const employeeNet = employees.reduce((t, l) => {
          const term = (revisionData.find(r => r.index === l.rev) || {}).details?.term;
          return (
            t +
            Number(netPounds('employee_fee_non_salon', l.totalPence, l.quantity, term ? term.days / term.total : 1)) *
              100
          );
        }, 0);
        const employeeGross = employees.reduce((t, l) => t + l.totalPence, 0);
        return {
          type: 'insurance_change',
          quote_reference: 'BGP-' + Date.now().toString(36).toUpperCase(),
          contact_id: contact.id,
          membership_deal_id: String(input.recordId),
          insurance_policy_id: policy ? policy.id : '',
          change_type: 'mta',
          mta_scope: 'policy',
          revision_count: String(saved.length),
          revision_ids: saved.map(r => r.id).join(','),
          effective_dates: revisionData.map(r => r.asked.effectiveDate).join(','),
          quote_ids: revisionData.map(r => r.details.quoteId).join(','),
          insurance_amount: pounds(premium + ipt),
          insurance_net_amount: pounds(premium),
          insurance_ipt_amount: pounds(ipt),
          mta_fee_amount: pounds(fee),
          named_employee_membership: employees.length
            ? JSON.stringify({
                count: employees.reduce((t, l) => t + l.quantity, 0),
                amount: pounds(employeeGross),
                amount_net: pounds(Math.round(employeeNet)),
              })
            : '',
          total_amount: total,
          total_amount_net: pounds(premium + ipt + Math.round(feeNet) + Math.round(employeeNet)),
        };
      },
    };
  },
};

const list = v => (Array.isArray(v) ? v : String(v || '').split(',')).map(x => String(x).trim()).filter(Boolean);

module.exports = {
  ITEMS,
  SERVICES,
  ADDONS,
  pounds,
  netPounds,
  ID,
  START_WINDOW_DAYS,
  PROCESSING_STATUS,
  isPaidStatus,
  isPayableAccreditation,
  membershipChangeOptions,
  oneMonthOn,
};
