import {isSafePath} from './config.mjs';

export class ApiError extends Error {
  constructor(message,{status=0,code='API_ERROR'}={}) {
    super(message);this.name='ApiError';this.status=status;this.code=code;
  }
}
const allowedMethods=new Set(['GET','POST','PUT','PATCH','DELETE']);
const SAFE_MESSAGES=Object.freeze({
  NOT_AUTHENTICATED:'Please sign in to continue.',
  NOT_AUTHORISED:'You do not have permission to do that.',
  RATE_LIMIT:'Too many requests. Please wait a moment and try again.',
  HTTP_ERROR:'The service is unavailable. Please try again.',
});
export function createHttpClient({baseUrl,fetchImpl=fetch,timeoutMs=15000}) {
  if(!baseUrl || !/^\/(?!\/)|^https:\/\//.test(baseUrl))throw new ApiError('Set a same-origin path or an HTTPS API base URL before enabling live integrations.',{code:'NOT_CONFIGURED'});
  return async function request(path,{method='GET',body,signal}={}) {
    method=String(method).toUpperCase();
    if(!allowedMethods.has(method))throw new ApiError('Unsupported HTTP method.',{code:'UNSUPPORTED_METHOD'});
    if(!isSafePath(path))throw new ApiError('Invalid API path.',{code:'INVALID_PATH'});
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    const abort=()=>controller.abort();
    if(signal?.aborted)controller.abort();
    signal?.addEventListener?.('abort',abort,{once:true});
    try{
      const response=await fetchImpl(baseUrl+path,{
        method, credentials:'include', cache:'no-store', signal:controller.signal,
        headers:{Accept:'application/json',...(body!==undefined?{'Content-Type':'application/json'}:{})},
        ...(body!==undefined?{body:JSON.stringify(body)}:{})
      });
      const raw=await response.text();
      let data={};
      if(raw){try{data=JSON.parse(raw);}catch{throw new ApiError('The service returned an unexpected non-JSON response.',{status:response.status,code:'INVALID_RESPONSE'});}}
      if(!response.ok){
        // Backend error text is never shown to customers: it may carry internal detail.
        const code=response.status===401?'NOT_AUTHENTICATED':response.status===403?'NOT_AUTHORISED':response.status===429?'RATE_LIMIT':'HTTP_ERROR';
        throw new ApiError(SAFE_MESSAGES[code],{status:response.status,code});
      }
      return data;
    }catch(error){
      if(error instanceof ApiError)throw error;
      if(error.name==='AbortError')throw new ApiError('The request timed out or was cancelled.',{code:'TIMEOUT'});
      throw new ApiError('The service cannot be reached. Check the API connection and try again.',{code:'NETWORK_ERROR'});
    }finally{
      clearTimeout(timer);signal?.removeEventListener?.('abort',abort);
    }
  };
}
