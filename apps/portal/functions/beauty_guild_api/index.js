'use strict';
const catalyst = require('zcatalyst-sdk-node');
const { loadConfig } = require('./src/config');
const { createApp } = require('./src/app');

// Beauty Guild Portal V2 backend, Advanced I/O. Served at /server/beauty_guild_api/*.
// Read-only courses, addresses and opt-in authenticated CRM record reads.
const config = loadConfig();

module.exports = createApp({
  config,
  async getCurrentUser(req) {
    const user=await catalyst.initialize(req).userManagement().getCurrentUser();
    if(!user || !user.user_id || user.status!=='ACTIVE' || user.is_confirmed!==true)return null;
    return {id:String(user.user_id),email:String(user.email_id||'').trim().toLowerCase()};
  },
  async getQuoteTable(req) {return catalyst.initialize(req,{scope:'admin'}).datastore().table('Portal_Quotes');},
  async getPaymentTable(req) {return catalyst.initialize(req,{scope:'admin'}).datastore().table('Portal_Payments');},
  async getWorkdriveHeaders(req) {
    const {headers}=await catalyst.initialize(req).connections().getConnectionCredentials(config.workdriveConnectionName);
    return headers;
  },
  async getCreatorHeaders(req) {
    const {headers}=await catalyst.initialize(req).connections().getConnectionCredentials(config.creatorConnectionName);
    return headers;
  },
  async getCrmHeaders(req) {
    const { headers } = await catalyst.initialize(req).connections().getConnectionCredentials(config.crmConnectionName);
    return headers;
  },
});
