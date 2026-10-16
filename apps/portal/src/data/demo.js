// Milestone 1 preview data only. These records do NOT represent CRM records.
export const DEMO_RECORDS = [
  { id: 'ACC-DEMO-101', kind: 'accreditation', category: 'Accreditation', title: 'Blossom Training Academy', subtitle: 'Standard Accreditation', status: 'Under review', updated: '14 Oct 2026', reference: 'ACC-DEMO-101', contact: 'Alex Morgan', email: 'example@example.invalid', country: 'United Kingdom', timeline: ['Application example created', 'Documents example received', 'Awaiting assessor example'] },
  { id: 'MEM-DEMO-201', kind: 'membership', category: 'Membership', title: 'Guild Membership', subtitle: 'Professional membership', status: 'Preview record', updated: '13 Oct 2026', reference: 'MEM-DEMO-201', contact: 'Alex Morgan', email: 'example@example.invalid', country: 'United Kingdom', timeline: ['Sample membership record added for demonstration'] },
  { id: 'INS-DEMO-301', kind: 'insurance', category: 'Insurance', title: 'Professional & Public Liability', subtitle: 'Example insurance quotation', status: 'Referral example', updated: '12 Oct 2026', reference: 'INS-DEMO-301', contact: 'Alex Morgan', email: 'example@example.invalid', country: 'United Kingdom', timeline: ['Sample quotation created', 'Example referral pending review'] },
  { id: 'ACC-DEMO-102', kind: 'accreditation', category: 'Accreditation', title: 'Harbour Beauty School', subtitle: 'International Accreditation', status: 'Draft example', updated: '10 Oct 2026', reference: 'ACC-DEMO-102', contact: 'Jamie Lee', email: 'jamie@example.invalid', country: 'Ireland', timeline: ['Example record started'] },
];
export const DEMO_USER = { name: 'Alex Morgan', initials: 'AM', role: 'Preview account' };
export const DEMO_SERVICES = [
  { kind: 'membership', title: 'Membership', description: 'Explore Guild membership options and a guided application preview.', action: 'Explore membership', theme: 'pink' },
  { kind: 'accreditation', title: 'Accreditation', description: 'See how training centres manage applications, courses and supporting information.', action: 'Explore accreditation', theme: 'cream' },
  { kind: 'insurance', title: 'Insurance', description: 'Walk through the business questionnaire and cover selection preview.', action: 'Explore insurance', theme: 'violet' },
];
