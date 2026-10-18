import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIntegrationConfig,isEnabled,appendPath} from './config.mjs';
import {ApiError,createHttpClient} from './transport.mjs';
import {createLegacyGateway,IntegrationUnavailableError} from './legacy.mjs';

test('demo mode disables everything regardless of supplied address',()=>{
  const c=parseIntegrationConfig({VITE_DATA_MODE:'demo',VITE_API_BASE_URL:'/server/beauty_guild_api',VITE_ENABLED_LEGACY_APIS:'courses,address',VITE_CATALYST_AUTH:'true'});
  assert.equal(c.catalystAuth,false);assert.equal(isEnabled(c,'courses'),false);assert.equal(c.baseConfigured,false);
});
test('api mode explicitly enables only verified legacy read endpoints',()=>{
  const c=parseIntegrationConfig({VITE_DATA_MODE:'api',VITE_API_BASE_URL:'/server/beauty_guild_api/',VITE_ENABLED_LEGACY_APIS:'courses,address,crmDrafts,checkout',VITE_CATALYST_AUTH:'true'});
  assert.equal(c.apiBaseUrl,'/server/beauty_guild_api');assert.deepEqual(c.enabled,['courses','address']);assert.equal(c.catalystAuth,true);
});
test('unconfigured endpoints cannot be used',async()=>{
  const c=parseIntegrationConfig({});
  const g=createLegacyGateway(c,{fetchImpl:async()=>{throw new Error('Must not call fetch');}});
  await assert.rejects(()=>g.listCourses(),IntegrationUnavailableError);
  await assert.rejects(()=>g.findAddresses('SW1A'),IntegrationUnavailableError);
});
test('GET requests include Catalyst session cookie and do not cache',async()=>{
  const calls=[];
  const client=createHttpClient({baseUrl:'/server/beauty_guild_api',fetchImpl:async(url,opts)=>{
    calls.push({url,opts});
    return {ok:true,status:200,text:async()=>JSON.stringify({courses:[]})};
  }});
  assert.deepEqual(await client('/courses'),{courses:[]});
  assert.equal(calls[0].url,'/server/beauty_guild_api/courses');
  assert.equal(calls[0].opts.credentials,'include');
  assert.equal(calls[0].opts.cache,'no-store');
});
test('course route parses only a courses array',async()=>{
  const c=parseIntegrationConfig({VITE_DATA_MODE:'api',VITE_API_BASE_URL:'/server/beauty_guild_api',VITE_ENABLED_LEGACY_APIS:'courses'});
  const g=createLegacyGateway(c,{fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({courses:[{id:'1',name:'Facials'}]})})});
  assert.equal((await g.listCourses())[0].name,'Facials');
});
test('address search uses URL encoding and the exact V1 response shape',async()=>{
  const urls=[];
  const c=parseIntegrationConfig({VITE_DATA_MODE:'api',VITE_API_BASE_URL:'/server/beauty_guild_api',VITE_ENABLED_LEGACY_APIS:'address'});
  const g=createLegacyGateway(c,{fetchImpl:async url=>{
    urls.push(url);
    return {ok:true,status:200,text:async()=>JSON.stringify(url.includes('/find?')?{items:[]}:{address:{postcode:'AB1 2CD'}})};
  }});
  assert.deepEqual(await g.findAddresses('12 High St & Co'),[]);
  assert.ok(urls[0].includes('text=12+High+St+%26+Co'));
  assert.deepEqual(await g.retrieveAddress('GB|123'),{postcode:'AB1 2CD'});
  assert.ok(urls[1].includes('GB%7C123'));
});
test('unauthorised CRM requests return typed errors',async()=>{
  const api=createHttpClient({baseUrl:'/server/beauty_guild_api',fetchImpl:async()=>({ok:false,status:403,text:async()=>JSON.stringify({error:'Not authorised'})})});
  await assert.rejects(()=>api('/courses'),e=>e instanceof ApiError&&e.code==='NOT_AUTHORISED'&&e.status===403);
});
test('bad paths and unsupported methods rejected before fetch',async()=>{
  const api=createHttpClient({baseUrl:'/server/beauty_guild_api',fetchImpl:async()=>{throw new Error('Unexpected fetch');}});
  await assert.rejects(()=>api('//other-site'),e=>e.code==='INVALID_PATH');
  await assert.rejects(()=>api('/courses',{method:'TRACE'}),e=>e.code==='UNSUPPORTED_METHOD');
  assert.throws(()=>appendPath('', '/courses'));
});
test('does not retry or silently mark writes as successful',async()=>{
  const api=createHttpClient({baseUrl:'/server/beauty_guild_api',fetchImpl:async()=>{throw new Error('offline');}});
  await assert.rejects(()=>api('/never',{method:'POST',body:{}}),e=>e.code==='NETWORK_ERROR');
});
