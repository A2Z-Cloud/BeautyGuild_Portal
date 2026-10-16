import { DEMO_MEMBER, RECORDS, ACTIVITY, DOCUMENTS, INVOICES } from '../data/fixtures';

// Milestone 1 deliberately contains no real backend requests.
export const PORTAL_MODE = 'demo';
export const BACKEND_STATUS = Object.freeze({
  authentication:'not-connected', records:'not-connected', drafts:'not-connected',
  pricing:'not-connected', checkout:'not-connected', policyIssuance:'not-connected'
});
export class IntegrationUnavailableError extends Error {
  constructor(operation) {
    super(operation + ' is not connected in this preview. No data was saved or submitted.');
    this.name = 'IntegrationUnavailableError';
  }
}
const unavailable = operation => { throw new IntegrationUnavailableError(operation); };
const clone = value => JSON.parse(JSON.stringify(value));
export const portalApi = {
  mode:PORTAL_MODE,
  member:()=>clone(DEMO_MEMBER),
  summary:()=>({member:clone(DEMO_MEMBER),records:clone(RECORDS),activity:clone(ACTIVITY)}),
  listRecords:service=>clone(RECORDS[service]||[]),
  getRecord:(service,id)=>clone((RECORDS[service]||[]).find(r=>r.id===id)||null),
  listDocuments:()=>clone(DOCUMENTS),
  listInvoices:()=>clone(INVOICES),
  signIn:()=>unavailable('Catalyst sign-in'),
  register:()=>unavailable('Account registration'),
  saveDraft:()=>unavailable('CRM draft saving'),
  listDrafts:()=>unavailable('CRM draft listing'),
  getDraft:()=>unavailable('CRM draft restoration'),
  discardDraft:()=>unavailable('CRM draft deletion'),
  calculatePrice:()=>unavailable('Authoritative pricing'),
  checkout:()=>unavailable('Stripe checkout'),
  submit:()=>unavailable('Final submission')
};
