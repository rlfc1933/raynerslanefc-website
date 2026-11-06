// SQUAD PUBLISH — put a confirmed change on the website, then CHECK it is there.
//
// "Website updated" is only ever said after the public copy has been read back
// and contains the change. Otherwise the answer is "queued" (written, waiting
// for the public copy to refresh) or "failed" (nothing published; try again).
'use strict';

const REPO = 'rlfc1933/raynerslanefc-website';

/**
 * @param scope  from deploy-scope
 * @param expect (players[]) => boolean — what the public copy must show
 * @param deps   test seams: { publish, fetchPublic }
 */
async function publishAndVerify(scope, expect, deps) {
  const d = deps || {};
  if (!scope.production) {
    // Preview: the sandbox IS what this preview's pages read (squad-data).
    const players = d.previewPlayers ? await d.previewPlayers() : [];
    return expect(players)
      ? { state: 'website_updated', message: 'Saved. This preview’s squad and player pages now show the change. (Preview only — the live website is untouched.)' }
      : { state: 'failed', retry: true, message: 'The change was saved but the preview pages do not show it yet. Try again.' };
  }
  let res;
  try { res = await (d.publish || require('../../la-publish-players').publish)(false); }
  catch (e) { res = { ok: false, error: 'publish threw' }; }
  if (!res || !res.ok) {
    return { state: 'failed', retry: true, message: 'Saved in the club database, but the website copy could not be written. Press “Try again” — nothing is lost.' };
  }
  try {
    const fetchPublic = d.fetchPublic || (async () => {
      const r = await fetch('https://cdn.jsdelivr.net/gh/' + REPO + '@main/data/players.json?t=' + Date.now(), { signal: AbortSignal.timeout(8000) });
      return r.ok ? ((await r.json()).players || []) : null;
    });
    const players = await fetchPublic();
    if (players && expect(players)) return { state: 'website_updated', message: 'Website updated.' };
  } catch (e) { /* fall through to queued */ }
  return { state: 'queued', retry: true, message: 'Saved and sent to the website. The public pages are still refreshing — check again in a minute.' };
}

module.exports = { publishAndVerify };
