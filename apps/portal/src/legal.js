// The Guild's legal and information pages and the policy documents, as in V1 (src/insurance/documents.js). One place, so every
// page links the same documents.
import { POLICY_LINKS } from './policyLinks.js';
// Terms of Business: a WorkDrive share link. Upload a new version of the same file to change it.
const TERMS_OF_BUSINESS_URL =
  'https://workdrive.zohopublic.eu/external/14804f48d2fc6acacd15e5c1f9e11008b57644429afd67cbfaf41c0b01c8e498';
export const LEGAL = {
  terms: { label: 'Terms of Business', href: TERMS_OF_BUSINESS_URL },
  privacy: { label: 'Privacy Policy', href: 'https://www.beautyguild.com/Legal/Privacy' },
  treatments: { label: 'Treatments We Cover', href: 'https://www.beautyguild.com/Membership/Treatments-We-Cover' },
  ethics: { label: 'Code of Ethics', href: 'https://www.beautyguild.com/Membership/Code-Of-Ethics' },
};
export const LEGAL_LINKS = { 'Terms of Business': LEGAL.terms.href, 'Privacy Policy': LEGAL.privacy.href };
const DOCUMENT_NAMES = {
  MEDMAL_WORDING: 'Medical Malpractice Policy Wording',
  GENERAL_TERMS: 'General Terms and Conditions',
  NON_SALON_CONTENTS_WORDING: 'Business Equipment Policy Wording',
  NON_SALON_EL_WORDING: "Employers' Liability Policy Wording",
  NON_SALON_PROPERTY_DEFINITIONS: 'Property Definitions',
  SALON_EL_WORDING: "Employers' Liability Policy Wording",
  SALON_CONTENTS_WORDING: 'Contents Policy Wording',
  SALON_MONEY_WORDING: 'Money Policy Wording',
  SALON_BUILDINGS_WORDING: 'Buildings Policy Wording',
  SALON_BI_WORDING: 'Business Interruption Policy Wording',
  SALON_PROPERTY_AWAY_WORDING: 'Property Away Policy Wording',
  SALON_PROPERTY_DEFINITIONS: 'Property Definitions',
};
// The policy documents that apply to the cover chosen (V1 getQuoteDocuments), from the insurance form's answers.
export function policyDocuments(v = {}) {
  const codes = ['GENERAL_TERMS', 'MEDMAL_WORDING'],
    salon = (v.insWorking || []).includes('insSalon');
  if (!salon) {
    if (v.insNonSalonEL === 'yes') codes.push('NON_SALON_EL_WORDING');
    if (Number(v.insEquipmentTier) > 0) codes.push('NON_SALON_CONTENTS_WORDING', 'NON_SALON_PROPERTY_DEFINITIONS');
  } else {
    if (v.insSalonEL === 'yes') codes.push('SALON_EL_WORDING');
    if (v.insContents === 'yes') codes.push('SALON_CONTENTS_WORDING', 'SALON_PROPERTY_DEFINITIONS');
    if (v.insMoneyCover === 'yes') codes.push('SALON_MONEY_WORDING');
    if (v.insBuildingsCover === 'yes') codes.push('SALON_BUILDINGS_WORDING');
    if (v.insBiCover === 'yes') codes.push('SALON_BI_WORDING');
    if (v.insPropertyAwayCover === 'yes') codes.push('SALON_PROPERTY_AWAY_WORDING');
  }
  return [...new Set(codes)].map(code => ({ code, name: DOCUMENT_NAMES[code], href: POLICY_LINKS[code] }));
}
