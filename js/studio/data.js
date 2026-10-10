/* ════════════════════════════════════════════════════════════════════════
   ASSET STUDIO — DATA AND STORAGE (browser)

   Facts come from the football registry, never from a person retyping them
   and never from the legacy data/fixtures.json. If the registry cannot be
   reached, fixture templates say so and wait; club templates still work.

   The library lives on the server (studio-assets). If the server library is
   not reachable, the SAME rules (js/studio/backend.js) run against this
   device's storage and the Studio says so on screen — work is never lost
   silently and never claimed to be shared when it is not.

   Interrupted work (scenario F): every edit is written to this device as it
   happens. Reopening the Studio offers it back.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  var Core = global.StudioCore;

  var FOOTBALL = '/.netlify/functions/football-data';
  var API = '/.netlify/functions/studio-assets';
  var ACTOR_KEY = 'rlfc_actor';
  var LOCAL_DB = 'rlfc-studio-db-v1';
  var AUTOSAVE = 'rlfc-studio-autosave-v1';

  function getJSON(url) {
    var opt = {};
    if (global.AbortSignal && AbortSignal.timeout) opt.signal = AbortSignal.timeout(9000);
    return fetch(url, opt).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/&/g, 'and').replace(/\bf\.?c\.?\b/g, '').replace(/[^a-z0-9]+/g, ''); }

  // ── Football registry ────────────────────────────────────────────────────
  var reg = { fixtures: null, summary: null, results: null, crests: null, squad: null, error: null, detail: {} };

  function loadRegistry() {
    return Promise.all([
      getJSON(FOOTBALL + '?what=fixtures'), getJSON(FOOTBALL + '?what=summary'), getJSON(FOOTBALL + '?what=results'),
      getJSON('data/crests.json'), getJSON('data/players.json')
    ]).then(function (r) {
      var fx = r[0], sum = r[1], res = r[2];
      reg.crests = (r[3] && r[3].crests) || [];
      reg.squad = ((r[4] && r[4].players) || []).filter(function (p) { return p && p.name; });
      if (!fx || fx.ok !== true) {
        reg.fixtures = null; reg.error = 'The football registry could not be reached. Fixture graphics need it — nothing is retyped from memory or an old file.';
        return reg;
      }
      var scores = {};
      ((res && res.results) || []).forEach(function (x) { scores[x.id] = x; });
      reg.fixtures = (fx.fixtures || []).map(function (f) { return facts(f, scores[f.id]); });
      reg.summary = sum && sum.ok ? sum : null;
      reg.error = null;
      return reg;
    });
  }

  function crestFor(f) {
    var p = f.isHome === false ? f.homeCrest : f.awayCrest;
    if (p) return String(p).replace(/^\//, '');
    var n = norm(f.opponent);
    var hit = (reg.crests || []).filter(function (c) { return norm(c.name) === n; })[0];
    return hit ? hit.file : null;
  }
  /** The snapshot a graphic is made from. Only registry fields; nothing invented. */
  function facts(f, scored) {
    var us = scored && scored.us != null ? scored.us : null, them = scored && scored.them != null ? scored.them : null;
    return {
      id: f.id, opponent: f.opponent || null, isHome: f.isHome !== false, kickoffAt: f.kickoffAt || null,
      competition: f.competition || null, venue: f.venue || null, status: f.status || null, season: f.season || null,
      opponentCrest: crestFor(f),
      homeScore: us == null ? null : (f.isHome === false ? them : us),
      awayScore: us == null ? null : (f.isHome === false ? us : them)
    };
  }

  function fixtureById(id) { return (reg.fixtures || []).filter(function (f) { return f.id === id; })[0] || null; }

  /** The fixture a template should start from. */
  function defaultFixture(pick, nowMs) {
    var list = reg.fixtures || [];
    var now = nowMs || Date.now();
    var upcoming = list.filter(function (f) { return f.status === 'scheduled' && f.kickoffAt && Date.parse(f.kickoffAt) > now - 150 * 60000; })
      .sort(function (a, b) { return Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt); });
    var s = reg.summary || {};
    if (pick === 'played') {
      var played = list.filter(function (f) { return f.homeScore != null && f.awayScore != null; }).sort(function (a, b) { return Date.parse(b.kickoffAt) - Date.parse(a.kickoffAt); });
      return played[0] || null;
    }
    if (pick === 'today') {
      var today = upcoming.filter(function (f) { return Core.dayRelation(f.kickoffAt, now) === 'today'; })[0];
      return today || (s.next && fixtureById(s.next.id)) || upcoming[0] || null;
    }
    if (pick === 'postponed') {
      var off = list.filter(function (f) { return String(f.status).toLowerCase() === 'postponed'; }).sort(function (a, b) { return Date.parse(b.kickoffAt) - Date.parse(a.kickoffAt); });
      return off[0] || (s.next && fixtureById(s.next.id)) || upcoming[0] || null;
    }
    if (pick === 'programme') {
      return (s.nextProgramme && fixtureById(s.nextProgramme.id)) || upcoming.filter(function (f) { return f.isHome; })[0] || null;
    }
    return (s.next && fixtureById(s.next.id)) || upcoming[0] || null;
  }

  /** Line-up and our scorers for one fixture, from the registry's fixture detail. */
  function fixtureDetail(id) {
    if (reg.detail[id]) return Promise.resolve(reg.detail[id]);
    return getJSON(FOOTBALL + '?what=fixture&id=' + encodeURIComponent(id)).then(function (d) {
      var out = { lineup: null, scorers: [] };
      if (d && d.ok && d.fixture) {
        var f = d.fixture, ours = f.isHome === false ? 'away' : 'home';
        var side = f.lineups && f.lineups[ours];
        if (side && side.starters && side.starters.length) {
          out.lineup = { source: 'registry', status: side.status,
            starters: side.starters.map(function (p) { return { name: p.name, number: p.number || '', captain: !!p.isCaptain }; }),
            subs: (side.substitutes || []).map(function (p) { return { name: p.name, number: p.number || '' }; }) };
        }
        out.scorers = (f.events || []).filter(function (e) { return e.type === 'goal' && e.side === ours; })
          .map(function (e) { return { player: e.player, minute: e.minute + (e.stoppage ? '+' + e.stoppage : ''), ownGoal: !!e.ownGoal }; });
        reg.detail[id] = out;
      }
      return out;
    });
  }

  // ── Library store ────────────────────────────────────────────────────────
  var seedP = null;
  function seed() { if (!seedP) seedP = getJSON('js/studio/library-seed.json').then(function (s) { return s || { assets: [], sponsors: [], sponsorLogos: {} }; }); return seedP; }

  function actor() { try { return localStorage.getItem(ACTOR_KEY) || ''; } catch (e) { return ''; } }
  function setActor(n) { try { localStorage.setItem(ACTOR_KEY, n); } catch (e) {} }

  /** A localStorage adapter with the same shape as the server's Supabase adapter. */
  function localAdapter() {
    function load() { try { return JSON.parse(localStorage.getItem(LOCAL_DB) || '{}'); } catch (e) { return {}; } }
    function store(d) { localStorage.setItem(LOCAL_DB, JSON.stringify(d)); }
    function match(row, where) {
      return Object.keys(where || {}).every(function (k) {
        var v = where[k];
        if (v && typeof v === 'object') { if ('not' in v) return row[k] !== v.not; if ('in' in v) return v.in.indexOf(row[k]) > -1; if ('is' in v) return row[k] == v.is; }
        return String(row[k]) === String(v);
      });
    }
    function uid() { return 'loc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
    return {
      select: function (t, where, o) {
        var rows = (load()[t] || []).filter(function (r) { return match(r, where); });
        if (o && o.order) { var p = o.order.split('.'); rows.sort(function (a, b) { return (a[p[0]] < b[p[0]] ? -1 : a[p[0]] > b[p[0]] ? 1 : 0) * (p[1] === 'desc' ? -1 : 1); }); }
        if (o && o.limit) rows = rows.slice(0, o.limit);
        return Promise.resolve(JSON.parse(JSON.stringify(rows)));
      },
      insert: function (t, row) {
        var d = load(); d[t] = d[t] || [];
        if (t === 'studio_revisions' && d[t].some(function (r) { return r.composition_id === row.composition_id && r.rev === row.rev; })) return Promise.reject(Object.assign(new Error('duplicate'), { duplicate: true }));
        var r = Object.assign({ id: uid(), created_at: new Date().toISOString() }, row);
        d[t].push(r); store(d); return Promise.resolve(JSON.parse(JSON.stringify(r)));
      },
      update: function (t, where, patch) {
        var d = load(); var hit = (d[t] || []).filter(function (r) { return match(r, where); });
        hit.forEach(function (r) {
          if (t === 'studio_revisions' && r.state === 'approved' && patch.doc) throw new Error('an approved revision cannot be changed');
          Object.assign(r, patch);
        });
        store(d); return Promise.resolve(JSON.parse(JSON.stringify(hit)));
      },
      audit: function () { return Promise.resolve(); }
    };
  }

  var mode = { where: 'unknown', reason: '' };
  var localApi = null;
  function device() {
    if (!localApi) localApi = seed().then(function (s) { return global.StudioBackend.create(localAdapter(), { seed: s }); });
    return localApi;
  }
  function useDevice(reason) {
    mode.where = 'device'; mode.reason = reason;
    try { document.dispatchEvent(new CustomEvent('studio:mode', { detail: mode })); } catch (e) {}
  }
  /** Ask the server library; fall back to this device only when the server cannot answer at all. */
  function call(action, body) {
    var b = Object.assign({ action: action, pin: global.PIN || '', actor: actor() }, body || {});
    if (mode.where === 'device') return device().then(function (api) { return api.handle(action, b, b.actor); });
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
      .then(function (r) {
        if (r.status === 404 || r.status >= 500) { useDevice('The library server is not available (' + r.status + ').'); return null; }
        return r.json().catch(function () { return { ok: false, error: 'The server answered with something unreadable.' }; });
      })
      .catch(function () { useDevice('No connection to the library server.'); return null; })
      .then(function (res) {
        if (res === null) return device().then(function (api) { return api.handle(action, b, b.actor); });
        if (res && res.notSetUp) { useDevice(res.error); return device().then(function (api) { return api.handle(action, b, b.actor); }); }
        if (mode.where === 'unknown' && res) mode.where = 'server';
        return res;
      });
  }

  // ── Autosave (interrupted work) ──────────────────────────────────────────
  function autosave(entry) {
    try {
      if (!entry) { localStorage.removeItem(AUTOSAVE); return true; }
      localStorage.setItem(AUTOSAVE, JSON.stringify(Object.assign({ savedAt: new Date().toISOString() }, entry)));
      return true;
    } catch (e) { return false; }
  }
  function recovered() { try { return JSON.parse(localStorage.getItem(AUTOSAVE) || 'null'); } catch (e) { return null; } }

  global.StudioData = {
    loadRegistry: loadRegistry, registry: reg, fixtureById: fixtureById, defaultFixture: defaultFixture, fixtureDetail: fixtureDetail, facts: facts,
    seed: seed, call: call, mode: mode, actor: actor, setActor: setActor, autosave: autosave, recovered: recovered
  };
}(typeof window !== 'undefined' ? window : globalThis));
