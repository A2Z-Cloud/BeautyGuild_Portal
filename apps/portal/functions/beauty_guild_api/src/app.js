'use strict';
const express = require('express');
const { HttpError } = require('./errors');
const { createLoqate } = require('./loqate');
const { createCourses } = require('./courses');
const { createRateLimiter, clientKey } = require('./rateLimit');
const { registerRecordRoutes } = require('./records');
const { registerCheckoutRoutes } = require('./checkout');
const { registerDocumentRoutes } = require('./documents');
const { registerDiagnosticsRoutes } = require('./diagnostics');
const { registerPublicSchoolVerification } = require('./publicSchoolVerification');
const { registerVoucherRoutes } = require('./vouchers');
const { registerDraftRoutes } = require('./crmDrafts');
const { registerSchoolRoutes } = require('./schoolServices');
const { createRiskChecks } = require('./riskChecks');

const TEXT_MIN = 3;
const TEXT_MAX = 100;
const ID_PATTERN = /^[A-Za-z0-9|._:-]{1,100}$/;

function cleanText(value) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function createApp({
  config,
  getCrmHeaders,
  fetchImpl = fetch,
  now = Date.now,
  log = console.log,
  addressLimit = 60,
  addressWindowMs = 60 * 1000,
  getCurrentUser,
  getWorkdriveHeaders,
  getCreatorHeaders,
  getAnalyticsHeaders,
  accreditationSleep,
}) {
  const loqate = createLoqate({ config, fetchImpl, log });
  const courses = createCourses({ config, getCrmHeaders, fetchImpl, now, log });
  const addressLimiter = createRateLimiter({ limit: addressLimit, windowMs: addressWindowMs, now });
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  // Read-only function: reject anything but GET before any route logic runs.
  app.use((req, res, next) => {
    if (
      req.method !== 'GET' &&
      !req.path.startsWith('/portal/checkout') &&
      !req.path.startsWith('/stripe/webhook') &&
      !req.path.startsWith('/public/quote') &&
      !req.path.startsWith('/portal/drafts') &&
      !req.path.startsWith('/portal/management')
    )
      return next(new HttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.'));
    return next();
  });

  const handle = fn => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      next(err);
    }
  };
  const limitAddress = (req, res, next) =>
    addressLimiter(clientKey(req))
      ? next()
      : next(new HttpError(429, 'RATE_LIMIT', 'Too many requests. Please wait a moment and try again.'));

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.get(
    '/courses',
    handle(async (req, res) => {
      res.json({ courses: await courses.listActiveGti(req) });
    }),
  );

  app.get(
    '/address/find',
    limitAddress,
    handle(async (req, res) => {
      const text = cleanText(req.query.text);
      if (text.length < TEXT_MIN || text.length > TEXT_MAX) {
        throw new HttpError(400, 'INVALID_REQUEST', `Enter between ${TEXT_MIN} and ${TEXT_MAX} characters to search.`);
      }
      const container = req.query.container === undefined ? '' : String(req.query.container);
      if (container && !ID_PATTERN.test(container))
        throw new HttpError(400, 'INVALID_REQUEST', 'Invalid address group.');
      res.json({ items: await loqate.find(text, container) });
    }),
  );

  app.get(
    '/address/retrieve',
    limitAddress,
    handle(async (req, res) => {
      const id = req.query.id === undefined ? '' : String(req.query.id);
      if (!ID_PATTERN.test(id)) throw new HttpError(400, 'INVALID_REQUEST', 'Invalid address.');
      res.json({ address: await loqate.retrieve(id) });
    }),
  );

  const riskChecks = createRiskChecks({
    config: config.risk,
    getAnalyticsHeaders,
    getCreatorHeaders,
    fetchImpl,
    now,
    log,
  });
  registerSchoolRoutes(app, {
    enabled: config.schoolServicesEnabled,
    writesEnabled: config.schoolWritesEnabled,
    getCurrentUser,
    getCrmHeaders,
    getCreatorHeaders,
    config,
    fetchImpl,
  });
  registerPublicSchoolVerification(app, {
    enabled: config.publicVerificationEnabled,
    registrationModule: config.schoolRegistrationModule,
    registrationField: config.schoolRegistrationField,
    activeStatus: config.schoolActiveStatus,
    getCrmHeaders,
    crmApiDomain: config.crmApiDomain,
    fetchImpl,
    now,
  });
  registerRecordRoutes(app, {
    enabled: config.recordsEnabled,
    getCurrentUser,
    getCrmHeaders,
    crmApiDomain: config.crmApiDomain,
    fetchImpl,
    hideDrafts: config.crmDraftsEnabled,
    draftStatus: config.draftStatus,
  });
  registerVoucherRoutes(app, {
    enabled: config.vouchersEnabled,
    getCurrentUser,
    getCrmHeaders,
    crmApiDomain: config.crmApiDomain,
    fetchImpl,
    module: config.voucherModule,
    now,
  });
  registerCheckoutRoutes(app, {
    publicQuotesEnabled: config.publicQuotesEnabled,
    enabled: config.billingEnabled,
    getCurrentUser,
    getCrmHeaders,
    crmApiDomain: config.crmApiDomain,
    stripeKey: config.stripeSecretKey,
    scheduleWebhookSecret: config.stripeScheduleWebhookSecret,
    publicOrigin: config.portalPublicOrigin,
    riskChecks,
    fetchImpl,
    now,
  });
  registerDraftRoutes(app, {
    enabled: config.crmDraftsEnabled,
    getCurrentUser,
    getCrmHeaders,
    crmApiDomain: config.crmApiDomain,
    config,
    fetchImpl,
    listCourses: req => courses.listActiveGti(req),
    sleep: accreditationSleep,
  });
  registerDiagnosticsRoutes(app, {
    enabled: config.diagnosticsEnabled,
    allowedEmails: config.diagnosticsEmails,
    allowedDomains: config.diagnosticsDomains,
    getCurrentUser,
    getCrmHeaders,
    crmApiDomain: config.crmApiDomain,
    fetchImpl,
    risk: config.risk,
    getAnalyticsHeaders,
    getCreatorHeaders,
  });
  registerDocumentRoutes(app, {
    enabled: config.documentsEnabled,
    getCurrentUser,
    getCrmHeaders,
    getWorkdriveHeaders,
    crmApiDomain: config.crmApiDomain,
    workdriveApiDomain: config.workdriveApiDomain,
    fetchImpl,
  });
  app.use((req, res, next) => next(new HttpError(404, 'NOT_FOUND', 'Not found.')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError)
      return res
        .status(err.status)
        .json({ error: err.message, code: err.code, ...(err.details ? { details: err.details } : {}) });
    log('Unhandled error', err && err.name, err && err.message);
    return res.status(500).json({ error: 'Something went wrong.', code: 'INTERNAL' });
  });
  return app;
}

module.exports = { createApp };
