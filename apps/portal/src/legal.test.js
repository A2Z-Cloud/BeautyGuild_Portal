import test from 'node:test';
import assert from 'node:assert/strict';
import {LEGAL,LEGAL_LINKS,policyDocuments} from './legal.js';

test('the Guild legal pages are the V1 addresses',()=>{
  assert.equal(LEGAL.terms.href,'https://www.beautyguild.com/Legal/Terms-Of-Business');
  assert.equal(LEGAL.privacy.href,'https://www.beautyguild.com/Legal/Privacy');
  assert.equal(LEGAL.treatments.href,'https://www.beautyguild.com/Membership/Treatments-We-Cover');
  assert.equal(LEGAL.ethics.href,'https://www.beautyguild.com/Membership/Code-Of-Ethics');
  assert.deepEqual(Object.keys(LEGAL_LINKS),['Terms of Business','Privacy Policy']);
});
const names=v=>policyDocuments(v).map(d=>d.name);
test('policy documents follow the cover chosen, as in V1',()=>{
  assert.deepEqual(names({insWorking:['insWorkingFromHome']}),['General Terms & Conditions','Medical Malpractice Policy Wording']);
  assert.deepEqual(names({insWorking:['insMobile'],insEquipmentTier:'5000',insNonSalonEL:'yes'}).slice(2),["Non-Salon Employers' Liability Policy Wording",'Non-Salon Contents Policy Wording','Non-Salon Property Definitions']);
  const salon=names({insWorking:['insSalon'],insSalonEL:'yes',insContents:'yes',insMoneyCover:'yes',insBuildingsCover:'yes',insBiCover:'yes',insPropertyAwayCover:'yes',insEquipmentTier:'5000'});
  assert.equal(salon.length,9);assert.ok(salon.includes('Salon Business Interruption Policy Wording'));assert.ok(!salon.some(n=>n.startsWith('Non-Salon')));
});
