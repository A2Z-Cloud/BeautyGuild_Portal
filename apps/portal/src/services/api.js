import {DEMO_RECORDS,DEMO_USER} from '../data/demo.js';
import {parseIntegrationConfig,isEnabled} from './config.mjs';
import {createLegacyGateway,IntegrationUnavailableError} from './legacy.mjs';
import {createCatalystAuth} from './catalystAuth.js';
import {resolveViewer} from './viewer.mjs';
import {createHttpClient} from './transport.mjs';

export {IntegrationUnavailableError};
export const integrationConfig=parseIntegrationConfig(import.meta.env);
export const DATA_MODE=integrationConfig.mode;
const gateway=createLegacyGateway(integrationConfig);
const auth=createCatalystAuth(integrationConfig.catalystAuth);
const draftsOn=integrationConfig.mode==='api' && integrationConfig.catalystAuth && import.meta.env.VITE_PORTAL_DRAFTS==='true';
const draftHttp=draftsOn?createHttpClient({baseUrl:integrationConfig.apiBaseUrl}):null;
const draftReq=(route,opts)=>draftHttp?draftHttp('/portal/drafts'+route,opts):unavailable('Authenticated draft storage');
const clone=obj=>JSON.parse(JSON.stringify(obj));
const unavailable=name=>{throw new IntegrationUnavailableError(name);};

// No CRM identity resolution exists in V2 yet; obtaining a Catalyst user does not
// establish ownership of CRM records. Do not pass a Contact ID supplied by the browser
// to legacy V1 write APIs until backend identity resolution + ownership checks are verified.
export const INTEGRATIONS=Object.freeze({
  catalystAuth:integrationConfig.catalystAuth,
  courses:isEnabled(integrationConfig,'courses'),
  address:isEnabled(integrationConfig,'address'),
  crmRecords:false,crmDrafts:draftsOn,crmContactMapping:false,pricing:false,
  underwriting:false,stripeCheckout:false,policyIssuance:false,workdrive:false,
});
export const portalApi=Object.freeze({
  mode:DATA_MODE,
  integrations:INTEGRATIONS,
  getViewer:()=>resolveViewer({config:integrationConfig,auth,demoUser:DEMO_USER}),
  listRecords:async(kind)=>DATA_MODE==='demo'?clone(DEMO_RECORDS.filter(r=>!kind||r.kind===kind)):unavailable('Authenticated CRM record listing'),
  getRecord:async(kind,id)=>DATA_MODE==='demo'?clone(DEMO_RECORDS.find(r=>r.kind===kind&&r.id===id)||null):unavailable('Authenticated CRM record retrieval'),
  getIdentity:()=>auth.currentUser(),
  register:profile=>auth.signUp(profile),
  signInEmbed:container=>auth.signInEmbed(container),
  signOut:()=>auth.signOut(),
  listCourses:options=>gateway.listCourses(options),
  findAddresses:(text,container,options)=>gateway.findAddresses(text,container,options),
  retrieveAddress:(id,options)=>gateway.retrieveAddress(id,options),
  createDraft:async data=>(await draftReq('/',{method:'POST',body:data})).draft,
  updateDraft:async (id,data)=>(await draftReq('/'+encodeURIComponent(id),{method:'PUT',body:data})).draft,
  getDraft:async id=>(await draftReq('/'+encodeURIComponent(id))).draft,
  listDrafts:async ()=>(await draftReq('/')).drafts,
  discardDraft:async id=>draftReq('/'+encodeURIComponent(id),{method:'DELETE'}),
  quote:async()=>unavailable('Authoritative pricing and underwriting'),
  submit:async()=>unavailable('CRM submission'),
  checkout:async()=>unavailable('Stripe Checkout'),
  getDocuments:async()=>unavailable('Authorised document listing'),
});
