/* Rayners Lane FC — dramatic back-page hooks + matchday copy.
 *
 * ONE engine, used in two places:
 *   • the staff portal, to draft the season's Monday/Wednesday posts and to
 *     suggest a shareHeadline for a news article;
 *   • tools-bake-hooks.js, to stamp a shareHeadline onto every fixture.
 *
 * It is NOT loaded on the public site. The public share card reads the STORED
 * shareHeadline — no generation, no AI call, no quota to burn, nothing for a
 * stranger to abuse. See js/share-news.js.
 *
 * ⛔ THE RULE THAT MATTERS — every fact comes from data/opponents.json.
 *    This file may re-word, tease and dramatise. It may NOT introduce a fact.
 *    There is no fact here that isn't in that JSON: no form, no league position,
 *    no "unbeaten in five", no player names. If a club has no profile, the copy
 *    drops to a template that states nothing about them at all.
 *
 *    An AI-invented "fact" about another club, published under our badge with
 *    nobody reading it first, is the failure this design exists to prevent.
 *    Deterministic text from a verified file cannot hallucinate. AI is offered
 *    on top as an OPTIONAL polish a human must accept.
 */
(function (root) {
  'use strict';

  var CLUB = 'Rayners Lane';
  var HOME_GROUND = 'Tithe Farm';

  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/\bf\.?c\.?\b/g, '').replace(/\butd\b/g, 'united')
      .replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  }
  function isHome(f) { return f.isHome !== false; }
  function comp(f) {
    var c = String(f.competition || '');
    if (/vase/i.test(c)) return 'vase';
    if (/fa cup/i.test(c)) return 'facup';
    if (/friendly/i.test(c)) return 'friendly';
    return 'league';
  }
  function dayName(d) {
    try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' }); }
    catch (e) { return 'Saturday'; }
  }
  function longDate(d) {
    try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }); }
    catch (e) { return d; }
  }
  function ko(k) {
    var p = String(k || '15:00').split(':'), H = +p[0], m = p[1] || '00';
    return (H % 12 || 12) + (m === '00' ? '' : '.' + m) + (H >= 12 ? 'pm' : 'am');
  }
  // "The Hares" -> "the Hares"; "" -> "". Never bolt an article onto nothing.
  function nick(o) {
    var n = String((o && o.nickname) || '').trim();
    if (!n) return '';
    return /^the\s/i.test(n) ? n.replace(/^The/, 'the') : 'the ' + n;
  }
  function nickBare(o) { return String((o && o.nickname) || '').replace(/^the\s+/i, '').trim(); }

  // ── Hand-written hooks, one club at a time ────────────────────────────────
  // Each is tied to something VERIFIED in that club's opponents.json record —
  // the groundshare, the colours, the Vase win, the division gap. Generic lines
  // ("LANE ARE BACK" on all 38) are the thing this exists to avoid.
  //
  // h = home, a = away. Picked per fixture; falls through to the generic engine
  // below when a club isn't listed.
  var SPECIFIC = {
    'broadfieldsunited': {
      h: ['THE TITHE FARM DERBY', 'SAME PITCH, DIFFERENT DUGOUT'],
      a: ['THE AWAY DAY THAT ISN\'T', 'OUR PATCH, THEIR NAME ON IT']
    },
    'bedfont': { h: ['TWO CLUBS, ONE COLOUR'], a: ['YELLOW vs YELLOW'] },
    'wokinghamtown': {
      h: ['THE SATSUMAS COME TO THE LANE', 'YELLOW AGAINST ORANGE'],
      a: ['150 YEARS AND COUNTING', 'INTO SATSUMA COUNTRY']
    },
    'thatchamtown': {
      h: ['WEMBLEY WINNERS COME TO TOWN', 'THE KINGFISHERS AT THE LANE'],
      a: ['OUR BIGGEST TEST YET', 'THE LONGEST ROAD OF THE SEASON']
    },
    'londonlions': {
      h: ['CUP NIGHT AT THE LANE'],
      a: ['GIANT-KILLING ON THE CARDS?', 'A DIVISION UP. SO WHAT.']
    },
    'newbradwellstpeter': {
      h: ['THE VASE COMES TO THE LANE', 'CUP FOOTBALL AT TITHE FARM'],
      a: ['THE VASE TRAIL BEGINS']
    },
    'burnham': {
      h: ['THE 1878 CLUB COME CALLING'], a: ['A TRIP TO THE 1878 STADIUM']
    },
    'harefieldunited': {
      h: ['THE HARES AT THE LANE', 'NEIGHBOURS AT TITHE FARM'], a: ['DOWN THE ROAD TO PRESTON PARK']
    },
    'northwood': { h: ['THE WOODS COME TO THE LANE'], a: ['THE SHORT HOP TO NORTHWOOD'] },
    'northgreenfordunited': { h: ['WEST LONDON NEIGHBOURS'], a: ['FOUR MILES DOWN THE ROAD'] },
    'pennandtylersgreen': {
      h: ['PENN AT THE LANE', 'BLUE AND WHITE AT THE LANE'],
      a: ['DOWN TO FRENCH SCHOOL MEADOW']
    },
    'holyport': { h: ['THE VILLAGERS COME TO TOWN'], a: ['OFF TO THE VILLAGE'] },
    'ardleyunited': { h: ['THE SKY BLUES AT THE LANE'], a: ['GRASSROOTS, PROPER'] },
    'amershamtown': { h: ['THE MAGPIES AT THE LANE'], a: ['A TRIP TO SPRATLEYS MEADOW'] },
    'northleigh': { h: ['THE MILLERS COME TO THE LANE'], a: ['THE LONG ROAD TO THE MILLERS'] },
    'kidlington': { h: ['THE GREENS AT THE LANE'], a: ['INTO OXFORDSHIRE'] },
    'hilltop': { h: ['HILLTOP AT THE LANE'], a: ['A SHORT TRIP EAST'] },
    'wallingfordandcrowmarsh': { h: ['WALLINGFORD AT THE LANE'], a: ['OUT TO THE HITHERCROFT'] },
    'readingcity': { h: ['READING CITY AT THE LANE'], a: ['DOWN TO THE RIVERMOOR'] },
    'abingdonunited': { h: ['ABINGDON AT THE LANE'], a: ['A TRIP TO THE NORTHCOURT'] },
    'easingtonsports': { h: ['EASINGTON AT THE LANE'], a: ['UP TO BANBURY'] }
  };

  // Deterministic pick — the same fixture always renders the same hook, but two
  // consecutive games don't read identically. Seeded off the fixture, not random,
  // so a staff member who reloads the panel doesn't see the text change under them.
  function seed(f) {
    var s = String(f.id || '') + String(f.date || '') + String(f.opponent || '');
    var n = 0; for (var i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
    return n;
  }
  function pick(arr, f, salt) {
    if (!arr || !arr.length) return '';
    return arr[(seed(f) + (salt || 0)) % arr.length];
  }

  // ── The hook ──────────────────────────────────────────────────────────────
  function fixtureHook(f, o, opts) {
    var home = isHome(f), c = comp(f);
    // Opening day beats any club-specific line — it only happens once.
    if (opts && opts.opener && c === 'league') {
      return home ? 'THE WAIT IS OVER' : 'THE WAIT IS OVER — WE\'RE BACK';
    }
    var sp = SPECIFIC[norm(f.opponent)];
    if (sp) {
      var list = home ? sp.h : sp.a;
      if (list && list.length) return pick(list, f, home ? 0 : 7);
    }
    // No hand-written line: build one from what the file actually holds.
    var OPP = String(f.opponent || '').toUpperCase();
    if (c === 'facup') return home ? 'THE CUP COMES TO THE LANE' : 'CUP FOOTBALL ON THE ROAD';
    if (c === 'vase') return home ? 'THE VASE COMES TO THE LANE' : 'THE VASE TRAIL';
    if (c === 'friendly') return home ? OPP + ' AT THE LANE' : 'THE LANE AT ' + OPP;
    var n = nickBare(o);
    if (home) return n ? n.toUpperCase() + ' AT THE LANE' : 'THE LANE HOST ' + OPP;
    return n ? 'THE LANE TAKE ON ' + n.toUpperCase() : 'THE LANE TRAVEL TO ' + OPP;
  }

  // ── MONDAY: who we're facing ──────────────────────────────────────────────
  // HOME  -> welcome them properly.
  // AWAY  -> what we're up against.
  // Every sentence is guarded: no profile field, no sentence.
  function monday(f, o) {
    var home = isHome(f), L = [], c = comp(f);
    var opp = f.opponent, N = nick(o);

    if (home) {
      L.push('This ' + dayName(f.date) + ' we welcome ' + opp + ' to ' + HOME_GROUND + '.');
      if (o && o.town && norm(o.town).indexOf(norm(opp)) === -1) {
        L.push(N ? 'Known as ' + N + ', they come to us from ' + o.town + '.'
                 : 'They come to us from ' + o.town + '.');
      } else if (N) {
        L.push('Known as ' + N + ' — and welcome to The Lane.');
      }
    } else {
      L.push('This ' + dayName(f.date) + ' we\'re away at ' + opp + '.');
      var where = (o && o.ground) ? o.ground + (o.town ? ', ' + o.town : '') : '';
      if (where) L.push(N ? 'We head to ' + where + ' to take on ' + N + '.' : 'We head to ' + where + '.');
      else if (N) L.push('We take on ' + N + ' on their own patch.');
    }

    // The respect. Straight from the verified record — nothing added.
    if (o && o.founded) {
      var yr = o.founded, age = 2026 - (+yr);
      // Wallingford's own infobox says 1922 despite the 1995 merger. Where the
      // record flags that nuance, don't put a bare year in a sentence.
      if (o.foundedNote) L.push('A club with roots back to ' + yr + ' — and we know what it takes to keep one going that long.');
      else L.push('Formed in ' + yr + '. That\'s ' + age + ' years of people turning up and keeping a football club alive. We know exactly what that takes.');
    }
    if (o && o.honours) L.push(o.honours);
    if (o && o.angle) L.push(o.angle);

    L.push(home
      ? 'Kick-off ' + ko(f.kickoff) + '. Come and give them a proper Lane welcome.'
      : 'Kick-off ' + ko(f.kickoff) + '. Directions and details are on the site.');
    if (c === 'friendly') L.push('Pre-season — but the yellow still means something.');
    return L.join('\n\n');
  }

  // ── WEDNESDAY: gearing up ─────────────────────────────────────────────────
  // Hype, countdown, matchday detail, rallying call. Same energy home or away;
  // the difference is welcome vs travel.
  function wednesday(f, o) {
    var home = isHome(f), L = [], opp = f.opponent;
    var venue = home ? HOME_GROUND : ((o && o.ground) || f.venue || '');

    L.push(home ? opp + ' at The Lane. ' + longDate(f.date) + '. ' + ko(f.kickoff) + '.'
                : longDate(f.date) + '. ' + (venue || opp) + '. ' + ko(f.kickoff) + '.');
    L.push(home
      ? 'Our ground, our yellow. ' + HOME_GROUND + ', 151 Rayners Lane, HA2 0XH — minutes from the station.'
      : 'We\'re taking the yellow on the road' + (o && o.travel ? ' — ' + o.travel + '.' : '.'));

    var c = comp(f);
    if (c === 'facup') L.push('Cup football. One game, winner stays in.');
    else if (c === 'vase') L.push('The Vase. Every round is a step towards Wembley.');
    else if (c === 'league') L.push('Three points on the table.');

    if (o && o.angle) L.push(o.angle);

    L.push(home
      ? 'Get down early, get a drink in, and make it loud. Every voice counts at this level.'
      : 'Away support is worth a goal at this level. If you can travel, travel.');
    L.push('Up The Lane. 💛');
    return L.join('\n\n');
  }

  // Article hooks: the news editor suggests one when there's no AI key, and it
  // seeds the "regenerate" box. Category-led, and it states nothing about the
  // article beyond what the title already says.
  function articleHook(a) {
    var t = String((a && a.title) || ''), cat = String((a && a.category) || '').toLowerCase();
    if (/sign|joins|welcome.*(to the (squad|club))/i.test(t) || /signing/.test(cat)) return 'THE LANE LAND THEIR MAN';
    if (/trial|player.*wanted|recruit/i.test(t + cat)) return 'FANCY WEARING THE YELLOW?';
    if (/sponsor|partner/i.test(t + cat)) return 'NEW FACES BEHIND THE CLUB';
    if (/win|beat|victory/i.test(t)) return 'GET IN! THE LANE ROLL ON';
    if (/fixture|season|back/i.test(t + cat)) return 'THE WAIT IS OVER';
    return '';   // no confident hook — the card falls back to the real title
  }

  root.rlHooks = {
    norm: norm,
    fixtureHook: fixtureHook,
    monday: monday,
    wednesday: wednesday,
    articleHook: articleHook,
    findOpponent: function (list, name) {
      var k = norm(name);
      return (list || []).find(function (o) { return norm(o.key) === k; }) || null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
