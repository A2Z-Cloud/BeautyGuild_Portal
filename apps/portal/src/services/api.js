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
const draftsOn=integrationConfig.baseConfigured&&integrationConfig.catalystAuth&&import.meta.env.VITE_PORTAL_CRM_DRAFTS==='true';
const draftHttp=draftsOn?createHttpClient({baseUrl:integrationConfig.apiBaseUrl}):null;
const draftReq=(path,opts)=>draftHttp?draftHttp('/portal/drafts'+path,opts):unavailable('CRM drafts');
const schoolOn=integrationConfig.baseConfigured&&integrationConfig.catalystAuth&&import.meta.env.VITE_PORTAL_SCHOOL_SERVICES==='true';
const schoolHttp=schoolOn?createHttpClient({baseUrl:integrationConfig.apiBaseUrl}):null;
const schoolReq=(path,opts)=>schoolHttp?schoolHttp('/portal/management'+path,opts):unavailable('School and invoice services');
const schoolWritesOn=schoolOn&&import.meta.env.VITE_PORTAL_SCHOOL_WRITES==='true';
const recordsOn=integrationConfig.baseConfigured && integrationConfig.catalystAuth && import.meta.env.VITE_PORTAL_RECORDS==='true';
const recordHttp=recordsOn?createHttpClient({baseUrl:integrationConfig.apiBaseUrl}):null;
const recordReq=path=>recordHttp?recordHttp('/portal/records'+path):unavailable('Authenticated CRM records');
const billingOn=integrationConfig.baseConfigured && integrationConfig.catalystAuth && import.meta.env.VITE_PORTAL_BILLING==='true';
// Signed-out visitors can price a membership (no account, no CRM access); the server also has to have PUBLIC_QUOTES_ENABLED on.
const publicQuotesOn=billingOn&&import.meta.env.VITE_PORTAL_PUBLIC_QUOTES==='true';
const publicHttp=publicQuotesOn?createHttpClient({baseUrl:integrationConfig.apiBaseUrl}):null;
const billingHttp=billingOn?createHttpClient({baseUrl:integrationConfig.apiBaseUrl}):null;
const billingReq=(path,options)=>billingHttp?billingHttp('/portal/checkout'+path,options):unavailable('Authorised pricing and checkout');
const documentsOn=integrationConfig.baseConfigured && integrationConfig.catalystAuth && import.meta.env.VITE_PORTAL_DOCUMENTS==='true';
const documentHttp=documentsOn?createHttpClient({baseUrl:integrationConfig.apiBaseUrl}):null;
const documentPath=(kind,id)=>'/portal/documents/'+encodeURIComponent(kind)+'/'+encodeURIComponent(id);
const clone=obj=>JSON.parse(JSON.stringify(obj));
const unavailable=name=>{throw new IntegrationUnavailableError(name);};

// Contact identity is resolved on the server from the verified Catalyst email (src/records.js resolveContact), and every record is
// ownership-checked there. Never pass a Contact ID from the browser to the API.
export const INTEGRATIONS=Object.freeze({
  catalystAuth:integrationConfig.catalystAuth,
  courses:isEnabled(integrationConfig,'courses'),
  address:isEnabled(integrationConfig,'address'),
  schoolServices:schoolOn,schoolWrites:schoolWritesOn,crmRecords:recordsOn,crmDrafts:draftsOn,
  // The accreditation application writes the V1 record set, so it has its own switch on top of saved drafts.
  crmAccreditation:draftsOn&&import.meta.env.VITE_PORTAL_CRM_ACCREDITATION==='true',crmContactMapping:recordsOn,pricing:false,
  underwriting:false,stripeCheckout:billingOn,publicQuotes:publicQuotesOn,policyIssuance:false,workdrive:documentsOn,
});
export const portalApi=Object.freeze({
  mode:DATA_MODE,
  integrations:INTEGRATIONS,
  getViewer:()=>resolveViewer({config:integrationConfig,auth,demoUser:DEMO_USER}),
  listRecords:async(kind)=>recordsOn?(await recordReq('/'+(kind?'?kind='+encodeURIComponent(kind):''))).records:DATA_MODE==='demo'?clone(DEMO_RECORDS.filter(r=>!kind||r.kind===kind)):unavailable('Authenticated CRM record listing'),
  getRecord:async(kind,id)=>recordsOn?(await recordReq('/'+encodeURIComponent(kind)+'/'+encodeURIComponent(id))).record:DATA_MODE==='demo'?clone(DEMO_RECORDS.find(r=>r.kind===kind&&r.id===id)||null):unavailable('Authenticated CRM record retrieval'),
  getDashboard:async()=>(await recordReq('/summary')),
  listSchools:async()=>(await schoolReq('/schools')).schools,
  getSchoolSection:async(id,section)=>schoolReq('/schools/'+encodeURIComponent(id)+'/'+encodeURIComponent(section)),
  getSessionBookings:async(id,sessionId)=>schoolReq('/schools/'+encodeURIComponent(id)+'/sessions/'+encodeURIComponent(sessionId)+'/bookings'),
  getCourseOptions:async id=>schoolReq('/schools/'+encodeURIComponent(id)+'/course-options'),
  saveSchoolQualification:async(id,data)=>schoolWritesOn?(await schoolReq('/schools/'+encodeURIComponent(id)+'/qualifications',{method:'POST',body:data})).qualification:unavailable('School qualification changes'),
  addSchoolTutor:async(id,data)=>schoolWritesOn?(await schoolReq('/schools/'+encodeURIComponent(id)+'/tutors',{method:'POST',body:data})):unavailable('Adding a tutor'),
  createSessionBooking:async(id,sessionId,data)=>schoolWritesOn?(await schoolReq('/schools/'+encodeURIComponent(id)+'/sessions/'+encodeURIComponent(sessionId)+'/bookings',{method:'POST',body:data})).booking:unavailable('Creating a booking'),
  createCourseSession:async(id,data)=>schoolWritesOn?(await schoolReq('/schools/'+encodeURIComponent(id)+'/sessions',{method:'POST',body:data})).session:unavailable('Course session creation'),
  getAccountInvoices:async()=>(await schoolReq('/invoices')).invoices,
  getMembershipInvoices:async(id)=>(await schoolReq('/memberships/'+encodeURIComponent(id)+'/invoices')).invoices,
  getMembershipExtensions:async(id)=>(await schoolReq('/memberships/'+encodeURIComponent(id)+'/extensions')).extensions,
  getIdentity:()=>auth.currentUser(),
  // The signed-in member's contact details from the CRM, to fill in forms. Resolved on the server from the verified email.
  getMyDetails:async()=>(await recordReq('/me')).details,
  register:profile=>auth.signUp(profile),
  signInEmbed:container=>auth.signInEmbed(container),
  // Always uses the email of the verified signed-in user, never a typed address.
  requestPasswordReset:async()=>{const user=await auth.currentUser();return auth.requestPasswordReset(user.email);},
  signOut:()=>auth.signOut(),
  listCourses:options=>gateway.listCourses(options),
  findAddresses:(text,container,options)=>gateway.findAddresses(text,container,options),
  retrieveAddress:(id,options)=>gateway.retrieveAddress(id,options),
  createDraft:async data=>(await draftReq('/',{method:'POST',body:data})).draft,
  updateDraft:async (service,id,data)=>(await draftReq('/'+service+'/'+encodeURIComponent(id),{method:'PUT',body:data})).draft,
  getDraft:async (service,id)=>(await draftReq('/'+service+'/'+encodeURIComponent(id))).draft,
  listDrafts:async ()=>(await draftReq('/')).drafts,
  submitAccreditation:async data=>(await draftReq('/accreditation/submit',{method:'POST',body:data})).accreditation,
  discardDraft:async (service,id)=>draftReq('/'+service+'/'+encodeURIComponent(id),{method:'DELETE'}),
  checkoutQuote:async params=>(await billingReq('/quote?'+new URLSearchParams(params).toString())).quote,
  checkoutQuotePost:async body=>(await billingReq('/quote',{method:'POST',body})).quote,
  publicQuote:async body=>publicHttp?(await publicHttp('/public/quote',{method:'POST',body})).quote:unavailable('Pricing'),
  submit:async()=>unavailable('CRM submission'),
  startCheckout:async body=>billingReq('/',{method:'POST',body}),
  // After a monthly plan is paid for, asks the server to put it on its 12 month schedule. Safe to repeat.
  finishCheckout:async sessionId=>billingReq('/finish',{method:'POST',body:{sessionId}}),
  resumePayment:async policyId=>billingReq('/resume',{method:'POST',body:{policyId}}),
  getDocuments:async(kind,id,path='')=>documentHttp?documentHttp(documentPath(kind,id)+(path?'?path='+encodeURIComponent(path):'')):unavailable('Authorised document listing'),
  getDocumentDownloadUrl:(kind,id,fileId,path='')=>documentsOn?integrationConfig.apiBaseUrl+documentPath(kind,id)+'/file/'+encodeURIComponent(fileId)+(path?'?path='+encodeURIComponent(path):''):null,
});
