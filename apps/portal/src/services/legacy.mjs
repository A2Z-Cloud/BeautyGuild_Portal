import {ApiError,createHttpClient} from './transport.mjs';
import {isEnabled} from './config.mjs';

export class IntegrationUnavailableError extends Error {
  constructor(feature){
    super(feature+' has not been connected or approved for this portal. No customer data was saved or submitted.');
    this.name='IntegrationUnavailableError';this.code='NOT_CONNECTED';
  }
}
// Routes below are sourced from the V1 beauty_guild_api Express backend and its React client.
// They are GET-only, do not accept user-provided Contact IDs and make no CRM mutations.
export function createLegacyGateway(config,options={}){
  const client=config.baseConfigured?createHttpClient({baseUrl:config.apiBaseUrl,...options}):null;
  const requireEnabled=feature=>{
    if(!isEnabled(config,feature) || !client)throw new IntegrationUnavailableError(feature);
    return client;
  };
  return Object.freeze({
    async listCourses({signal}={}){
      const data=await requireEnabled('courses')('/courses',{signal});
      if(!Array.isArray(data.courses))throw new ApiError('Course response is missing a courses array.',{code:'INVALID_RESPONSE'});
      return data.courses;
    },
    async findAddresses(text,container,{signal}={}){
      const value=String(text||'').trim();
      if(value.length<3) return [];
      const params=new URLSearchParams({text:value});
      if(container)params.set('container',String(container));
      const data=await requireEnabled('address')('/address/find?'+params.toString(),{signal});
      if(!Array.isArray(data.items))throw new ApiError('Address response is missing an items array.',{code:'INVALID_RESPONSE'});
      return data.items;
    },
    async retrieveAddress(id,{signal}={}){
      if(!id)throw new ApiError('Choose an address.',{code:'INVALID_ID'});
      const data=await requireEnabled('address')('/address/retrieve?id='+encodeURIComponent(id),{signal});
      if(!data.address||typeof data.address!=='object')throw new ApiError('Address details are unavailable.',{code:'INVALID_RESPONSE'});
      return data.address;
    },
  });
}
