'use strict';
// What members can pay for. Books is the source of truth for prices and keeps Stripe in step, so
// nothing here holds an amount: each ITEM points at a Stripe price by its lookup key (the price list code),
// and the checkout reads the live amount from Stripe. To add a new item, add it here and give its Stripe
// price the matching lookup key. To add a new service, add an entry to SERVICES: it says who
// may pay (ownership), which items to charge, and the metadata Creator expects after payment.
const { HttpError } = require('./errors');
const insurance = require('./insurance');
const { joiningFeeDue, discountsMetadata, NOT_DUE } = require('./discounts');

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

// Insurance is rated here, not read from Stripe: each cover row and the IPT become inline price_data lines.
// Nothing is created in the CRM until the member pays (beforePay runs on checkout only, never on a quote),
// and a quote that needs the Insurance team (REFER) or cannot be offered online (STOP) is never payable.
async function insuranceLines({ req, contact, input, member, risk, start, end }) {
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
  async prepare({ req, crm, contact, input, user, risk, discounts }) {
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
      previousExpiry = null,
      change = 'new';
    if (input.previousId) {
      if (!contact || !ID.test(String(input.previousId))) notFound('Membership');
      const deal = (await crm(req, 'Deals/' + input.previousId + '?fields=Contact_Name,Expiry_Date'))[0];
      if (!deal || String(deal.Contact_Name?.id) !== String(contact.id)) notFound('Membership');
      previous = String(input.previousId);
      previousExpiry = deal.Expiry_Date || null;
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
    // The joining fee is charged to a new person, and (with discounts on) to someone whose last membership expired more than 30 days ago.
    const feeDue = joiningFeeDue({ previous, expiry: previousExpiry, today, rule: Boolean(discounts) });
    // A school referral code takes the joining fee off. The line is left out here, before plans.splitMonthly runs, so yearly and monthly are exact.
    let discount = null,
      codeResult = null;
    if (discounts && feeDue && input.code) {
      const checked = await discounts.check({ req, raw: input.code, userId: user?.id, guest: !user });
      if (checked.status === 'ok') {
        discount = { code: checked.code, school: checked.school, indicative: checked.indicative };
        codeResult = { status: 'applied', code: checked.code, indicative: checked.indicative };
      } else codeResult = { status: checked.status, message: checked.message };
    } else if (discounts && !feeDue && input.code) codeResult = { status: 'not_due', message: NOT_DUE };
    if (feeDue && !discount) lines.push({ item: 'joining_fee', quantity: 1, term: 'year_one' });
    if (secondary.length) lines.push({ item: 'membership_branch', quantity: secondary.length, term: 'ongoing' });
    for (const [key, quantity] of Object.entries(addons)) lines.push({ item: ADDONS[key], quantity, term: 'year_one' });
    if (input.insurance && level === 'associate') throw NEEDS_FULL();
    // One date covers both: the membership and its insurance start together.
    const ins = input.insurance
      ? await insuranceLines({ req, contact, input, member, risk, start, end: expiry })
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
      // What the checkout needs to price, show and record the code (see checkout.js).
      joiningFee: discounts ? { due: feeDue } : null,
      discount,
      codeResult,
      metadata: ({ lines: priced, total, insuranceIds, fees, discountsEntry, quoteReference }) => {
        const by = item => priced.find(l => l.item === item);
        const gross = item => (by(item) ? pounds(by(item).totalPence) : '0.00');
        const netOf = l => netPounds(l.item, l.totalPence, l.origQuantity ?? l.quantity, l.scale ?? 1);
        const net = item => (by(item) ? netOf(by(item)) : '0.00');
        const base = priced[0].item;
        const totalNet = priced.reduce((t, l) => t + Number(netOf(l)), 0).toFixed(2);
        return {
          type: ins ? 'membership_insurance' : 'membership',
          quote_reference: quoteReference || 'BGP-' + Date.now().toString(36).toUpperCase(),
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
          ...(discountsEntry ? { discounts: discountsEntry } : {}),
          total_amount: total,
          total_amount_net: (Number(totalNet) + (ins ? ins.quote.totalPence / 100 + fees.netPence / 100 : 0)).toFixed(
            2,
          ),
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
};
