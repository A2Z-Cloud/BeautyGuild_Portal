import { DEMO_RECORDS, DEMO_USER } from '../data/demo.js';

// The V2 M1 implementation is intentionally frontend-only. No API requests are sent.
// Milestone 2 will wire these methods to verified backend contracts.
export const DATA_MODE = 'demo';
export const INTEGRATIONS = Object.freeze({
  identity:false, crmRecords:false, crmDrafts:false, pricing:false,
  underwriting:false, stripeCheckout:false, policyIssuance:false, workdrive:false,
});
const copy=value=>JSON.parse(JSON.stringify(value));
export class IntegrationUnavailableError extends Error {
  constructor(operation) {
    super(operation+' is not connected in Milestone 1. Nothing was saved, submitted or purchased.');
    this.name='IntegrationUnavailableError';
    this.code='NOT_CONNECTED';
  }
}
const unavailable=(name)=>{throw new IntegrationUnavailableError(name);};
export const portalApi=Object.freeze({
  mode:DATA_MODE,
  getViewer:async()=>copy(DEMO_USER),
  listRecords:async(kind)=>copy(DEMO_RECORDS.filter(r=>!kind||r.kind===kind)),
  getRecord:async(kind,id)=>copy(DEMO_RECORDS.find(r=>r.kind===kind&&r.id===id)||null),
  getIdentity:async()=>unavailable('Catalyst identity'),
  register:async()=>unavailable('Catalyst registration'),
  createDraft:async()=>unavailable('CRM draft creation'),
  updateDraft:async()=>unavailable('CRM draft update'),
  getDraft:async()=>unavailable('CRM draft retrieval'),
  listDrafts:async()=>unavailable('CRM draft listing'),
  discardDraft:async()=>unavailable('CRM draft deletion'),
  quote:async()=>unavailable('Authoritative pricing and underwriting'),
  submit:async()=>unavailable('CRM submission'),
  checkout:async()=>unavailable('Stripe Checkout'),
  getDocuments:async()=>unavailable('Authorised document listing'),
});
