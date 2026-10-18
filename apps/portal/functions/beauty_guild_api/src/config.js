'use strict';

// Environment variables are set in the Catalyst console for this function. Never commit values.
// Only the variables for the routes this function serves are read here.
function httpsUrl(value, fallback, name) {
  const url = String(value || fallback).trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^/\s]+$/.test(url)) throw new Error(`${name} must be an https origin with no path`);
  return url;
}

function boundedInt(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
}

function loadConfig(env = process.env) {
  return Object.freeze({
    crmApiDomain: httpsUrl(env.CRM_API_DOMAIN, 'https://www.zohoapis.eu', 'CRM_API_DOMAIN'),
    crmConnectionName: String(env.CRM_CONNECTION_NAME || 'zohocrm').trim(),
    loqateBaseUrl: httpsUrl(env.LOQATE_API_BASE_URL, 'https://api.addressy.com', 'LOQATE_API_BASE_URL'),
    loqateKey: String(env.LOQATE_API_KEY || ''),
    loqateCountries: String(env.LOQATE_COUNTRY_FILTER || '').trim(),
    loqateMaxResults: boundedInt(env.LOQATE_MAX_RESULTS, 40, 1, 100),
    recordsEnabled:env.PORTAL_RECORDS_ENABLED === 'true',
    crmDraftsEnabled:env.PORTAL_CRM_DRAFTS_ENABLED === 'true',
    draftStatus:String(env.PORTAL_CRM_DRAFT_STATUS||'Draft'),
    dealStage:String(env.PORTAL_CRM_DRAFT_DEAL_STAGE||''),
    schoolServicesEnabled:env.PORTAL_SCHOOL_SERVICES_ENABLED === 'true',
    schoolWritesEnabled:env.PORTAL_SCHOOL_WRITES_ENABLED === 'true',
    creatorApiDomain:httpsUrl(env.CREATOR_API_DOMAIN,'https://www.zohoapis.eu','CREATOR_API_DOMAIN'),
    creatorConnectionName:String(env.CREATOR_CONNECTION_NAME||'zohocreator'),
    creatorAccountOwner:String(env.CREATOR_ACCOUNT_OWNER||'beautyguild'),
    creatorAppLinkName:String(env.CREATOR_APP_LINK_NAME||'beautyguild'),
    creatorInvoiceReport:String(env.CREATOR_INVOICES_REPORT||'All_Invoice_Records'),
    // Set these only after confirming the school identifier API name and status in CRM.
    publicVerificationEnabled:env.PUBLIC_SCHOOL_VERIFICATION_ENABLED === 'true',
    schoolRegistrationModule:String(env.PUBLIC_SCHOOL_REGISTRATION_MODULE||'Accounts').trim(),
    schoolRegistrationField:String(env.PUBLIC_SCHOOL_REGISTRATION_FIELD||'').trim(),
    schoolActiveStatus:String(env.PUBLIC_SCHOOL_ACTIVE_STATUS||'Verified').trim(),
    billingEnabled:env.PORTAL_BILLING_ENABLED === 'true',
    documentsEnabled:env.PORTAL_DOCUMENTS_ENABLED === 'true',
    workdriveApiDomain:httpsUrl(env.WORKDRIVE_API_DOMAIN,'https://www.zohoapis.eu','WORKDRIVE_API_DOMAIN'),
    workdriveConnectionName:String(env.WORKDRIVE_CONNECTION_NAME||'zohoworkdrive'),
    stripeSecretKey:String(env.STRIPE_SECRET_KEY||''),
    stripeWebhookSecret:String(env.STRIPE_WEBHOOK_SECRET||''),
    portalPublicOrigin:String(env.PORTAL_PUBLIC_ORIGIN||''),
  });
}

module.exports = { loadConfig };
