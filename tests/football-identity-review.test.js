// ════════════════════════════════════════════════════════════════════════════
// THE COMPUTER SUGGESTS. THE COMMITTEE CONFIRMS.
//
// Nineteen Full-Time names sat provisional, none linked to a club player, so
// every programme card correctly showed a dash. The identity architecture was
// already right — it refuses to guess which real person a match-sheet name
// belongs to. What was missing was help: the review screen showed nineteen
// blank dropdowns and asked a volunteer to identify each person from a bare
// string, so nobody ever finished.
//
// These tests hold the line that makes helping safe:
//
//   A SUGGESTION IS NOT A DECISION. Even an exact string match is offered, not
//   applied. Two people can share a name, and it is the club that has to
//   answer for saying which of its players scored.
//
//   NO SHORTCUT SKIPS A CHECK. The bulk action exists because nineteen
//   decisions is enough friction that the job never gets done — but every pair
//   still goes through the same confirm(), with the same duplicate guards and
//   the same audit row naming who decided.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const fn = read('netlify/functions/football-players.js');
const admin = read('admin.html');
const identity = read('netlify/functions/lib/football/identity.js');

// ── 1 · A SUGGESTION IS NEVER A DECISION ────────────────────────────────────

test('suggestAll proposes and writes nothing', () => {
  const block = fn.slice(fn.indexOf("if (action === 'suggestall')"),
                         fn.indexOf("if (action === 'confirm')"));
  assert.ok(!/patchPlayer|confirmPatch|method: 'POST'/.test(block),
    'the suggestion pass must not change a single record');
  // The promise it makes, stated where the branch begins.
  assert.match(fn.slice(fn.indexOf('SUGGESTIONS FOR THE WHOLE QUEUE')),
    /NOTHING HERE DECIDES ANYTHING/);
});

test('an exact name match is still only a suggestion', () => {
  const block = fn.slice(fn.indexOf("if (action === 'suggestall')"),
                         fn.indexOf("if (action === 'confirm')"));
  assert.match(block, /confidence: exact\.length === 1 \? 'exact'/);
  // It is reported as confidence, never applied.
  assert.ok(!/identity_status: *'confirmed'/.test(block));
});

test('the screen pre-selects a suggestion but still requires a press', () => {
  const rowBlock = admin.slice(admin.indexOf('var sug = suggestions[q.id]'),
                               admin.indexOf('warn + sugNote'));
  assert.match(rowBlock, /selected/, 'the likely answer is offered');
  assert.match(rowBlock, /Please check, then press Confirm/);
  // Nothing may confirm on render.
  assert.ok(!/identConfirm\(q\.id\)\s*;/.test(rowBlock),
    'opening the screen must not confirm anybody');
});

test('ambiguity is shown as a choice, never resolved silently', () => {
  assert.match(admin, /We found more than one possible match\. Please choose\./);
  const block = fn.slice(fn.indexOf("if (action === 'suggestall')"),
                         fn.indexOf("if (action === 'confirm')"));
  assert.match(block, /'ambiguous'/);
  // More than one candidate must never collapse to a pick.
  assert.match(block, /exact\.length === 1/, 'only a single exact candidate may be offered');
});

test('initials remain a suggestion, as the resolver already insisted', () => {
  assert.match(identity, /A suggestion, never a match: initials are the/);
});

// ── 2 · NOTHING AMBIGUOUS ENTERS THE BULK ACTION ────────────────────────────

test('only unambiguous exact matches are offered in bulk', () => {
  const b = admin.slice(admin.indexOf('var bulkReady = todo.filter'),
                        admin.indexOf('var parkedNote'));
  assert.match(b, /sg\.confidence === 'exact'/);
  assert.ok(!/ambiguous/.test(b), 'an ambiguous row must never be swept up');
  assert.match(b, /sg\.suggestion && sg\.suggestion\.clubPlayerId/,
    'a pair needs both halves before it can be offered');
});

test('the bulk action shows every pair before doing anything', () => {
  const p = admin.match(/window\.identBulkPreview = function \(\) \{[\s\S]*?\n  \};/)[0];
  assert.match(p, /p\.from \+ '  →  ' \+ p\.to/, 'both names, so the reader can check');
  assert.match(p, /if \(!confirm\(/, 'one deliberate confirmation');
  // The preview must precede the call.
  assert.ok(p.indexOf('confirm(') < p.indexOf("action: 'confirmMany'"));
});

test('the server confirms the pairs it was sent, not its own opinion', () => {
  const block = fn.slice(fn.indexOf("if (action === 'confirmmany')"), fn.length);
  assert.match(block, /body\.pairs/, 'the caller sends the exact pairs it displayed');
  assert.ok(!/ID\.resolve/.test(block.slice(0, 600)),
    'the bulk path must not re-derive who to link — the screen and server would disagree');
});

test('every bulk confirmation goes through the same guarded path', () => {
  const block = fn.slice(fn.indexOf("if (action === 'confirmmany')"), fn.length);
  assert.match(block, /await confirm\(\{ playerId: pr\.playerId, clubPlayerId: pr\.clubPlayerId/,
    'no faster path may skip a protection');
  assert.match(block, /reason: 'bulk exact-name confirmation, reviewed on screen'/,
    'the audit must record how it was approved');
});

test('a bulk run is capped and reports what failed', () => {
  const block = fn.slice(fn.indexOf("if (action === 'confirmmany')"), fn.length);
  assert.match(block, /slice\(0, 50\)/);
  assert.match(block, /failed\.push/, 'a refusal must be surfaced, not swallowed');
});

// ── 3 · DUPLICATE PROTECTION ────────────────────────────────────────────────

test('one club player cannot be claimed by two Full-Time records', () => {
  const c = fn.match(/async function confirm\(body, by\) \{[\s\S]*?\n\}/)[0];
  assert.match(c, /club_player_id=eq\./, 'the club player is checked for an existing owner');
  assert.match(c, /is already confirmed as that player/);
  assert.match(c, /If they are the same person, merge instead/,
    'the refusal must say what to do instead');
});

test('a taken club player is not even offered', () => {
  const block = fn.slice(fn.indexOf("if (action === 'suggestall')"),
                         fn.indexOf("if (action === 'confirm')"));
  assert.match(block, /takenBy\[/, 'offering a taken player would only produce a refusal later');
});

test('merged records are excluded from the index', () => {
  const block = fn.slice(fn.indexOf("if (action === 'suggestall')"),
                         fn.indexOf("if (action === 'confirm')"));
  assert.match(block, /if \(x\.merged_into_id\) return;/);
});

test('two players on one URL is prevented', () => {
  const c = fn.match(/async function confirm\(body, by\) \{[\s\S]*?\n\}/)[0];
  assert.match(c, /public_slug=eq\./);
  assert.match(c, /would put two players on one URL/);
});

test('a refusal is remembered so the same wrong suggestion is not re-offered', () => {
  const r = fn.match(/async function reject\(body, by\) \{[\s\S]*?\n\}/)[0];
  assert.match(r, /football_identity_rejections/);
  const block = fn.slice(fn.indexOf("if (action === 'suggestall')"),
                         fn.indexOf("if (action === 'confirm')"));
  assert.match(block, /rejections: rejections \|\| \[\]/, 'past refusals feed back into suggestions');
});

// ── 4 · SCOPE AND STAT INTEGRITY SURVIVE ────────────────────────────────────

test('confirming changes identity, never a statistic', () => {
  const c = strip(fn.match(/async function confirm\(body, by\) \{[\s\S]*?\n\}/)[0]);
  ['appearances', 'goals', 'minutes'].forEach((k) => {
    assert.ok(!new RegExp(k).test(c), `confirming must not write ${k}`);
  });
});

test('totals are still recomputed, never incremented', () => {
  const ps = read('netlify/functions/lib/football/player-stats.js');
  assert.match(ps, /Everything here RECOMPUTES\. Nothing increments\./);
});

test('the programme still reads one scope only', () => {
  const prog = read('netlify/functions/programme-stats.js');
  assert.match(prog, /statsByClubPlayer\(season, 'all'\)/);
  assert.match(prog, /never summed with subsets/);
});

test('only confirmed identities reach a programme card', () => {
  const rp = read('netlify/functions/lib/football/read-players.js');
  const q = rp.match(/football_players\?current_team_id[\s\S]*?\|\| \[\]/)[0];
  assert.match(q, /identity_status=eq\.confirmed/);
  assert.match(q, /merged_into_id=is\.null/);
});

// ── 5 · WHO MAY DECIDE, AND WHOSE NAME GOES ON IT ───────────────────────────

test('every action name is compared in the case the handler produces', () => {
  // action is lowercased on the way in, so a camelCase comparison never fires
  // and the whole branch is dead code that falls through to "unknown action".
  const gate = fn.match(/const action = String\([^)]*\)\.toLowerCase\(\);/);
  assert.ok(gate, 'the handler still lowercases the action');
  const compared = [...fn.matchAll(/action === '([^']+)'/g)].map((m) => m[1]);
  assert.ok(compared.length >= 8);
  compared.forEach((a) => {
    assert.strictEqual(a, a.toLowerCase(), `"${a}" can never match a lowercased action`);
  });
  assert.ok(compared.includes('suggestall') && compared.includes('confirmmany'));
});

test('changing a record needs the capability, not just the club PIN', () => {
  assert.match(fn, /const gate = await AUTHZ\.requireCap\(event, AUTHZ\.CAP\.CONFIRM_IDENTITY\);/);
  assert.match(fn, /if \(!gate\.ok\) return gate\.response;/);
  const AZ = require(path.join(ROOT, 'netlify/functions/lib/authz.js'));
  assert.strictEqual(AZ.CAP.CONFIRM_IDENTITY, 'can_confirm_player_identity');
});

test('the gate sits below the reads and above every write', () => {
  const g = fn.indexOf('const gate = await AUTHZ.requireCap');
  assert.ok(g > fn.indexOf("if (action === 'queue')"), 'seeing the queue must stay open');
  assert.ok(g > fn.indexOf("if (action === 'suggestall')"), 'seeing suggestions must stay open');
  ['confirm', 'confirmmany', 'reject', 'merge', 'unmerge', 'correct', 'recompute'].forEach((a) => {
    assert.ok(fn.indexOf(`action === '${a}'`) > g, `${a} must be below the gate`);
  });
});

test('the manager holds it without holding any administrative power', () => {
  const AZ = require(path.join(ROOT, 'netlify/functions/lib/authz.js'));
  const tm = AZ.DEFAULT_CAPS['Team Manager'] || [];
  assert.deepStrictEqual(tm, [AZ.CAP.CONFIRM_IDENTITY]);
  AZ.ELEVATED.concat([AZ.CAP.MANAGE_USERS, AZ.CAP.ASSIGN_ADMIN, AZ.CAP.VIEW_STAFF])
    .forEach((c) => assert.ok(tm.indexOf(c) === -1, `Team Manager must not hold ${c}`));
});

test('it is not exclusive to developer access', () => {
  const AZ = require(path.join(ROOT, 'netlify/functions/lib/authz.js'));
  const holders = Object.keys(AZ.DEFAULT_CAPS)
    .filter((r) => AZ.DEFAULT_CAPS[r].indexOf(AZ.CAP.CONFIRM_IDENTITY) > -1);
  ['Chairman', 'System Maintainer', 'Team Manager'].forEach((r) =>
    assert.ok(holders.includes(r), `${r} must be able to confirm a player`));
});

test('the drawing mirror agrees with the server', () => {
  const AZ = require(path.join(ROOT, 'netlify/functions/lib/authz.js'));
  const pt = read('js/portal-tools.js');
  const caps = pt.slice(pt.indexOf('var STAFF_CAPS = {'), pt.indexOf('/** Does this role hold'));
  Object.keys(AZ.DEFAULT_CAPS).forEach((role) => {
    assert.ok(caps.includes("'" + role + "'"), `the portal has no mirror for "${role}"`);
  });
  assert.match(caps, /'Team Manager': \['can_confirm_player_identity'\]/);
});

test('the decider is taken from the signed session, never from the body', () => {
  const a = fn.match(/function actor\(sess\) \{[\s\S]*?\n\}/)[0];
  assert.ok(!/body/.test(a), 'a typed name must not become the permanent record');
  assert.match(a, /sess\.username/);
  assert.match(fn, /const by = actor\(gate\.session\);/);
});

test('the screen sends the signed token with every decision', () => {
  const d = admin.match(/function decide\(payload\) \{[\s\S]*?\n  \}/)[0];
  assert.match(d, /staffAdminFetch\(FN/);
  const p = admin.match(/window\.identBulkPreview = function \(\) \{[\s\S]*?\n  \};/)[0];
  assert.match(p, /decide\(\{ action: 'confirmMany'/);
  assert.ok(!/\bby:/.test(p), 'the browser must not name the decider any more');
});

test('cancelling the password box is not treated as a failure', () => {
  ['identConfirm', 'identReject'].forEach((f) => {
    const b = admin.match(new RegExp('window\\.' + f + ' = function[\\s\\S]*?\\n  \\};'))[0];
    assert.match(b, /if \(!j\) return;/, `${f} must stay silent when the person cancels`);
  });
});

// ── 5b · THE THIRD ANSWER ───────────────────────────────────────────────────

test('"not our player" reads as the permanent decision it is', () => {
  assert.match(admin, />Not our player</);
  assert.ok(!/>Leave unconfirmed</.test(admin),
    'a permanent rejection must not be labelled as skipping');
  const b = admin.match(/window\.identReject = function[\s\S]*?\n  \};/)[0];
  assert.match(b, /NOT one of our players/);
  assert.match(b, /use “I'm not sure” instead/, 'the dialog must point at the honest alternative');
});

test('"I\'m not sure" records nothing at all', () => {
  const b = admin.match(/window\.identUnsure = function[\s\S]*?\n  \};/)[0];
  assert.ok(!/decide\(|api\(/.test(b), 'not knowing must never reach the server');
  assert.match(b, /unsure\[id\] = true/);
  assert.match(admin, /will be waiting here next time/);
});

test('a name set aside is still counted as outstanding', () => {
  const r = admin.slice(admin.indexOf('var parked = ours.filter'),
                        admin.indexOf('var rows = todo.slice'));
  assert.match(r, /todo = ours\.filter\(function \(q\) \{ return !unsure\[q\.id\]; \}\)/);
  // Progress and the headline count read `ours`, which still includes them.
  assert.match(admin, /var totalKnown = checked \+ ours\.length;/);
  assert.match(admin, /var bulkReady = todo\.filter/, 'nor may it be swept up in bulk');
});

test('every decision is written to the audit', () => {
  const c = fn.match(/async function confirm\(body, by\) \{[\s\S]*?\n\}/)[0];
  assert.match(c, /await audit\(\{/);
  ['from_status', 'to_status', 'from_value', 'to_value', 'decided_by']
    .forEach((k) => assert.ok(c.includes(k), `the audit must record ${k}`));
});

test('no credential is ever written to the audit', () => {
  const c = fn.match(/async function confirm\(body, by\) \{[\s\S]*?\n\}/)[0];
  assert.ok(!/pin|password|token/i.test(c.replace(/^\s*\/\/.*$/gm, '')));
});

// ── 6 · THE SCREEN ITSELF ───────────────────────────────────────────────────

test('the committee is told what confirming unlocks', () => {
  assert.match(admin, /Programme statistics are now available/);
});

test('progress is visible, so the job feels finishable', () => {
  assert.match(admin, /' of ' \+ esc\(totalKnown\) \+ ' checked/);
  assert.match(admin, /ident-bar/);
});

test('a suggestion looks different from a decision', () => {
  const css = admin.match(/\.ident-sug\{[^}]*\}/)[0];
  assert.ok(css.length > 0);
  assert.match(admin, /\.ident-sug--amb\{/, 'ambiguity is styled as a caution, not a result');
});

// ── 7 · A PROGRAMME IS A PRE-MATCH DOCUMENT ─────────────────────────────────
// Handed to supporters before kick-off, so every figure in it must be the
// figure as it stood BEFORE the match they are about to watch.

const print = read('programme-print.html');

/** seasonStats() lifted out and run for real, rather than matched as text. */
function seasonStats(fixtures, editionDate) {
  const src = print.slice(print.indexOf('function seasonStats(fixtures, editionDate){'),
                          print.indexOf('/* ── WHICH PROGRAMME IS THIS?'));
  return new Function(src + '; return seasonStats;')()(fixtures, editionDate);
}

const SEASON_SO_FAR = [
  { date: '2026-08-08', us: 3, them: 1, opponent: 'Ashford', scorers: 'Smith, Jones, Patel' },
  { date: '2026-08-15', us: 0, them: 2, opponent: 'Hilltop', scorers: '' },
  { date: '2026-08-18', us: 1, them: 1, opponent: 'Knaphill', scorers: 'Smith' },
];

test("today's match is excluded from its own programme", () => {
  // The programme for the 18th. Live scores are entered while it is being
  // played, and this page reads the same fixtures file.
  const s = seasonStats(SEASON_SO_FAR, '2026-08-18');
  assert.strictEqual(s.played, 2, 'only the matches played BEFORE today count');
  assert.deepStrictEqual(s.form, ['W', 'L'], "today's result must not appear in form");
  assert.strictEqual(s.pts, 3);
  assert.ok(!s.results.some((r) => r.date === '2026-08-18'));
});

test('a later fixture never leaks into an earlier programme', () => {
  const s = seasonStats(SEASON_SO_FAR, '2026-08-15');
  assert.strictEqual(s.played, 1);
  assert.deepStrictEqual(s.form, ['W']);
  // Which is what keeps a published edition honest years later.
  assert.strictEqual(seasonStats(SEASON_SO_FAR, '2026-08-08').played, 0);
});

test('goals are counted from the same cut-off as the form', () => {
  const s = seasonStats(SEASON_SO_FAR, '2026-08-18');
  assert.strictEqual(s.gf, 3);
  assert.strictEqual(s.ga, 3);
  // Smith scored on the 8th and again today. Only the 8th may be credited.
  const smith = s.scorers.filter((x) => x.name === 'Smith')[0];
  assert.strictEqual(smith.goals, 1, "today's goal must not be credited before kick-off");
  assert.strictEqual(seasonStats(SEASON_SO_FAR, '').scorers
    .filter((x) => x.name === 'Smith')[0].goals, 2, 'and both are counted with no cut-off');
});

test('an undated draft still shows what it can', () => {
  const s = seasonStats(SEASON_SO_FAR, '');
  assert.strictEqual(s.played, 3, 'no cut-off falls back to everything with a score');
});

test('an unplayed fixture is excluded whatever its date', () => {
  const s = seasonStats(SEASON_SO_FAR.concat([{ date: '2026-08-01', opponent: 'Bedfont' }]), '2026-08-18');
  assert.strictEqual(s.played, 2);
});

test('the print page passes the edition its own date', () => {
  assert.match(print, /var S = seasonStats\(fixtures, d\.date\);/);
});

// ── 8 · A PUBLISHED EDITION IS HISTORY ──────────────────────────────────────

test('a published edition draws the table it was published with', () => {
  assert.match(print, /var frozenTable = d\.leagueTable && \(d\.leagueTable\.table \|\| d\.leagueTable\)/);
  // PUBLISHED decides, the same rule the player figures follow: an archived
  // edition keeps the standings it went to print with, while a draft is built
  // on the standings as they are today.
  const block = print.slice(print.indexOf('var frozenTable ='), print.indexOf('var club = {'));
  assert.match(block, /d\.published\s*\n?\s*\? \(\(frozenTable && frozenTable\.length\) \? frozenTable : liveTable\)/,
    'a published edition takes its frozen copy');
  assert.match(block, /: \(liveTable\.length \? liveTable : \(frozenTable \|\| \[\]\)\)/,
    'a draft takes the live standings');
});

test('the freeze stores rows the print page can actually read', () => {
  const pub = admin.match(/async function publishProgramme\(\)[\s\S]*?\n\}/)[0];
  assert.match(pub, /if \(tb && tb\.table && tb\.table\.length\) doc\.leagueTable = tb\.table;/);
  assert.ok(!/doc\.leagueTable = tb;/.test(pub),
    'storing the envelope made the print page fall through to today’s table');
});

// ── 9 · THE PAGE MUST ACTUALLY BUILD ────────────────────────────────────────
// A local `var seasonStats` inside render() shadowed the season-summary
// function — `var` is function-scoped, not block-scoped — so the Season So Far
// page called an object. The render chain had no catch, so the promise rejected
// silently and the page sat on "Building…" for ever. It looked like a slow
// network. Every printed programme had quietly lost a page.

test('the season summary function is not shadowed inside render', () => {
  const r = print.slice(print.indexOf('function render(d, crests'));
  assert.ok(!/var seasonStats\s*=/.test(r),
    'a local of that name silently replaces the function for the whole of render');
  assert.match(r, /var playerSeason = \(d\.playerStats && d\.playerStats\.players\) \|\| \{\};/);
});

test('the per-player figures are declared before anything could read them', () => {
  // The original fault: `var playerSeason` sat inside the squad block while the
  // Statistics Centre read it unconditionally, so a club with no players listed
  // hoisted it as undefined and Object.keys() threw. The Statistics Centre has
  // since been removed with the rest of the individual statistics, but the
  // declaration must stay above the squad block — a published edition still
  // carries a frozen snapshot, and anything added later must find it defined.
  const r = print.slice(print.indexOf('function render(d, crests'));
  const decl = r.indexOf('var playerSeason =');
  const guard = r.indexOf('if (club.players && club.players.length)');
  assert.ok(decl > -1, 'the frozen snapshot is still read for published editions');
  assert.ok(decl < guard, 'it must not be trapped inside the squad block');
  assert.ok(!/Object\.keys\(playerSeason\)/.test(print),
    'nothing reads it unconditionally any more — the Statistics Centre is gone');
});

test('a failure to build says so instead of hanging', () => {
  const c = print.match(/\}\)\.catch\(function\(err\)\{[\s\S]*?\n  \}\);/);
  assert.ok(c, 'the render chain must have a catch');
  assert.match(c[0], /This programme could not be built/);
  assert.match(c[0], /Nothing has been printed/, 'the reader must know not to trust the page');
  assert.match(c[0], /esc\(String\(\(err && err\.message\) \|\| err\)\)/,
    'the fault must be reportable, not guessed at');
});

test('nothing already deployed is regressed', () => {
  assert.match(read('programme-print.html'), /aspect-ratio:4\/5/, 'headshot fix');
  assert.match(read('programme-print.html'), /league-mark/, 'Cherry Red placement');
  assert.match(read('programme-print.html'), /function loadSeasonStats\(doc\)\{/, 'archive rule');
  assert.match(admin, /function prBuildDoc\(\)/, 'programme fixture repair');
  assert.match(admin, /async function publishProgramme\(\)/, 'publish freeze');
  assert.ok(!/Press Publish first/.test(strip(admin)));
});
