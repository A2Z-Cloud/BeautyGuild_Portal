export class PortalRequestError extends Error {
  constructor(code, message, status = null) {
    super(message);
    this.name = 'PortalRequestError';
    this.code = code;
    this.status = status;
  }
}
export class NotConnectedError extends PortalRequestError {
  constructor(operation) {
    super('NOT_CONNECTED', operation + ' requires a verified backend API contract. No change was made.');
  }
}
export const isSafeRoute = path => typeof path === 'string' &&
  path.startsWith('/') && !path.startsWith('//') && !path.includes('..') &&
  !path.includes('\\') && !/[\r\n]/.test(path);
export function createTransport(fetcher = globalThis.fetch) {
  return async function request(route, {method = 'GET', body, signal} = {}) {
    if (!isSafeRoute(route)) throw new PortalRequestError('UNSAFE_ROUTE', 'Invalid relative API route.');
    const verb = method.toUpperCase();
    if (!['GET','POST','PUT','PATCH','DELETE'].includes(verb))
      throw new PortalRequestError('BAD_METHOD', 'Unsupported API method.');
    if (verb === 'GET' && body !== undefined)
      throw new PortalRequestError('BAD_METHOD', 'GET must not send a body.');
    let response;
    try {
      response = await fetcher(route, {
        method: verb, credentials: 'include', cache: 'no-store', signal,
        headers: {Accept: 'application/json', ...(body === undefined ? {} : {'Content-Type':'application/json'})},
        ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      });
    } catch {
      throw new PortalRequestError('NETWORK', 'Service unreachable or request cancelled.');
    }
    let data = null;
    if (response.status !== 204) {
      if (!(response.headers.get('content-type') || '').includes('json'))
        throw new PortalRequestError('BAD_RESPONSE', 'Unexpected response format.', response.status);
      try {data = await response.json();}
      catch {throw new PortalRequestError('BAD_RESPONSE', 'Invalid JSON response.', response.status);}
    }
    if (!response.ok) {
      const statuses = {
        401:['AUTH_REQUIRED','Please sign in to your Guild account.'],
        403:['FORBIDDEN','You are not permitted to access this record.'],
        404:['NOT_FOUND','The requested record was not found.'],
        409:['CONFLICT','The draft has changed. Reload it before saving.'],
        412:['CONFLICT','The draft has changed. Reload it before saving.'],
        422:['VALIDATION','Review the submitted details.'],
        429:['RATE_LIMIT','Service busy. Try again later.'],
      };
      const [code,message] = statuses[response.status] ||
        (response.status >= 500 ? ['SERVER','Service temporarily unavailable.'] : ['REQUEST','Request failed.']);
      throw new PortalRequestError(code, message, response.status);
    }
    return data;
  };
}
