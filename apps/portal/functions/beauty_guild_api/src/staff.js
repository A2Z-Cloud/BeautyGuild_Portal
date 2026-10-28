'use strict';
// Staff API foundation (docs/api-contracts/staff-api.md, widgets/crm/beauty-guild-staff-workspace/STAFF-API-AND-IDENTITY.md).
// Guild staff use the CRM Staff Workspace widget, which cannot hold a secret. A CRM custom function holds the secret, signs each
// request with the logged-in staff user, and calls /staff/... here. This module proves the request came from that function, then
// proves in the CRM that the user is active and on the allow-list. It serves two routes only: /staff/ping (the channel) and
// /staff/me (the channel plus the staff user). Quote, assess and save routes are built on top of it later. Off unless
// PORTAL_STAFF_API_ENABLED is 'true'; an unsigned or wrongly signed request always gets the same 401.
const crypto = require('node:crypto');
const express = require('express');
const { HttpError } = require('./errors');
const { createRateLimiter, clientKey } = require('./rateLimit');

const NONCE = /^[0-9a-f]{32,128}$/;
const SIGNATURE = /^[0-9a-f]{64}$/;
const SIGNATURE_BASE64 = /^[A-Za-z0-9+/]{43}=$/;
const CRM_USER_ID = /^\d{10,25}$/;
const SECONDS = /^\d{10}$/;
const MAX_BODY_BYTES = 256 * 1024;

const sha256Hex = data => crypto.createHash('sha256').update(data).digest('hex');
const notAuthorised = () => new HttpError(401, 'STAFF_AUTH_FAILED', 'Not authorised.');

// What is signed: six lines, in this order. `path` is the path and query exactly as this function receives them (no
// /server/beauty_guild_api prefix), `body` the raw request body (empty for a GET).
function canonicalString({ method, path, body, time, nonce, userId }) {
  return [String(method).toUpperCase(), path, sha256Hex(Buffer.from(body || '')), String(time), nonce, userId].join(
    '\n',
  );
}

function signStaffRequest({ secret, method, path, body, time, nonce, userId }) {
  return crypto
    .createHmac('sha256', secret)
    .update(canonicalString({ method, path, body, time, nonce, userId }))
    .digest('hex');
}

// The CRM's Deluge returns the HMAC as base64, so either 64 hex characters or 44 base64 characters is accepted. Returns lower case hex, or ''.
function normaliseSignature(value) {
  const raw = String(value || '').trim();
  if (SIGNATURE.test(raw.toLowerCase())) return raw.toLowerCase();
  if (SIGNATURE_BASE64.test(raw)) return Buffer.from(raw, 'base64').toString('hex');
  return '';
}

const sameHex = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Checks the four headers, the time window and the signature against every current secret (so a secret can be rotated). It does not
// record the nonce: the caller does that only for a request whose signature is valid, so bad requests cannot fill the store.
// Returns { ok: true, userId, nonce } or { ok: false, reason } (the reason is for the log, never for the caller).
function verifyStaffRequest({ secrets, method, path, body, headers, nowMs, windowSeconds }) {
  const userId = String(headers['x-staff-user'] || '');
  const time = String(headers['x-staff-time'] || '');
  const nonce = String(headers['x-staff-nonce'] || '').toLowerCase();
  const rawSignature = String(headers['x-staff-signature'] || '');
  if (!userId || !time || !nonce || !rawSignature) return { ok: false, reason: 'missing_header' };
  if (!CRM_USER_ID.test(userId)) return { ok: false, reason: 'bad_user' };
  if (!SECONDS.test(time)) return { ok: false, reason: 'bad_time' };
  if (!NONCE.test(nonce)) return { ok: false, reason: 'bad_nonce' };
  const signature = normaliseSignature(rawSignature);
  if (!signature) return { ok: false, reason: 'bad_signature_format' };
  if (Math.abs(nowMs / 1000 - Number(time)) > windowSeconds) return { ok: false, reason: 'stale' };
  const parts = { method, path, body, time, nonce, userId };
  // Every secret is tried, with no early exit, so the time taken does not say which one matched.
  let matched = false;
  for (const secret of secrets) if (sameHex(signStaffRequest({ secret, ...parts }), signature)) matched = true;
  if (matched) return { ok: true, userId, nonce };
  // For the log only, never the caller: what this function expected to sign, as lengths and a short hash of the message (no secret and
  // no signature), so the CRM function's author can find the line that differs. Compare messageSha256 with the first 16 characters of the
  // SHA-256 of the string the CRM function signed.
  const canonical = canonicalString(parts);
  const lines = canonical.split('\n');
  return {
    ok: false,
    reason: 'bad_signature',
    detail: {
      lineLengths: lines.map(l => l.length),
      pathSeen: String(path).slice(0, 200),
      messageSha256: sha256Hex(Buffer.from(canonical)).slice(0, 16),
      receivedForm: /^[0-9a-fA-F]{64}$/.test(rawSignature) ? 'hex' : 'base64',
      secretLengths: secrets.map(x => x.length),
    },
  };
}

// Remembers nonces for a while so a captured request cannot be sent again. It lives in this instance's memory, like the other limiters,
// so it is a best-effort check across instances. A durable store (Catalyst Cache or Data Store) is an open decision in the design.
function createNonceStore({ ttlMs, now = Date.now }) {
  const seen = new Map();
  return function use(nonce) {
    const t = now();
    if (seen.size > 10000) for (const [k, expires] of seen) if (expires <= t) seen.delete(k);
    const expires = seen.get(nonce);
    if (expires && expires > t) return false;
    seen.set(nonce, t + ttlMs);
    return true;
  };
}

// The actor the pricing and discount code takes. Every approved role may waive (Guild answer, 26 October 2026).
const actorOf = ({ id, name, email }) => ({ type: 'staff', id, name, email, canWaive: true });

const lower = v =>
  String(v || '')
    .trim()
    .toLowerCase();

// Is this CRM user active and on the allow-list? The list holds CRM profile or role names (case-insensitive). An empty list allows nobody.
function isAllowedStaff(user, allowedRoles) {
  if (!user || user.status !== 'active') return false;
  const allowed = new Set(allowedRoles.map(lower));
  return allowed.has(lower(user.profile)) || allowed.has(lower(user.role));
}

function registerStaffRoutes(
  app,
  {
    enabled,
    secrets = [],
    roles = [],
    actions = null,
    draftsRouter = null,
    windowSeconds = 300,
    getCrmHeaders,
    crmApiDomain,
    fetchImpl = fetch,
    now = Date.now,
    log = console.log,
  },
) {
  if (!enabled) return;
  if (!secrets.length) throw new Error('The staff API is on but has no signing secret');
  const router = express.Router();
  const useNonce = createNonceStore({ ttlMs: (windowSeconds * 2 + 60) * 1000, now });
  // Best effort, per instance: slows a flood of requests, and a run of failures.
  const limiter = createRateLimiter({ limit: 300, windowMs: 60 * 1000, now });
  const failures = createRateLimiter({ limit: 20, windowMs: 60 * 1000, now });
  const audit = entry => log(JSON.stringify({ event: 'staff_request', ...entry }));

  // The body is read raw, because the signature covers its exact bytes.
  router.use(express.raw({ type: () => true, limit: MAX_BODY_BYTES }));
  router.use((err, req, res, next) =>
    next(err && err.type === 'entity.too.large' ? new HttpError(413, 'TOO_LARGE', 'Request too large.') : err),
  );

  const authenticate = (req, res, next) => {
    const key = clientKey(req);
    if (!limiter(key))
      return next(new HttpError(429, 'RATE_LIMIT', 'Too many requests. Please wait a moment and try again.'));
    const checked = verifyStaffRequest({
      secrets,
      method: req.method,
      path: req.originalUrl,
      body: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
      headers: req.headers,
      nowMs: now(),
      windowSeconds,
    });
    const reject = (reason, detail = {}) => {
      audit({ route: req.path, outcome: 'refused', reason, ...detail });
      return next(
        failures(key)
          ? notAuthorised()
          : new HttpError(429, 'RATE_LIMIT', 'Too many requests. Please wait a moment and try again.'),
      );
    };
    if (!checked.ok) return reject(checked.reason, checked.detail);
    if (!useNonce(checked.nonce)) return reject('replay');
    req.staffCall = { userId: checked.userId, requestId: crypto.randomUUID() };
    return next();
  };

  // A valid signature proves the CRM function sent the request. The CRM still has to say the user is real, active and allowed.
  // A refusal to act because the CRM could not say. `diag` is for the log only and is never sent to the caller: which step failed and, for a
  // CRM answer, its status and error code (for example OAUTH_SCOPE_MISMATCH when the connection lacks the users scope). No token or header.
  const lookupFailed = diag =>
    Object.assign(new HttpError(503, 'STAFF_LOOKUP_UNAVAILABLE', 'Staff lookup is unavailable.'), { diag });
  const brief = (v, n) =>
    String(v ?? '')
      .replace(/[\u0000-\u001f]/g, ' ')
      .slice(0, n);

  async function lookupStaffUser(req, userId) {
    let headers;
    try {
      headers = await getCrmHeaders(req);
    } catch (e) {
      throw lookupFailed({ stage: 'connection', error: brief(e?.name, 60), message: brief(e?.message, 120) });
    }
    let response;
    try {
      response = await fetchImpl(`${crmApiDomain}/crm/v3/users/${encodeURIComponent(userId)}`, {
        headers: { ...headers, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
    } catch (e) {
      throw lookupFailed({ stage: 'request', error: brief(e?.name, 60), message: brief(e?.message, 120) });
    }
    if (response.status === 204 || response.status === 404) return null;
    // Fail closed: any other answer, including a missing CRM scope for users, is a refusal to act, not a guess.
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw lookupFailed({
        stage: 'crm',
        crmStatus: response.status,
        crmCode: brief(body?.code, 60),
        crmMessage: brief(body?.message, 160),
      });
    }
    const record = ((await response.json().catch(() => null)) || {}).users?.[0];
    if (!record || String(record.id) !== String(userId)) return null;
    return {
      id: String(record.id),
      name: String(record.full_name || [record.first_name, record.last_name].filter(Boolean).join(' ') || '').trim(),
      email: lower(record.email),
      status: lower(record.status),
      profile: String(record.profile?.name || ''),
      role: String(record.role?.name || ''),
    };
  }

  const requireStaff = async (req, res, next) => {
    try {
      const user = await lookupStaffUser(req, req.staffCall.userId);
      if (!isAllowedStaff(user, roles)) {
        audit({
          route: req.path,
          requestId: req.staffCall.requestId,
          staffUserId: req.staffCall.userId,
          outcome: 'refused',
          reason: user ? 'not_allowed' : 'unknown_user',
        });
        return next(notAuthorised());
      }
      req.staff = user;
      return next();
    } catch (err) {
      audit({
        route: req.path,
        requestId: req.staffCall.requestId,
        staffUserId: req.staffCall.userId,
        outcome: 'error',
        reason: 'lookup_unavailable',
        ...(err.diag || {}),
      });
      return next(err);
    }
  };

  // The function's own clock, in whole seconds, with no sign-in: the CRM function signs with this time instead of its own clock, because
  // Deluge's clock and time zone handling can be out by hours. It gives nothing away (anyone can read a clock) and weakens nothing: a
  // request still needs the secret, the time window and a fresh nonce. Limited per caller like the rest.
  const timeLimit = createRateLimiter({ limit: 300, windowMs: 60 * 1000, now });
  router.get('/time', (req, res, next) =>
    timeLimit(clientKey(req))
      ? res.json({ serverTime: Math.floor(now() / 1000) })
      : next(new HttpError(429, 'RATE_LIMIT', 'Too many requests. Please wait a moment and try again.')),
  );

  // The channel only: proves the signing works end to end. Echoes the path this function saw, because that exact string is what
  // must be signed (the Catalyst mount prefix is not part of it).
  router.get('/ping', authenticate, (req, res) => {
    audit({ route: req.path, requestId: req.staffCall.requestId, staffUserId: req.staffCall.userId, outcome: 'ok' });
    res.json({
      ok: true,
      serverTime: Math.floor(now() / 1000),
      seenPath: req.originalUrl,
      staffUserId: req.staffCall.userId,
      requestId: req.staffCall.requestId,
    });
  });

  // The channel and the person: who the CRM says this is, and the actor object the pricing code takes. Every approved role may
  // waive (Guild answer, 26 October 2026); a narrower rule replaces this single line when the roles are agreed.
  router.get('/me', authenticate, requireStaff, (req, res) => {
    const { id, name, email, profile, role } = req.staff;
    audit({ route: req.path, requestId: req.staffCall.requestId, staffUserId: id, profile, role, outcome: 'ok' });
    res.json({
      requestId: req.staffCall.requestId,
      staff: { id, name, email, profile, role },
      actor: actorOf(req.staff),
    });
  });

  // The routes that price and save for a customer the staff member chose. The body is signed JSON; the Contact comes from `contactId`.
  const writes = createRateLimiter({ limit: 60, windowMs: 60 * 1000, now });
  const bodyOf = req => {
    try {
      const parsed = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };
  const priced = (route, action) => async (req, res, next) => {
    try {
      if (!actions || typeof actions[action] !== 'function')
        throw new HttpError(503, 'NOT_AVAILABLE', 'This is not available yet.');
      if (!writes(req.staff.id))
        throw new HttpError(429, 'RATE_LIMIT', 'Too many requests. Please wait a moment and try again.');
      const body = bodyOf(req);
      if (!body) throw new HttpError(400, 'INVALID_REQUEST', 'Send the request as a JSON object.');
      const waivers = Array.isArray(body.waivers)
        ? body.waivers.filter(w => w && typeof w === 'object').slice(0, 6)
        : [];
      const result = await actions[action](req, {
        contactId: String(body.contactId || ''),
        body,
        voucherCode: String(body.voucherCode || '').slice(0, 60),
        waivers,
        applicationId: String(body.applicationId || ''),
        actor: actorOf(req.staff),
      });
      audit({
        route,
        requestId: req.staffCall.requestId,
        staffUserId: req.staff.id,
        contactId: result.contact?.id,
        service: String(body.service || ''),
        outcome: 'ok',
      });
      res.status(result.created === true ? 201 : 200).json({ requestId: req.staffCall.requestId, ...result });
    } catch (err) {
      audit({
        route,
        requestId: req.staffCall.requestId,
        staffUserId: req.staff?.id,
        outcome: 'error',
        code: err.code,
      });
      next(err);
    }
  };
  // Read-only lookups for a Contact the staff member chose. The Contact and record ids come in the (signed) query string.
  const reads = (route, action) => async (req, res, next) => {
    try {
      if (!actions || typeof actions[action] !== 'function')
        throw new HttpError(503, 'NOT_AVAILABLE', 'This is not available yet.');
      if (!writes(req.staff.id))
        throw new HttpError(429, 'RATE_LIMIT', 'Too many requests. Please wait a moment and try again.');
      const result = await actions[action](req, {
        contactId: String(req.query.contactId || ''),
        recordId: String(req.query.recordId || ''),
      });
      audit({
        route,
        requestId: req.staffCall.requestId,
        staffUserId: req.staff.id,
        contactId: result.contact?.id,
        outcome: 'ok',
      });
      res.json({ requestId: req.staffCall.requestId, ...result });
    } catch (err) {
      audit({
        route,
        requestId: req.staffCall.requestId,
        staffUserId: req.staff?.id,
        outcome: 'error',
        code: err.code,
      });
      next(err);
    }
  };
  router.get('/membership-options', authenticate, requireStaff, reads('/membership-options', 'staffMembershipOptions'));
  router.get('/cover', authenticate, requireStaff, reads('/cover', 'staffCover'));

  // The portal's draft services (save, resume, list, discard, accreditation) for a Contact the staff member chose, so a draft started by staff
  // is the customer's own draft in Portal V2 and the other way round. The router is the customer's own; this only supplies the Contact.
  const withStaffContact = async (req, res, next) => {
    try {
      if (!actions || typeof actions.staffContact !== 'function')
        throw new HttpError(503, 'NOT_AVAILABLE', 'This is not available yet.');
      if (!writes(req.staff.id))
        throw new HttpError(429, 'RATE_LIMIT', 'Too many requests. Please wait a moment and try again.');
      const hasBody = req.method === 'POST' || req.method === 'PUT';
      const body = hasBody ? bodyOf(req) : {};
      if (!body) throw new HttpError(400, 'INVALID_REQUEST', 'Send the request as a JSON object.');
      // The body was read raw so the signature could cover it; hand the parsed object on and mark it read so the router does not parse again.
      req.body = body;
      req._body = true;
      req.staffContact = await actions.staffContact(req, String(hasBody ? body.contactId : req.query.contactId || ''));
      res.on('finish', () =>
        audit({
          route: '/drafts' + req.path,
          method: req.method,
          requestId: req.staffCall.requestId,
          staffUserId: req.staff.id,
          contactId: String(req.staffContact.id),
          status: res.statusCode,
          outcome: res.statusCode < 400 ? 'ok' : 'error',
        }),
      );
      next();
    } catch (err) {
      next(err);
    }
  };
  if (draftsRouter) router.use('/drafts', authenticate, requireStaff, withStaffContact, draftsRouter);

  // Prices only: nothing is charged, saved or sent. Also the assessment: insurance answers come back as a decision or a referral.
  router.post('/quote', authenticate, requireStaff, priced('/quote', 'staffQuote'));
  // A Stripe Checkout link for the customer (test mode, its own switch). Same body as /staff/quote. Returns `checkoutUrl` for the staff member to
  // send; the session identifies the customer, not the staff member.
  router.post('/payment-link', authenticate, requireStaff, priced('/payment-link', 'staffPaymentLink'));
  // Saves a quoted insurance change as a revision (no payment), recording the staff member. Safe to repeat: the same change saves once.
  router.post(
    '/insurance-change/revision',
    authenticate,
    requireStaff,
    priced('/insurance-change/revision', 'staffSaveRevision'),
  );

  app.use('/staff', router);
}

module.exports = {
  registerStaffRoutes,
  signStaffRequest,
  verifyStaffRequest,
  canonicalString,
  createNonceStore,
  isAllowedStaff,
};
