'use strict';
const catalyst = require('zcatalyst-sdk-node');
const { loadConfig } = require('./src/config');
const { createApp } = require('./src/app');

// Beauty Guild Portal V2 backend, Advanced I/O. Served at /server/beauty_guild_api/*.
// Milestone 2 scope: read-only routes (courses, address). No CRM writes, payments or documents.
const config = loadConfig();

module.exports = createApp({
  config,
  async getCrmHeaders(req) {
    const { headers } = await catalyst.initialize(req).connections().getConnectionCredentials(config.crmConnectionName);
    return headers;
  },
});
