'use strict';
const { HttpError } = require('./errors');

const UPSTREAM_TIMEOUT_MS = 8000;

function mapAddress(item) {
  const physicalLine = [item.SubBuilding, item.BuildingName, item.BuildingNumber, item.Street]
    .filter(Boolean)
    .join(' ')
    .trim();
  const addressLine1 = item.Line1 || item.Company || physicalLine || '';
  const addressLine2 =
    item.Line2 || (!item.Line1 && item.Company && physicalLine && physicalLine !== addressLine1 ? physicalLine : '');
  return {
    addressLine1,
    addressLine2,
    addressLine3: item.Line3 || '',
    town: item.City || '',
    county: item.ProvinceName || item.AdminAreaName || item.Province || '',
    postcode: item.PostalCode || '',
    country: item.CountryName || '',
  };
}

function createLoqate({ config, fetchImpl = fetch, log = console.log }) {
  async function call(path, params) {
    if (!config.loqateKey) {
      log('Loqate key is not configured');
      throw new HttpError(503, 'ADDRESS_UNAVAILABLE', 'Address lookup is unavailable.');
    }
    const url = new URL(config.loqateBaseUrl + path);
    url.search = new URLSearchParams({ Key: config.loqateKey, ...params }).toString();
    let body;
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
      body = await response.json();
      if (!response.ok) throw new Error(`Loqate HTTP ${response.status}`);
    } catch (err) {
      // Never log the URL: it contains the API key.
      log('Loqate request failed', path, err && err.name, err && err.message);
      throw new HttpError(502, 'ADDRESS_UNAVAILABLE', 'Address lookup is unavailable.');
    }
    const items = Array.isArray(body && body.Items) ? body.Items : [];
    const failure = items.find(item => item && item.Error);
    if (failure) {
      log('Loqate error item', path, failure.Error, failure.Description || failure.Cause);
      throw new HttpError(502, 'ADDRESS_UNAVAILABLE', 'Address lookup is unavailable.');
    }
    return items;
  }

  return Object.freeze({
    async find(text, container) {
      const params = { Text: text };
      if (container) params.Container = container;
      if (config.loqateCountries) params.Countries = config.loqateCountries;
      const items = await call('/Capture/Interactive/Find/v1.10/json3.ws', params);
      return items.slice(0, config.loqateMaxResults).map(i => ({
        Id: i.Id,
        Type: i.Type,
        Text: i.Text,
        Description: i.Description,
      }));
    },
    async retrieve(id) {
      const items = await call('/Capture/Interactive/Retrieve/v1.30/json6.ws', { Id: id });
      return items[0] ? mapAddress(items[0]) : null;
    },
  });
}

module.exports = { createLoqate, mapAddress };
