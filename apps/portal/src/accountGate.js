// A live accreditation application is made in the applicant's own account, so a visitor who is not signed in is asked to sign in or create
// one before the first question. `signedIn` is null while we are still finding out, which never sends anyone away.
export const needsAccountFirst = ({ kind, live, signedIn }) =>
  kind === 'accreditation' && Boolean(live) && signedIn === false;
export const accountFirstPath = kind =>
  '/account/checkpoint?returnTo=' + encodeURIComponent('/' + kind + '/new') + '&intent=start';
