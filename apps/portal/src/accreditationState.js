// What the Accreditation card should say, from the member's applications and saved drafts (UAT AL-ACC-039). The most urgent
// thing comes first: pay, finish a draft, add qualifications, wait for review, then manage an approved school.
const APPROVED = /^(verified|accredited)$/i;
export const MANAGE_TEXT =
  'Manage your accreditation application, qualifications, courses, tutors and training centre.';
export function accreditationState({ schools = [], drafts = [] } = {}) {
  const real = schools.filter(s => s.stage !== 'Draft');
  const pay = real.find(s => s.payable && !s.paid);
  if (pay)
    return {
      key: 'payment',
      title: 'Your accreditation application is waiting for payment.',
      text: 'Pay to send it to the Guild for review.',
      action: 'Continue to payment',
      to: '/pay/accreditation/' + encodeURIComponent(pay.id),
    };
  if (drafts.length || schools.some(s => s.stage === 'Draft'))
    return {
      key: 'draft',
      title: 'Your Accreditation Application is incomplete.',
      text: 'Pick up where you left off.',
      action: 'Continue Application',
      to: '/drafts',
    };
  const open = real.filter(s => s.paid && !APPROVED.test(s.status));
  const needQuals = open.find(s => !s.qualificationCount);
  if (needQuals)
    return {
      key: 'qualifications',
      title: 'Your application has been received.',
      text: 'Please upload your outstanding qualifications.',
      action: 'Add qualifications',
      to: '/schools/' + encodeURIComponent(needQuals.id) + '/qualifications',
    };
  if (open.length)
    return {
      key: 'review',
      title: 'Your accreditation application is being reviewed.',
      text: 'We will be in touch when the review is complete.',
      action: 'View my training centre',
      to: '/schools/' + encodeURIComponent(open[0].id) + '/profile',
    };
  const approved = real.find(s => APPROVED.test(s.status));
  if (approved)
    return {
      key: 'approved',
      title: 'My Training Centre',
      text: MANAGE_TEXT,
      action: 'Manage my school',
      to: '/schools/' + encodeURIComponent(approved.id) + '/profile',
    };
  return {
    key: 'none',
    title: 'Apply for Guild Accreditation',
    text: 'Apply for accreditation for your training centre.',
    action: 'Apply for accreditation',
    to: '/accreditation/new',
  };
}
