'use strict';

// Environment variables are set in the Catalyst console for this function. Never commit values.
// Only the variables for the routes this function serves are read here.
function httpsUrl(value, fallback, name) {
  const url = String(value || fallback)
    .trim()
    .replace(/\/+$/, '');
  if (!/^https:\/\/[^/\s]+$/.test(url)) throw new Error(`${name} must be an https origin with no path`);
  return url;
}

function boundedInt(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
}

function safeName(value, fallback, name) {
  const v = String(value || fallback).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,79}$/.test(v))
    throw new Error(`${name} contains characters that are not allowed`);
  return v;
}
function unitFloat(value, fallback) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : fallback;
}

function loadConfig(env = process.env) {
  return Object.freeze({
    crmApiDomain: httpsUrl(env.CRM_API_DOMAIN, 'https://www.zohoapis.eu', 'CRM_API_DOMAIN'),
    crmConnectionName: String(env.CRM_CONNECTION_NAME || 'zohocrm').trim(),
    loqateBaseUrl: httpsUrl(env.LOQATE_API_BASE_URL, 'https://api.addressy.com', 'LOQATE_API_BASE_URL'),
    loqateKey: String(env.LOQATE_API_KEY || ''),
    loqateCountries: String(env.LOQATE_COUNTRY_FILTER || '').trim(),
    loqateMaxResults: boundedInt(env.LOQATE_MAX_RESULTS, 40, 1, 100),
    recordsEnabled: env.PORTAL_RECORDS_ENABLED === 'true',
    diagnosticsEnabled: env.PORTAL_DIAGNOSTICS_ENABLED === 'true',
    diagnosticsEmails: String(env.PORTAL_DIAGNOSTICS_EMAILS || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean),
    // Whole email domains (exact, or a subdomain of one) that may also use diagnostics, e.g. "beautyguild.com,a2zcloud.com".
    diagnosticsDomains: String(env.PORTAL_DIAGNOSTICS_DOMAINS || '')
      .split(',')
      .map(s => s.trim().toLowerCase().replace(/^@/, ''))
      .filter(d => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)),
    crmDraftsEnabled: env.PORTAL_CRM_DRAFTS_ENABLED === 'true',
    draftStatus: String(env.PORTAL_CRM_DRAFT_STATUS || 'Draft'),
    // A verified user with no CRM Contact gets one at first save. Set to 'false' to refuse instead.
    draftCreateContact: env.PORTAL_CRM_DRAFT_CREATE_CONTACT !== 'false',
    accreditationEnabled: env.PORTAL_CRM_DRAFTS_ENABLED === 'true' && env.PORTAL_CRM_ACCREDITATION_ENABLED === 'true',
    dealStage: String(env.PORTAL_CRM_DRAFT_DEAL_STAGE || ''),
    // Journey_ID should be a unique CRM field so a repeated save cannot create a duplicate. Set this to 'false' only on a test system.
    draftRequireUnique: env.PORTAL_CRM_DRAFT_REQUIRE_UNIQUE !== 'false',
    schoolServicesEnabled: env.PORTAL_SCHOOL_SERVICES_ENABLED === 'true',
    schoolWritesEnabled: env.PORTAL_SCHOOL_WRITES_ENABLED === 'true',
    // API name of the free-text "where you completed it" field on the CRM Qualifications module. Unset: the value is not sent.
    qualificationCentreField: String(env.PORTAL_QUALIFICATION_CENTRE_FIELD || '').trim(),
    creatorApiDomain: httpsUrl(env.CREATOR_API_DOMAIN, 'https://www.zohoapis.eu', 'CREATOR_API_DOMAIN'),
    creatorConnectionName: String(env.CREATOR_CONNECTION_NAME || 'zohocreator'),
    creatorAccountOwner: String(env.CREATOR_ACCOUNT_OWNER || 'beautyguild'),
    creatorAppLinkName: String(env.CREATOR_APP_LINK_NAME || 'beautyguild'),
    creatorInvoiceReport: String(env.CREATOR_INVOICES_REPORT || 'All_Invoice_Records'),
    // Set these only after confirming the school identifier API name and status in CRM.
    publicVerificationEnabled: env.PUBLIC_SCHOOL_VERIFICATION_ENABLED === 'true',
    schoolRegistrationModule: String(env.PUBLIC_SCHOOL_REGISTRATION_MODULE || 'Accounts').trim(),
    schoolRegistrationField: String(env.PUBLIC_SCHOOL_REGISTRATION_FIELD || '').trim(),
    schoolActiveStatus: String(env.PUBLIC_SCHOOL_ACTIVE_STATUS || 'Verified').trim(),
    billingEnabled: env.PORTAL_BILLING_ENABLED === 'true',
    // Lets signed-out visitors price a membership (no account, no CRM access). Needs billing on as well.
    publicQuotesEnabled: env.PUBLIC_QUOTES_ENABLED === 'true',
    documentsEnabled: env.PORTAL_DOCUMENTS_ENABLED === 'true',
    workdriveApiDomain: httpsUrl(env.WORKDRIVE_API_DOMAIN, 'https://www.zohoapis.eu', 'WORKDRIVE_API_DOMAIN'),
    workdriveConnectionName: String(env.WORKDRIVE_CONNECTION_NAME || 'zohoworkdrive'),
    stripeSecretKey: String(env.STRIPE_SECRET_KEY || ''),
    // Signing secret of the function's own Stripe webhook endpoint (monthly plan schedules). Not Creator's webhook secret.
    stripeScheduleWebhookSecret: String(env.STRIPE_SCHEDULE_WEBHOOK_SECRET || '').trim(),
    portalPublicOrigin: String(env.PORTAL_PUBLIC_ORIGIN || ''),
    analyticsConnectionName: String(env.ANALYTICS_CONNECTION_NAME || 'analytics'),
    // Insurance risk checks (riskChecks.js). Each is off unless its switch is 'true', and a check that is on fails closed.
    risk: Object.freeze({
      sanctionsEnabled: env.PORTAL_RISK_SANCTIONS === 'true',
      floodEnabled: env.PORTAL_RISK_FLOOD === 'true',
      subsidenceEnabled: env.PORTAL_RISK_SUBSIDENCE === 'true',
      guildPhone: String(env.PORTAL_GUILD_PHONE || '01332 224830')
        .trim()
        .slice(0, 30),
      sanctionsThreshold: unitFloat(env.PORTAL_RISK_SANCTIONS_THRESHOLD, 0.88),
      // 0 (the default) treats the Government list as live however long ago it last changed: it is not always updated. Set 1 to 720 hours to block on old data.
      maxAgeHours: boundedInt(env.PORTAL_RISK_SANCTIONS_MAX_AGE_HOURS, 0, 0, 720),
      rowFloor: boundedInt(env.PORTAL_RISK_SANCTIONS_ROW_FLOOR, 40000, 1, 10000000),
      analytics: Object.freeze({
        apiDomain: httpsUrl(env.ANALYTICS_API_DOMAIN, 'https://analyticsapi.zoho.eu', 'ANALYTICS_API_DOMAIN'),
        orgId: String(env.ANALYTICS_ORG_ID || '').trim(),
        workspaceId: String(env.ANALYTICS_WORKSPACE_ID || '309854000000255068').trim(),
        table: safeName(env.ANALYTICS_SANCTIONS_TABLE, 'UK-Sanctions-List', 'ANALYTICS_SANCTIONS_TABLE'),
      }),
      creator: Object.freeze({
        apiDomain: httpsUrl(env.CREATOR_API_DOMAIN, 'https://www.zohoapis.eu', 'CREATOR_API_DOMAIN'),
        owner: String(env.CREATOR_ACCOUNT_OWNER || 'beautyguild'),
        app: String(env.CREATOR_RISK_APP_LINK_NAME || 'insurance-check'),
        floodReport: safeName(env.CREATOR_RISK_FLOOD_REPORT, 'All_Flood_Postcodes', 'CREATOR_RISK_FLOOD_REPORT'),
        subsidenceReport: safeName(
          env.CREATOR_RISK_SUBSIDENCE_REPORT,
          'Subsidence_Postcodes_Report',
          'CREATOR_RISK_SUBSIDENCE_REPORT',
        ),
      }),
    }),
  });
}

module.exports = { loadConfig };
