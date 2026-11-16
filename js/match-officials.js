/* ════════════════════════════════════════════════════════════════════════
   MATCH OFFICIALS — the appointment paste parser, shared by the browser
   (programme editor, HQ Matchday preparation) and the server (save-data,
   which re-sanitises every record before it is stored).

   What it stores: names, roles, a source LABEL, checkedAt, enteredBy.
   What it never stores: phone numbers, email addresses, postal addresses,
   the pasted text itself, or any assessment / marking text — a line that
   talks about assessment is refused outright, not cleaned.

   A pasted line is matched to a fixture by DATE + OPPONENT against the
   club's fixture list. A line that cannot be matched is shown back as
   unmatched; nothing is guessed.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var ROLES = [
    // order matters: the numbered assistants before the bare word
    ['fourthOfficial', /\b(4th(?:\s+official)?|fourth\s+official|4o)\b/i],
    ['assistant1', /\b(ar\s*1|assistant(?:\s+referee)?\s*1|asst\.?\s*1|ar\s*one|linesman\s*1|assistant\s+one)\b/i],
    ['assistant2', /\b(ar\s*2|assistant(?:\s+referee)?\s*2|asst\.?\s*2|ar\s*two|linesman\s*2|assistant\s+two)\b/i],
    ['referee', /\b(referee|ref)\b/i]
  ];
  var ROLE_LABEL = { referee: 'Referee', assistant1: 'Assistant referee 1', assistant2: 'Assistant referee 2', fourthOfficial: '4th official' };
  var ROLE_KEYS = ['referee', 'assistant1', 'assistant2', 'fourthOfficial'];

  var ASSESS = /\b(assess(?:ment|or|ed|ing)?|marks?\b|marking|grading|graded|observer|observation\s+report|performance\s+report|scored\s+\d)/i;
  var EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  // UK-style phone numbers: +44 / 0 followed by 9-10 more digits with optional spaces, dots, dashes, brackets
  var PHONE = /(?:\+\s?44\s?\(?0?\)?|\(?0)\d[\d\s().-]{7,14}\d/g;
  var POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi;
  var STREET = /\b\d{1,4}[A-Z]?\s+(?!(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b)(?:[A-Z][\w'’-]*\s+){1,4}(?:road|rd|street|st|lane|ln|avenue|ave|close|drive|dr|way|gardens|gdns|crescent|court|place|terrace|grove|hill|park)\b\.?/gi;
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

  /** Remove contact details. Returns { text, stripped } — stripped counts removals. */
  /* `lite` keeps street-shaped text: "28 Nov Rayners Lane" is a fixture line,
     not an address. Names always get the full strip (cleanName). */
  function stripContact(s, lite) {
    var n = 0, t = String(s == null ? '' : s);
    function cut(re) { t = t.replace(re, function () { n++; return ' '; }); }
    cut(EMAIL); cut(PHONE); cut(POSTCODE); if (!lite) cut(STREET);
    t = t.replace(/\b(?:tel|phone|mob(?:ile)?|email|e-mail|address|t|m|e)\s*[:.]\s*(?=[;,]|$)/gi, ' ');
    return { text: t.replace(/[ \t]+/g, ' ').trim(), stripped: n };
  }

  /** A name and nothing else: letters, spaces, hyphen, apostrophe, full stop. */
  function cleanName(s) {
    var t = stripContact(s).text;
    t = t.replace(/\(.*?\)|\[.*?\]/g, ' ');           // bracketed notes go
    t = t.split(/\s+[-–—]\s+|[|/\\]/)[0];             // "Name - Watford" → "Name"
    t = t.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' ’.-]/g, ' ').replace(/\s+/g, ' ').trim();
    t = t.replace(/^[.\-' ]+|[\-' ]+$/g, '');
    if (!/[A-Za-z]{2}/.test(t)) return '';
    if (/^(tbc|tba|none|n\/a|vacant|to be confirmed)$/i.test(t)) return '';
    return t.slice(0, 60);
  }

  function key(s) {
    return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/\b(fc|f\.c\.|afc)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /** Dates: "Sat 28 Nov", "28 November 2026", "28/11/2026", "28/11/26", "2026-11-28". */
  function findDate(line) {
    var s = String(line || ''), m;
    if ((m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) return { y: +m[1], m: +m[2], d: +m[3] };
    if ((m = s.match(/\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?\b/))) {
      var y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : null;
      if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return { y: y, m: +m[2], d: +m[1] };
    }
    if ((m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?/i)))
      return { y: m[3] ? +m[3] : null, m: MONTHS[m[2].toLowerCase()], d: +m[1] };
    return null;
  }
  function iso(y, m, d) { return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }

  /** The fixture a line names, by date AND opponent. Null when either is missing or ambiguous. */
  function matchFixture(line, fixtures) {
    var dt = findDate(line); if (!dt) return { fixture: null, reason: 'no date found' };
    var k = ' ' + key(line) + ' ';
    var named = (fixtures || []).filter(function (f) {
      var o = key(f.opponent); return o && k.indexOf(' ' + o + ' ') >= 0;
    });
    if (!named.length) return { fixture: null, reason: 'no fixture opponent named' };
    var hits = named.filter(function (f) {
      var p = String(f.date || '').slice(0, 10).split('-');
      if (p.length !== 3) return false;
      return +p[1] === dt.m && +p[2] === dt.d && (dt.y == null || +p[0] === dt.y);
    });
    if (hits.length === 1) return { fixture: hits[0], reason: null };
    if (hits.length > 1) return { fixture: null, reason: 'more than one fixture matches' };
    return { fixture: null, reason: 'no fixture against ' + named[0].opponent + ' on ' + (dt.y ? iso(dt.y, dt.m, dt.d) : dt.d + '/' + dt.m) };
  }

  /** "Referee: A Name; AR1: B Name" → { referee:'A Name', assistant1:'B Name' } */
  function rolesIn(line) {
    var out = {}, s = stripContact(line, true).text;
    // split at every role word, keeping the role with the text that follows it
    var parts = s.split(/[;,\n]|(?=\b(?:referee|ref|ar\s*[12]|assistant(?:\s+referee)?\s*[12]|asst\.?\s*[12]|4th|fourth\s+official|linesman\s*[12])\b\s*[:\-–=])/i);
    parts.forEach(function (p) {
      var m = p.match(/^\s*([^:\-–=]{1,40}?)\s*[:\-–=]\s*(.+)$/); if (!m) return;
      for (var i = 0; i < ROLES.length; i++) {
        if (ROLES[i][1].test(m[1]) && m[1].replace(ROLES[i][1], '').replace(/\s+/g, '').length <= 3) {
          var n = cleanName(m[2]); if (n && !out[ROLES[i][0]]) out[ROLES[i][0]] = n; return;
        }
      }
    });
    return out;
  }

  /**
   * Parse a pasted appointments message.
   * @returns {{matches:Array, unmatched:Array, refused:Array, stripped:number}}
   * A line that names a fixture opens a block; role-only lines below it join
   * that block until the next fixture line.
   */
  function parse(text, fixtures) {
    var lines = String(text || '').split(/\r?\n/);
    var matches = [], unmatched = [], refused = [], stripped = 0, cur = null, byId = {};
    lines.forEach(function (raw, i) {
      var line = raw.trim(); if (!line) return;
      if (ASSESS.test(line)) { refused.push({ lineNo: i + 1, reason: 'mentions assessment or marking; not stored' }); return; }
      var sc = stripContact(line, true); stripped += sc.stripped;
      var hasDate = !!findDate(sc.text);
      var roles = rolesIn(sc.text);
      var hasRoles = Object.keys(roles).length > 0;
      if (hasDate) {
        var mf = matchFixture(sc.text, fixtures);
        if (!mf.fixture) { cur = null; unmatched.push({ lineNo: i + 1, text: stripContact(line).text.slice(0, 160), reason: mf.reason }); return; }
        var f = mf.fixture, id = String(f.id);
        cur = byId[id] || (byId[id] = { fixtureId: id, date: String(f.date).slice(0, 10), opponent: f.opponent, isHome: f.isHome !== false, officials: {}, conflicts: [] });
        if (matches.indexOf(cur) < 0) matches.push(cur);
        addRoles(cur, roles);
        return;
      }
      if (hasRoles && cur) { addRoles(cur, roles); return; }
      unmatched.push({ lineNo: i + 1, text: stripContact(line).text.slice(0, 160), reason: hasRoles ? 'roles with no fixture line above them' : 'no date, fixture or role found' });
    });
    return { matches: matches, unmatched: unmatched, refused: refused, stripped: stripped };
  }
  function addRoles(cur, roles) {
    Object.keys(roles).forEach(function (r) {
      if (cur.officials[r] && cur.officials[r] !== roles[r]) cur.conflicts.push(ROLE_LABEL[r] + ': “' + cur.officials[r] + '” and “' + roles[r] + '”');
      else cur.officials[r] = roles[r];
    });
  }

  /**
   * The ONE record shape that is stored. Anything else in the input is dropped,
   * and every name is re-cleaned (the server calls this on every upsert).
   * Returns null when the record cannot be stored, with no partial write.
   */
  function toRecord(m, meta) {
    meta = meta || {};
    if (!m || !m.fixtureId || !/^\d{4}-\d{2}-\d{2}$/.test(String(m.date || ''))) return null;
    var off = {};
    ROLE_KEYS.forEach(function (r) {
      var v = m.officials ? m.officials[r] : null;
      if (v != null && ASSESS.test(String(v))) return;
      var n = cleanName(v); if (n) off[r] = n;
    });
    if (!off.referee && !off.assistant1 && !off.assistant2 && !off.fourthOfficial) return null;
    var label = stripContact(meta.sourceLabel || m.sourceLabel || '').text.replace(/[^\w ’'&().,-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    var by = cleanName(meta.enteredBy || m.enteredBy || '');
    if (!label || !by) return null;
    return {
      fixtureId: String(m.fixtureId).slice(0, 80), date: String(m.date).slice(0, 10),
      opponent: String(m.opponent || '').replace(/[<>]/g, '').slice(0, 80),
      officials: off, status: 'confirmed', sourceLabel: label,
      checkedAt: String(meta.checkedAt || m.checkedAt || new Date().toISOString()).slice(0, 30),
      enteredBy: by
    };
  }

  /** Which programme fields would change, so the editor can ask before overwriting. */
  function diffAgainst(current, officials) {
    var map = { referee: 'pr-ref', assistant1: 'pr-ar1', assistant2: 'pr-ar2', fourthOfficial: 'pr-4th' };
    return ROLE_KEYS.filter(function (r) {
      var have = String((current || {})[r] || '').trim(), want = String((officials || {})[r] || '').trim();
      return have && want && have.toLowerCase() !== want.toLowerCase();
    }).map(function (r) { return { role: r, label: ROLE_LABEL[r], el: map[r], have: current[r], want: officials[r] }; });
  }

  /** The record for a fixture: by id first, else by date + opponent. */
  function recordFor(records, fx) {
    if (!fx) return null;
    var list = records || [];
    var byId = list.filter(function (r) { return String(r.fixtureId) === String(fx.id); })[0];
    if (byId) return byId;
    var d = String(fx.date || fx.kickoffAt || '').slice(0, 10), o = key(fx.opponent);
    return list.filter(function (r) { return r.date === d && key(r.opponent) === o; })[0] || null;
  }

  var api = { parse: parse, toRecord: toRecord, stripContact: stripContact, cleanName: cleanName, rolesIn: rolesIn,
    findDate: findDate, matchFixture: matchFixture, diffAgainst: diffAgainst, recordFor: recordFor,
    ROLE_KEYS: ROLE_KEYS, ROLE_LABEL: ROLE_LABEL, ASSESS: ASSESS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MatchOfficials = api;
})(typeof window !== 'undefined' ? window : this);
