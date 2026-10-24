'use strict';
// A phone number as the portal stores it: "+<country code> <number without its first 0>". UK numbers need at least 9 digits
// after the country code (UAT AL-ACC-011); other countries need 6 to 12. A number without a "+" is read as a UK number.
function phoneIssue(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  if (/[^\d\s()+.\-]/.test(text)) return 'Phone numbers can only contain digits, spaces and + ( ) -.';
  let digits = text.replace(/\D/g, '');
  let international = text.startsWith('+');
  if (!international && digits.startsWith('00')) {
    international = true;
    digits = digits.slice(2);
  }
  const uk = !international || digits.startsWith('44');
  const national = (international ? (uk ? digits.slice(2) : digits) : digits).replace(/^0/, '');
  if (uk)
    return national.length >= 9 && national.length <= 10
      ? ''
      : 'Enter a UK number with at least 9 digits after the country code.';
  return digits.length >= 8 && digits.length <= 15 ? '' : 'Enter a valid phone number with its country code.';
}
module.exports = { phoneIssue };
