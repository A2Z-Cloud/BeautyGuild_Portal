'use strict';
// UK postcodes for the flood and subsidence lists. Matching is on the whole postcode only: the
// lists hold exceptions, so a sector or outward-code fallback would refer whole areas.
const PATTERN = /^(?:(GIR)(0AA)|([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2}))$/;

// "ab10 1au", " AB101AU" -> {key: 'AB101AU', display: 'AB10 1AU'}; anything that is not a UK postcode -> null.
function normalisePostcode(value) {
  const key = String(value == null ? '' : value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = PATTERN.exec(key);
  if (!m) return null;
  const outward = m[1] || m[3], inward = m[2] || m[4];
  return {key, display: outward + ' ' + inward, outward, inward};
}

module.exports = {normalisePostcode};
