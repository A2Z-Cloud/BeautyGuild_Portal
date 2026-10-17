import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PortalRequestError, NotConnectedError, createTransport, isSafeRoute,
} from './transport.mjs';
import {
  VERIFIED_DRAFT_CONTRACTS, canUseDrafts, createDraftService, normaliseDraft,
} from './drafts.mjs';

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {status, headers: {'content-type':'application/json'}});
const sample = {
  id: 'draft/123', kind: 'membership', status: 'Draft', revision: 3,
  updatedAt: '2026-10-17T08:00:00Z', step: 'details', answers: {firstName:'Example'},
};
function verifiedContracts() {
  const base = '/verified-gateway/membership-drafts';
  const encode = data => ({answers:data.answers, step:data.step, revision:data.revision});
  const decode = response => response;
  return {membership: {verified:true, operations:{
    create: {verified:true, method:'POST', route:base, encode, decode},
    list: {verified:true, method:'GET', route:base, encode:()=>undefined, decode},
    get: {verified:true, method:'GET', route:base+'/:id', encode:()=>undefined, decode},
    update: {verified:true, method:'PATCH', route:base+'/:id', encode, decode},
    discard: {verified:true, method:'DELETE', route:base+'/:id', encode:()=>undefined, decode:()=>true},
  }}};
}
test('contracts are deliberately unverified for every service', () => {
  assert.deepEqual(VERIFIED_DRAFT_CONTRACTS, {});
  for (const kind of ['membership','insurance','accreditation'])
    assert.equal(canUseDrafts(kind), false);
});
test('API paths are same-origin only', () => {
  assert.equal(isSafeRoute('/server/verified'), true);
  for (const route of ['https://elsewhere.test/api','//elsewhere.test/api','/../private','/a\\b','relative'])
    assert.equal(isSafeRoute(route), false, route);
});
test('transport sends a same-origin cookie-backed request without an API secret', async () => {
  let observed;
  const request = createTransport(async (route, options) => {
    observed={route,...options};
    return json({ok:true});
  });
  assert.deepEqual(await request('/server/verified', {method:'POST',body:{value:1}}), {ok:true});
  assert.equal(observed.credentials, 'include');
  assert.equal(observed.cache, 'no-store');
  assert.equal(observed.body, JSON.stringify({value:1}));
  assert.equal(observed.headers['Content-Type'], 'application/json');
  assert.ok(observed.signal === undefined);
});
test('transport maps authentication, conflict, validation and invalid responses to safe errors', async () => {
  for (const [status,code] of [[401,'AUTH_REQUIRED'],[403,'FORBIDDEN'],[409,'CONFLICT'],[422,'VALIDATION'],[500,'SERVER']]) {
    const request=createTransport(async()=>json({message:'internal details'},status));
    await assert.rejects(request('/server/verified'),e=>e instanceof PortalRequestError &&
      e.code===code && !e.message.includes('internal details'));
  }
  const invalid=createTransport(async()=>new Response('<html>no</html>',{status:200,headers:{'content-type':'text/html'}}));
  await assert.rejects(invalid('/server/verified'), {code:'BAD_RESPONSE'});
});
test('unverified draft actions make zero network calls', async () => {
  let calls=0;
  const client=createDraftService({request:async()=>{calls++;return sample;}});
  await assert.rejects(client.listDrafts('membership'), NotConnectedError);
  await assert.rejects(client.createDraft('insurance',{answers:{},step:'first'}), NotConnectedError);
  await assert.rejects(client.discardDraft('accreditation','abc',1), NotConnectedError);
  assert.equal(calls,0);
});
test('verified injected contract implements CRUD without invented production routes', async () => {
  const calls=[];
  const client=createDraftService({contracts:verifiedContracts(),request:async(route,options)=>{
    calls.push({route,...options});
    return options.method==='GET' && !route.includes('draft%2F123') ? [sample] : sample;
  }});
  assert.ok(canUseDrafts('membership',verifiedContracts()));
  assert.deepEqual(await client.createDraft('membership',{answers:{firstName:'Example'},step:'details'}),sample);
  assert.deepEqual(await client.listDrafts('membership'),[sample]);
  assert.deepEqual(await client.getDraft('membership','draft/123'),sample);
  assert.deepEqual(await client.updateDraft('membership','draft/123',{answers:{firstName:'Example'},step:'review',revision:3}),sample);
  assert.equal(await client.discardDraft('membership','draft/123',3),true);
  assert.equal(calls.length,5);
  assert.equal(calls[0].method,'POST');
  assert.deepEqual(calls[0].body,{answers:{firstName:'Example'},step:'details',revision:undefined});
  assert.equal(calls[2].route,'/verified-gateway/membership-drafts/draft%2F123');
  assert.equal(calls[3].method,'PATCH');
  assert.equal(calls[3].body.revision,3);
  assert.equal(calls[4].method,'DELETE');
});
test('partial contracts and malformed payloads fail closed', async () => {
  const partial=verifiedContracts();
  partial.membership.operations.update.verified=false;
  assert.equal(canUseDrafts('membership',partial),false);
  const request=async()=>sample;
  const client=createDraftService({contracts:partial,request});
  await assert.rejects(client.updateDraft('membership','abc',{answers:{},revision:1}),NotConnectedError);
  assert.throws(()=>normaliseDraft({...sample,revision:undefined},'membership'),{code:'BAD_RESPONSE'});
  await assert.rejects(client.getDraft('unknown','abc'),{code:'INVALID_SERVICE'});
});
