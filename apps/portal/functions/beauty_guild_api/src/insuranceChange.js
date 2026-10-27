'use strict';
// The quote engine for a mid-term change to an insurance policy (MTA R3-1). It is pure: it reads the member's current cover (cover.js),
// prices the proposed change over the rest of the policy and says whether it can be paid for online. It writes nothing, calls nothing
// and takes no payment. Slice: Non-Salon policies paid yearly; add or swap people, add treatments, teaching, equipment or Employers'
// Liability, and raise equipment or Employers' Liability. Everything else, and anything whose current level cannot be verified, is a
// REFER: the member is told to call the office and the request is saved (spec sections 5, 7A and 12).
//
// Rules (Guild, 26 and 27 October 2026): pro-rata is the days left over the days on the policy, both end days counted (prorata.js);
// premium is rounded to the penny, then IPT at 12% once on the net total; the GBP 5 adjustment fee is charged on every online change; an
// added employee also pays the pro-rated membership fee; a like-for-like swap carries the membership fee over; an increase credits what
// was paid for the old level, pro-rated, not today's table; a refund of any kind goes to the office.
const crypto = require('node:crypto');
const insurance = require('./insurance');
const { prorata, prorate } = require('./prorata');

const RULES_VERSION = 'mta-r3-1';
const MAX_PEOPLE = 4;
const EQUIPMENT_TIERS = [5000, 10000, 15000, 20000];
const EL_TIERS = [1, 3, 5];
const TREATMENT_IDS = insurance.TREATMENT_EXTENSIONS.map(t => t.id);
const NAMED = { employee: 'NAMED_EMPLOYEES', subcontractor: 'NAMED_SUBCONTRACTORS' };
const day = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));
// The day before a date: a replaced row or a removed person is covered up to and including this day, and the new cover starts on the date,
// so cover is continuous with no overlap and both end days count (the same as the pro-rata).
const dayBefore = iso => new Date(Date.parse(iso + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
const text = (v, max = 60) =>
  String(v == null ? '' : v)
    .trim()
    .slice(0, max);
const list = v => (Array.isArray(v) ? v : []);

// What the browser sent, cleaned into a fixed shape. Unknown keys are dropped, and nothing in it is a price.
function cleanChange(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const tier = (v, allowed) => (allowed.includes(Number(v)) ? Number(v) : 0);
  return {
    effectiveDate: day(r.effectiveDate) ? r.effectiveDate : '',
    addPeople: list(r.addPeople)
      .slice(0, 10)
      .map(p => ({
        type: p && p.type === 'subcontractor' ? 'subcontractor' : 'employee',
        firstName: text(p && p.firstName),
        lastName: text(p && p.lastName),
      })),
    removePeople: [...new Set(list(r.removePeople).map(String))].slice(0, 10),
    treatments: [...new Set(list(r.treatments).map(String))].filter(id => TREATMENT_IDS.includes(id)),
    teaching: r.teaching === 'standard' || r.teaching === 'additional' ? r.teaching : '',
    equipmentTier: tier(r.equipmentTier, EQUIPMENT_TIERS),
    elTier: tier(r.elTier, EL_TIERS),
    // The member repeats the declarations and the four confirmations; the rules read them (insurance.evaluateRules).
    declarations: list(r.declarations).slice(0, 7).map(String),
    qualified: r.qualified === 'yes' || r.qualified === 'no' ? r.qualified : '',
    patchTesting: r.patchTesting === 'yes' || r.patchTesting === 'no' ? r.patchTesting : '',
    confirmations: {
      insInformationAccurate:
        r.insInformationAccurate === 'yes' || r.insInformationAccurate === 'no' ? r.insInformationAccurate : '',
      insEthicsAccepted: r.insEthicsAccepted === 'yes' || r.insEthicsAccepted === 'no' ? r.insEthicsAccepted : '',
      insDemandsNeedsAccepted:
        r.insDemandsNeedsAccepted === 'yes' || r.insDemandsNeedsAccepted === 'no' ? r.insDemandsNeedsAccepted : '',
      insNonAdvisedAccepted:
        r.insNonAdvisedAccepted === 'yes' || r.insNonAdvisedAccepted === 'no' ? r.insNonAdvisedAccepted : '',
    },
  };
}
const isEmpty = c =>
  !c.addPeople.length && !c.removePeople.length && !c.treatments.length && !c.teaching && !c.equipmentTier && !c.elTier;

// The premium of a set of covers, from the same rating as a new quote (insurance.calculateQuote), without the Medical Malpractice row.
// Returns { CODE: { pence, sku } }. Equipment depends on the premises construction.
function rate({ people = [], treatments = [], teaching = '', equipmentTier = 0, elTier = 0, nonStandard = false }) {
  const ins = insurance.clean({
    insNamedPeopleCover: people.length > 0,
    insNamedPeople: people,
    insTreatmentExtensions: treatments,
    insTeachingCover: teaching,
    insEquipmentTier: equipmentTier,
    insStandardConstruction: nonStandard ? 'no' : 'yes',
    insNonSalonEL: elTier > 0,
    insNonSalonELTier: elTier,
  });
  const out = {};
  for (const row of insurance.calculateQuote(ins).rows)
    if (row.code !== 'MEDMAL') out[row.code] = { pence: row.premiumPence, sku: row.sku };
  return out;
}
// One cover's rate and its price list code.
const price = (args, code) => rate(args)[code] || { pence: 0, sku: null };

const daysInclusive = (from, to) => (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 864e5 + 1;
// What a cover row costs for a whole year. A row added by an earlier change was charged only from its start date, so its recorded premium
// is scaled up by the days of the policy over the days the row covers. A row that runs from the start of the policy is already a year.
function annualPence(row, policy) {
  const from = row.effectiveFrom,
    to = row.effectiveTo || policy.endDate;
  if (!from || !policy.startDate || !policy.endDate || from <= policy.startDate || !to || to < from)
    return row.netPence;
  return Math.round((row.netPence * daysInclusive(policy.startDate, policy.endDate)) / daysInclusive(from, to));
}

function quoteChange({ cover, change, today }) {
  const reasons = [];
  const refer = (code, message) => reasons.push({ code, message });
  const insuranceCover = cover && cover.insurance;
  const base = { rulesVersion: RULES_VERSION, effectiveDate: change.effectiveDate, items: [], endings: [], reasons };
  if (!insuranceCover) {
    refer('NO_POLICY', 'We could not find a current insurance policy on this membership.');
    return {
      ...base,
      outcome: 'REFER',
      premiumNetPence: 0,
      iptPence: 0,
      employeesCharged: 0,
      feeApplies: false,
      term: null,
      today,
    };
  }
  if (insuranceCover.route !== 'non_salon')
    refer('SALON_NOT_ONLINE', 'Changes to a Salon policy cannot be made online yet. Please call the office.');
  if (insuranceCover.paymentFrequency !== 'Annual')
    refer(
      'PAYMENT_PLAN',
      'Changes to a policy paid monthly, or whose payment plan we cannot confirm, are made by the office.',
    );
  if (!insuranceCover.startDate || !insuranceCover.endDate)
    refer('POLICY_DATES', 'We could not confirm the dates of your policy. Please call the office.');
  if (isEmpty(change)) refer('NOTHING_CHOSEN', 'Choose the change you would like to make.');

  const term = prorata({
    start: insuranceCover.startDate || change.effectiveDate,
    end: insuranceCover.endDate || change.effectiveDate,
    from:
      change.effectiveDate > (insuranceCover.startDate || '')
        ? change.effectiveDate
        : insuranceCover.startDate || change.effectiveDate,
  });
  const nonStandard = (insuranceCover.premises || []).some(p => p.standardConstruction === 'no');
  const covers = insuranceCover.covers || [];
  const annual = row => annualPence(row, insuranceCover);
  const byCode = code => covers.find(c => c.code === code);
  const people = insuranceCover.people || [];
  const items = [];
  const add = (code, label, priced, creditPence = 0, extra = {}) => {
    items.push({
      ...extra,
      code,
      label,
      sku: priced.sku,
      premiumPence: prorate(priced.pence, term),
      creditPence: prorate(creditPence, term),
      days: term.days,
      totalDays: term.total,
    });
  };

  // ---- People: additions, and swaps (a removal with an addition). A removal on its own is a refund, so it goes to the office.
  const added = change.addPeople;
  const removed = change.removePeople.map(id => people.find(p => p.id === id));
  if (removed.some(p => !p))
    refer('UNKNOWN_PERSON', 'We could not find one of the people you want to remove. Please call the office.');
  const gone = removed.filter(Boolean);
  const pairs = [];
  const unmatched = [...added];
  for (const p of gone) {
    const i = unmatched.findIndex(a => a.type === p.type);
    if (i >= 0) pairs.push([p, unmatched.splice(i, 1)[0]]);
  }
  const unpairedGone = gone.filter(p => !pairs.some(([g]) => g === p));
  // A removed employee replaced by a subcontractor gives up a membership fee for a smaller premium: a refund. A removed subcontractor
  // replaced by an employee is a payment, and the employee pays the membership fee. Anything else removed is a refund.
  const crossed = [];
  for (const p of unpairedGone) {
    const i = unmatched.findIndex(a => a.type !== p.type);
    if (i >= 0 && p.type === 'subcontractor') crossed.push([p, unmatched.splice(i, 1)[0]]);
  }
  if (unpairedGone.some(p => !crossed.some(([g]) => g === p)))
    refer('REMOVAL', 'Removing a person may mean a refund, which the office works out. Please call the office.');
  const remaining = people.length - gone.length + added.length;
  if (remaining > MAX_PEOPLE)
    refer(
      'NAMED_PEOPLE_LIMIT',
      'More than four people on a policy are reviewed by the Insurance team. Please call the office.',
    );
  let employeesCharged = 0;
  const rowFor = person => covers.find(c => c.personId === person.id && /NAMED_/.test(c.code || ''));
  for (const [out, inn] of pairs) {
    const old = rowFor(out);
    const code = NAMED[inn.type];
    const now = price({ people: [inn] }, code);
    if (!old || old.netPence == null) {
      refer(
        'UNVERIFIED_PERSON',
        'We could not confirm what was paid for the person you are replacing. Please call the office.',
      );
      continue;
    }
    add(
      code,
      'Replace ' + out.name + ' with ' + [inn.firstName, inn.lastName].filter(Boolean).join(' '),
      now,
      annual(old),
      { kind: 'swap', replacesId: old.id, person: inn, removePersonId: out.id },
    );
    // The membership fee carries over when an employee replaces an employee: nothing is charged or credited.
  }
  for (const [out, inn] of crossed) {
    const old = rowFor(out);
    const now = price({ people: [inn] }, NAMED[inn.type]);
    if (!old || old.netPence == null) {
      refer(
        'UNVERIFIED_PERSON',
        'We could not confirm what was paid for the person you are replacing. Please call the office.',
      );
      continue;
    }
    add(
      NAMED[inn.type],
      'Replace ' + out.name + ' with ' + [inn.firstName, inn.lastName].filter(Boolean).join(' '),
      now,
      annual(old),
      { kind: 'swap', replacesId: old.id, person: inn, removePersonId: out.id },
    );
    employeesCharged += inn.type === 'employee' ? 1 : 0;
  }
  for (const inn of unmatched) {
    add(
      NAMED[inn.type],
      'Add ' + inn.type + ' ' + [inn.firstName, inn.lastName].filter(Boolean).join(' '),
      price({ people: [inn] }, NAMED[inn.type]),
      0,
      { kind: 'add', person: inn },
    );
    employeesCharged += inn.type === 'employee' ? 1 : 0;
  }
  for (const inn of added)
    if (!inn.firstName || !inn.lastName)
      refer('PERSON_NAME', 'Enter the first name and surname of each person you add.');

  // ---- Treatments and teaching
  const heldTreatments = covers
    .filter(c => /^TREATMENT_/.test(c.code || ''))
    .map(c => c.code.slice('TREATMENT_'.length).toLowerCase());
  for (const id of change.treatments) {
    const key = 'TREATMENT_' + id.toUpperCase();
    add(key, insurance.TREATMENT_EXTENSIONS.find(t => t.id === id).name, price({ treatments: [id] }, key), 0, {
      kind: 'add',
    });
  }
  const treatmentsAfter = new Set([...heldTreatments, ...change.treatments]);
  if (change.teaching === 'standard' && !byCode('TEACHING') && !byCode('TEACHING_PLUS'))
    add('TEACHING', 'Teaching + Student Cover', price({ teaching: 'standard' }, 'TEACHING'), 0, { kind: 'add' });
  if (change.teaching === 'additional' && !byCode('TEACHING_PLUS')) {
    const old = byCode('TEACHING');
    if (old && old.netPence == null)
      refer(
        'UNVERIFIED_COVER',
        'We could not confirm what was paid for your current teaching cover. Please call the office.',
      );
    else
      add(
        'TEACHING_PLUS',
        'Teaching + Student Cover + Additional Treatments' + (old ? ' (replacing standard teaching)' : ''),
        price({ teaching: 'additional' }, 'TEACHING_PLUS'),
        old ? annual(old) : 0,
        { kind: old ? 'increase' : 'add', replacesId: old ? old.id : undefined },
      );
  }

  // ---- Equipment: only a verified increase goes online. New equipment needs the premises details, which are not collected here yet.
  if (change.equipmentTier) {
    const held = byCode('BUSINESS_EQUIPMENT');
    if (!held)
      refer('PREMISES_NEEDED', 'Adding business equipment needs your premises details. Please call the office.');
    else if (!EQUIPMENT_TIERS.includes(held.sumInsured) || held.netPence == null)
      refer('UNVERIFIED_COVER', 'We could not confirm your current business equipment level. Please call the office.');
    else if (change.equipmentTier < held.sumInsured)
      refer('DOWNGRADE', 'Reducing cover may mean a refund, which the office works out. Please call the office.');
    else if (change.equipmentTier > held.sumInsured)
      add(
        'BUSINESS_EQUIPMENT',
        'Business Equipment increased to £' + change.equipmentTier.toLocaleString('en-GB'),
        price({ equipmentTier: change.equipmentTier, nonStandard }, 'BUSINESS_EQUIPMENT'),
        annual(held),
        { kind: 'increase', replacesId: held.id, sumInsured: change.equipmentTier },
      );
  }
  // ---- Employers' Liability
  if (change.elTier) {
    const held = byCode('EMPLOYERS_LIABILITY');
    if (!held)
      add(
        'EMPLOYERS_LIABILITY',
        "Employers' Liability up to " + change.elTier,
        price({ elTier: change.elTier }, 'EMPLOYERS_LIABILITY'),
        0,
        { kind: 'add', elTier: change.elTier },
      );
    // A held Employers' Liability level is never verified online: Cover_Option's picklist has no real tiers yet (Guild CRM, 27 October), so an
    // increase goes to the office until the pricing tiers are mapped to it.
    else
      refer(
        'EL_OFFICE',
        "Changes to your Employers' Liability level are made by the office for now. Please call the office.",
      );
  }
  // A choice that changes nothing (the same level, or cover already held) is not a change.
  for (const id of change.treatments)
    if (heldTreatments.includes(id)) refer('ALREADY_HELD', 'You already have one of the treatments you chose.');
  if (change.teaching === 'additional' && !treatmentsAfter.size)
    refer('TEACHING_NEEDS_TREATMENT', 'Teaching with additional treatments needs a treatment extension.');

  // ---- Money. Credits are taken off the item they belong to; what is left of a credit comes off the other items in order.
  let credit = 0;
  for (const it of items) {
    it.netPence = it.premiumPence - it.creditPence;
    if (it.netPence < 0) {
      credit += -it.netPence;
      it.netPence = 0;
    }
  }
  for (const it of items) {
    const use = Math.min(it.netPence, credit);
    it.netPence -= use;
    credit -= use;
  }
  if (credit > 0)
    refer('REFUND', 'This change would leave a refund, which the office works out. Please call the office.');
  const premiumNetPence = items.reduce((t, it) => t + it.netPence, 0);
  const iptPence = Math.round(premiumNetPence * insurance.IPT_RATE);

  // What Creator ends when it applies the revision: each replaced cover row and each removed person, covered up to the day before the new
  // cover starts. Nothing is ended here; the portal never edits live cover.
  const lastDay = dayBefore(change.effectiveDate);
  const endings = [
    ...items
      .filter(i => i.replacesId)
      .map(i => ({ module: 'Insurance_Extension', id: i.replacesId, effectiveTo: lastDay })),
    ...items
      .filter(i => i.removePersonId)
      .map(i => ({ module: 'Insured_People', id: i.removePersonId, effectiveTo: lastDay })),
  ];
  const outcome = reasons.length ? 'REFER' : 'PASS';
  return {
    ...base,
    items,
    endings,
    outcome,
    premiumNetPence,
    iptPence,
    employeesCharged,
    feeApplies: !isEmpty(change),
    term: { days: term.days, total: term.total },
    today,
  };
}

// What the rules (insurance.evaluateRules) need to see: the policy as it will be after the change, with the member's repeated answers.
function afterIns({ cover, change }) {
  const insuranceCover = cover.insurance;
  const gone = new Set(change.removePeople);
  const keep = (insuranceCover.people || [])
    .filter(p => !gone.has(p.id))
    .map(p => ({ type: p.type, firstName: p.name, lastName: '' }));
  const after = [...keep, ...change.addPeople];
  const held = (insuranceCover.covers || [])
    .filter(c => /^TREATMENT_/.test(c.code || ''))
    .map(c => c.code.slice(10).toLowerCase());
  const premises = (insuranceCover.premises || [])[0] || {};
  return insurance.clean({
    insNamedPeopleCover: after.length > 0,
    insNamedPeople: after,
    insTreatmentExtensions: [...new Set([...held, ...change.treatments])],
    insTeachingCover: change.teaching,
    insEquipmentTier:
      change.equipmentTier || (insuranceCover.covers || []).find(c => c.code === 'BUSINESS_EQUIPMENT')?.sumInsured || 0,
    insStandardConstruction: premises.standardConstruction || '',
    insNonStandardOver15: premises.nonStandardOver15 || '',
    insNonSalonEL: Boolean(change.elTier) || (insuranceCover.covers || []).some(c => c.code === 'EMPLOYERS_LIABILITY'),
    insNonSalonELTier: change.elTier,
    insDeclarations: change.declarations,
    insQualifiedForTreatments: change.qualified,
    insPatchTesting: change.patchTesting,
    ...change.confirmations,
  });
}

// Changes with the same start date are one revision (one set of documents, one GBP 5): their answers are combined. Several dates are
// several revisions, in date order, at most MAX_REVISIONS.
const MAX_REVISIONS = 3;
function mergeSameDate(changes) {
  const byDate = new Map();
  for (const c of changes) {
    const m = byDate.get(c.effectiveDate);
    if (!m) {
      byDate.set(c.effectiveDate, {
        ...c,
        addPeople: [...c.addPeople],
        removePeople: [...c.removePeople],
        treatments: [...c.treatments],
      });
      continue;
    }
    m.addPeople.push(...c.addPeople);
    m.removePeople = [...new Set([...m.removePeople, ...c.removePeople])];
    m.treatments = [...new Set([...m.treatments, ...c.treatments])];
    m.teaching = c.teaching || m.teaching;
    m.equipmentTier = Math.max(m.equipmentTier, c.equipmentTier);
    m.elTier = Math.max(m.elTier, c.elTier);
    m.declarations = m.declarations.length ? m.declarations : c.declarations;
    m.qualified = m.qualified || c.qualified;
    m.patchTesting = m.patchTesting || c.patchTesting;
    m.confirmations = {
      ...c.confirmations,
      ...Object.fromEntries(Object.entries(m.confirmations).filter(([, v]) => v)),
    };
  }
  return [...byDate.values()].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

// The cover as it will be once a quoted change is applied: replaced rows and removed people gone, and a pending row (and person) for each
// item, so a later change in the same basket is priced against it. Pending ids are replaced by the real draft ids when the revisions are saved.
function applyChange(cover, quote, change, index) {
  const policy = cover.insurance;
  const gone = new Set(quote.items.filter(i => i.replacesId).map(i => i.replacesId));
  const goneP = new Set(change.removePeople);
  const covers = (policy.covers || []).filter(c => !gone.has(c.id));
  const people = (policy.people || []).filter(p => !goneP.has(p.id));
  quote.items.forEach((it, k) => {
    const id = 'pending:' + index + ':' + k;
    let personId = null;
    if (it.person) {
      personId = id + ':person';
      people.push({
        id: personId,
        name: [it.person.firstName, it.person.lastName].filter(Boolean).join(' '),
        type: it.person.type,
      });
    }
    covers.push({
      id,
      code: it.code,
      netPence: it.premiumPence,
      sumInsured: it.sumInsured || null,
      option: null,
      personId,
      effectiveFrom: change.effectiveDate,
      effectiveTo: policy.endDate,
    });
  });
  return { ...cover, insurance: { ...policy, covers, people } };
}

// A basket of changes: one revision per start date, in date order, each priced against the cover as it will be after the earlier ones.
// A revision that is referred is not applied to the cover the next one sees.
function quoteBasket({ cover, changes, today }) {
  const revisions = [];
  let current = cover;
  mergeSameDate(changes).forEach((change, index) => {
    const quote = quoteChange({ cover: current, change, today });
    revisions.push({ change, quote, cover: current, index });
    if (quote.outcome === 'PASS') current = applyChange(current, quote, change, index);
  });
  return revisions;
}

// A reference for this quote, so a payment can be checked against exactly what was quoted. The same cover and the same change on the
// same day give the same reference; a change to the policy, the change or the rules gives a different one.
function quoteId({ cover, change, quote }) {
  const basis = {
    v: RULES_VERSION,
    policy: cover.insurance && cover.insurance.id,
    covers: ((cover.insurance && cover.insurance.covers) || [])
      .map(c => [c.id, c.code, c.netPence, c.sumInsured])
      .sort(),
    people: ((cover.insurance && cover.insurance.people) || []).map(p => p.id).sort(),
    change: {
      ...change,
      declarations: undefined,
      confirmations: undefined,
      qualified: undefined,
      patchTesting: undefined,
    },
    day: quote.today,
    net: quote.premiumNetPence,
  };
  return 'QC-' + crypto.createHash('sha256').update(JSON.stringify(basis)).digest('hex').slice(0, 16).toUpperCase();
}

module.exports = {
  MAX_REVISIONS,
  mergeSameDate,
  applyChange,
  quoteBasket,
  annualPence,
  dayBefore,
  RULES_VERSION,
  MAX_PEOPLE,
  EQUIPMENT_TIERS,
  EL_TIERS,
  cleanChange,
  isEmpty,
  quoteChange,
  afterIns,
  quoteId,
  rate,
};
