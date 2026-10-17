import {DEMO_RECORDS, DEMO_USER} from '../data/demo.js';
import {NotConnectedError} from './transport.mjs';
import {createDraftService, DRAFT_KINDS, canUseDrafts} from './drafts.mjs';

// The only usable runtime today is a clearly labelled demonstration.
// An unsupported "live" flag cannot enable any CRM, identity or payment call.
export const DATA_MODE = import.meta.env?.VITE_DATA_MODE === 'demo' ||
  !import.meta.env?.VITE_DATA_MODE ? 'demo' : 'integration-pending';

export const DRAFT_CAPABILITIES = Object.freeze(Object.fromEntries(
  DRAFT_KINDS.map(kind => [kind, canUseDrafts(kind)])
));
export const INTEGRATIONS = Object.freeze({
  identity: false,
  crmRecords: false,
  crmDrafts: false, // Must remain false until verified auth AND all draft contracts exist.
  pricing: false,
  underwriting: false,
  stripeCheckout: false,
  policyIssuance: false,
  workdrive: false,
  loqate: false,
  creator: false,
});
export {NotConnectedError as IntegrationUnavailableError};

const draftClient = createDraftService();
const copy = value => JSON.parse(JSON.stringify(value));
const unavailable = operation => {throw new NotConnectedError(operation);};

export const portalApi = Object.freeze({
  mode: DATA_MODE,
  // These are isolated examples, not the result of authenticated CRM reads.
  getViewer: async () => DATA_MODE === 'demo' ? copy(DEMO_USER) : unavailable('CRM viewer'),
  listRecords: async kind => DATA_MODE === 'demo' ?
    copy(DEMO_RECORDS.filter(record => !kind || record.kind === kind)) : unavailable('CRM record listing'),
  getRecord: async (kind, id) => DATA_MODE === 'demo' ?
    copy(DEMO_RECORDS.find(record => record.kind === kind && record.id === id) || null) :
    unavailable('CRM record'),
  getIdentity: async () => unavailable('Catalyst identity and Contact resolution'),
  register: async () => unavailable('Catalyst registration'),
  createDraft: (...args) => draftClient.createDraft(...args),
  listDrafts: (...args) => draftClient.listDrafts(...args),
  getDraft: (...args) => draftClient.getDraft(...args),
  updateDraft: (...args) => draftClient.updateDraft(...args),
  discardDraft: (...args) => draftClient.discardDraft(...args),
  quote: async () => unavailable('Authoritative pricing and underwriting'),
  submit: async () => unavailable('CRM submission'),
  checkout: async () => unavailable('Stripe Checkout'),
  getDocuments: async () => unavailable('Authorised document listing'),
});
