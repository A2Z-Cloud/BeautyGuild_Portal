'use strict';
const { HttpError } = require('./errors');

const UPSTREAM_TIMEOUT_MS = 8000;
// Loqate's geocoder places an address far better with a two letter country code than with a name. The country on the form is a name, so it
// is turned into its ISO code here. A name that cannot be matched is left out and the country in the address text does the work.
const ALIASES = {
  'united kingdom': 'GB',
  uk: 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'northern ireland': 'GB',
  'cabo verde': 'CV',
  myanmar: 'MM',
  turkey: 'TR',
  palestine: 'PS',
  'saint vincent and the grenadines': 'VC',
};
const plain = name =>
  String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\bst\.?\s/g, 'saint ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const NOT_COUNTRIES = new Set(['FX', 'EU', 'UN', 'QO', 'ZZ', 'AC', 'CP', 'DG', 'EA', 'IC', 'TA']);
let codeByName = null;
function countryCode(country) {
  const c = String(country || '').trim();
  if (/^[A-Za-z]{2,3}$/.test(c)) return c.toUpperCase();
  const key = plain(c);
  if (ALIASES[key]) return ALIASES[key];
  if (!codeByName) {
    codeByName = new Map();
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let a = 65; a < 91; a++)
      for (let b = 65; b < 91; b++) {
        const code = String.fromCharCode(a, b),
          name = names.of(code);
        // The first code for a name wins, and the codes that are not countries (for example FX for France) are skipped.
        if (name && name !== code && !NOT_COUNTRIES.has(code) && !codeByName.has(plain(name)))
          codeByName.set(plain(name), code);
      }
  }
  return codeByName.get(key) || '';
}

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
    // The point for an address, as V1 does it (Loqate International Geocode). A country the service cannot take as a code is left out and the
    // country name in the address text does the work. No point found is null, never a guess.
    async geocode(country, location) {
      const params = { Location: location };
      const code = countryCode(country);
      if (code) params.Country = code;
      const items = await call('/Geocoding/International/Geocode/v1.10/json6.ws', params);
      const item = items[0];
      const latitude = Number(item && item.Latitude),
        longitude = Number(item && item.Longitude);
      return item &&
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 &&
        Math.abs(longitude) <= 180
        ? { latitude, longitude }
        : null;
    },
  });
}

module.exports = { createLoqate, mapAddress };
