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
const recordsOn=integrationConfig.baseConfigured && integrationConfig.catalystAuth && import.meta.env.VITE_PORTAL_RECORDS==='true';
const recordHttp=recordsOn?createHttpClient({baseUrl:integrationConfig.apiBaseUrl}):null;
const recordReq=path=>recordHttp?recordHttp('/portal/records'+path):unavailable('Authenticated CRM records');
const billingOn=integrationConfig.baseConfigured && integrationConfig.catalystAuth && import.meta.env.VITE_PORTAL_BILLING==='true';
const billingHttp=billingOn?createHttpClient({baseUrl:integrationConfig.apiBaseUrl}):null;
const billingReq=(path,options)=>billingHttp?billingHttp('/portal/billing'+path,options):unavailable('Authorised pricing and checkout');
const documentsOn=integrationConfig.baseConfigured && integrationConfig.catalystAuth && import.meta.env.VITE_PORTAL_DOCUMENTS==='true';
const documentHttp=documentsOn?createHttpClient({baseUrl:integrationConfig.apiBaseUrl}):null;
const documentPath=(kind,id)=>'/portal/documents/'+encodeURIComponent(kind)+'/'+encodeURIComponent(id);
const clone=obj=>JSON.parse(JSON.stringify(obj));
const unavailable=name=>{throw new IntegrationUnavailableError(name);};

// No CRM identity resolution exists in V2 yet; obtaining a Catalyst user does not
// establish ownership of CRM records. Do not pass a Contact ID supplied by the browser
// to legacy V1 write APIs until backend identity resolution + ownership checks are verified.
export const INTEGRATIONS=Object.freeze({
  catalystAuth:integrationConfig.catalystAuth,
  courses:isEnabled(integrationConfig,'courses'),
  address:isEnabled(integrationConfig,'address'),
  crmRecords:recordsOn,crmDrafts:false,crmContactMapping:false,pricing:false,
  underwriting:false,stripeCheckout:billingOn,policyIssuance:false,workdrive:documentsOn,
});
export const portalApi=Object.freeze({
  mode:DATA_MODE,
  integrations:INTEGRATIONS,
  getViewer:()=>resolveViewer({config:integrationConfig,auth,demoUser:DEMO_USER}),
  listRecords:async(kind)=>recordsOn?(await recordReq('/'+(kind?'?kind='+encodeURIComponent(kind):''))).records:DATA_MODE==='demo'?clone(DEMO_RECORDS.filter(r=>!kind||r.kind===kind)):unavailable('Authenticated CRM record listing'),
  getRecord:async(kind,id)=>recordsOn?(await recordReq('/'+encodeURIComponent(kind)+'/'+encodeURIComponent(id))).record:DATA_MODE==='demo'?clone(DEMO_RECORDS.find(r=>r.kind===kind&&r.id===id)||null):unavailable('Authenticated CRM record retrieval'),
  getDashboard:async()=>(await recordReq('/summary')),
  getIdentity:()=>auth.currentUser(),
  register:profile=>auth.signUp(profile),
  signInEmbed:container=>auth.signInEmbed(container),
  // Always uses the email of the verified signed-in user, never a typed address.
  requestPasswordReset:async()=>{const user=await auth.currentUser();return auth.requestPasswordReset(user.email);},
  signOut:()=>auth.signOut(),
  listCourses:options=>gateway.listCourses(options),
  findAddresses:(text,container,options)=>gateway.findAddresses(text,container,options),
  retrieveAddress:(id,options)=>gateway.retrieveAddress(id,options),
  createDraft:async()=>unavailable('CRM draft creation'),
  updateDraft:async()=>unavailable('CRM draft update'),
  getDraft:async()=>unavailable('CRM draft retrieval'),
  listDrafts:async()=>unavailable('CRM draft listing'),
  discardDraft:async()=>unavailable('CRM draft deletion'),
  quote:async id=>(await billingReq('/quotes/'+encodeURIComponent(id))).quote,
  submit:async()=>unavailable('CRM submission'),
  checkout:async quoteId=>billingReq('/checkout',{method:'POST',body:{quoteId}}),
  getDocuments:async(kind,id,path='')=>documentHttp?documentHttp(documentPath(kind,id)+(path?'?path='+encodeURIComponent(path):'')):unavailable('Authorised document listing'),
  getDocumentDownloadUrl:(kind,id,fileId,path='')=>documentsOn?integrationConfig.apiBaseUrl+documentPath(kind,id)+'/file/'+encodeURIComponent(fileId)+(path?'?path='+encodeURIComponent(path):''):null,
});
