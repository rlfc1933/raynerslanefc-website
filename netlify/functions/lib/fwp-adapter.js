// Football Web Pages → Rayners Lane, the translation layer.
//
// EVERYTHING provider-specific lives in this file. Nothing else in the codebase
// may know that FWP exists, what its markup looks like, or how it phrases an
// event. The rest of the system consumes the normalised shape at the bottom of
// this file. That is the whole point: when FWP changes its markup, or the club
// moves to another provider, exactly one file is rewritten and the scoreboard,
// the Match Centre and the portal are untouched.
//
// This file is PURE — no fetch, no database, no environment. It takes HTML in
// and returns data out, which is what makes it testable against the real
// captured responses in tests/fixtures/fwp/.
//
// Provider markup this was built against (captured live, 1 Aug 2026, Rayners
// Lane 2-1 Wallingford & Crowmarsh, FWP fixture 578225):
//
//   <p class="match-heading" id="fwp-heading">Today's Match -
//      <span class="status">First Half - 45+5'</span></p>
//   <ul class="match-summary">
//     <li class="team home-team has-crest">
//       <img ... title="Rayners Lane"> <h4><span>2</span>Rayners Lane</h4>
//       <p>Harry Bonner (13' og)<br />Keiran Barnard-White (41')</p></li>
//     <li class="team away-team has-crest">…</li>
//     <li class="info">Combined Counties League Premier Division North<br />
//         Kick-off: 3pm<br />Referee: Nathan Parrin<br />Venue: …</li>
//   </ul>
//   <ul class="match-events with-extra">
//     <li class="goal"><span>13'</span>Harry Bonner scores (og)</li>
//     <li><span>30'</span>Beau  Pryce sent off</li>
//     <li><span>45+3'</span>Harry Bonner cautioned</li>
//   </ul>
//   <li class="playing"><a href="rayners-lane/appearances/<slug>/<id>" …>
//     <span class="player">Le'Kai Chevannes</span>
//     <span class="fwp-card yellow-card" title="… cautioned - 45+3'"></span></a></li>

'use strict';

const OUR_CLUB = 'Rayners Lane';

// ── text helpers ───────────────────────────────────────────────────────────
// FWP serves HTML entities in real names (Tyler D&rsquo;Cruz) and occasionally
// doubles a space ("Beau  Pryce"). Both would otherwise produce two different
// player keys for one person and break deduplication.
function decode(s) {
  return String(s == null ? '' : s)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&rsquo;|&#8217;/g, '’')
    .replace(/&lsquo;|&#8216;/g, '‘')
    .replace(/&eacute;/g, 'é')
    .replace(/&nbsp;/g, ' ');
}
function clean(s) { return decode(s).replace(/[ \t]+/g, ' ').trim(); }

// Compare club names across sources. FWP writes "Punjab Utd FC" where our
// fixtures say "Punjab United" — the same normalisation import-fixtures.js
// already uses, kept identical on purpose so the two agree.
function normClub(s) {
  return String(s || '').toLowerCase()
    .replace(/\bf\.?c\.?\b/g, '').replace(/\butd\b/g, 'united')
    .replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
}
// Player identity key. Strips the role suffix FWP appends in line-ups — the
// captain is "Keiran Barnard-White (C)" there but plain "Keiran Barnard-White"
// in the timeline, so without this the captain's goals never attribute to a
// team. Also folds the curly apostrophe FWP uses in "Tyler D’Cruz".
function normPlayer(s) {
  return clean(s)
    .replace(/\s*\((?:c|gk|capt|captain|vc)\)\s*$/i, '')
    .toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ').trim();
}
// Display name and the flags that suffix carried, kept apart so the public UI
// can render "Keiran Barnard-White" with its own captain marker rather than
// reprinting the provider's "(C)".
function splitRole(raw) {
  const name = clean(raw);
  const m = name.match(/^(.*?)\s*\((c|gk|capt|captain|vc)\)\s*$/i);
  if (!m) return { name, isCaptain: false, isKeeper: false };
  const tag = m[2].toLowerCase();
  return {
    name: clean(m[1]),
    isCaptain: tag === 'c' || tag === 'capt' || tag === 'captain',
    isKeeper: tag === 'gk',
  };
}

// "45+5'" → { minute: 45, stoppage: 5 }.  "13'" → { minute: 13, stoppage: 0 }.
// Returns nulls rather than zeros when there is no minute at all, so "unknown"
// is never silently rendered as the 0th minute.
function parseMinute(raw) {
  const m = String(raw || '').match(/(\d{1,3})(?:\s*\+\s*(\d{1,2}))?/);
  if (!m) return { minute: null, stoppage: null };
  return { minute: Number(m[1]), stoppage: m[2] ? Number(m[2]) : 0 };
}

// ── status / period ────────────────────────────────────────────────────────
// The provider's own words, mapped to our vocabulary. Anything unrecognised is
// 'unknown' and is NOT treated as live — an unreadable status must never put a
// stale score on the site under a live badge.
const PERIODS = [
  [/\bfull[\s-]?time\b|\bft\b/i,               'full_time'],
  [/\bhalf[\s-]?time\b|\bht\b/i,               'half_time'],
  [/\bsecond half\b|\b2nd half\b/i,            'second_half'],
  [/\bfirst half\b|\b1st half\b/i,             'first_half'],
  [/\bextra[\s-]?time\b/i,                     'extra_time'],
  [/\bpenalt/i,                                'penalties'],
  [/\babandon/i,                               'abandoned'],
  [/\bpostpon/i,                               'postponed'],
  [/\bcancel/i,                                'cancelled'],
  [/\bdelay/i,                                 'delayed'],
];
const LIVE_PERIODS = ['first_half', 'half_time', 'second_half', 'extra_time', 'penalties'];

function parseStatus(html) {
  const m = html.match(/<span class="status"[^>]*>([\s\S]*?)<\/span>/i);
  const text = m ? clean(m[1]) : '';
  let period = 'unknown';
  for (const [re, name] of PERIODS) if (re.test(text)) { period = name; break; }
  // A bare clock with no period word ("67'") still means the game is running.
  const clock = text.match(/(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s*'/);
  if (period === 'unknown' && clock) period = 'in_play';
  const min = clock ? parseMinute(clock[0]) : { minute: null, stoppage: null };
  // Half time has no running clock; carrying 45' into it would show a frozen
  // timer that looks broken.
  const showClock = period !== 'half_time' && period !== 'full_time';
  return {
    statusText: text,
    period,
    matchMinute: showClock ? min.minute : null,
    stoppageMinute: showClock ? min.stoppage : null,
    isLive: LIVE_PERIODS.indexOf(period) !== -1 || period === 'in_play',
    isFinal: period === 'full_time',
  };
}

// ── teams, scores and the scorer lines ─────────────────────────────────────
function parseTeamBlock(html, side) {
  const re = new RegExp('<li class="team ' + side + '-team[^"]*"[^>]*>([\\s\\S]*?)</li>', 'i');
  const m = html.match(re);
  if (!m) return null;
  const block = m[1];
  const crest = (block.match(/<img[^>]*src="([^"]+)"/i) || [])[1] || '';
  const h4 = block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
  let name = '', score = null;
  if (h4) {
    const sp = h4[1].match(/<span[^>]*>([\s\S]*?)<\/span>/i);
    if (sp) score = parseInt(clean(sp[1]), 10);
    name = clean(h4[1].replace(/<span[^>]*>[\s\S]*?<\/span>/i, ''));
  }
  // "Harry Bonner (13' og)<br />Keiran Barnard-White (41')"
  const p = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const scorers = [];
  if (p) {
    decode(p[1]).split('\n').forEach((line) => {
      const t = clean(line);
      if (!t) return;
      const g = t.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
      const who = clean(g ? g[1] : t);
      const meta = g ? g[2] : '';
      const { minute, stoppage } = parseMinute(meta);
      scorers.push({
        player: who,
        minute, stoppage,
        ownGoal: /\bog\b|own goal/i.test(meta),
        penalty: /\bpen\b|penalty/i.test(meta),
      });
    });
  }
  return {
    name,
    crest: crest ? absoluteCrest(crest) : '',
    score: isNaN(score) ? null : score,
    scorers,
  };
}

// FWP serves crest paths relative to its own <base>. We resolve them so the
// value we store is meaningful, but the public site prefers the club's OWN
// crest assets — see pickCrest() in js/match-centre.js. Storing this is a
// fallback, never the primary image.
function absoluteCrest(src) {
  if (/^https?:\/\//i.test(src)) return src;
  return 'https://www.footballwebpages.co.uk/' + String(src).replace(/^\/+/, '');
}

// ── the info line: competition / kick-off / referee / venue ────────────────
function parseInfo(html) {
  const m = html.match(/<li class="info"[^>]*>([\s\S]*?)<\/li>/i);
  const out = { competition: '', kickoffText: '', referee: '', venue: '' };
  if (!m) return out;
  decode(m[1]).split('\n').map((s) => clean(s)).filter(Boolean).forEach((line, i) => {
    const kv = line.match(/^([A-Za-z-\s]+):\s*(.+)$/);
    if (kv) {
      const k = kv[1].toLowerCase().trim();
      if (k === 'kick-off' || k === 'kick off') out.kickoffText = kv[2];
      else if (k === 'referee') out.referee = kv[2];
      else if (k === 'venue') out.venue = kv[2];
      else if (k === 'attendance') out.attendance = kv[2];
    } else if (i === 0) out.competition = line;
  });
  return out;
}

// ── line-ups (also the index that tells us WHOSE event it is) ──────────────
function parseLineUp(html, side) {
  // Anchor on the side marker, then take the FIRST <ul class="match-line-up">
  // after it. Matching the wrapping <div> instead looks obvious and is wrong:
  // the div contains nested divs, so a non-greedy match stops at the first
  // </div> and silently returns a partial XI. That produced exactly two
  // unattributed events (a goal and a red card) on the first real match.
  const marker = new RegExp('\\b' + side + '-line-up\\b', 'i').exec(html);
  if (!marker) return [];
  const ul = /<ul class="match-line-up"[^>]*>([\s\S]*?)<\/ul>/i.exec(html.slice(marker.index));
  if (!ul) return [];
  const players = [];
  // Match EVERY <li>, with or without a class. Only the used starters carry
  // class="playing"; unused substitutes — and, importantly, a player who has
  // been sent off — are bare <li>. Requiring the class dropped the sent-off
  // player from the index, which left his red card unattributed to any team.
  const liRe = /<li([^>]*)>([\s\S]*?)<\/li>/gi;
  let li;
  while ((li = liRe.exec(ul[1])) !== null) {
    const role = (li[1].match(/class="([^"]*)"/i) || [, 'squad'])[1];
    const row = li[2];
    const rawName = (row.match(/<span class="player"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '';
    const role2 = splitRole(rawName);
    const name = role2.name;
    if (!name) continue;
    const number = clean((row.match(/<span class="fa-layers-text"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '');
    const href = (row.match(/href="([^"]*appearances[^"]*)"/i) || [])[1] || '';
    const externalPlayerId = (href.match(/\/(\d+)\s*$/) || [])[1] || '';
    const cards = [];
    const cardRe = /<span class="fwp-card (yellow|red)-card"[^>]*title="([^"]*)"/gi;
    let c;
    while ((c = cardRe.exec(row)) !== null) {
      cards.push({ colour: c[1], detail: clean(c[2]) });
    }
    players.push({
      name,
      number: number || null,
      externalPlayerId: externalPlayerId || null,
      role: role || 'playing',
      isCaptain: role2.isCaptain,
      isKeeper: role2.isKeeper,
      cards,
    });
  }
  return players;
}

// ── the event timeline ─────────────────────────────────────────────────────
// FWP writes plain English verbs. We map to our own vocabulary and never store
// the provider's phrasing as the thing we render — the public site builds its
// own wording from event_type (see js/match-centre.js renderEvent()).
const VERBS = [
  [/\bsent off\b|\bred card\b/i,            'red_card'],
  [/\bcautioned\b|\bbooked\b|\byellow\b/i,  'yellow_card'],
  [/\bscores\b|\bgoal\b/i,                  'goal'],
  [/\bsubstitut|\breplaced by\b|\bon for\b/i, 'substitution'],
  [/\bpenalty missed\b|\bmisses penalty\b/i, 'penalty_missed'],
  [/\bhalf[\s-]?time\b/i,                   'half_time'],
  [/\bfull[\s-]?time\b/i,                   'full_time'],
];

function parseEvents(html) {
  const ul = html.match(/<ul class="match-events[^"]*"[^>]*>([\s\S]*?)<\/ul>/i);
  if (!ul) return [];
  const out = [];
  const liRe = /<li([^>]*)>([\s\S]*?)<\/li>/gi;
  let li, seq = 0;
  while ((li = liRe.exec(ul[1])) !== null) {
    const attrs = li[1] || '';
    const inner = li[2];
    const minRaw = clean((inner.match(/<span[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '');
    const text = clean(inner.replace(/<span[^>]*>[\s\S]*?<\/span>/i, ''));
    if (!text) continue;
    const { minute, stoppage } = parseMinute(minRaw);
    let type = 'info';
    for (const [re, name] of VERBS) if (re.test(text)) { type = name; break; }
    // class="goal" is the provider's own marker and is more reliable than the
    // verb when a name happens to contain a keyword.
    if (/\bclass="[^"]*\bgoal\b/i.test(attrs)) type = 'goal';
    const ownGoal = /\(og\)|own goal/i.test(text);
    // The player is the sentence minus the verb phrase.
    const player = clean(text
      .replace(/\s*\(og\)|\s*\(pen\)/gi, '')
      .replace(/\b(scores|sent off|cautioned|booked|substituted|replaced).*$/i, ''));
    out.push({
      sequence: seq++,
      type,
      minute, stoppage,
      player,
      ownGoal,
      penalty: /\(pen\)|penalty/i.test(text),
      text,                       // kept for audit only — never rendered
    });
  }
  return out;
}

// ── putting it together ────────────────────────────────────────────────────
// Attribute each event to a team using the LINE-UPS, not the order of the
// timeline. This matters: Harry Bonner is a Wallingford player whose own goal
// is credited to Rayners Lane. Reading the timeline alone would file both his
// goal and his booking under the wrong club.
function attribute(events, homeLineUp, awayLineUp, homeName, awayName) {
  const index = {};
  homeLineUp.forEach((p) => { index[normPlayer(p.name)] = 'home'; });
  awayLineUp.forEach((p) => { index[normPlayer(p.name)] = 'away'; });
  return events.map((e) => {
    const side = index[normPlayer(e.player)] || null;
    // An own goal counts for the OPPOSITE team to the player who scored it.
    let creditedSide = side;
    if (e.type === 'goal' && e.ownGoal && side) creditedSide = side === 'home' ? 'away' : 'home';
    return Object.assign({}, e, {
      playerSide: side,
      playerTeam: side ? (side === 'home' ? homeName : awayName) : null,
      side: creditedSide,
      team: creditedSide ? (creditedSide === 'home' ? homeName : awayName) : null,
    });
  });
}

/**
 * Parse a FWP match fragment (either a full embed page or the `match` field of
 * a refresh delta) into the internal shape. Returns null when the HTML is not
 * a match view at all — the caller must treat null as "reject", never as "0-0".
 */
function parseMatch(html) {
  if (!html || typeof html !== 'string') return null;
  if (!/match-summary|match-heading/i.test(html)) return null;

  const home = parseTeamBlock(html, 'home');
  const away = parseTeamBlock(html, 'away');
  if (!home || !away || !home.name || !away.name) return null;

  const status = parseStatus(html);
  const info = parseInfo(html);
  const homeLineUp = parseLineUp(html, 'home');
  const awayLineUp = parseLineUp(html, 'away');
  const events = attribute(parseEvents(html), homeLineUp, awayLineUp, home.name, away.name);

  return {
    provider: 'fwp',
    home: { name: home.name, score: home.score, crest: home.crest, scorers: home.scorers, lineUp: homeLineUp },
    away: { name: away.name, score: away.score, crest: away.crest, scorers: away.scorers, lineUp: awayLineUp },
    homeScore: home.score,
    awayScore: away.score,
    period: status.period,
    statusText: status.statusText,
    matchMinute: status.matchMinute,
    stoppageMinute: status.stoppageMinute,
    isLive: status.isLive,
    isFinal: status.isFinal,
    competition: info.competition,
    kickoffText: info.kickoffText,
    referee: info.referee,
    venue: info.venue,
    attendance: info.attendance || null,
    events,
  };
}

/**
 * Is this the match we asked for, and are we actually in it?
 * A provider that quietly returns a different fixture must never be written to
 * the scoreboard — that is how a supporter ends up watching someone else's game.
 */
function validateMatch(parsed, expected) {
  const errors = [];
  if (!parsed) return { ok: false, errors: ['unparseable response'] };
  const ours = [parsed.home.name, parsed.away.name].some((n) => normClub(n) === normClub(OUR_CLUB));
  if (!ours) errors.push('neither team is ' + OUR_CLUB);
  if (expected && expected.opponent) {
    const oppSeen = normClub(parsed.home.name) === normClub(OUR_CLUB) ? parsed.away.name : parsed.home.name;
    if (normClub(oppSeen) !== normClub(expected.opponent)) {
      errors.push('opponent mismatch: expected ' + expected.opponent + ', got ' + oppSeen);
    }
  }
  if (expected && typeof expected.isHome === 'boolean') {
    const weAreHome = normClub(parsed.home.name) === normClub(OUR_CLUB);
    if (weAreHome !== expected.isHome) {
      errors.push('home/away mismatch: fixture says ' + (expected.isHome ? 'home' : 'away'));
    }
  }
  if (parsed.homeScore != null && (parsed.homeScore < 0 || parsed.homeScore > 30)) errors.push('implausible home score');
  if (parsed.awayScore != null && (parsed.awayScore < 0 || parsed.awayScore > 30)) errors.push('implausible away score');
  return { ok: errors.length === 0, errors };
}

/** Orientation helper: our goals first, regardless of venue. */
function ourView(parsed) {
  const weAreHome = normClub(parsed.home.name) === normClub(OUR_CLUB);
  return {
    isHome: weAreHome,
    us: weAreHome ? parsed.homeScore : parsed.awayScore,
    them: weAreHome ? parsed.awayScore : parsed.homeScore,
    opponent: weAreHome ? parsed.away.name : parsed.home.name,
  };
}

/**
 * A stable identity for an event, so re-polling the same timeline cannot create
 * duplicates. Deliberately does NOT include the free text — FWP tidying a name
 * from "Beau  Pryce" to "Beau Pryce" must not read as a new booking.
 */
function eventKey(fixtureId, e) {
  return [fixtureId, e.type, e.minute == null ? '?' : e.minute,
    e.stoppage || 0, normPlayer(e.player), e.ownGoal ? 'og' : ''].join('|');
}

module.exports = {
  OUR_CLUB,
  decode, clean, normClub, normPlayer, splitRole, parseMinute,
  parseStatus, parseTeamBlock, parseInfo, parseLineUp, parseEvents,
  parseMatch, validateMatch, ourView, eventKey,
  LIVE_PERIODS,
};
