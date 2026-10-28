// Training centre facility checkbox options, shared between the School profile edit form and its read-only display.
// Keys match the server's facilities.js (functions/beauty_guild_api/src/facilities.js).
export const FACILITY_OPTIONS = [
  { value: 'parking', label: 'Parking' },
  { value: 'changingArea', label: 'Changing area' },
  { value: 'eatingArea', label: 'Eating area' },
  { value: 'disabledAccess', label: 'Disabled access' },
  { value: 'freeWifi', label: 'Free wifi' },
  { value: 'airConditioning', label: 'Air conditioning' },
  { value: 'refreshmentsProvided', label: 'Refreshments provided' },
  { value: 'publicTransportNearby', label: 'Public transport nearby' },
];
export const FACILITY_LABELS = Object.fromEntries(FACILITY_OPTIONS.map(o => [o.value, o.label]));
