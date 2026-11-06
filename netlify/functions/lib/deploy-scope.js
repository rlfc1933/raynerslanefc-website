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

const SANDBOX_KEY = /^(deploy-preview-\d+|[a-z0-9-]{1,40})--raynerslanefc\.netlify\.app$/;

/**
 * The Host header ONLY. X-Forwarded-Host is set by whoever sends the request,
 * so it is never read: a request to the live site claiming a preview host in
 * it must not reach preview behaviour. Host itself is what Netlify routed on,
 * so the production deploy only ever sees production hosts.
 */
function hostOf(event) {
  const h = (event && event.headers) || {};
  return String(h.host || h.Host || '').toLowerCase().split(':')[0];
}

/**
 * @returns {{production:boolean, host:string, key:string}}
 *   key — a short name for the sandbox ('production' on the live site).
 */
function scopeOf(event) {
  const host = hostOf(event);
  // Live: one of the club's real hosts, or Netlify's own production context.
  // Everything else — a preview, a branch deploy, a host nobody expected — is a
  // sandbox, so preview code can never write to the live database by accident.
  if (PRODUCTION_HOSTS.indexOf(host) > -1 || process.env.CONTEXT === 'production') {
    return { production: true, host, key: 'production' };
  }
  const m = SANDBOX_KEY.exec(host);
  const key = m ? m[1] : (host.replace(/[^a-z0-9-]/g, '-').slice(0, 40) || 'local');
  return { production: false, host, key };
}

module.exports = { scopeOf, hostOf, PRODUCTION_HOSTS };
