#!/usr/bin/env node
// PRODUCTION SMOKE CHECKS.
//
// Hundreds of tests were green while every opponent crest was missing and the
// programme engine had never published anything, because they all asserted that
// a fallback EXISTED. None asserted that the real path was being taken.
//
// These check OUTCOMES against a running site. Point them at production after a
// deploy, or at a preview before one:
//
//   node tools/smoke.js                       (production)
//   node tools/smoke.js https://preview-url   (a deploy preview)
//
// Exit code 1 means the site is wrong, whatever the unit tests say.
'use strict';

const BASE = (process.argv[2] || 'https://raynerslanefc.co.uk').replace(/\/$/, '');
const FN = BASE + '/.netlify/functions';

let pass = 0; const failures = [];
function check(name, ok, detail) {
  if (ok) { pass++; return; }
  failures.push(name + (detail ? ' — ' + detail : ''));
}
async function json(url) {
  const r = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  return { status: r.status, body: r.ok ? await r.json().catch(() => null) : null };
}

(async () => {
  // ── CRESTS ───────────────────────────────────────────────────────────────
  const fx = await json(FN + '/football-data?what=fixtures');
  const fixtures = (fx.body && fx.body.fixtures) || [];
  check('fixtures endpoint answers', fx.status === 200 && fixtures.length > 0);
  check('every fixture team has a crest in the registry',
    fixtures.every((f) => f.homeCrest && f.awayCrest),
    fixtures.filter((f) => !f.homeCrest || !f.awayCrest).map((f) => f.opponent).join(', '));

  const opponents = [...new Set(fixtures.map((f) => f.opponent).filter(Boolean))];
  check('the season has a full set of opponents', opponents.length >= 15, opponents.length + ' found');

  const crests = await json(BASE + '/data/crests.json');
  const lib = ((crests.body && crests.body.crests) || []);
  check('the crest library is published', lib.length >= 20);
  // Every crest asset must actually load — a 404 renders as a fallback that
  // looks deliberate, which is exactly how the incident hid.
  const assetResults = await Promise.all(lib.map(async (c) => {
    const r = await fetch(BASE + '/' + c.file, { method: 'HEAD' });
    return { name: c.name, file: c.file, ok: r.ok, status: r.status };
  }));
  check('every crest asset returns success', assetResults.every((a) => a.ok),
    assetResults.filter((a) => !a.ok).map((a) => a.file + '=' + a.status).join(', '));

  const sum = await json(FN + '/football-data?what=summary');
  const S = sum.body || {};
  check('the next fixture has both crests', !!(S.next && S.next.homeCrest && S.next.awayCrest));
  check('the previous result has both crests', !!(S.previous && S.previous.homeCrest && S.previous.awayCrest));

  // ── FIXTURES ─────────────────────────────────────────────────────────────
  const uk = (iso, opt) => new Intl.DateTimeFormat('en-GB',
    Object.assign({ timeZone: 'Europe/London' }, opt)).format(new Date(Date.parse(iso)));
  /* The club's stated pattern: Saturdays 15:00, Tuesdays 19:45.
     Deliberately NOT applied to every day — the season legitimately contains
     Bank Holiday Monday fixtures with morning kick-offs (31 August and 28
     December 2026, both 10:30/11:30). A check that called those wrong would
     be asserting a rule the club never had, and the real value of this check
     is catching a hard-coded 15:00 fallback reappearing. */
  const wrongKo = fixtures.filter((f) => {
    if (!f.kickoffAt) return true;
    const day = uk(f.kickoffAt, { weekday: 'short' });
    const time = uk(f.kickoffAt, { hour: '2-digit', minute: '2-digit', hour12: false });
    if (day === 'Sat') return time !== '15:00';
    if (day === 'Tue') return time !== '19:45';
    return false;                                   // other days vary, legitimately
  });
  check('Saturday 15:00 and Tuesday 19:45 hold',
    wrongKo.length === 0, wrongKo.map((f) => f.opponent + ' ' + f.kickoffAt).join(', '));

  // The specific regression this replaced: every fixture reading 15:00 because
  // the time was never carried across and the renderer defaulted.
  const distinctTimes = new Set(fixtures.filter((f) => f.kickoffAt)
    .map((f) => uk(f.kickoffAt, { hour: '2-digit', minute: '2-digit', hour12: false })));
  check('kick-off times are not all the same hard-coded value', distinctTimes.size > 1,
    [...distinctTimes].join(', '));
  check('no fixture is missing a core fact',
    fixtures.every((f) => f.opponent && f.venue && f.competition && f.status && f.isHome !== undefined));
  check('next and current are different questions',
    !(S.next && S.current && S.next.id === S.current.id));

  // ── PROGRAMMES ───────────────────────────────────────────────────────────
  const lib2 = await json(FN + '/programme-data');
  const eds = (lib2.body && lib2.body.editions) || [];
  check('the programme library answers', lib2.status === 200);
  check('at least one edition is published', eds.length >= 1);
  const wall = eds.filter((e) => /Wallingford/.test(e.awayTeam || ''))[0];
  check('the Wallingford edition is in the library', !!wall);
  if (wall) {
    check('its card carries both crests', !!(wall.homeCrest && wall.awayCrest));
    check('its card is not labelled as today', !/today/i.test(wall.state || ''));
  }
  const ed = await json(FN + '/programme-data?id=fwp-578225');
  const E = ed.body || {};
  check('the Wallingford edition answers publicly', ed.status === 200 && E.ok === true);

  /* THE MEMBER GATE, from a logged-out request.
     The programme is free and members-only, so what a visitor gets is the
     cover, the fixture and the score — enough to want it — and nothing of the
     edition itself. These are the checks that would catch the payload
     leaking back out. */
  check('a logged-out request is LOCKED', E.locked === true, 'reason: ' + E.reason);
  check('no programme payload is sent', !E.programme);
  check('no line-ups are sent', !E.lineups);
  check('no league table is sent', !E.table);
  check('no legal footer is sent', !E.legal);
  check('the cover IS sent', !!E.cover);
  check('the score IS sent', !!(E.finalMatch && E.finalMatch.homeScore != null));
  check('the edition is not backdated',
    !!(E.edition && Date.parse(E.edition.publishedAt) > Date.parse('2026-08-01T17:00:00Z')));
  check('it records that it came after full time', !!(E.edition && E.edition.afterFullTime));

  // A member payload must never be cached by a CDN.
  const hdr = await fetch(FN + '/programme-data?id=fwp-578225');
  const cc = (hdr.headers.get('cache-control') || '').toLowerCase();
  check('member responses are not publicly cacheable',
    /private/.test(cc) && /no-store/.test(cc), cc);
  check('member responses vary on Authorization',
    /authorization/i.test(hdr.headers.get('vary') || ''), hdr.headers.get('vary'));

  // Drafts stay private.
  const draft = await fetch(FN + '/programme-data?id=fwp-578229');
  check('the Hilltop draft is not public', draft.status === 404, 'got ' + draft.status);
  const sitemap = await (await fetch(BASE + '/sitemap.xml')).text();
  check('no draft appears in the sitemap', !/578229/.test(sitemap));

  // ── ACCESS CONTROL ───────────────────────────────────────────────────────
  for (const f of ['football-players', 'football-health', 'programme-sync-now']) {
    const r = await fetch(FN + '/' + f, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: '{}' });
    check(f + ' refuses without a sign-in', r.status === 401, 'got ' + r.status);
  }
  for (const f of ['fwp-sync', 'programme-sync', 'football-registry-sync']) {
    const r = await fetch(FN + '/' + f);
    check(f + ' is not reachable over HTTP', r.status === 403, 'got ' + r.status);
  }

  // ── OUTPUT ───────────────────────────────────────────────────────────────
  console.log('\n' + BASE);
  console.log(pass + ' checks passed' + (failures.length ? ', ' + failures.length + ' FAILED' : ''));
  failures.forEach((f) => console.log('  ✖ ' + f));
  if (!failures.length) console.log('  production is behaving as specified');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('smoke run failed:', e.message); process.exit(1); });
