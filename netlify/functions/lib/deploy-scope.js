// ════════════════════════════════════════════════════════════════════════════
// DEPLOY SCOPE — is this request being served by the live site or a preview?
//
// Deploy Previews run with the PRODUCTION environment: the same Supabase
// database and the same GitHub token. A squad change tested on a preview would
// otherwise rewrite the live roster and commit to main. So every write path
// that matters asks this first, and on anything that is not the live site it
// works in a sandbox scoped to that preview instead.
//
// The Host header is a sound signal here: Netlify routes a request to a deploy
// BY its host, so a request served by the production deploy carries a
// production host, and a preview host can only ever reach preview code.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const PRODUCTION_HOSTS = ['raynerslanefc.co.uk', 'www.raynerslanefc.co.uk',
  'raynerslanefc.netlify.app', 'main--raynerslanefc.netlify.app'];

function hostOf(event) {
  const h = (event && event.headers) || {};
  return String(h['x-forwarded-host'] || h.host || h.Host || '').toLowerCase().split(':')[0];
}

/**
 * @returns {{production:boolean, host:string, key:string}}
 *   key — a short name for the sandbox ('production' on the live site).
 */
function scopeOf(event) {
  const host = hostOf(event);
  const production = PRODUCTION_HOSTS.indexOf(host) > -1;
  const m = host.match(/^(deploy-preview-\d+|[a-z0-9-]+?)--raynerslanefc\.netlify\.app$/);
  const key = production ? 'production' : (m ? m[1] : (host.replace(/[^a-z0-9-]/g, '-') || 'local'));
  return { production, host, key };
}

module.exports = { scopeOf, hostOf, PRODUCTION_HOSTS };
