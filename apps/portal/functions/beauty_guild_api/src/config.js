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
    billingEnabled:env.PORTAL_BILLING_ENABLED === 'true',
    stripeSecretKey:String(env.STRIPE_SECRET_KEY||''),
    stripeWebhookSecret:String(env.STRIPE_WEBHOOK_SECRET||''),
    portalPublicOrigin:String(env.PORTAL_PUBLIC_ORIGIN||''),
  });
}

module.exports = { loadConfig };
