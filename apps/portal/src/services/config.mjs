// Public, browser-visible integration switches. Never pass API keys here.
const known = new Set(['courses','address']);
export function parseIntegrationConfig(env={}) {
  const mode=env.VITE_DATA_MODE==='api'?'api':'demo';
  const base=String(env.VITE_API_BASE_URL||'').trim().replace(/\/+$/,'');
  const enabled=String(env.VITE_ENABLED_LEGACY_APIS||'').split(',').map(s=>s.trim().toLowerCase()).filter(s=>known.has(s));
  const configured=mode==='api' && base.length>0;
  // Other paths must be explicitly configured in the environment by the backend owner.
  return Object.freeze({
    mode,apiBaseUrl:base,enabled:Object.freeze(configured?enabled:[]),
    catalystAuth:mode==='api' && env.VITE_CATALYST_AUTH==='true',
    baseConfigured:configured,
  });
}
export function isEnabled(config, feature) {
  return Boolean(config.baseConfigured && config.enabled.includes(feature));
}
export function appendPath(base,path) {
  if(!base || !path.startsWith('/') || path.startsWith('//') || path.includes('..'))throw new Error('Invalid API configuration');
  return base+path;
}
