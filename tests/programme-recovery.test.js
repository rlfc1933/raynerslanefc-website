// MISSED-PUBLICATION RECOVERY.
//
// Supporters got no programme for Rayners Lane v Wallingford & Crowmarsh, and
// the engine reported the edition as "waiting for matchday" — for a matchday
// that had already been and gone.
//
// decide() could only publish ON the day. Any fixture whose day passed without
// publication fell into WAITING_FOR_MATCHDAY and stayed there for ever, waiting
// for a date in the past. That is the shape of every real failure: a deploy
// lands after the teams are out, the provider releases line-ups late, an outage
// crosses kick-off. The programme was not late — it was unreachable.

const test = require('node:test');
const assert = require('node:assert');
const R = require('../netlify/functions/lib/programme/publish-rules');

const KO = Date.parse('2026-08-01T14:00:00Z');   // 15:00 at the ground
const FT = KO + R.FULL_TIME_AFTER_KO_MS;

const fixture = {
  scheduled_kickoff_at: new Date(KO).toISOString(),
  fixture_status: 'played', programme_eligible: true,
  external_fixture_id: '578225', home_team_id: 1, away_team_id: 2,
};

function xi(teamId) {
  return {
    status: 'confirmed', teamId: teamId, sourceUpdatedAt: new Date(KO).toISOString(),
    players: Array.from({ length: 14 }, (_, i) => ({
      name: 'Team' + teamId + ' Player' + i, role: i < 11 ? 'starter' : 'substitute',
    })),
  };
}

const ctx = (now, edition) => ({
  fixture, ourTeamId: 1, now,
  homeLineup: xi(1), awayLineup: xi(2),
  edition: Object.assign({ mandatory_content_valid: true, generated_at: 'yes' }, edition || {}),
});

/* ── the normal path still works ──────────────────────────────────────────── */

test('before kick-off on matchday, with teams out, it publishes normally', () => {
  const d = R.decide(ctx(KO - 2 * 3600000));
  assert.strictEqual(d.canPublish, true);
  assert.strictEqual(d.state, R.STATES.READY_TO_PUBLISH);
  assert.ok(!d.recovery, 'this is not a recovery, it is the normal path');
});

test('teams released late, after kick-off, still publishes as late', () => {
  const d = R.decide(ctx(KO + 20 * 60000));
  assert.strictEqual(d.canPublish, true);
  assert.strictEqual(d.state, R.STATES.PUBLISHED_LATE);
});

test('days before, it waits — and is not treated as a recovery', () => {
  const d = R.decide(ctx(KO - 4 * 86400000));
  assert.strictEqual(d.canPublish, false);
  assert.strictEqual(d.state, R.STATES.WAITING_FOR_MATCHDAY);
  assert.ok(!d.recovery);
});

/* ── the failure this is for ──────────────────────────────────────────────── */

test('THE DAY AFTER, IT RECOVERS INSTEAD OF WAITING FOR A DAY THAT HAS GONE', () => {
  // The Wallingford case exactly: full time yesterday, engine deployed today.
  const d = R.decide(ctx(FT + 13 * 3600000));
  assert.strictEqual(d.canPublish, true, 'it must be publishable, not stuck');
  assert.strictEqual(d.state, R.STATES.PUBLISHED_RECOVERY);
  assert.strictEqual(d.recovery, true);
  assert.strictEqual(d.afterFullTime, true);
  assert.notStrictEqual(d.state, R.STATES.WAITING_FOR_MATCHDAY);
});

test('an outage across kick-off is still fixed the SAME evening, as a late edition', () => {
  // Still matchday at the ground, so this is the existing late path, not a
  // recovery. It must publish rather than wait, and it must not pretend to be
  // something it is not.
  const d = R.decide(ctx(KO + 6 * 3600000));
  assert.strictEqual(d.canPublish, true);
  assert.strictEqual(d.state, R.STATES.PUBLISHED_LATE);
  assert.ok(!d.recovery, 'the same day is lateness, not recovery');
});

test('an outage lasting past midnight recovers the next morning', () => {
  // The real Wallingford shape: matchday gone, nothing published, engine runs.
  const d = R.decide(ctx(KO + 30 * 3600000));
  assert.strictEqual(d.canPublish, true);
  assert.strictEqual(d.state, R.STATES.PUBLISHED_RECOVERY);
  assert.strictEqual(d.recovery, true);
});

test('the recovery window has an edge, and it is respected on both sides', () => {
  const inside = R.decide(ctx(FT + (R.RECOVERY_WINDOW_HOURS - 1) * 3600000));
  assert.strictEqual(inside.canPublish, true);
  assert.strictEqual(inside.state, R.STATES.PUBLISHED_RECOVERY);

  const outside = R.decide(ctx(FT + (R.RECOVERY_WINDOW_HOURS + 1) * 3600000));
  assert.strictEqual(outside.canPublish, false);
  assert.strictEqual(outside.state, R.STATES.RETROSPECTIVE_CANDIDATE);
});

test('OUTSIDE THE WINDOW NOTHING MANUFACTURES HISTORY BY ITSELF', () => {
  // A timer must never quietly produce programmes for matches played months
  // ago. That would be inventing a past the club never had.
  const d = R.decide(ctx(FT + 90 * 86400000));
  assert.strictEqual(d.canPublish, false);
  assert.strictEqual(d.state, R.STATES.RETROSPECTIVE_CANDIDATE);
  assert.match(d.reasons.join(' '), /authoris/i, 'it must say a human is needed');
});

test('a human CAN authorise a retrospective edition, and is named for it', () => {
  const d = R.decide(ctx(FT + 90 * 86400000, { retrospective_authorised_by: 'Chair' }));
  assert.strictEqual(d.canPublish, true);
  assert.strictEqual(d.state, R.STATES.PUBLISHED_RECOVERY);
  assert.strictEqual(d.retrospective, true);
  assert.match(d.reasons.join(' '), /Chair/);
});

/* ── what recovery must never do ──────────────────────────────────────────── */

test('recovery never publishes without confirmed teams', () => {
  // The day after, so this is genuinely the recovery branch.
  const d = R.decide(Object.assign(ctx(KO + 30 * 3600000), { homeLineup: null, awayLineup: null }));
  assert.strictEqual(d.canPublish, false);
  assert.strictEqual(d.state, R.STATES.WITHHELD);
  assert.match(d.reasons.join(' '), /never confirmed/);
});

test('recovery never publishes an incomplete programme', () => {
  const d = R.decide(ctx(KO + 30 * 3600000, { mandatory_content_valid: false }));
  assert.strictEqual(d.canPublish, false);
  assert.strictEqual(d.state, R.STATES.WITHHELD);
  assert.match(d.reasons.join(' '), /incomplete/);
});

test('an already-published edition is never republished by recovery', () => {
  const d = R.decide(ctx(KO + 30 * 3600000, { published_at: new Date(FT).toISOString() }));
  assert.strictEqual(d.canPublish, false, 'a duplicate recovery run must be a no-op');
});

test('an archived edition is left alone', () => {
  const d = R.decide(ctx(KO + 30 * 3600000, { archived_at: new Date(FT).toISOString() }));
  assert.strictEqual(d.state, R.STATES.ARCHIVED);
  assert.strictEqual(d.canPublish, false);
});

test('a withheld edition stays withheld — a human said no', () => {
  const d = R.decide(ctx(KO + 30 * 3600000, { withheld_by: 'Chair', withheld_reason: 'pitch inspection' }));
  assert.strictEqual(d.state, R.STATES.WITHHELD);
  assert.strictEqual(d.canPublish, false);
});

test('an AWAY fixture gets no programme, recovery or not', () => {
  const away = Object.assign({}, fixture, { home_team_id: 2, away_team_id: 1 });
  const d = R.decide(Object.assign(ctx(KO + 30 * 3600000), { fixture: away }));
  assert.strictEqual(d.canPublish, false);
  assert.match(d.reasons.join(' '), /away fixture/);
});

test('a postponed match is never recovered into a programme', () => {
  const off = Object.assign({}, fixture, { fixture_status: 'postponed' });
  const d = R.decide(Object.assign(ctx(KO + 30 * 3600000), { fixture: off }));
  assert.strictEqual(d.canPublish, false);
  assert.strictEqual(d.state, R.STATES.WITHHELD);
});

/* ── honesty about when it was published ──────────────────────────────────── */

test('NOTHING IN THE RULES EVER BACKDATES A PUBLICATION', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'netlify/functions/programme-sync.js'), 'utf8');
  // published_at is always the real moment. A backdated timestamp would be the
  // system claiming supporters had something on the day that they did not.
  const assigns = src.match(/published_at:\s*([^,\n]+)/g) || [];
  assert.ok(assigns.length > 0, 'expected the publication timestamp to be set');
  assigns.forEach((a) => {
    assert.match(a, /new Date\(\)\.toISOString\(\)/,
      'published_at must be now, never derived from the fixture: ' + a);
  });
  assert.ok(!/scheduled_kickoff_at[^;]{0,40}published_at/.test(src),
    'the kick-off must never become the publication time');
});

test('the portal says it in plain words', () => {
  const w = R.portalWording({ state: R.STATES.RETROSPECTIVE_CANDIDATE, reasons: [] }, fixture);
  assert.match(w.headline, /approval/i, 'a committee member must know it is waiting on them');
  const p = R.portalWording({ state: R.STATES.PUBLISHED_RECOVERY, reasons: [] }, fixture);
  assert.match(p.headline, /after full time/i, 'and that this one came late, honestly');
});

/* ── the three lists that must agree ──────────────────────────────────────── */

test('EVERY PLACE THAT DECIDES "PUBLIC" AGREES', () => {
  // The states appear in the endpoint, the RLS policy and the Match Centre.
  // If they drift, an edition is listed and then refuses to open — or opens
  // when it should not.
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '..');
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

  const expected = ['published_matchday', 'published_late', 'full_time_current',
    'archived', 'published_recovery'];

  const endpoint = read('netlify/functions/programme-data.js');
  const matchCentre = read('netlify/functions/lib/football/read.js');
  const sql = read('supabase/migrations/20260803120000_programme_recovery.sql');

  expected.forEach((st) => {
    assert.ok(endpoint.includes("'" + st + "'"), 'endpoint missing ' + st);
    assert.ok(matchCentre.includes("'" + st + "'"), 'match centre missing ' + st);
  });
  // Both policies moved together.
  const editions = sql.slice(sql.indexOf('create policy programme_editions_public_read'));
  const versions = sql.slice(sql.indexOf('create policy programme_versions_public_read'));
  expected.forEach((st) => {
    assert.ok(editions.includes(st), 'editions policy missing ' + st);
    assert.ok(versions.includes(st), 'versions policy missing ' + st);
  });
});

test('A RETROSPECTIVE CANDIDATE IS NOT PUBLIC', () => {
  // An unapproved proposal is not part of the club's record.
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '..');
  // Only the READ POLICIES and the endpoint filter decide what is public. The
  // state CHECK constraint legitimately lists every state, including the ones
  // that must never be served — an earlier version of this test conflated the
  // two and failed on a correct schema.
  const sql = fs.readFileSync(path.join(ROOT,
    'supabase/migrations/20260803120000_programme_recovery.sql'), 'utf8');
  const policies = sql.split('create policy').slice(1)
    .map((p) => p.slice(0, p.indexOf(';')));
  assert.strictEqual(policies.length, 2, 'expected both read policies');
  policies.forEach((p) => {
    assert.ok(p.includes('for select using'), 'not a read policy: ' + p.slice(0, 60));
    assert.ok(!p.includes('retrospective_candidate'), 'a policy exposes an unapproved proposal');
    assert.ok(!p.includes('draft_hidden'), 'a policy exposes a hidden draft');
    assert.ok(!p.includes('withheld'), 'a policy exposes a withheld edition');
  });

  const endpoint = fs.readFileSync(path.join(ROOT, 'netlify/functions/programme-data.js'), 'utf8');
  const list = endpoint.match(/const PUBLIC_STATES = "\(([^)]*)\)"/)[1];
  ['retrospective_candidate', 'draft_hidden', 'withheld', 'waiting_for_matchday',
   'waiting_for_lineups', 'ready_to_publish'].forEach((st) => {
    assert.ok(!list.includes(st), 'the endpoint would serve ' + st);
  });

  // And the state IS allowed to exist — it just is not public.
  assert.ok(sql.includes("'retrospective_candidate'"), 'the state must be a legal value');
});

test('the sync records WHY the normal moment was missed', () => {
  const fs = require('fs');
  const path = require('path');
  const s = fs.readFileSync(path.join(__dirname, '..', 'netlify/functions/programme-sync.js'), 'utf8');
  assert.match(s, /publication_source_detail = decision\.retrospective \? 'retrospective' : 'recovery'/);
  assert.match(s, /recovery_reason = decision\.reasons\.join/);
  assert.match(s, /published_after_full_time = !!decision\.afterFullTime/);
});

test('full time is CAPTURED into the edition, not looked up when read', () => {
  const fs = require('fs');
  const path = require('path');
  const s = fs.readFileSync(path.join(__dirname, '..', 'netlify/functions/programme-sync.js'), 'utf8');
  assert.match(s, /final_match_snapshot: finalMatch/,
    'an archived programme that reached for the current score would rewrite the past');
  assert.match(s, /isFinal: !!\(state && state\.is_final\)/,
    'isFinal was hardcoded false, so no edition could ever be enriched');
});

test('NOTHING CALLS A PAST MATCH "TODAY"', () => {
  // A recovered edition is not archived, so a state check labelled yesterday's
  // programme "Today at The Lane" and offered "Read today's programme".
  const fs = require('fs');
  const path = require('path');
  const s = fs.readFileSync(path.join(__dirname, '..', 'js/programme-library.js'), 'utf8');
  assert.match(s, /function isToday\(kickoffAt\)/,
    '"today" must be decided from the kick-off, not from the edition state');
  assert.match(s, /timeZone: 'Europe\/London'/, 'and at the ground, not in the viewer\'s timezone');
  assert.ok(!/var live = e\.state !== 'archived'/.test(s),
    'the state check is what caused the wrong label');
  // The honest alternative wording exists.
  assert.match(s, /Inaugural digital edition/);
});

test('the library card knows an edition came after full time', () => {
  const fs = require('fs');
  const path = require('path');
  const s = fs.readFileSync(path.join(__dirname, '..', 'netlify/functions/programme-data.js'), 'utf8');
  assert.match(s, /afterFullTime: !!r\.published_after_full_time/);
  assert.match(s, /published_after_full_time,publication_source_detail/,
    'it must select the columns it reads');
});

test('the portal offers approval ONLY for a candidate, and names who approved', () => {
  const fs = require('fs');
  const path = require('path');
  const s = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  assert.match(s, /ed\.state === 'retrospective_candidate'/,
    'the approve button must appear only for an edition awaiting a human');
  assert.match(s, /action: 'authorise_retrospective'/);
  assert.match(s, /so the club has a record of who approved it/);
  // And it tells the truth about the date in the confirmation itself.
  assert.match(s, /dated TODAY, not backdated/);
});

test('the portal explains recovery in plain words, with no state names', () => {
  const fs = require('fs');
  const path = require('path');
  const s = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  const block = s.slice(s.indexOf('published_recovery:'), s.indexOf('retrospective_candidate:') + 400);
  assert.match(block, /published after full time/);
  assert.ok(!/WAITING_FOR|canPublish|decide\(/.test(block), 'no jargon in the committee view');
});

test('PUBLICATION IS NEVER ONE RUN BEHIND', () => {
  // decide() reads edition.mandatory_content_valid, and `edition` is the row as
  // it was BEFORE this run. A programme that had just become complete was
  // judged on the previous run's answer, withheld, and published an hour later
  // when the stale flag caught up. On matchday an hour is the difference
  // between a programme and no programme.
  const fs = require('fs');
  const path = require('path');
  const s = fs.readFileSync(path.join(__dirname, '..', 'netlify/functions/programme-sync.js'), 'utf8');
  assert.match(s, /const editionNow = Object\.assign\(\{\}, edition, \{/,
    'the decision must use this run\'s validity');
  assert.match(s, /mandatory_content_valid: built\.validation\.ok/);
  assert.match(s, /edition: editionNow/, 'and decide() must be given it');
  // The stale row must not be what the decision sees.
  assert.ok(!/RULES\.decide\(\{\s*\n?\s*fixture: fx, edition, /.test(s),
    'decide() is still being handed the pre-run row');
});

test('a freshly complete programme publishes on the SAME run', () => {
  // Behavioural: content became valid this run, edition row still says false.
  const staleRow = { mandatory_content_valid: false, generated_at: 'yes' };
  const freshRow = Object.assign({}, staleRow, { mandatory_content_valid: true });
  const stale = R.decide(Object.assign(ctx(KO - 3600000), { edition: staleRow }));
  const fresh = R.decide(Object.assign(ctx(KO - 3600000), { edition: freshRow }));
  assert.strictEqual(stale.canPublish, false, 'the stale flag withholds it');
  assert.strictEqual(fresh.canPublish, true, 'the fresh one publishes it');
});

/* ── the bug that meant NO edition could ever publish ─────────────────────── */

test('CLUB DATA FILES ARE REQUESTED WITH THEIR EXTENSION', () => {
  // loadJson('committee') fetched /data/committee — no .json — which 404s.
  // committee and sponsors were therefore always null, staff and sponsors are
  // both MANDATORY, and mandatory_content_valid could never be true. The
  // programme engine could not publish anything, ever, and reported "waiting
  // for matchday" while doing it.
  const fs = require('fs');
  const path = require('path');
  const s = fs.readFileSync(path.join(__dirname, '..', 'netlify/functions/programme-sync.js'), 'utf8');
  assert.match(s, /replace\(\/\\\.json\$\/i, ''\) \+ '\.json'/,
    'the extension must be normalised on, not left to the caller');
  // No call site may build a bare path.
  const calls = s.match(/loadJson\('[^']+'\)/g) || [];
  assert.ok(calls.length >= 2, 'expected the committee and sponsor loads');
  // And the fetch must use the normalised name.
  assert.match(s, /SITE \+ '\/data\/' \+ file \+ '\?t='/);
  assert.ok(!/SITE \+ '\/data\/' \+ path \+ '\?t='/.test(s), 'the unnormalised path is still in use');
});

test('a missing club file is reported, not swallowed', () => {
  const fs = require('fs');
  const path = require('path');
  const s = fs.readFileSync(path.join(__dirname, '..', 'netlify/functions/programme-sync.js'), 'utf8');
  assert.match(s, /console\.error\('programme: \/data\/' \+ file \+ ' returned '/,
    'a 404 that returns null silently is how this hid for a whole gate');
});

test('the withheld reason NAMES the sections that are missing', () => {
  const fs = require('fs');
  const path = require('path');
  const s = fs.readFileSync(path.join(__dirname, '..', 'netlify/functions/programme-sync.js'), 'utf8');
  assert.match(s, /missing sections: ' \+ built\.validation\.missing\.join/,
    '"content is not complete" is not something a committee member can act on');
});

test('the programme timer is fast enough to matter on a matchday', () => {
  // Hourly meant up to 59 minutes between the official teams being confirmed
  // and the programme appearing. For a 3pm kick-off with teams out at 2pm that
  // is the difference between a pre-match programme and none at all.
  const fs = require('fs');
  const path = require('path');
  const toml = fs.readFileSync(path.join(__dirname, '..', 'netlify.toml'), 'utf8');
  const block = toml.slice(toml.indexOf('[functions."programme-sync"]'));
  const cron = (block.match(/schedule = "([^"]+)"/) || [])[1];
  assert.ok(cron, 'the programme sync must be scheduled');
  const everyN = (cron.match(/^\*\/(\d+) \* \* \* \*$/) || [])[1];
  assert.ok(everyN && Number(everyN) <= 15,
    'it must run at least every 15 minutes, found: ' + cron);
});

/* ── the latch ────────────────────────────────────────────────────────────── */

test('AN AUTOMATIC WITHHOLD DOES NOT LATCH THE EDITION SHUT FOR EVER', () => {
  // decide() read edition.withheld_reason as "a human said no" — the same field
  // the sync writes for ordinary technical reasons. So the first automatic
  // withhold shut the edition permanently: every later run saw the field,
  // returned early, wrote the reason back with another "withheld: " in front,
  // and never re-evaluated. The Wallingford edition had four prefixes stacked.
  const withReason = { mandatory_content_valid: true, generated_at: 'yes',
    withheld_reason: 'the match has been played and the content is incomplete' };
  const d = R.decide(ctx(KO - 3600000, withReason));
  assert.strictEqual(d.canPublish, true,
    'a stale machine reason must not prevent publication once the cause is gone');
  assert.notStrictEqual(d.state, R.STATES.WITHHELD);
});

test('a HUMAN withhold still outranks everything', () => {
  const stopped = { mandatory_content_valid: true, generated_at: 'yes',
    withheld_by: 'Chair', withheld_reason: 'pitch inspection at noon' };
  const d = R.decide(ctx(KO - 3600000, stopped));
  assert.strictEqual(d.canPublish, false);
  assert.strictEqual(d.state, R.STATES.WITHHELD);
  assert.match(d.reasons.join(' '), /withheld by Chair/);
  assert.match(d.reasons.join(' '), /pitch inspection/);
});

test('the withheld reason never compounds its own prefix', () => {
  const stopped = { mandatory_content_valid: true, generated_at: 'yes',
    withheld_by: 'Chair', withheld_reason: 'pitch inspection' };
  const once = R.decide(ctx(KO - 3600000, stopped)).reasons.join(' ');
  const twice = R.decide(ctx(KO - 3600000,
    Object.assign({}, stopped, { withheld_reason: once }))).reasons.join(' ');
  assert.ok((twice.match(/withheld by/g) || []).length <= 2,
    'the reason is growing a prefix every run: ' + twice);
});

test('the migration clears the latch it created', () => {
  const fs = require('fs');
  const path = require('path');
  const sql = fs.readFileSync(path.join(__dirname, '..',
    'supabase/migrations/20260803120000_programme_recovery.sql'), 'utf8');
  assert.match(sql, /add column if not exists withheld_by text/);
  assert.match(sql, /update public\.programme_editions\s*\n\s*set withheld_reason = null/,
    'existing latched editions must be released');
});

test('EVERY COLUMN THE SYNC WRITES EXISTS AND ACCEPTS THE VALUE', () => {
  // A 23514 check-constraint violation failed the whole run and, from a
  // supporter's point of view, looked like nothing at all: the edition just
  // stayed unpublished. `publication_source` allows only
  // automatic|emergency_teamsheet|manual; the recovery values belong in
  // publication_source_detail.
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '..');
  const sync = fs.readFileSync(path.join(ROOT, 'netlify/functions/programme-sync.js'), 'utf8');
  const schema = fs.readFileSync(path.join(ROOT,
    'supabase/migrations/20260802060000_programme_editions.sql'), 'utf8')
    + fs.readFileSync(path.join(ROOT,
    'supabase/migrations/20260803120000_programme_recovery.sql'), 'utf8');

  // Every patch.<column> the sync assigns must exist in the schema.
  const cols = [...new Set((sync.match(/patch\.([a-z_]+)\s*=/g) || [])
    .map((m) => m.slice(6).replace(/\s*=$/, '')))];
  assert.ok(cols.length >= 5, 'expected the sync to write several columns');
  cols.forEach((c) => {
    assert.ok(new RegExp('\\b' + c + '\\b').test(schema),
      'the sync writes a column the schema does not have: ' + c);
  });

  // And the constrained one must not be handed a recovery value.
  assert.ok(!/patch\.publication_source\s*=/.test(sync),
    'publication_source only allows automatic|emergency_teamsheet|manual');
  assert.match(sync, /patch\.publication_source_detail\s*=/);

  // The values written to publication_source_detail must be allowed by it.
  const allowed = (schema.match(/publication_source_detail in\s*\n?\s*\(([^)]*)\)/) || [])[1] || '';
  ['recovery', 'retrospective'].forEach((v) => {
    assert.ok(allowed.includes("'" + v + "'"), v + ' is not an allowed detail value');
  });
});

test('every state the sync writes is a legal state', () => {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '..');
  const sync = fs.readFileSync(path.join(ROOT, 'netlify/functions/programme-sync.js'), 'utf8');
  const sql = fs.readFileSync(path.join(ROOT,
    'supabase/migrations/20260803120000_programme_recovery.sql'), 'utf8');
  const allowed = (sql.match(/state in \(([\s\S]*?)\)\)/) || [])[1] || '';
  // Which STATES constants the sync assigns.
  const used = [...new Set((sync.match(/RULES\.STATES\.([A-Z_]+)/g) || [])
    .map((m) => m.split('.').pop()))];
  const R2 = require('../netlify/functions/lib/programme/publish-rules');
  used.forEach((k) => {
    const v = R2.STATES[k];
    assert.ok(v, 'unknown state constant: ' + k);
    assert.ok(allowed.includes("'" + v + "'"), 'the database would reject state ' + v);
  });
});
