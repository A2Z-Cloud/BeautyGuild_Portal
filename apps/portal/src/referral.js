import { GUILD_PHONE } from './insuranceInputs.js';

// A REFER or STOP insurance application that the server has recorded for the Insurance team comes back with the
// payment refusal (code REFERRAL_REQUIRED) as {reference, status}. These helpers read it safely and word it for the customer.
export const REFERRAL_STATUSES = ['Referred', 'Stopped'];
export function referralFrom(error) {
  const d = error?.code === 'REFERRAL_REQUIRED' ? error.details : null;
  if (
    !d ||
    typeof d !== 'object' ||
    !REFERRAL_STATUSES.includes(d.status) ||
    typeof d.reference !== 'string' ||
    !/^\d{1,25}$/.test(d.reference)
  )
    return null;
  return { reference: d.reference, status: d.status };
}
// What the confirmation panel says. A Stopped application is not shown in My records, so it points to the phone instead.
export function referralCopy(outcome) {
  if (!outcome) return null;
  const stopped = outcome.status === 'Stopped';
  return stopped
    ? {
        title: 'We cannot offer this cover online',
        stopped: true,
        lines: [
          'The Guild has a note of your application, so nothing you entered is lost. You cannot pay for this cover online.',
          'Please call the Guild on ' + GUILD_PHONE + ' and we will help you.',
        ],
        referenceNote: 'Quote this reference when you call.',
      }
    : {
        title: 'Your application has been sent to our Insurance team',
        stopped: false,
        lines: ['They will review it and contact you.', 'You cannot pay for this cover online.'],
        referenceNote: 'Keep this reference for your records.',
      };
}
// The panel belongs to the answers it was recorded for; once any answer changes, the customer is quoting afresh.
export const sameAnswers = (outcome, key) => Boolean(outcome && outcome.key === key);
