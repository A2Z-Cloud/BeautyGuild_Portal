'use strict';
// Training centre facility checkbox key (as sent by the centreFacilities form field) to its CRM field name.
const FACILITY_FIELDS = Object.freeze({
  parking: 'Parking',
  changingArea: 'Changing_Area',
  eatingArea: 'Eating_Area',
  disabledAccess: 'Disabled_Access',
  freeWifi: 'Free_Wifi',
  airConditioning: 'Air_Conditioning',
  refreshmentsProvided: 'Refreshments_Provided',
  publicTransportNearby: 'Public_Transport_Nearby',
});
module.exports = { FACILITY_FIELDS };
