// The Guild's legal and information pages and the policy documents, as in V1 (src/insurance/documents.js). One place, so every
// page links the same documents.
export const LEGAL = {
  terms: { label: 'Terms of Business', href: 'https://www.beautyguild.com/Legal/Terms-Of-Business' },
  privacy: { label: 'Privacy Policy', href: 'https://www.beautyguild.com/Legal/Privacy' },
  treatments: { label: 'Treatments We Cover', href: 'https://www.beautyguild.com/Membership/Treatments-We-Cover' },
  ethics: { label: 'Code of Ethics', href: 'https://www.beautyguild.com/Membership/Code-Of-Ethics' },
};
export const LEGAL_LINKS = { 'Terms of Business': LEGAL.terms.href, 'Privacy Policy': LEGAL.privacy.href };
const DOCUMENT_NAMES = {
  MEDMAL_WORDING: 'Medical Malpractice Policy Wording',
  GENERAL_TERMS: 'General Terms & Conditions',
  NON_SALON_CONTENTS_WORDING: 'Non-Salon Contents Policy Wording',
  NON_SALON_EL_WORDING: "Non-Salon Employers' Liability Policy Wording",
  NON_SALON_PROPERTY_DEFINITIONS: 'Non-Salon Property Definitions',
  SALON_EL_WORDING: "Salon Employers' Liability Policy Wording",
  SALON_CONTENTS_WORDING: 'Salon Contents Policy Wording',
  SALON_MONEY_WORDING: 'Salon Money Policy Wording',
  SALON_BUILDINGS_WORDING: 'Salon Buildings Policy Wording',
  SALON_BI_WORDING: 'Salon Business Interruption Policy Wording',
  SALON_PROPERTY_AWAY_WORDING: 'Salon Property Away Policy Wording',
  SALON_PROPERTY_DEFINITIONS: 'Salon Property Definitions',
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
  return [...new Set(codes)].map(code => ({ code, name: DOCUMENT_NAMES[code] }));
}
