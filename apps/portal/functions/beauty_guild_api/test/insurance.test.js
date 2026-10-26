'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { clean, calculateQuote, evaluateRules, territory, TREATMENT_EXTENSIONS, IPT_RATE } = require('../src/insurance');

const DECL = ['no', 'no', 'no', 'no', 'no', 'yes', 'yes'];
const CONFIRM = {
  insInformationAccurate: 'yes',
  insEthicsAccepted: 'yes',
  insDemandsNeedsAccepted: 'yes',
  insNonAdvisedAccepted: 'yes',
};
const quote = raw => calculateQuote(clean(raw));
const rules = (raw, country = 'United Kingdom', opts) => evaluateRules(clean(raw), country, opts);
const codes = r => r.results.map(x => x.code);

test('non-salon core cover is £32.50 plus 12% IPT, rounded once in pence', () => {
  const q = quote({});
  assert.deepEqual(
    q.rows.map(r => [r.code, r.premiumPence]),
    [['MEDMAL', 3250]],
  );
  assert.equal(q.netPence, 3250);
  assert.equal(q.iptPence, 390);
  assert.equal(q.totalPence, 3640);
});
test('salon medical malpractice is banded by turnover and unavailable above £250,000', () => {
  const med = turnover =>
    quote({ insSalon: true, insTurnover: turnover }).rows.find(r => r.code === 'MEDMAL')?.premiumPence;
  assert.equal(med(100000), 7500);
  assert.equal(med(100001), 10000);
  assert.equal(med(175000), 10000);
  assert.equal(med(250000), 15000);
  assert.equal(med(250001), undefined);
});
test('named people, treatments, teaching and non-salon tiers are rated as in V1', () => {
  const q = quote({
    insNamedPeopleCover: true,
    insNamedPeople: [
      { type: 'employee', firstName: 'A', lastName: 'B' },
      { type: 'subcontractor', firstName: 'C', lastName: 'D' },
    ],
    insTreatmentExtensions: ['microneedling', 'piercing', 'nope'],
    insTeachingCover: 'additional',
    insEquipmentTier: 10000,
    insStandardConstruction: 'no',
    insNonSalonEL: true,
    insNonSalonELTier: 3,
  });
  const by = Object.fromEntries(q.rows.map(r => [r.code, r.premiumPence]));
  assert.deepEqual(by, {
    MEDMAL: 3250,
    NAMED_EMPLOYEES: 3250,
    NAMED_SUBCONTRACTORS: 1500,
    TREATMENT_MICRONEEDLING: 17925,
    TREATMENT_PIERCING: 1415,
    TEACHING_PLUS: 15000,
    BUSINESS_EQUIPMENT: 15000,
    EMPLOYERS_LIABILITY: 12000,
  });
});
test('salon property covers use V1 rates and minimums', () => {
  const q = quote({
    insSalon: true,
    insTurnover: 50000,
    insSalonEL: true,
    insWageRoll: 10000,
    insContents: true,
    insComputers: 1000,
    insMoneyCover: true,
    insBuildingsCover: true,
    insBuildingsSI: 100000,
    insBiCover: true,
    insBiIncome: 10000,
    insPropertyAwayCover: true,
    insPropertyAwaySI: 4000,
  });
  const by = Object.fromEntries(q.rows.map(r => [r.code, r.premiumPence]));
  assert.equal(by.EMPLOYERS_LIABILITY, 7500);
  assert.equal(by.CONTENTS, 5000);
  assert.equal(by.MONEY, 2000);
  assert.equal(by.BUILDINGS, 15000);
  assert.equal(by.BUSINESS_INTERRUPTION, 5000);
  assert.equal(by.PROPERTY_AWAY, 10000);
});
test('the route comes from how the person works, not from the request', () => {
  assert.equal(clean({ insRoute: 'salon' }).insRoute, 'non_salon');
  assert.equal(clean({ insSalon: true, insRoute: 'non_salon' }).insRoute, 'salon');
});
test('clean drops unknown keys, bounds numbers and caps people', () => {
  const c = clean({
    insTurnover: -5,
    insStock: 'abc',
    insNamedPeople: Array.from({ length: 40 }, () => ({ type: 'x', firstName: 'n'.repeat(200) })),
    evil: 1,
    insDeclarations: ['maybe', 'yes'],
    insEquipmentTier: 'junk',
  });
  assert.equal(c.insTurnover, 0);
  assert.equal(c.insStock, 0);
  assert.equal(c.insNamedPeople.length, 10);
  assert.equal(c.insNamedPeople[0].type, 'employee');
  assert.equal(c.insNamedPeople[0].firstName.length, 60);
  assert.equal(c.evil, undefined);
  assert.deepEqual(c.insDeclarations, ['', 'yes', '', '', '', '', '']);
  assert.equal(c.insEquipmentTier, 0);
});
test('a clean application passes; a salon turnover over the limit is a STOP', () => {
  const ok = rules({ insDeclarations: DECL, ...CONFIRM }, 'United Kingdom', { complete: true });
  assert.equal(ok.overall, 'PASS');
  const stop = rules({ insSalon: true, insTurnover: 250001 });
  assert.equal(stop.overall, 'STOP');
  assert.ok(codes(stop).includes('SALON_TURNOVER_LIMIT'));
});
test('STOP rules: territory, wage roll, sums insured, declarations the customer refused', () => {
  assert.ok(codes(rules({}, 'France')).includes('UNSUPPORTED_TERRITORY'));
  assert.ok(codes(rules({ insSalon: true, insWageRoll: 125001 })).includes('WAGE_ROLL_LIMIT'));
  assert.ok(codes(rules({ insSalon: true, insContents: true, insStock: 250001 })).includes('CONTENTS_LIMIT'));
  assert.ok(
    codes(rules({ insSalon: true, insBuildingsCover: true, insBuildingsSI: 500001 })).includes('BUILDINGS_LIMIT'),
  );
  assert.ok(
    codes(rules({ insSalon: true, insBuildingsCover: true, insBuildingsSubsidenceDeclaration: 'no' })).includes(
      'BUILDINGS_SUBSIDENCE',
    ),
  );
  assert.ok(codes(rules({ insSalon: true, insBiCover: true, insBiIncome: 300001 })).includes('BI_LIMIT'));
  assert.ok(
    codes(rules({ insSalon: true, insPropertyAwayCover: true, insPropertyAwaySI: 25001 })).includes(
      'PROPERTY_AWAY_LIMIT',
    ),
  );
  assert.ok(
    codes(rules({ insTreatmentExtensions: ['dermaplaning'], insQualifiedForTreatments: 'no' })).includes(
      'TREATMENT_QUALIFICATION',
    ),
  );
  assert.ok(
    codes(rules({ insTreatmentExtensions: ['dermaplaning'], insPatchTesting: 'no' })).includes('PATCH_TESTING'),
  );
  for (const [key, code] of [
    ['insInformationAccurate', 'INFORMATION_ACCURACY'],
    ['insEthicsAccepted', 'CODE_OF_ETHICS'],
    ['insDemandsNeedsAccepted', 'DEMANDS_AND_NEEDS'],
    ['insNonAdvisedAccepted', 'NON_ADVISED_SALE'],
  ])
    assert.ok(codes(rules({ [key]: 'no' })).includes(code));
});
test('REFER rules: people limit, multiple salons, premises history, declarations', () => {
  const five = Array.from({ length: 5 }, () => ({ type: 'employee', firstName: 'A', lastName: 'B' }));
  assert.equal(rules({ insNamedPeopleCover: true, insNamedPeople: five }).overall, 'REFER');
  assert.equal(rules({ insNamedPeopleCover: true, insNamedPeople: five.slice(0, 4) }).overall, 'PASS');
  assert.ok(codes(rules({ insSalon: true, insSalonCount: 2 })).includes('MULTIPLE_SALONS'));
  assert.ok(codes(rules({ insSalon: true, insContents: true, insSoleOccupation: 'no' })).includes('SOLE_OCCUPATION'));
  assert.ok(codes(rules({ insSalon: true, insSubsidenceHistory: 'yes' })).includes('SUBSIDENCE_HISTORY'));
  assert.ok(
    codes(rules({ insEquipmentTier: 5000, insStandardConstruction: 'no', insNonStandardOver15: 'yes' })).includes(
      'NON_STANDARD_CONSTRUCTION',
    ),
  );
  assert.ok(codes(rules({ insEquipmentTier: 5000, insMultipleAddresses: 'yes' })).includes('MULTIPLE_ADDRESSES'));
  const refer = rules({ insDeclarations: ['yes', 'no', 'no', 'no', 'no', 'yes', 'yes'] });
  assert.equal(refer.overall, 'REFER');
  assert.ok(codes(refer).includes('DECLARATION_1'));
  assert.ok(codes(rules({ insDeclarations: ['no', 'no', 'no', 'no', 'no', 'no', 'yes'] })).includes('DECLARATION_6'));
});
test('STOP outranks REFER, and REFER outranks incomplete', () => {
  assert.equal(rules({ insEthicsAccepted: 'no', insDeclarations: ['yes', '', '', '', '', '', ''] }).overall, 'STOP');
  assert.equal(
    rules({ insDeclarations: ['yes', 'no', 'no', 'no', 'no', 'yes', 'yes'] }, 'UK', { complete: true }).overall,
    'REFER',
  );
});
test('paying needs every declaration and confirmation answered; a quote does not', () => {
  assert.equal(rules({}).overall, 'PASS');
  const r = rules({}, 'United Kingdom', { complete: true });
  assert.equal(r.overall, 'INCOMPLETE');
  assert.match(r.results[0].customerMessage, /declaration/);
  assert.equal(
    rules({ insSalon: true, insContents: true, insDeclarations: DECL, ...CONFIRM }, 'UK', { complete: true }).overall,
    'INCOMPLETE',
  );
  assert.equal(
    rules({ insTreatmentExtensions: ['spmu'], insDeclarations: DECL, ...CONFIRM }, 'UK', { complete: true }).overall,
    'INCOMPLETE',
  );
});
test('UK nations and Crown dependencies are supported territories', () => {
  for (const c of [
    '',
    'United Kingdom',
    'England',
    'Scotland',
    'Wales',
    'Northern Ireland',
    'Jersey',
    'Guernsey',
    'Isle of Man',
  ])
    assert.notEqual(territory(c), 'other', c);
  for (const c of ['France', 'Ireland', 'Other']) assert.equal(territory(c), 'other', c);
});

test('AL-INS-045: one salon passes, two or three refer, more than three stop', () => {
  assert.equal(rules({ insSalon: true, insSalonCount: 1 }).overall, 'PASS');
  assert.equal(rules({ insSalon: true, insSalonCount: 2 }).overall, 'REFER');
  assert.equal(rules({ insSalon: true, insSalonCount: 3 }).overall, 'REFER');
  const four = rules({ insSalon: true, insSalonCount: 4 });
  assert.equal(four.overall, 'STOP');
  assert.ok(codes(four).includes('SALON_COUNT_LIMIT'));
  assert.ok(!codes(four).includes('MULTIPLE_SALONS'));
});
test('AL-INS-053: flood history alone refers', () => {
  const r = rules({ insSalon: true, insFloodHistory: 'yes', insBasement: 'no' });
  assert.equal(r.overall, 'REFER');
  assert.deepEqual(codes(r), ['FLOOD_HISTORY']);
});
test('AL-INS-054: a basement alone refers', () => {
  const r = rules({ insSalon: true, insFloodHistory: 'no', insBasement: 'yes' });
  assert.equal(r.overall, 'REFER');
  assert.deepEqual(codes(r), ['BASEMENT']);
});
test('AL-INS-057: premises that may be empty for more than 30 days refer; occupied premises pass', () => {
  assert.deepEqual(codes(rules({ insSalon: true, insUnoccupiedDeclaration: 'no' })), ['UNOCCUPIED_30_DAYS']);
  assert.equal(
    rules({ insSalon: true, insUnoccupiedDeclaration: 'yes', insFloodHistory: 'no', insBasement: 'no' }).overall,
    'PASS',
  );
});

// UAT AL-INS-043, 044, 049, 073, 008.
test('the three turnover bands the portal sends rate at £75, £100 and £150', () => {
  const med = turnover =>
    quote({ insSalon: true, insTurnover: turnover }).rows.find(r => r.code === 'MEDMAL')?.premiumPence;
  assert.deepEqual([100000, 175000, 250000].map(med), [7500, 10000, 15000]);
});
test('a wage roll over £125,000 answered yes stops the quote and asks the customer to call the office', () => {
  const r = rules({ insSalon: true, insWageRollOver125k: 'yes' });
  assert.equal(r.overall, 'STOP');
  assert.equal(
    r.stop.find(x => x.code === 'WAGE_ROLL_LIMIT').customerMessage,
    'Please call the office to discuss your application.',
  );
  assert.ok(!codes(rules({ insSalon: true, insWageRollOver125k: 'no' })).includes('WAGE_ROLL_LIMIT'));
  assert.equal(clean({ insWageRollOver125k: 'maybe' }).insWageRollOver125k, '');
});
test('the Employers Liability wage roll figure is still rated at 0.2%, minimum £75, and stops above £125,000', () => {
  const el = wage =>
    quote({ insSalon: true, insSalonEL: true, insWageRoll: wage }).rows.find(r => r.code === 'EMPLOYERS_LIABILITY')
      .premiumPence;
  assert.equal(el(10000), 7500);
  assert.equal(el(100000), 20000);
  assert.ok(codes(rules({ insSalon: true, insSalonEL: true, insWageRoll: 125001 })).includes('WAGE_ROLL_LIMIT'));
  assert.ok(!codes(rules({ insSalon: true, insSalonEL: true, insWageRoll: 125000 })).includes('WAGE_ROLL_LIMIT'));
});
test('the £10,000 single property away item is a condition of cover in the journey, not a check on the quote (agreed 21 October)', () => {
  const base = { insSalon: true, insPropertyAwayCover: true, insPropertyAwaySI: 20000 };
  assert.ok(!codes(rules({ ...base, insPropertyAwayMaxItem: 50000 })).includes('PROPERTY_AWAY_ITEM_LIMIT'));
  assert.ok(
    codes(rules({ ...base, insPropertyAwaySI: 30000 })).includes('PROPERTY_AWAY_LIMIT'),
    'the £25,000 total limit still stops the quote',
  );
});
test("treatment extensions carry the customer's names and their prices with IPT are the ones the portal shows", () => {
  const gross = id => {
    const t = TREATMENT_EXTENSIONS.find(x => x.id === id);
    return Math.round(t.premium * 100 * (1 + IPT_RATE)) / 100;
  };
  assert.deepEqual(
    TREATMENT_EXTENSIONS.map(t => t.name),
    [
      'Red Veins, Skin Tags, Milia, Warts & Moles by Advanced Electrolysis',
      'Microneedling or Dermarolling',
      'Nose and Cartilage Piercing',
      'Microblading, Semi-Permanent Make Up & Micropigmentation',
      'Dermaplaning',
    ],
  );
  // Electrolysis is £30 net, £33.60 with IPT (the Guild confirmed this on 21 October; the Fees Table said £28).
  assert.deepEqual(
    ['advanced_electrolysis', 'microneedling', 'piercing', 'spmu', 'dermaplaning'].map(gross),
    [33.6, 200.76, 15.85, 200.76, 200.76],
  );
  assert.deepEqual(
    [75, 150].map(n => Math.round(n * 100 * (1 + IPT_RATE)) / 100),
    [84, 168],
  );
});

// ---- Price list codes (the SKUs in Books) on every quote row ----
const BOOKS_INSURANCE_SKUS = new Set([
  'INS-MEDMAL-NS',
  'INS-MEDMAL-S1',
  'INS-MEDMAL-S2',
  'INS-MEDMAL-S3',
  'INS-EQ-5K',
  'INS-EQ-10K',
  'INS-EQ-15K',
  'INS-EQ-20K',
  'INS-EQ-5K-NS',
  'INS-EQ-10K-NS',
  'INS-EQ-15K-NS',
  'INS-EQ-20K-NS',
  'INS-EL-1',
  'INS-EL-3',
  'INS-EL-5',
  'INS-TEACH',
  'INS-TEACH-PLUS',
  'INS-EXT-ELEC',
  'INS-EXT-NEEDLE',
  'INS-EXT-PIERCE',
  'INS-EXT-SPMU',
  'INS-EXT-DERMA',
  'INS-MONEY',
  'INS-NAMED-EMP-NS',
  'INS-NAMED-SUB-NS',
  'CALC-EL-S',
  'CALC-CON',
  'CALC-BLD',
  'CALC-BI',
  'CALC-PA',
  'INS-IPT',
  'INS-ADJ',
]);
test('every quote row carries a price list code that exists in Books, whatever the cover', () => {
  const seen = new Set();
  const check = answers => {
    for (const r of calculateQuote(clean(answers)).rows) {
      assert.ok(BOOKS_INSURANCE_SKUS.has(r.sku), r.code + ' has no valid code: ' + r.sku);
      seen.add(r.sku);
    }
  };
  for (const nonStd of ['yes', 'no'])
    for (const tier of [5000, 10000, 15000, 20000]) check({ insEquipmentTier: tier, insStandardConstruction: nonStd });
  for (const tier of [1, 3, 5]) check({ insNonSalonEL: true, insNonSalonELTier: tier });
  for (const turnover of [50000, 100000, 100001, 175000, 175001, 250000])
    check({ insSalon: true, insTurnover: turnover });
  check({ insTeachingCover: 'standard' });
  check({ insTeachingCover: 'additional' });
  check({ insTreatmentExtensions: TREATMENT_EXTENSIONS.map(t => t.id) });
  check({
    insNamedPeopleCover: true,
    insNamedPeople: [
      { type: 'employee', firstName: 'A', lastName: 'B' },
      { type: 'subcontractor', firstName: 'C', lastName: 'D' },
    ],
  });
  check({
    insSalon: true,
    insTurnover: 90000,
    insSalonEL: true,
    insWageRoll: 60000,
    insContents: true,
    insComputers: 2000,
    insMoneyCover: true,
    insBuildingsCover: true,
    insBuildingsSI: 100000,
    insBiCover: true,
    insBiIncome: 100000,
    insPropertyAwayCover: true,
    insPropertyAwaySI: 10000,
  });
  // every Books insurance code except the staff-only adjustment and IPT (which is its own line) is reachable from the portal
  const unreachable = [...BOOKS_INSURANCE_SKUS].filter(c => !seen.has(c) && !['INS-ADJ', 'INS-IPT'].includes(c));
  assert.deepEqual(unreachable, []);
});
