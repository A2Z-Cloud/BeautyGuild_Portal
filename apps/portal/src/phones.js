// Phone numbers are held as "+<country code> <number without its first 0>". The country code is chosen next to the number
// and follows the country the applicant picked until they type a number. UK numbers need at least 9 digits after the code.
export const DIALS = [
  ['GB', 'United Kingdom', '44'],
  ['IE', 'Ireland', '353'],
  ['FR', 'France', '33'],
  ['ES', 'Spain', '34'],
  ['DE', 'Germany', '49'],
  ['IT', 'Italy', '39'],
  ['NL', 'Netherlands', '31'],
  ['BE', 'Belgium', '32'],
  ['PT', 'Portugal', '351'],
  ['CH', 'Switzerland', '41'],
  ['AT', 'Austria', '43'],
  ['SE', 'Sweden', '46'],
  ['NO', 'Norway', '47'],
  ['DK', 'Denmark', '45'],
  ['FI', 'Finland', '358'],
  ['PL', 'Poland', '48'],
  ['GR', 'Greece', '30'],
  ['CY', 'Cyprus', '357'],
  ['MT', 'Malta', '356'],
  ['IS', 'Iceland', '354'],
  ['LU', 'Luxembourg', '352'],
  ['RO', 'Romania', '40'],
  ['BG', 'Bulgaria', '359'],
  ['HU', 'Hungary', '36'],
  ['CZ', 'Czechia', '420'],
  ['SK', 'Slovakia', '421'],
  ['HR', 'Croatia', '385'],
  ['SI', 'Slovenia', '386'],
  ['LT', 'Lithuania', '370'],
  ['LV', 'Latvia', '371'],
  ['EE', 'Estonia', '372'],
  ['TR', 'Turkey', '90'],
  ['AE', 'United Arab Emirates', '971'],
  ['SA', 'Saudi Arabia', '966'],
  ['QA', 'Qatar', '974'],
  ['KW', 'Kuwait', '965'],
  ['BH', 'Bahrain', '973'],
  ['OM', 'Oman', '968'],
  ['JO', 'Jordan', '962'],
  ['IL', 'Israel', '972'],
  ['EG', 'Egypt', '20'],
  ['MA', 'Morocco', '212'],
  ['ZA', 'South Africa', '27'],
  ['NG', 'Nigeria', '234'],
  ['GH', 'Ghana', '233'],
  ['KE', 'Kenya', '254'],
  ['UG', 'Uganda', '256'],
  ['TZ', 'Tanzania', '255'],
  ['ZW', 'Zimbabwe', '263'],
  ['MU', 'Mauritius', '230'],
  ['IN', 'India', '91'],
  ['PK', 'Pakistan', '92'],
  ['BD', 'Bangladesh', '880'],
  ['LK', 'Sri Lanka', '94'],
  ['SG', 'Singapore', '65'],
  ['MY', 'Malaysia', '60'],
  ['TH', 'Thailand', '66'],
  ['PH', 'Philippines', '63'],
  ['ID', 'Indonesia', '62'],
  ['VN', 'Vietnam', '84'],
  ['HK', 'Hong Kong', '852'],
  ['CN', 'China', '86'],
  ['JP', 'Japan', '81'],
  ['KR', 'South Korea', '82'],
  ['AU', 'Australia', '61'],
  ['NZ', 'New Zealand', '64'],
  ['US', 'United States', '1'],
  ['CA', 'Canada', '1'],
  ['MX', 'Mexico', '52'],
  ['BR', 'Brazil', '55'],
  ['AR', 'Argentina', '54'],
  ['CL', 'Chile', '56'],
  ['CO', 'Colombia', '57'],
  ['JM', 'Jamaica', '1876'],
  ['BB', 'Barbados', '1246'],
  ['TT', 'Trinidad and Tobago', '1868'],
];
const UK_NAMES = new Set([
  'united kingdom',
  'uk',
  'great britain',
  'england',
  'scotland',
  'wales',
  'northern ireland',
  'jersey',
  'guernsey',
  'isle of man',
]);
const byDial = [...DIALS].sort((a, b) => b[2].length - a[2].length);

export const flagOf = iso => String.fromCodePoint(...[...iso].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
export const dialLabel = ([iso, name, dial]) => flagOf(iso) + ' +' + dial + ' ' + name;
// The ISO code of the entry that suits a country name; the United Kingdom when the country is unknown or not chosen.
export function isoForCountry(name) {
  const wanted = String(name || '')
    .trim()
    .toLowerCase();
  if (!wanted || UK_NAMES.has(wanted)) return 'GB';
  return DIALS.find(d => d[1].toLowerCase() === wanted)?.[0] || 'GB';
}
// Removes a leading country code (digits only, ignoring spaces and punctuation between them) from "+44 1332 224830".
function afterCode(text, dial) {
  let need = dial.length,
    i = 0;
  while (i < text.length && need > 0) {
    if (/\d/.test(text[i])) need -= 1;
    i += 1;
  }
  return text.slice(i).replace(/^[\s\-.()]+/, '');
}
// "+44 1332 224830", "+441332224830", "0044...", "01332 224830" -> the country and the rest.
export function splitPhone(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { iso: '', local: '' };
  const digits = text.replace(/\D/g, '');
  if (text.startsWith('+') || digits.startsWith('00')) {
    const body = text.startsWith('+') ? text.replace(/^\+\s*/, '') : text.replace(/^\D*00\s*/, '');
    const all = body.replace(/\D/g, '');
    const hit = byDial.find(d => all.startsWith(d[2]));
    return hit
      ? { iso: DIALS.find(d => d[2] === hit[2])[0], local: afterCode(body, hit[2]) }
      : { iso: '', local: body };
  }
  return { iso: 'GB', local: text.replace(/^0/, '') };
}
export const joinPhone = (iso, local) => {
  const clean = String(local || '')
    .replace(/[^\d\s()\-.]/g, '')
    .replace(/^\s*0/, '')
    .trim();
  if (!/\d/.test(clean)) return '';
  const entry = DIALS.find(d => d[0] === iso) || DIALS[0];
  return '+' + entry[2] + ' ' + clean;
};
// The message to show for a number that is the wrong length; empty when it is fine or blank.
export function phoneIssue(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  if (/[^\d\s()+.-]/.test(text)) return 'Phone numbers can only contain digits, spaces and + ( ) -.';
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
