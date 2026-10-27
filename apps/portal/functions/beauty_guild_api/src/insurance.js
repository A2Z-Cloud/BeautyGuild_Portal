'use strict';
// Insurance rating, underwriting rules and CRM record creation, ported from V1
// (beauty-guild-catalyst: calculateInsuranceQuote, evaluateInsuranceRules, createInsuranceRecords).
// Premiums are computed, not catalogue prices, so checkout lines use inline price_data. Everything
// the browser sends is cleaned into a fixed shape first (clean), and nothing it says about price,
// route or eligibility is trusted: the server rates and rules on the cleaned answers only.
const IPT_RATE = 0.12;
const TREATMENT_EXTENSIONS = Object.freeze([
  {
    id: 'advanced_electrolysis',
    name: 'Red Veins, Skin Tags, Milia, Warts & Moles by Advanced Electrolysis',
    premium: 30,
  },
  { id: 'microneedling', name: 'Microneedling or Dermarolling', premium: 179.25 },
  { id: 'piercing', name: 'Nose and Cartilage Piercing', premium: 14.15 },
  { id: 'spmu', name: 'Microblading, Semi-Permanent Make Up & Micropigmentation', premium: 179.25 },
  { id: 'dermaplaning', name: 'Dermaplaning', premium: 179.25 },
]);
// The Books SKU of each treatment extension.
const TREATMENT_SKU = Object.freeze({
  advanced_electrolysis: 'INS-EXT-ELEC',
  microneedling: 'INS-EXT-NEEDLE',
  piercing: 'INS-EXT-PIERCE',
  spmu: 'INS-EXT-SPMU',
  dermaplaning: 'INS-EXT-DERMA',
});
const IPT_SKU = 'INS-IPT';
const NON_SALON_EQUIPMENT = Object.freeze([
  { value: 0, premium: 0 },
  { value: 5000, premium: 65 },
  { value: 10000, premium: 100 },
  { value: 15000, premium: 150 },
  { value: 20000, premium: 200 },
]);
const NON_SALON_EQUIPMENT_NON_STANDARD = Object.freeze([
  { value: 0, premium: 0 },
  { value: 5000, premium: 97.5 },
  { value: 10000, premium: 150 },
  { value: 15000, premium: 225 },
  { value: 20000, premium: 300 },
]);
const NON_SALON_EL = Object.freeze([
  { value: 1, premium: 75 },
  { value: 3, premium: 120 },
  { value: 5, premium: 150 },
]);
// Expected answers to the seven underwriting declarations; any other answer is a REFER.
const DECLARATION_EXPECTED = Object.freeze(['no', 'no', 'no', 'no', 'no', 'yes', 'yes']);
// Cover row code -> Insurance_Extension.Cover_Type (an exact-match CRM picklist).
const COVER_TYPE_BY_CODE = Object.freeze({
  MEDMAL: 'MedMal',
  NAMED_EMPLOYEES: 'Named Person',
  NAMED_SUBCONTRACTORS: 'Named Person',
  TEACHING: 'Teaching',
  TEACHING_PLUS: 'Teaching',
  BUSINESS_EQUIPMENT: 'Equipment',
  EMPLOYERS_LIABILITY: 'Employers Liability',
  CONTENTS: 'Contents',
  MONEY: 'Money',
  BUILDINGS: 'Buildings',
  BUSINESS_INTERRUPTION: 'Business Interruption',
  PROPERTY_AWAY: 'Property Away',
});
const PROPERTY_CODES = ['CONTENTS', 'MONEY', 'BUILDINGS', 'BUSINESS_INTERRUPTION', 'PROPERTY_AWAY'];
const BUSINESS_DESCRIPTION_BY_FLAG = Object.freeze({
  insWorkingFromHome: 'I work from home',
  insMobile: 'I work on a mobile basis',
  insRentedRoom: 'I solely occupy a treatment room within a salon, Fitness/leisure or other commercial establishment',
  insSubcontractor: 'I am a self-employed subcontractor within a multi-therapist salon',
  insSalon: 'I own/operate a salon in a commercial/retail premises',
});

const FLAGS = [
  'insWorkingFromHome',
  'insMobile',
  'insRentedRoom',
  'insSubcontractor',
  'insSalon',
  'insNamedPeopleCover',
  'insContents',
  'insMoneyCover',
  'insBuildingsCover',
  'insBiCover',
  'insPropertyAwayCover',
  'insSalonEL',
  'insNonSalonEL',
];
const MONEY_KEYS = [
  'insTurnover',
  'insWageRoll',
  'insSalonCount',
  'insComputers',
  'insEquipment',
  'insStock',
  'insGeneralContents',
  'insTenantImprovements',
  'insRentPayable',
  'insBuildingsSI',
  'insFixturesSI',
  'insRentReceivableSI',
  'insBiIncome',
  'insBiDebts',
  'insPropertyAwaySI',
  'insPropertyAwayMaxItem',
];
const YES_NO_KEYS = [
  'insWageRollOver125k',
  'insStandardConstruction',
  'insNonStandardOver15',
  'insMultipleAddresses',
  'insSoleOccupation',
  'insUnoccupiedDeclaration',
  'insFlatRoof',
  'insFloodHistory',
  'insSubsidenceHistory',
  'insBasement',
  'insBuildingsSubsidenceDeclaration',
  'insQualifiedForTreatments',
  'insPatchTesting',
  'insInformationAccurate',
  'insEthicsAccepted',
  'insDemandsNeedsAccepted',
  'insNonAdvisedAccepted',
];
const MAX_PEOPLE = 10;
const yesNo = v => (v === 'yes' || v === 'no' ? v : '');
const num = v => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 1e9) : 0;
};
const text = (v, max = 100) =>
  String(v == null ? '' : v)
    .trim()
    .slice(0, max);
const positive = v => Math.max(0, Number(v || 0));

// Browser answers -> the fixed shape the rating and rules read. Unknown keys are dropped. The
// route is derived (a salon owner is "salon"), never taken from the request.
function clean(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const ins = {};
  for (const k of FLAGS) ins[k] = r[k] === true || r[k] === 'true' || r[k] === 'yes';
  for (const k of MONEY_KEYS) ins[k] = num(r[k]);
  for (const k of YES_NO_KEYS) ins[k] = yesNo(r[k]);
  ins.insRoute = ins.insSalon ? 'salon' : 'non_salon';
  ins.insSalonCount = ins.insSalon ? Math.max(1, Math.floor(ins.insSalonCount) || 1) : 0;
  ins.insTeachingCover =
    r.insTeachingCover === 'standard' || r.insTeachingCover === 'additional' ? r.insTeachingCover : '';
  ins.insEquipmentTier = Number(r.insEquipmentTier) || 0;
  ins.insNonSalonELTier = Number(r.insNonSalonELTier) || 0;
  const ext = Array.isArray(r.insTreatmentExtensions) ? r.insTreatmentExtensions : [];
  ins.insTreatmentExtensions = [...new Set(ext.map(String))].filter(id => TREATMENT_EXTENSIONS.some(t => t.id === id));
  const people = Array.isArray(r.insNamedPeople) ? r.insNamedPeople.slice(0, MAX_PEOPLE) : [];
  ins.insNamedPeople = people.map(p => ({
    type: p && p.type === 'subcontractor' ? 'subcontractor' : 'employee',
    firstName: text(p && p.firstName, 60),
    lastName: text(p && p.lastName, 60),
  }));
  const decl = Array.isArray(r.insDeclarations) ? r.insDeclarations : [];
  ins.insDeclarations = DECLARATION_EXPECTED.map((_, i) => yesNo(decl[i]));
  const a = r.insPremisesAddress && typeof r.insPremisesAddress === 'object' ? r.insPremisesAddress : {};
  ins.insPremisesAddress = {
    l1: text(a.l1),
    l2: text(a.l2),
    town: text(a.town),
    county: text(a.county),
    postcode: text(a.postcode, 12),
    country: text(a.country),
  };
  return ins;
}

const salonMedMal = turnover => {
  const t = Number(turnover || 0);
  return t <= 100000 ? 75 : t <= 175000 ? 100 : t <= 250000 ? 150 : null;
};
function territory(country) {
  const c = String(country || '')
    .trim()
    .toLowerCase();
  if (
    !c ||
    c === 'united kingdom' ||
    c === 'uk' ||
    c === 'great britain' ||
    ['england', 'scotland', 'wales', 'northern ireland'].includes(c)
  )
    return 'uk';
  if (c.includes('channel island') || c === 'jersey' || c === 'guernsey') return 'ci';
  if (c === 'isle of man') return 'iom';
  return 'other';
}
const personName = p => (p.firstName + ' ' + p.lastName).trim();
const propertyRequired = ins =>
  ins.insRoute === 'salon' &&
  (ins.insContents || ins.insMoneyCover || ins.insBuildingsCover || ins.insBiCover || ins.insPropertyAwayCover);
const namedPeople = ins => (ins.insNamedPeopleCover ? ins.insNamedPeople : []);
// Every named employee, salon or not, pays a membership fee on top of any premium. Subcontractors pay none.
const employeeCount = ins => namedPeople(ins).filter(p => p.type !== 'subcontractor').length;

// Rates the cleaned answers. Rows carry premiums in pence (each rounded to the penny, as the
// customer sees them); IPT is 12% of the net total, rounded once. Same tables and formulas as V1.
function calculateQuote(ins) {
  const rows = [];
  const add = (code, label, premium, extra = {}) => {
    const pence = Math.round(Number(premium || 0) * 100);
    if (pence > 0) rows.push({ code, label, premiumPence: pence, ...extra });
  };
  const salon = ins.insRoute === 'salon';
  // Every row carries its price list code (sku), the same code as the item in Books, so Creator can find the Books item by code.
  const turnoverTier = Number(ins.insTurnover || 0) <= 100000 ? 'S1' : Number(ins.insTurnover) <= 175000 ? 'S2' : 'S3';
  add('MEDMAL', 'Medical Malpractice', salon ? salonMedMal(ins.insTurnover) || 0 : 32.5, {
    sku: salon ? 'INS-MEDMAL-' + turnoverTier : 'INS-MEDMAL-NS',
  });
  // A salon pays no premium for its named people: a salon employee pays the membership fee only (see employeeCount) and a
  // salon subcontractor pays nothing. A non-salon employee pays the premium and the membership fee; a subcontractor, £15.
  namedPeople(ins).forEach((p, i) => {
    if (salon) return;
    const label = personName(p);
    if (p.type === 'subcontractor')
      add('NAMED_SUBCONTRACTORS', ('Named subcontractor cover (' + label + ')').trim(), 15, {
        person: i,
        sku: 'INS-NAMED-SUB-NS',
      });
    else
      add('NAMED_EMPLOYEES', ('Named employee cover (' + label + ')').trim(), 32.5, {
        person: i,
        sku: 'INS-NAMED-EMP-NS',
      });
  });
  for (const id of ins.insTreatmentExtensions) {
    const e = TREATMENT_EXTENSIONS.find(t => t.id === id);
    if (e) add('TREATMENT_' + id.toUpperCase(), e.name, e.premium, { sku: TREATMENT_SKU[id] });
  }
  if (ins.insTeachingCover === 'standard') add('TEACHING', 'Teaching + Student Cover', 75, { sku: 'INS-TEACH' });
  if (ins.insTeachingCover === 'additional')
    add('TEACHING_PLUS', 'Teaching + Student Cover + Additional Treatments', 150, { sku: 'INS-TEACH-PLUS' });
  if (!salon) {
    const nonStandard = ins.insStandardConstruction === 'no';
    const equipment = (nonStandard ? NON_SALON_EQUIPMENT_NON_STANDARD : NON_SALON_EQUIPMENT).find(
      t => t.value === ins.insEquipmentTier,
    );
    if (equipment)
      add(
        'BUSINESS_EQUIPMENT',
        'Business Equipment' + (nonStandard ? ' (non-standard construction)' : ''),
        equipment.premium,
        { sku: 'INS-EQ-' + equipment.value / 1000 + 'K' + (nonStandard ? '-NS' : '') },
      );
    if (ins.insNonSalonEL) {
      const el = NON_SALON_EL.find(t => t.value === ins.insNonSalonELTier);
      if (el) add('EMPLOYERS_LIABILITY', "Employers' Liability", el.premium, { sku: 'INS-EL-' + el.value });
    }
  } else {
    if (ins.insSalonEL)
      add('EMPLOYERS_LIABILITY', "Employers' Liability", Math.max(positive(ins.insWageRoll) * 0.002, 75), {
        sku: 'CALC-EL-S',
      });
    if (ins.insContents)
      add(
        'CONTENTS',
        'Contents',
        Math.max(
          positive(ins.insComputers) * 0.008 +
            positive(ins.insEquipment) * 0.02 +
            positive(ins.insStock) * 0.008 +
            positive(ins.insGeneralContents) * 0.005 +
            positive(ins.insTenantImprovements) * 0.0015 +
            positive(ins.insRentPayable) * 0.0015,
          50,
        ),
        { sku: 'CALC-CON' },
      );
    if (ins.insMoneyCover) add('MONEY', 'Money', 20, { sku: 'INS-MONEY' });
    if (ins.insBuildingsCover)
      add(
        'BUILDINGS',
        'Buildings',
        Math.max(
          positive(ins.insBuildingsSI) * 0.0015 +
            positive(ins.insFixturesSI) * 0.0015 +
            positive(ins.insRentReceivableSI) * 0.0015,
          75,
        ),
        { sku: 'CALC-BLD' },
      );
    if (ins.insBiCover)
      add(
        'BUSINESS_INTERRUPTION',
        'Business Interruption',
        Math.max(positive(ins.insBiIncome) * 0.0008 + positive(ins.insBiDebts) * 0.0006, 50),
        { sku: 'CALC-BI' },
      );
    if (ins.insPropertyAwayCover)
      add('PROPERTY_AWAY', 'Property Away', Math.max(positive(ins.insPropertyAwaySI) * 0.025, 50), { sku: 'CALC-PA' });
  }
  const netPence = rows.reduce((t, r) => t + r.premiumPence, 0),
    iptPence = Math.round(netPence * IPT_RATE);
  return { rows, netPence, iptPence, totalPence: netPence + iptPence };
}

// STOP and REFER findings (V1). With {complete: true} (paying, not just quoting) the confirmations
// and declarations must also all have been answered: V1 left that to its wizard, the server asks too.
function evaluateRules(ins, country, { complete = false } = {}) {
  const results = [];
  const push = (status, code, customerMessage) => results.push({ status, code, customerMessage });
  if (territory(country) === 'other')
    push('STOP', 'UNSUPPORTED_TERRITORY', 'We cannot complete an online quotation for this territory.');
  if (namedPeople(ins).length > 4)
    push(
      'REFER',
      'NAMED_PEOPLE_LIMIT',
      'The Insurance team needs to review the number of people working in your business.',
    );
  if (ins.insRoute === 'salon') {
    if (ins.insTurnover > 250000)
      push('STOP', 'SALON_TURNOVER_LIMIT', 'Your annual turnover is above the current online quotation limit.');
    // The wage roll is asked as a yes/no (over £125,000); the figure itself is only collected with Employers' Liability (UAT AL-INS-044, AL-INS-049).
    if (ins.insWageRollOver125k === 'yes' || ins.insWageRoll > 125000)
      push('STOP', 'WAGE_ROLL_LIMIT', 'Please call the office to discuss your application.');
    // One salon passes, two or three go to the Insurance team, more than three cannot be quoted online (UAT AL-INS-045).
    if (ins.insSalonCount > 3)
      push('STOP', 'SALON_COUNT_LIMIT', 'The number of salons is above the current online quotation limit.');
    else if (ins.insSalonCount > 1)
      push('REFER', 'MULTIPLE_SALONS', 'More than one salon needs to be reviewed by the Insurance team.');
    if (ins.insContents) {
      const total = [
        'insComputers',
        'insEquipment',
        'insStock',
        'insGeneralContents',
        'insTenantImprovements',
        'insRentPayable',
      ].reduce((s, k) => s + positive(ins[k]), 0);
      if (total > 250000) push('STOP', 'CONTENTS_LIMIT', 'Your Contents sum insured is above £250,000.');
      if (ins.insSoleOccupation === 'no')
        push('REFER', 'SOLE_OCCUPATION', 'The Insurance team needs to review sole occupation of your premises.');
      if (ins.insStandardConstruction === 'no' && ins.insNonStandardOver15 === 'yes')
        push(
          'REFER',
          'NON_STANDARD_CONSTRUCTION_CONTENTS',
          'The construction of the premises needs to be reviewed by the Insurance team.',
        );
    }
    if (ins.insBuildingsCover && ins.insBuildingsSubsidenceDeclaration === 'no')
      push(
        'STOP',
        'BUILDINGS_SUBSIDENCE',
        'We cannot continue this quotation online based on the subsidence declaration for your buildings cover.',
      );
    if (
      ins.insBuildingsCover &&
      positive(ins.insBuildingsSI) + positive(ins.insFixturesSI) + positive(ins.insRentReceivableSI) > 500000
    )
      push('STOP', 'BUILDINGS_LIMIT', 'Your Buildings sum insured is above £500,000.');
    if (ins.insBiCover && positive(ins.insBiIncome) + positive(ins.insBiDebts) > 300000)
      push('STOP', 'BI_LIMIT', 'Your Business Interruption sum insured is above £300,000.');
    if (ins.insPropertyAwayCover && ins.insPropertyAwaySI > 25000)
      push('STOP', 'PROPERTY_AWAY_LIMIT', 'Your Property Away sum insured is above £25,000.');
    // The £10,000 single item limit is a condition of cover shown in the journey, not a check (agreed with the Guild 21 October).
    // Each of these refers on its own (UAT AL-INS-053, AL-INS-054, AL-INS-057); V1 only referred flood together with a basement.
    if (ins.insFloodHistory === 'yes')
      push('REFER', 'FLOOD_HISTORY', 'The Insurance team needs to review the flood history for this premises.');
    if (ins.insBasement === 'yes')
      push('REFER', 'BASEMENT', 'The Insurance team needs to review the basement at this premises.');
    if (ins.insUnoccupiedDeclaration === 'no')
      push(
        'REFER',
        'UNOCCUPIED_30_DAYS',
        'The Insurance team needs to review premises that may be empty for more than 30 days in a row.',
      );
    if (ins.insSubsidenceHistory === 'yes')
      push(
        'REFER',
        'SUBSIDENCE_HISTORY',
        'The Insurance team needs to review the subsidence history for this premises.',
      );
  } else if (ins.insEquipmentTier > 0) {
    if (ins.insStandardConstruction === 'no' && ins.insNonStandardOver15 === 'yes')
      push(
        'REFER',
        'NON_STANDARD_CONSTRUCTION',
        'The construction of the premises needs to be reviewed by the Insurance team.',
      );
    if (ins.insMultipleAddresses === 'yes')
      push(
        'REFER',
        'MULTIPLE_ADDRESSES',
        'Cover across multiple addresses needs to be reviewed by the Insurance team.',
      );
  }
  if (ins.insTreatmentExtensions.length) {
    if (ins.insQualifiedForTreatments === 'no')
      push(
        'STOP',
        'TREATMENT_QUALIFICATION',
        'The required treatment qualifications must be confirmed before continuing.',
      );
    if (ins.insPatchTesting === 'no')
      push('STOP', 'PATCH_TESTING', 'The required patch testing declaration must be confirmed before continuing.');
  }
  if (ins.insInformationAccurate === 'no')
    push(
      'STOP',
      'INFORMATION_ACCURACY',
      'The information provided must be confirmed as complete and accurate before continuing.',
    );
  if (ins.insEthicsAccepted === 'no')
    push('STOP', 'CODE_OF_ETHICS', 'The Beauty Guild Code of Ethics must be accepted before continuing.');
  if (ins.insDemandsNeedsAccepted === 'no')
    push('STOP', 'DEMANDS_AND_NEEDS', 'The demands and needs confirmation must be accepted before continuing.');
  if (ins.insNonAdvisedAccepted === 'no')
    push('STOP', 'NON_ADVISED_SALE', 'The non-advised sale confirmation must be accepted before continuing.');
  ins.insDeclarations.forEach((answer, i) => {
    if (answer && answer !== DECLARATION_EXPECTED[i])
      push(
        'REFER',
        'DECLARATION_' + (i + 1),
        'One or more declaration answers need to be reviewed by the Insurance team.',
      );
  });
  if (complete) {
    const missing = [];
    if (ins.insDeclarations.some(a => !a)) missing.push('Please answer every declaration question.');
    if (
      ['insInformationAccurate', 'insEthicsAccepted', 'insDemandsNeedsAccepted', 'insNonAdvisedAccepted'].some(
        k => ins[k] !== 'yes',
      )
    )
      missing.push('Please confirm each statement before paying.');
    if (ins.insTreatmentExtensions.length && (!ins.insQualifiedForTreatments || !ins.insPatchTesting))
      missing.push('Please confirm your treatment qualifications and patch testing.');
    if (propertyRequired(ins) && !(ins.insPremisesAddress.l1 && ins.insPremisesAddress.postcode))
      missing.push('Please enter the address of the insured premises.');
    if (missing.length) push('INCOMPLETE', 'INCOMPLETE', missing.join(' '));
  }
  return summarise(results);
}
// Joins findings (the rules above and the risk checks) into one outcome: STOP, then REFER, then INCOMPLETE, else PASS.
function summarise(results) {
  const stop = results.filter(r => r.status === 'STOP'),
    refer = results.filter(r => r.status === 'REFER'),
    incomplete = results.filter(r => r.status === 'INCOMPLETE');
  return {
    results,
    stop,
    refer,
    overall: stop.length ? 'STOP' : refer.length ? 'REFER' : incomplete.length ? 'INCOMPLETE' : 'PASS',
  };
}

const yn = v => (v === 'yes' ? 'Yes' : v === 'no' ? 'No' : undefined);
const money2 = pence => Math.round(pence) / 100;

// Creates the Insurance_Policy, Insured_Premises, Insured_People, Insurance_Extension and Declarations
// records before payment (as V1 does) and returns their ids for the Stripe metadata, which Creator's
// webhook reads. Sequential, because later records link to the ids made earlier. create(module, record) -> id.
//
// A quote that is REFER or STOP also gets these records ({referral}: Application_Status Referred, Risk_Status
// Referred or Stopped) so the Insurance team can pick it up; it never reaches Stripe. {audits} are the risk checks
// run for this application: each becomes a staff-only Risk_Screenings row linked to the policy.
async function createRecords(
  create,
  {
    contactId,
    membershipDealId,
    ins,
    quote,
    start,
    end,
    entryRoute,
    termsAccepted,
    referral = null,
    audits = [],
    expiresAt = null,
    feesPence = 0,
  },
) {
  const description = Object.entries(BUSINESS_DESCRIPTION_BY_FLAG)
    .filter(([flag]) => ins[flag])
    .map(([, label]) => label);
  const policyId = await create('Insurance_Policy', {
    Contact: contactId || undefined,
    Membership: membershipDealId || undefined,
    Policy_Type: ins.insRoute === 'salon' ? 'Salon' : 'Non Salon',
    Business_Description: description.length ? description : undefined,
    Annual_Turnover: ins.insRoute === 'salon' ? ins.insTurnover : undefined,
    Policy_Start_Date: start || undefined,
    Policy_End_Date: end || undefined,
    Application_Status: referral ? 'Referred' : 'Ready for Payment',
    Application_Source: 'Website',
    Entry_Route: entryRoute,
    // What was quoted (gross, with IPT) and, for a payable quote, the day its Stripe session runs out.
    Quoted_Amount: money2(quote.totalPence + feesPence),
    Quote_Expiry: expiresAt ? expiresAt.toISOString().slice(0, 10) : undefined,
    ...(referral
      ? { Risk_Status: referral.status, Risk_Summary: referral.summary }
      : audits.length
        ? { Risk_Status: 'Clear' }
        : {}),
  });
  let premisesId = null;
  if (propertyRequired(ins)) {
    const a = ins.insPremisesAddress;
    premisesId = await create('Insured_Premises', {
      Policy: policyId,
      Name: a.l1 || a.postcode || 'Premises - ' + policyId,
      Address_Line_1: a.l1 || undefined,
      Address_Line_2: a.l2 || undefined,
      Town: a.town || undefined,
      County: a.county || undefined,
      Postcode: a.postcode || undefined,
      Country: a.country || undefined,
      Standard_Construction: yn(ins.insStandardConstruction),
      More_Than_15_Percent_Nonstandard: yn(ins.insNonStandardOver15),
      Sole_Occupation_Confirmed: yn(ins.insSoleOccupation),
      Not_Unoccupied_Over_30_Days: yn(ins.insUnoccupiedDeclaration),
      Flat_Roof_Present: yn(ins.insFlatRoof),
      Previous_Flooding: yn(ins.insFloodHistory),
      Previous_Subsidence: yn(ins.insSubsidenceHistory),
      Basement_or_Semi_Basement: yn(ins.insBasement),
      Buildings_Subsidence_Declaration: yn(ins.insBuildingsSubsidenceDeclaration),
    });
  }
  const people = namedPeople(ins),
    personIds = [];
  for (const p of people) {
    personIds.push(
      await create('Insured_People', {
        Policy: policyId,
        Name: personName(p) || 'Unnamed',
        First_Name: p.firstName || undefined,
        Last_Name: p.lastName || undefined,
        Person_Type: p.type === 'subcontractor' ? 'Subcontractors' : 'Employees',
        Status: 'Draft',
      }),
    );
  }
  const extensionIds = [];
  for (const row of quote.rows) {
    const ipt = Math.round(row.premiumPence * IPT_RATE);
    const record = {
      Policy: policyId,
      Cover_Type:
        COVER_TYPE_BY_CODE[row.code] || (row.code.startsWith('TREATMENT_') ? 'Treatment' : 'Ad Hoc Adjustment'),
      Cover_Code: row.code,
      Premium_Net: money2(row.premiumPence),
      IPT_Rate: IPT_RATE,
      IPT_Amount: money2(ipt),
      Gross_Amount: money2(row.premiumPence + ipt),
      VAT_Rate: 0,
      VAT_Amount: 0,
      VAT_Classification: 'Exempt per source',
      Status: 'Draft',
    };
    if (row.person !== undefined) record.Insured_Person = personIds[row.person];
    if (premisesId && PROPERTY_CODES.includes(row.code)) record.Insured_Premises = premisesId;
    extensionIds.push(await create('Insurance_Extension', record));
  }
  const d = ins.insDeclarations;
  const declarationsId = await create('Declarations', {
    Insurance_Policy: policyId,
    Name: 'Declarations - ' + policyId,
    Contact: contactId || undefined,
    Previous_Claims_or_Losses: yn(d[0]),
    Bankrupt_or_Insolvent: yn(d[1]),
    Known_Claim_Circumstances: yn(d[2]),
    Criminal_Convictions: yn(d[3]),
    Insurance_Declined: yn(d[4]),
    Over_18_and_UK_Domiciled: yn(d[5]),
    Supported_Territories_Only: yn(d[6]),
    Qualifications_Held: yn(ins.insQualifiedForTreatments),
    Patch_Testing_Agreed: yn(ins.insPatchTesting),
    Previous_Flooding: yn(ins.insFloodHistory),
    Basement: yn(ins.insBasement),
    Previous_Subsidence: yn(ins.insSubsidenceHistory),
    Sole_Occupation: yn(ins.insSoleOccupation),
    Not_Unoccupied_Over_30_Days: yn(ins.insUnoccupiedDeclaration),
    Standard_Construction: yn(ins.insStandardConstruction),
    Over_15_Non_Standard: yn(ins.insNonStandardOver15),
    Flat_Roof: yn(ins.insFlatRoof),
    Buildings_Subsidence_Decl: yn(ins.insBuildingsSubsidenceDeclaration),
    Information_Accurate: ins.insInformationAccurate === 'yes',
    Code_of_Ethics_Agreed: ins.insEthicsAccepted === 'yes',
    Demands_and_Needs_Correct: ins.insDemandsNeedsAccepted === 'yes',
    Non_Advised_Sale_Understood: ins.insNonAdvisedAccepted === 'yes',
    Terms_and_Privacy_Accepted: termsAccepted === true,
    // A REFER or STOP is recorded for staff but never reaches payment.
    Referral_Required: Boolean(referral),
    Cover_Summary: quote.rows.map(r => r.label).join(', '),
  });
  const screeningIds = [];
  for (const a of audits) {
    screeningIds.push(
      await create('Risk_Screenings', {
        Name: (a.check + ' - ' + a.subject).slice(0, 120),
        Policy: policyId,
        Contact: contactId || undefined,
        Check: a.check,
        Subject: a.subject.slice(0, 200),
        Result: a.result,
        Screened_At: a.screenedAt,
        Data_Version: String(a.dataVersion || '').slice(0, 200),
        Inputs_Hash: a.inputsHash,
        Match_Detail: a.detail || undefined,
        Investigation_Status: a.result === 'Clear' ? 'Cleared' : 'Open',
      }),
    );
  }
  return { policyId, premisesId, insuredPeopleIds: personIds, extensionIds, declarationsId, screeningIds };
}

module.exports = {
  COVER_TYPE_BY_CODE,
  IPT_RATE,
  IPT_SKU,
  TREATMENT_EXTENSIONS,
  clean,
  calculateQuote,
  employeeCount,
  evaluateRules,
  summarise,
  createRecords,
  propertyRequired,
  territory,
};
