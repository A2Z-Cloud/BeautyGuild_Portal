import {NotConnectedError, PortalRequestError, createTransport, isSafeRoute} from './transport.mjs';

export const DRAFT_KINDS = Object.freeze(['membership', 'insurance', 'accreditation']);
export const DRAFT_ACTIONS = Object.freeze(['create', 'list', 'get', 'update', 'discard']);

// No endpoint in the repository's API-contract documentation is verified.
// Deliberately empty. Do not populate until the backend owner supplies actual
// routes, request/response mappings, auth enforcement and ownership tests.
export const VERIFIED_DRAFT_CONTRACTS = Object.freeze({});

const validObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export function normaliseDraft(value, kind) {
  if (!validObject(value) || typeof value.id !== 'string' || !value.id ||
      value.kind !== kind || typeof value.updatedAt !== 'string' ||
      typeof value.status !== 'string' || !validObject(value.answers) ||
      (typeof value.revision !== 'string' && typeof value.revision !== 'number')) {
    throw new PortalRequestError('BAD_RESPONSE', 'The service returned an incomplete draft.');
  }
  return {
    id: value.id, kind, updatedAt: value.updatedAt, status: value.status,
    revision: value.revision, step: value.step ?? null, answers: value.answers,
  };
}
export function canUseDrafts(kind, contracts = VERIFIED_DRAFT_CONTRACTS) {
  if (!DRAFT_KINDS.includes(kind)) return false;
  const config = contracts[kind];
  return Boolean(config?.verified && DRAFT_ACTIONS.every(action => {
    const op = config.operations?.[action];
    return op?.verified === true && typeof op.route === 'string' &&
      isSafeRoute(op.route) && typeof op.method === 'string' &&
      typeof op.encode === 'function' && typeof op.decode === 'function';
  }));
}
export function createDraftService({
  contracts = VERIFIED_DRAFT_CONTRACTS,
  request = createTransport(),
} = {}) {
  async function execute(kind, action, {id, answers, step, revision, signal} = {}) {
    if (!DRAFT_KINDS.includes(kind)) {
      throw new PortalRequestError('INVALID_SERVICE', 'Unsupported draft service.');
    }
    if (!DRAFT_ACTIONS.includes(action)) {
      throw new PortalRequestError('INVALID_ACTION', 'Unsupported draft operation.');
    }
    const config = contracts[kind];
    const op = config?.operations?.[action];
    if (!config?.verified || !op?.verified || typeof op.route !== 'string' ||
        !isSafeRoute(op.route) || typeof op.encode !== 'function' ||
        typeof op.decode !== 'function' || typeof op.method !== 'string') {
      throw new NotConnectedError(kind + ' draft ' + action);
    }
    const hasId = ['get', 'update', 'discard'].includes(action);
    if (hasId && (typeof id !== 'string' || !id || !op.route.includes(':id'))) {
      throw new PortalRequestError('INVALID_DRAFT_ID', 'Invalid draft reference.');
    }
    if (!hasId && op.route.includes(':id')) {
      throw new PortalRequestError('BAD_CONTRACT', 'Draft route is incorrectly configured.');
    }
    const route = hasId ? op.route.replace(':id', encodeURIComponent(id)) : op.route;
    if (!isSafeRoute(route)) {
      throw new PortalRequestError('UNSAFE_ROUTE', 'Invalid draft route.');
    }
    if (['create', 'update'].includes(action) && !validObject(answers)) {
      throw new PortalRequestError('INVALID_PAYLOAD', 'Draft answers must be an object.');
    }
    // Only service-specific data is passed to the confirmed request mapper.
    // Authenticated Contact identity and record ownership MUST be derived
    // and enforced by the backend, never trusted from client-provided IDs.
    const input = {kind, id, answers, step, revision};
    const payload = op.encode(input);
    const result = await request(route, {method: op.method, body: payload, signal});
    const mapped = op.decode(result);
    if (action === 'list') {
      if (!Array.isArray(mapped)) throw new PortalRequestError('BAD_RESPONSE', 'Invalid draft listing.');
      return mapped.map(item => normaliseDraft(item, kind));
    }
    if (action === 'discard') {
      if (mapped !== true) throw new PortalRequestError('BAD_RESPONSE', 'Draft deletion was not confirmed.');
      return true;
    }
    return normaliseDraft(mapped, kind);
  }
  return Object.freeze({
    createDraft: (kind, values, options = {}) => execute(kind, 'create', {...values, ...options}),
    listDrafts: (kind, options = {}) => execute(kind, 'list', options),
    getDraft: (kind, id, options = {}) => execute(kind, 'get', {id, ...options}),
    updateDraft: (kind, id, values, options = {}) => execute(kind, 'update', {id, ...values, ...options}),
    discardDraft: (kind, id, revision, options = {}) =>
      execute(kind, 'discard', {id, revision, ...options}),
  });
}
