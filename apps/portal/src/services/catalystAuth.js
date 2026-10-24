import { IntegrationUnavailableError } from './legacy.mjs';

let readyPromise;
// Pinned SDK version with a Subresource Integrity hash: if the CDN file ever changes, the
// browser refuses it and sign-in fails closed. Recompute the hash when bumping the version.
const SDK_URL = 'https://static.zohocdn.com/catalyst/sdk/js/4.6.1/catalystWebSDK.js';
const SDK_INTEGRITY = 'sha384-N45BD52JNBULILyzXT1syFPnINEBnKXFwFFFMqWtjuoW1j/6SHkBY+wZTq3KWnAV';
const LOAD_TIMEOUT_MS = 15000;
// isReady covers a matching tag that already finished loading before we could attach listeners.
function loadScript(src, { integrity, isReady = () => false } = {}) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(s => s.src === new URL(src, window.location.origin).href);
    if (existing?.dataset.loaded === 'true' || (existing && isReady())) return resolve();
    const script = existing || document.createElement('script');
    const timer = setTimeout(() => fail(), LOAD_TIMEOUT_MS);
    const done = () => {
      clearTimeout(timer);
      script.dataset.loaded = 'true';
      resolve();
    };
    const fail = () => {
      clearTimeout(timer);
      reject(new IntegrationUnavailableError('Catalyst Web SDK loading'));
    };
    script.addEventListener('load', done, { once: true });
    script.addEventListener('error', fail, { once: true });
    if (!existing) {
      script.src = src;
      script.async = false;
      if (integrity) {
        script.integrity = integrity;
        script.crossOrigin = 'anonymous';
      }
      document.head.appendChild(script);
    }
  });
}
async function sdk() {
  if (typeof window === 'undefined' || typeof document === 'undefined')
    throw new IntegrationUnavailableError('Catalyst browser runtime');
  if (window.catalyst?.auth) return window.catalyst.auth;
  if (!readyPromise)
    readyPromise = (async () => {
      await loadScript(SDK_URL, { integrity: SDK_INTEGRITY, isReady: () => Boolean(window.catalyst) });
      await loadScript('/__catalyst/sdk/init.js', { isReady: () => Boolean(window.catalyst?.auth) });
      if (!window.catalyst?.auth) throw new IntegrationUnavailableError('Catalyst Authentication SDK');
      return window.catalyst.auth;
    })().catch(e => {
      readyPromise = undefined;
      throw e;
    });
  return readyPromise;
}
function redirectUrl() {
  return window.location.origin + import.meta.env.BASE_URL;
}
export function createCatalystAuth(enabled) {
  const requireSDK = async () => {
    if (!enabled) throw new IntegrationUnavailableError('Catalyst authentication');
    return sdk();
  };
  return Object.freeze({
    get configured() {
      return enabled;
    },
    async currentUser() {
      const auth = await requireSDK();
      const result = await auth.isUserAuthenticated();
      const user = result?.content;
      if (!user?.user_id) throw new IntegrationUnavailableError('Authenticated Catalyst app user');
      return {
        userId: String(user.user_id),
        email: user.email_id || '',
        firstName: user.first_name || '',
        lastName: user.last_name || '',
      };
    },
    async signInEmbed(containerId) {
      const auth = await requireSDK();
      // css_url points at our branded copy of Catalyst's sign-in stylesheet (see auth-css/).
      return auth.signIn(containerId, {
        redirect_url: import.meta.env.BASE_URL,
        css_url: import.meta.env.BASE_URL + 'auth/embedded_signin.css',
        // The "Forgot password?" screen is a separate Catalyst page with its own stylesheet setting.
        forgot_password_css_url: import.meta.env.BASE_URL + 'auth/embedded_password_reset.css',
      });
    },
    async signUp({ firstName, lastName, email }) {
      if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) throw new Error('Name and email are required.');
      const auth = await requireSDK();
      return auth.signUp({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email_id: email.trim(),
        platform_type: 'web',
        redirect_url: redirectUrl(),
      });
    },
    // Sends Catalyst's reset email. Only the address is sent (in the request body); no password
    // ever appears in a URL, unlike the SDK's changePassword, which puts both in the query string.
    async requestPasswordReset(email) {
      if (!email?.trim()) throw new Error('An email address is required.');
      await requireSDK();
      const userManagement = window.catalyst?.userManagement;
      if (typeof userManagement?.forgotPassword !== 'function')
        throw new IntegrationUnavailableError('Catalyst password reset');
      return userManagement.forgotPassword({
        email_id: email.trim(),
        platform_type: 'web',
        redirect_url: redirectUrl(),
      });
    },
    async signOut() {
      const auth = await requireSDK();
      auth.signOut(redirectUrl());
      // On Slate, cross-origin backend session invalidation needs an agreed backend mechanism.
    },
  });
}
