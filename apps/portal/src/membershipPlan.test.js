import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
  INSURANCE_GROUPS,
  INTERNATIONAL_NO_INSURANCE_TEXT,
  STEPS_FULL,
  STEPS_SIMPLE,
  STEP_TITLES,
  WORKING_OPTIONS,
  aboutYouErrors,
  answersRequest,
  fieldsOf,
  inUkGroup,
  insuranceStepErrors,
  outcomeText,
  planFor,
  stepIndex,
  defaultBranch,
  extrasErrors,
  suggestedBranches,
  toggleBranchChoice,
  ukOnce,
} from './membershipPlan.js';
import { INSURANCE_STEPS } from './insuranceInputs.js';
import { HELP_TEXTS } from './membershipText.js';

const require = createRequire(import.meta.url);
const server = require('../functions/beauty_guild_api/src/membershipDecision.js');

const COUNTRIES = [
  'United Kingdom',
  'UK',
  'Great Britain',
  'England',
  'Scotland',
  'Wales',
  'Northern Ireland',
  'Jersey',
  'Guernsey',
  'Isle of Man',
  'Ireland',
  'France',
  'Other',
];

test('the plan agrees with the server decision for every country, answer and way of working', () => {
  for (const country of COUNTRIES)
    for (const insuranceRequired of ['', 'yes', 'no'])
      for (const working of ['', ...WORKING_OPTIONS.map(o => o.value)]) {
        const mine = planFor({ country, insuranceRequired, working });
        let theirs = null;
        try {
          theirs = server.decideMembership({
            country,
            insuranceRequired: insuranceRequired || undefined,
            working: working || undefined,
          });
        } catch {
          /* an answer the server still needs */
        }
        const label = JSON.stringify({ country, insuranceRequired, working });
        if (mine.ready) {
          assert.ok(theirs, 'server should decide ' + label);
          assert.equal(mine.level, theirs.level, label);
          assert.equal(mine.insurance, theirs.insurance, label);
          assert.deepEqual(mine.steps, [...theirs.steps], label);
          assert.equal(mine.message, theirs.message, label);
        } else if (theirs) {
          // The server may decide with less (a UK Associate needs no working answer) but never the other way round.
          assert.fail('plan not ready but the server decided: ' + label);
        }
      }
});
test("the placeholder message and the UK group are the server's", () => {
  assert.equal(INTERNATIONAL_NO_INSURANCE_TEXT, server.INTERNATIONAL_NO_INSURANCE_TEXT);
  for (const c of COUNTRIES) assert.equal(inUkGroup(c), server.inUkGroup(c), c);
  assert.deepEqual(WORKING_OPTIONS.map(o => o.value).sort(), Object.keys(server.WORKING).sort());
});
test('steps before and after the answers', () => {
  assert.deepEqual(planFor({}).steps, STEPS_SIMPLE);
  assert.deepEqual(planFor({ country: 'England' }).steps, STEPS_SIMPLE);
  assert.equal(planFor({ country: 'England' }).ready, false);
  assert.deepEqual(planFor({ country: 'England', insuranceRequired: 'yes' }).steps, STEPS_FULL);
  assert.equal(planFor({ country: 'England', insuranceRequired: 'yes' }).ready, false);
  assert.equal(planFor({ country: 'France' }).level, 'international');
  assert.ok(STEPS_FULL.every(k => STEP_TITLES[k]));
});
test('answers sent to the server carry only what matters', () => {
  assert.deepEqual(answersRequest({ country: 'France', insuranceRequired: 'yes', working: 'insSalon' }), {
    country: 'France',
  });
  assert.deepEqual(answersRequest({ country: 'England', insuranceRequired: 'no', working: 'insSalon' }), {
    country: 'England',
    insuranceRequired: 'no',
  });
  assert.deepEqual(answersRequest({ country: 'England', insuranceRequired: 'yes', working: 'insMobile' }), {
    country: 'England',
    insuranceRequired: 'yes',
    working: 'insMobile',
  });
});
test('every insurance question appears in exactly one journey step', () => {
  const grouped = Object.values(INSURANCE_GROUPS).flat();
  assert.equal(new Set(grouped).size, grouped.length, 'a question is in two steps');
  assert.deepEqual([...grouped].sort(), INSURANCE_STEPS.map(s => s.id).sort());
});
test('how you work needs a choice, and the salon questions appear only for salon', () => {
  assert.ok(insuranceStepErrors('how_you_work', {}).insWorking);
  assert.equal(insuranceStepErrors('how_you_work', { insWorking: ['insMobile'] }).insWorking, undefined);
  const names = v => fieldsOf('how_you_work', v).map(f => f.name);
  assert.ok(!names({ insWorking: ['insMobile'] }).includes('insTurnover'));
  assert.ok(names({ insWorking: ['insSalon'] }).includes('insTurnover'));
});
test('About you needs a country, an insurance answer for the UK, and an interest', () => {
  const i = ['nails'];
  assert.deepEqual(Object.keys(aboutYouErrors({})), ['country', 'interests']);
  assert.deepEqual(Object.keys(aboutYouErrors({ country: 'England', interests: i })), ['insuranceRequired']);
  assert.deepEqual(aboutYouErrors({ country: 'France', interests: i }), {});
  assert.deepEqual(aboutYouErrors({ country: 'England', interests: i }, { askInsurance: false }), {});
  assert.ok(aboutYouErrors({ country: 'France', interests: [] }).interests);
});
test('the branch is chosen on Personalise your membership', () => {
  assert.ok(extrasErrors({}).branch);
  assert.deepEqual(extrasErrors({ branch: 'beauty' }), {});
});
test('the first branch follows the interests in the Guild order, and Training points to Beauty', () => {
  assert.equal(defaultBranch(['hair', 'nails']), 'nails');
  assert.equal(defaultBranch(['hair', 'beauty', 'holistic', 'nails']), 'beauty');
  assert.equal(defaultBranch(['holistic', 'hair']), 'holistic');
  assert.equal(defaultBranch(['training']), 'beauty', 'Training points to Beauty');
  assert.equal(defaultBranch(['training', 'nails']), 'beauty');
  assert.deepEqual(suggestedBranches(['training', 'hair'], { branch: 'hair', branches: [] }), ['beauty']);
  assert.equal(defaultBranch([]), '');
  assert.deepEqual(suggestedBranches(['hair', 'beauty', 'training'], { branch: 'beauty', branches: [] }), ['hair']);
  assert.deepEqual(suggestedBranches(['hair', 'beauty'], { branch: 'beauty', branches: ['hair'] }), []);
});
test('one branch list: the first ticked is included, the rest are additional, unticking the first promotes the next', () => {
  assert.deepEqual(toggleBranchChoice({ branch: '', branches: [] }, 'nails'), { branch: 'nails', branches: [] });
  assert.deepEqual(toggleBranchChoice({ branch: 'nails', branches: [] }, 'hair'), {
    branch: 'nails',
    branches: ['hair'],
  });
  assert.deepEqual(toggleBranchChoice({ branch: 'nails', branches: ['hair'] }, 'hair'), {
    branch: 'nails',
    branches: [],
  });
  assert.deepEqual(toggleBranchChoice({ branch: 'nails', branches: ['hair', 'beauty'] }, 'nails'), {
    branch: 'hair',
    branches: ['beauty'],
  });
  assert.deepEqual(toggleBranchChoice({ branch: 'nails', branches: [] }, 'nails'), { branch: '', branches: [] });
});
test('England, Scotland, Wales and Northern Ireland are the United Kingdom in the list', () => {
  for (const c of ['England', 'scotland', 'Wales', 'Northern Ireland']) assert.equal(ukOnce(c), 'United Kingdom');
  assert.equal(ukOnce('France'), 'France');
  assert.equal(ukOnce(''), '');
  assert.equal(inUkGroup(ukOnce('England')), true);
});
test('Associate and International have no Membership details step; Full membership keeps it', () => {
  assert.equal(STEPS_SIMPLE.includes('membership_details'), false);
  assert.deepEqual(planFor({ country: 'France' }).steps, ['about_you', 'extras', 'review']);
  assert.deepEqual(planFor({ country: 'England', insuranceRequired: 'no' }).steps, ['about_you', 'extras', 'review']);
  assert.equal(planFor({ country: 'England', insuranceRequired: 'yes' }).steps.includes('membership_details'), true);
  assert.equal(STEP_TITLES.extras, 'Personalise your membership');
});
test('an unknown step counts as the first', () => {
  assert.equal(stepIndex(STEPS_SIMPLE, 'extras'), 1);
  assert.equal(stepIndex(STEPS_SIMPLE, 'declarations'), 0);
});
test('content checklist: every help text is defined once and used by the combined journey', () => {
  const page = fs.readFileSync(new URL('./CombinedMembership.jsx', import.meta.url), 'utf8');
  const old = fs.readFileSync(new URL('./BuyMembership.jsx', import.meta.url), 'utf8');
  for (const name of Object.keys(HELP_TEXTS)) {
    assert.ok(page.includes(name), name + ' is missing from the combined journey');
    assert.ok(old.includes(name), name + ' is missing from the old page');
  }
  // The texts live only in membershipText.js, so the two pages cannot say different things.
  for (const [name, text] of Object.entries(HELP_TEXTS)) {
    assert.ok(!page.includes(text.slice(0, 40)), name + ' is written out in the page');
    assert.ok(!old.includes(text.slice(0, 40)), name + ' is written out in the old page');
  }
});
test('outcome text is given only once the level is known', () => {
  assert.equal(outcomeText(planFor({})), '');
  assert.equal(outcomeText(planFor({ country: 'England', insuranceRequired: 'yes' })), '');
  assert.match(
    outcomeText(planFor({ country: 'England', insuranceRequired: 'no' })),
    /Associate member, without insurance/,
  );
  assert.match(outcomeText(planFor({ country: 'England', insuranceRequired: 'yes', working: 'insSalon' })), /Salon/);
  assert.equal(outcomeText(planFor({ country: 'Jersey' })), INTERNATIONAL_NO_INSURANCE_TEXT);
});
