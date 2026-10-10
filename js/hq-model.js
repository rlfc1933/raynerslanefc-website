/* ════════════════════════════════════════════════════════════════════════
   LANE HQ — the model behind the Command Centre.

   Pure functions, no DOM, no network: the shell (js/hq-shell.js) fetches,
   this decides. Unit-tested in tests/hq-model.test.js.

   1. NAVIGATION — one structure (Overview / Football / Club & Community /
      Commercial / Media / Administration). Every destination is an existing
      panel in PortalTools; nothing here invents a screen.
   2. PRIORITIES — what needs a person, grouped by cause and by fixture so one
      match with three gaps is one line, not three red emergencies. Public
      results (the league feed, via the football registry) and the club's
      private matchday record (attendance and takings) are different records
      and are never conflated: a registry result is the public result.
   3. NOTIFICATIONS — the same groups, keyed so that a change in the
      underlying records is a new notification and an unchanged one is not.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var T = (typeof module !== 'undefined' && module.exports) ? require('./hq-time') : root.HQTime;
  var HOUR = 3600000, DAY = 86400000;
  var MATCH_WINDOW = 150 * 60000;
  var HISTORIC_DAYS = 14;

  // ── 1 · NAVIGATION ─────────────────────────────────────────────────────
  // Labels are sentence case and name the job, not the implementation.
  var SECTIONS = [
    { key: 'overview', name: 'Overview', items: [
      { id: 'home', label: 'Command centre' },
      { id: 'clubtasks', label: 'Tasks and approvals' },
      { id: 'command', label: 'Club office' },
      { id: 'clubstats', label: 'Club overview' },
      { id: 'scorecard', label: 'Scorecard' } ] },
    { key: 'football', name: 'Football', items: [
      { id: 'preparematch', label: 'Matchday preparation' },
      { id: 'fixtures', label: 'Fixtures and results' },
      { id: 'mdops', label: 'Attendance and takings' },
      { id: 'attendance', label: 'Verified attendance' },
      { id: 'matchday', label: 'Live scoreboard' },
      { id: 'programme', label: 'Programmes' },
      { id: 'squad', label: 'Squad' },
      { id: 'players', label: 'Player profiles' },
      { id: 'trialists', label: 'Trial applications' },
      { id: 'coaching', label: 'Match analysis' },
      { id: 'venues', label: 'Venues' },
      { id: 'scanner', label: 'Check-in scanner' } ] },
    { key: 'community', name: 'Club and community', items: [
      { id: 'supporters', label: 'Members and supporters' },
      { id: 'volunteers', label: 'Volunteers' },
      { id: 'records', label: 'Website enquiries' },
      { id: 'fanclub', label: 'Fan club' },
      { id: 'perks', label: 'Supporter offers' },
      { id: 'rewards', label: 'Reward redemption' },
      { id: 'news', label: 'News' },
      { id: 'signoff', label: 'Drafted stories' },
      { id: 'matchreport', label: 'Match reports' },
      { id: 'motm', label: 'Man of the match' },
      { id: 'signing', label: 'New signing' },
      { id: 'commsdesk', label: 'Comms approvals' } ] },
    { key: 'commercial', name: 'Commercial', items: [
      { id: 'commercial', label: 'Sponsorship' },
      { id: 'bookings', label: 'Matchday sponsor slots' },
      { id: 'outreach', label: 'Business outreach' },
      { id: 'radar', label: 'Prospects' },
      { id: 'prospects', label: 'Import prospects' },
      { id: 'businessclub', label: 'Proposals' },
      { id: 'sponsors', label: 'Sponsors on the website' },
      { id: 'sponsorhub', label: 'Website applications' },
      { id: 'funding', label: 'Grants and funding' },
      { id: 'playbook', label: 'Income plan' } ] },
    { key: 'media', name: 'Media', items: [
      { id: 'assetstudio', label: 'Asset Studio' },
      { id: 'poststudio', label: 'Live match cards' },
      { id: 'gallery', label: 'Media library' },
      { id: 'brandlibrary', label: 'Club colours' },
      { id: 'social', label: 'Social plan' },
      { id: 'fwp', label: 'Match cards for X' },
      { id: 'monthlyfix', label: 'Monthly fixture posters' } ] },
    { key: 'admin', name: 'Administration', items: [
      { id: 'meetings', label: 'Committee meetings' },
      { id: 'committee', label: 'Committee and roles' },
      { id: 'staff', label: 'Staff profiles' },
      { id: 'compliance', label: 'Compliance' },
      { id: 'swot', label: 'Club plans' },
      { id: 'analytics', label: 'Historic takings' },
      { id: 'finance', label: 'Club finances' },
      { id: 'future', label: 'Future of the Lane' },
      { id: 'users', label: 'Staff access' },
      { id: 'mail', label: 'Club email' },
      { id: 'siteguide', label: 'Guides and handbook' },
      { id: 'lowdown', label: 'The Lane Lowdown' },
      { id: 'livesite', label: 'Public website' },
      { id: 'settings', label: 'System health' },
      { id: 'undo', label: 'Emergency controls' },
      { id: 'developer', label: 'Developer reference' } ] }
  ];

  /** Which section holds this destination. */
  function sectionOf(id) {
    for (var i = 0; i < SECTIONS.length; i++) {
      for (var j = 0; j < SECTIONS[i].items.length; j++) if (SECTIONS[i].items[j].id === id) return SECTIONS[i];
    }
    return null;
  }
  function labelOf(id) {
    var s = sectionOf(id);
    if (!s) return null;
    for (var j = 0; j < s.items.length; j++) if (s.items[j].id === id) return s.items[j].label;
    return null;
  }

  /**
   * The navigation this person may see. `canSee(id)` is the existing
   * permission mirror (PortalTools.canSee); a destination that does not exist
   * as a tool is dropped rather than drawn as a dead link.
   */
  function navFor(canSee, exists) {
    return SECTIONS.map(function (s) {
      return { key: s.key, name: s.name, items: s.items.filter(function (it) {
        if (it.id === 'home') return true;
        if (exists && !exists(it.id)) return false;
        return !canSee || canSee(it.id);
      }) };
    }).filter(function (s) { return s.items.length; });
  }

  // ── 2 · FIXTURES ───────────────────────────────────────────────────────
  function ms(f) { return f && f.kickoffAt ? Date.parse(f.kickoffAt) : NaN; }
  function off(f) { var s = String((f && f.status) || '').toLowerCase(); return s === 'postponed' || s === 'cancelled' || s === 'abandoned' || s === 'superseded'; }
  function hasScore(f) { return !!f && f.us != null && f.them != null; }

  /** Results keyed by fixture id (from football-data?what=results). */
  function resultIndex(results) {
    var m = {};
    (results || []).forEach(function (r) { if (r && r.id != null) m[String(r.id)] = r; });
    return m;
  }

  /**
   * The match the club is working towards: one being played now, else the
   * soonest not yet kicked off. Postponed and superseded rows never qualify.
   */
  function nextFixture(fixtures, nowMs, results) {
    var now = nowMs == null ? Date.now() : nowMs;
    var res = resultIndex(results);
    var live = (fixtures || []).filter(function (f) {
      var k = ms(f); return !off(f) && isFinite(k) && k <= now && now < k + MATCH_WINDOW && !hasScore(res[String(f.id)] || f);
    })[0];
    if (live) return { fixture: live, state: 'live' };
    var up = (fixtures || []).filter(function (f) { var k = ms(f); return !off(f) && isFinite(k) && k > now; })
      .sort(function (a, b) { return ms(a) - ms(b); });
    return up.length ? { fixture: up[0], state: 'upcoming' } : { fixture: null, state: 'none' };
  }
  function nextHome(fixtures, nowMs) {
    var now = nowMs == null ? Date.now() : nowMs;
    return (fixtures || []).filter(function (f) { var k = ms(f); return f.isHome !== false && !off(f) && isFinite(k) && k > now - MATCH_WINDOW; })
      .sort(function (a, b) { return ms(a) - ms(b); })[0] || null;
  }
  function fixtureTitle(f) {
    if (!f) return '';
    return f.isHome === false ? (f.opponent || 'TBC') + ' (away)' : (f.opponent || 'TBC') + ' (home)';
  }
  /** "today", "tomorrow" or "Sat 10 Oct" — for use mid-sentence. */
  function relDay(at, now) { var r = T.relativeDay(at, now); return /^(Today|Tomorrow|Yesterday)$/.test(r) ? r.toLowerCase() : r; }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  /**
   * Every fixture-related gap, one entry per fixture with its causes.
   *
   *  public  — the registry has the match as played (or long past) but holds
   *            no score. That is the league feed's job; HQ says so.
   *  private — a played HOME match whose attendance and takings record is not
   *            completed. Only a match the registry confirms was played counts:
   *            a record for a postponed or superseded fixture is a conflict to
   *            check, not missing takings.
   */
  function fixtureIssues(input) {
    var now = input.now == null ? Date.now() : input.now;
    var fixtures = input.fixtures || [], res = resultIndex(input.results);
    var byId = {}, byKey = {};
    fixtures.forEach(function (f) {
      byId[String(f.id)] = f;
      byKey[norm(f.opponent) + '|' + T.londonDate(f.kickoffAt)] = f;
    });
    var out = {};
    function entry(f, fallback) {
      var id = String(f ? f.id : fallback.id);
      if (!out[id]) out[id] = { fixtureId: id, fixture: f || null, opponent: f ? f.opponent : fallback.opponent,
        date: f ? T.londonDate(f.kickoffAt) : fallback.date, kickoffAt: f ? f.kickoffAt : null, isHome: f ? f.isHome !== false : true,
        public: [], private: [], conflict: [] };
      return out[id];
    }
    // Public results.
    fixtures.forEach(function (f) {
      var k = ms(f);
      if (off(f) || !isFinite(k) || k + 3 * HOUR > now) return;
      var r = res[String(f.id)];
      if (r && r.hasScore !== false && hasScore(r)) return;
      entry(f).public.push({ code: 'result-missing', text: 'Score not in the league fixture feed yet' });
    });
    // Private matchday records.
    (input.mdopsRows || []).forEach(function (row) {
      var rf = row.fixture || {};
      var st = row.recordStatus || 'upcoming';
      var f = byId[String(rf.id)] || byKey[norm(rf.opponent) + '|' + String(rf.date || '').slice(0, 10)] || null;
      var hasRecord = !!row.record || (st !== 'upcoming' && st !== 'none');
      if (!f || off(f)) {
        if (hasRecord && st !== 'completed' && st !== 'locked') {
          entry(f, { id: rf.id, opponent: rf.opponent, date: rf.date }).conflict.push({ code: 'record-orphan',
            text: f ? 'An open takings record is attached to a fixture the league lists as ' + (f.status || 'postponed') : 'An open takings record is attached to a fixture no longer in the league list' });
        }
        return;
      }
      if (f.isHome === false) return;
      var k = ms(f), r = res[String(f.id)];
      var played = (r && hasScore(r)) || String(f.status) === 'played' || (isFinite(k) && k + 3 * HOUR <= now);
      if (!played) return;
      if (st === 'completed' || st === 'locked') return;
      if (st === 'awaiting_reconciliation') entry(f).private.push({ code: 'awaiting-approval', text: 'Attendance and takings submitted, waiting for approval' });
      else if (st === 'in_progress') entry(f).private.push({ code: 'record-in-progress', text: 'Attendance and takings record started but not finished' });
      else entry(f).private.push({ code: 'record-missing', text: 'No attendance and takings record yet' });
    });
    return Object.keys(out).map(function (k) {
      var e = out[k];
      var age = e.date ? T.dayDiff(e.date, T.londonDate(now)) : 0;
      e.historic = age > HISTORIC_DAYS;
      return e;
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  }

  // ── 3 · PRIORITIES ─────────────────────────────────────────────────────
  var CLOSED = { done: 1, cancelled: 1, closed: 1, won: 1, lost: 1, not_interested: 1, not_applicable: 1, paid: 1, void: 1,
    replied: 1, withdrawn: 1, ineligible: 1, awarded: 1, declined: 1, complete: 1, published: 1, shared: 1 };
  var KIND_PANEL = { task: 'clubtasks', enquiry: 'commercial', opportunity: 'commercial', invoice: 'commercial', fulfilment: 'commercial',
    outreach: 'outreach', grant: 'funding', compliance: 'compliance', comms: 'commsdesk', analysis: 'coaching' };
  function pounds(p) { return '£' + (Math.round(p || 0) / 100).toLocaleString('en-GB', { maximumFractionDigits: (p || 0) % 100 ? 2 : 0, minimumFractionDigits: (p || 0) % 100 ? 2 : 0 }); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  /** The matchday checklist tasks that belong to one fixture. */
  function tasksForFixture(tasks, fixtureId) {
    var id = String(fixtureId);
    return (tasks || []).filter(function (t) {
      var d = t.data || {};
      return String(d.fixture || '') === id || t.source === 'fixture:' + id;
    });
  }
  /** Tasks created for a fixture's old date — the fixture has since moved. */
  function movedTasks(tasks, fixture) {
    if (!fixture) return [];
    var day = T.londonDate(fixture.kickoffAt);
    return tasksForFixture(tasks, fixture.id).filter(function (t) {
      var was = (t.data || {}).fixture_date;
      return was && was !== day && !CLOSED[t.stage];
    });
  }

  /**
   * Everything that needs a person, grouped and de-duplicated.
   *
   * input = { now, fixtures, results, mdopsRows, scoreboardOn,
   *           cos: { attention, items: { task, enquiry, comms, outreach, invoice, opportunity } } }
   *
   * Each group: { id, category, severity, title, detail, panel, items[] }.
   * category: action | approval | deadline | conflict | system
   * severity: critical | high | normal | low   (critical is reserved for
   * something the public is seeing wrongly right now)
   */
  function buildPriorities(input) {
    var now = input.now == null ? Date.now() : input.now;
    var today = T.londonDate(now);
    var groups = [], seen = {};
    var cos = input.cos || {}, att = cos.attention || null, items = cos.items || {};
    function take(list) { return (list || []).filter(function (i) { if (!i || seen[i.id]) return false; seen[i.id] = 1; return true; }); }
    function rec(i) {
      return { id: i.id, title: i.title, panel: KIND_PANEL[i.kind] || 'command',
        meta: [i.owner ? i.owner : 'No owner', i.due_date ? 'due ' + T.shortDate(i.due_date) : null].filter(Boolean).join(' · ') };
    }

    // Critical: the public is looking at a live score nobody is running.
    var nx = nextFixture(input.fixtures, now, input.results);
    if (input.scoreboardOn && nx.state !== 'live') {
      groups.push({ id: 'scoreboard-on', category: 'system', severity: 'critical', panel: 'matchday',
        title: 'The live scoreboard is still switched on',
        detail: 'Supporters see a live score on the website, but no match is being played. Switch it off.', items: [] });
    }

    // The next match: is it prepared?
    var f = nx.fixture;
    if (f) {
      var days = T.dayDiff(today, T.londonDate(f.kickoffAt));
      var mine = tasksForFixture(items.task, f.id);
      var moved = movedTasks(items.task, f);
      if (moved.length) {
        take(moved);
        groups.push({ id: 'fixture-moved:' + f.id, category: 'conflict', severity: 'high', panel: 'preparematch', fixtureId: f.id,
          title: fixtureTitle(f) + ' has moved to ' + T.shortDate(f.kickoffAt),
          detail: plural(moved.length, 'matchday task') + ' still dated for the old fixture date.',
          items: moved.map(rec) });
      }
      if (days >= 0 && days <= 7) {
        var open = mine.filter(function (t) { return !CLOSED[t.stage]; });
        take(mine);
        if (!mine.length) {
          groups.push({ id: 'prep:' + f.id + ':none', category: 'action', severity: days <= 2 ? 'high' : 'normal', panel: 'preparematch', fixtureId: f.id,
            title: fixtureTitle(f) + ', ' + relDay(f.kickoffAt, now) + ': no matchday checklist',
            detail: 'Create the checklist so each job has an owner before kick-off.', items: [] });
        } else if (open.length) {
          groups.push({ id: 'prep:' + f.id + ':' + open.length, category: 'action', severity: days <= 1 && open.length ? 'high' : 'normal', panel: 'preparematch', fixtureId: f.id,
            title: fixtureTitle(f) + ': ' + (mine.length - open.length) + ' of ' + mine.length + ' matchday jobs done',
            detail: open.filter(function (t) { return !t.owner; }).length
              ? plural(open.filter(function (t) { return !t.owner; }).length, 'job') + ' still need an owner.' : 'Every remaining job has an owner.',
            items: open.map(rec) });
        }
      }
    }

    // Commercial: website enquiries past the 48-hour promise.
    if (att && att.enquiriesOver48h && att.enquiriesOver48h.length) {
      var late = take(att.enquiriesOver48h);
      if (late.length) groups.push({ id: 'enquiries-48h', category: 'action', severity: 'high', panel: 'commercial',
        title: plural(late.length, 'sponsorship enquiry', 'sponsorship enquiries') + ' waiting more than 48 hours',
        detail: 'Acknowledge and give each an owner — the website promises a reply within 48 hours.', items: late.map(rec) });
    }

    // Approvals: something somebody else has to sign off.
    var appr = [];
    (items.comms || []).forEach(function (i) { if (i.stage === 'review') appr.push(Object.assign({}, i, { _why: 'Announcement to approve' })); });
    (items.outreach || []).forEach(function (i) { if (i.stage === 'draft') appr.push(Object.assign({}, i, { _why: 'Business approach to approve' })); });
    (items.invoice || []).forEach(function (i) { if (i.stage === 'draft') appr.push(Object.assign({}, i, { _why: 'Invoice to approve' })); });
    (items.opportunity || []).forEach(function (i) { if (i.stage === 'proposal' || i.stage === 'negotiation') appr.push(Object.assign({}, i, { _why: 'Sponsorship proposal awaiting a decision' })); });
    appr = take(appr);
    if (appr.length) groups.push({ id: 'approvals', category: 'approval', severity: 'normal', panel: 'commsdesk',
      title: plural(appr.length, 'approval') + ' waiting',
      detail: summarise(appr.map(function (a) { return a._why; })),
      items: appr.map(function (a) { var r = rec(a); r.meta = a._why + (r.meta ? ' · ' + r.meta : ''); return r; }) });

    // Overdue work, whoever owns it.
    if (att && att.overdue && att.overdue.length) {
      var od = take(att.overdue);
      if (od.length) groups.push({ id: 'overdue', category: 'deadline', severity: 'high', panel: 'command',
        title: plural(od.length, 'overdue item'), detail: byOwner(od), items: od.map(rec) });
    }

    // Money owed on issued invoices.
    if (att && att.invoicesUnpaid && att.invoicesUnpaid.length) {
      var inv = take(att.invoicesUnpaid);
      var owed = inv.reduce(function (s, i) { return s + ((i.value_pence || 0) - (i.paid_pence || 0)); }, 0);
      if (inv.length) groups.push({ id: 'invoices', category: 'action', severity: 'normal', panel: 'commercial',
        title: pounds(owed) + ' owed on ' + plural(inv.length, 'invoice'),
        detail: 'Record payments only against bank evidence.', items: inv.map(rec) });
    }

    // Fixture records: public results and private matchday records, by fixture.
    var issues = fixtureIssues({ now: now, fixtures: input.fixtures, results: input.results, mdopsRows: input.mdopsRows });
    var pub = issues.filter(function (e) { return e.public.length; });
    if (pub.length) groups.push({ id: 'results-missing', category: 'conflict', severity: 'normal', panel: 'fixtures',
      title: plural(pub.length, 'result') + ' not yet in the fixture feed',
      detail: 'Public results come from the league feed through the football registry. Check them on Fixtures and results.',
      items: pub.map(function (e) { return { id: 'fx:' + e.fixtureId, title: e.opponent + ' · ' + T.shortDate(e.date), meta: e.public.map(function (p) { return p.text; }).join('; '), panel: 'fixtures' }; }) });
    var priv = issues.filter(function (e) { return e.private.length || e.conflict.length; });
    if (priv.length) {
      var recent = priv.filter(function (e) { return !e.historic; });
      groups.push({ id: 'reconcile', category: 'conflict', severity: recent.length ? 'normal' : 'low', panel: 'mdops',
        title: plural(priv.length, 'fixture') + ' need' + (priv.length === 1 ? 's' : '') + ' reconciliation',
        detail: (recent.length ? plural(recent.length, 'recent home match', 'recent home matches') + ', ' : '') +
          (priv.length - recent.length ? (priv.length - recent.length) + ' older than two weeks. ' : '') +
          'Private attendance and takings records — separate from the public result.',
        items: priv.map(function (e) {
          return { id: 'fx:' + e.fixtureId, title: e.opponent + ' · ' + (e.date ? T.shortDate(e.date) : 'date unknown'),
            meta: e.private.concat(e.conflict).map(function (p) { return p.text; }).join('; '), panel: 'mdops', historic: e.historic };
        }) });
    }

    // Due today / this week (anything not already shown).
    if (att) {
      var due = take((att.today || []).concat(att.week || []));
      if (due.length) groups.push({ id: 'due-soon', category: 'deadline', severity: 'low', panel: 'command',
        title: plural(due.length, 'item') + ' due in the next seven days', detail: byOwner(due), items: due.map(rec) });
      var unowned = take(att.unowned);
      if (unowned.length) groups.push({ id: 'unowned', category: 'action', severity: 'low', panel: 'command',
        title: plural(unowned.length, 'record') + ' with no owner', detail: 'Nobody is responsible for these yet.', items: unowned.map(rec) });
    }

    var rank = { critical: 0, high: 1, normal: 2, low: 3 };
    groups.sort(function (a, b) { return rank[a.severity] - rank[b.severity]; });
    groups.forEach(function (g) { g.count = g.items.length || 1; g.key = g.id + '#' + g.items.map(function (i) { return i.id; }).sort().join(','); });
    return groups;
  }

  function summarise(reasons) {
    var c = {};
    reasons.forEach(function (r) { c[r] = (c[r] || 0) + 1; });
    return Object.keys(c).map(function (k) { return c[k] + ' × ' + k.toLowerCase(); }).join(' · ');
  }
  function byOwner(list) {
    var c = {};
    list.forEach(function (i) { var o = i.owner || 'No owner'; c[o] = (c[o] || 0) + 1; });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).map(function (k) { return k + ' ' + c[k]; }).join(' · ');
  }

  // ── 4 · NOTIFICATIONS ──────────────────────────────────────────────────
  /**
   * One notification per priority group. `state` is what this device has
   * recorded: { read: {key: at}, known: {groupId: {key, title, firstSeen}} }.
   * Returns { list, resolved, unread, state } — a group that has disappeared
   * since it was last seen is RESOLVED (the records changed), which is
   * different from read (somebody looked at it).
   */
  function notifications(groups, state, nowMs) {
    var now = nowMs == null ? Date.now() : nowMs;
    var st = { read: Object.assign({}, (state && state.read) || {}), known: Object.assign({}, (state && state.known) || {}),
      resolved: ((state && state.resolved) || []).filter(function (r) { return now - r.at < 7 * DAY; }) };
    var live = {};
    var list = groups.map(function (g) {
      live[g.id] = 1;
      var k = st.known[g.id];
      if (!k || k.key !== g.key) st.known[g.id] = { key: g.key, title: g.title, firstSeen: k && k.key === g.key ? k.firstSeen : now };
      return { id: g.id, key: g.key, title: g.title, detail: g.detail, category: g.category, severity: g.severity, panel: g.panel,
        since: st.known[g.id].firstSeen, read: !!st.read[g.key] };
    });
    Object.keys(st.known).forEach(function (id) {
      if (live[id]) return;
      st.resolved.unshift({ id: id, title: st.known[id].title, at: now });
      delete st.known[id];
    });
    st.resolved = st.resolved.slice(0, 20);
    // Read markers for keys that no longer exist are dropped, so the store
    // cannot grow for ever.
    var keys = {}; list.forEach(function (n) { keys[n.key] = 1; });
    Object.keys(st.read).forEach(function (k) { if (!keys[k]) delete st.read[k]; });
    var unread = list.filter(function (n) { return !n.read && n.severity !== 'low'; }).length;
    return { list: list, resolved: st.resolved, unread: unread, state: st };
  }

  var api = { SECTIONS: SECTIONS, sectionOf: sectionOf, labelOf: labelOf, navFor: navFor,
    nextFixture: nextFixture, nextHome: nextHome, fixtureTitle: fixtureTitle, fixtureIssues: fixtureIssues,
    tasksForFixture: tasksForFixture, movedTasks: movedTasks, buildPriorities: buildPriorities, relDay: relDay,
    notifications: notifications, pounds: pounds, plural: plural, CLOSED: CLOSED, KIND_PANEL: KIND_PANEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HQModel = api;
}(typeof window !== 'undefined' ? window : globalThis));
