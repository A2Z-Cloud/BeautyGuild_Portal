import { IntegrationUnavailableError } from './legacy.mjs';

// Demo identity is only ever shown in demo mode. In API mode a viewer must come from
// Catalyst Authentication; never fall back to a made-up user in a build that looks live.
export function resolveViewer({ config, auth, demoUser }) {
  if (config.catalystAuth) return auth.currentUser();
  if (config.mode === 'demo') return Promise.resolve(JSON.parse(JSON.stringify(demoUser)));
  return Promise.reject(new IntegrationUnavailableError('Authenticated Catalyst app user'));
}
