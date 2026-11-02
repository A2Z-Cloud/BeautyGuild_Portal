// Help text for the membership journey, in one place so the old page and the combined journey say exactly the same thing
// (docs/delivery/combined-membership-flow-spec.md, section 3.2: a move, not a rewrite). membershipPlan.test.js checks that the combined
// journey uses every one of these.
export const INSURANCE_TEXT =
  'Our standard insurance policy covers you for treatment, public and product liability. This covers any injuries caused to your clients by the treatments you provide, accidental damage to property that doesn’t belong to you and any accidental injury to your customers, visitors, people you visit or members of the public. It would include things like slips and trips. You will be able to add on additional covers you may require, later on.';
export const BRANCH_TEXT =
  'There are 4 branches of Guild membership. Select the branch which is best suited to your qualifications and the area you work in. Please note, the branch you choose does not affect your insurance where applicable and the membership element is not regulated by the Financial Conduct Authority.';
export const EXTRAS_TEXT =
  'On completion of your application, your Membership Certificate will be available to download for free from your account, along with the relevant Guild logos which you can use on your website and social media.';
export const ADDITIONAL_BRANCHES_TEXT =
  'If you would like to add any additional branches, these are chargeable at £15 per branch';
export const EXTRAS_INTRO_TEXT =
  'Showcase your professional credentials, strengthen client confidence and proudly display your Guild membership with our range of membership extras.';
export const EXTRAS_ORDER_TEXT =
  'You can order any of the following marketing and branding items from the options below:';
export const SCHOOL_CODE_TEXT =
  'If your school gave you its Accreditation Reference (for example ACC-0140), enter it to have your joining fee waived.';
export const UPGRADE_TEXT =
  'Choose your Full membership level and answer the insurance questions, as you would to get an insurance quote. We credit the unused part of your Associate membership fee, so you only pay the difference. Your Associate membership carries on until your new membership starts, and the new membership runs for a full year.';
export const startDateText = (days, withInsurance) =>
  'Starts today unless you choose a later date, up to ' +
  days +
  ' days ahead.' +
  (withInsurance ? ' Your insurance starts on the same date.' : '') +
  ' You pay now, and it shows as Coming soon until it starts.';

// Every text above with the name it is used under, for the content checklist test.
export const HELP_TEXTS = {
  INSURANCE_TEXT,
  BRANCH_TEXT,
  EXTRAS_TEXT,
  ADDITIONAL_BRANCHES_TEXT,
  EXTRAS_INTRO_TEXT,
  EXTRAS_ORDER_TEXT,
  SCHOOL_CODE_TEXT,
  UPGRADE_TEXT,
};
