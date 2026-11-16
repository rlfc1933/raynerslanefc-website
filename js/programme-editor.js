/* ════════════════════════════════════════════════════════════════════════
   PROGRAMME EDITOR — save, publish, stages and checks for the HQ programme.

   The rules this file enforces, each of which was broken before:

   SAVED MEANS SAVED. "Programme saved" used to appear before the request had
   even been sent. Now the button is disabled while saving, the status line
   says "Saving…", and "Saved to the club" appears only when the server has
   confirmed the write. A failure says so, and the work stays on this device,
   labelled as device-only.

   A STALE DEVICE CANNOT OVERWRITE NEWER WORK. Every save carries the version
   it started from; if someone else saved since, the server refuses and the
   editor says who and when.

   A DRAFT IS NOT AN EDITION. Drafts live in data/programme-draft.json. They
   never replace a published edition in the archive, and publishing goes
   through the club's edition system (programme-admin), which is what the
   public reader actually shows.

   ONE FIXTURE. The fixture chosen in stage 1 supplies opponent, date, crest
   and competition. Changing it never deletes writing: every non-empty story
   is listed as "carried over from <old opponent> — review", and publishing is
   blocked until each one is reviewed.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  var DRAFT = 'data/programme-draft.json';
  var DEVICE_KEY = 'rlfc_programme_device_v2';
  var STORY_FIELDS = [
    ['pr-mgr', 'managerNotes', 'Manager’s notes'], ['pr-wel', 'welcomeNotes', 'Welcome to our guests'],
    ['pr-storylines', 'storylines', 'Match preview'], ['pr-lf', 'lookingForward', 'What we’re looking forward to'],
    ['pr-keyplayers', 'keyPlayers', 'Our players to watch'], ['pr-captainnotes', 'captainNotes', 'Captain’s notes'],
    ['pr-oppsum', 'oppSummary', 'Opposition summary'], ['pr-h2h', 'headToHead', 'Head to head'],
    ['pr-oppmanager', 'oppManager', 'Opposition manager'], ['pr-opponestowatch', 'oppOnesToWatch', 'Opposition ones to watch'],
    ['pr-away', 'awayLineup', 'Opposition line-up'], ['pr-awaykit', 'awayKit', 'Visitors’ colours'],
    ['pr-ref', 'referee', 'Referee'], ['pr-ar1', 'assistant1', 'Assistant 1'], ['pr-ar2', 'assistant2', 'Assistant 2'], ['pr-4th', 'fourthOfficial', '4th official'],
    ['pr-matchsponsor', 'matchSponsor', 'Match sponsor'], ['pr-ballsponsor', 'ballSponsor', 'Match ball sponsor'], ['pr-matchdaysponsor', 'matchdaySponsor', 'Matchday sponsor'],
    ['pr-oppfounded', 'oppFounded', 'Opposition founded'], ['pr-oppground', 'oppGround', 'Opposition ground']
  ];
  var PRE = global.PRE = {
    rev: 0, savedAt: null, savedBy: null, saving: false, publishing: false,
    clubSaved: false, deviceOnly: false, carry: null, oppSource: null, opponents: null, compliance: null,
    lastFixtureId: ''
  };

  function $(id) { return document.getElementById(id); }
  function val(id) { var e = $(id); return e ? String(e.value || '').trim() : ''; }
  function h(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function hhmm(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
  function dayTime(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function me() {
    var n = ''; try { n = localStorage.getItem('rlfc_actor') || ''; } catch (e) {}
    if (!n && global.HQShell && HQShell.askName) n = HQShell.askName() || '';
    if (!n && global.prompt) { n = String(global.prompt('Your name — the club records who saved and published each programme.') || '').trim().slice(0, 80); if (n) try { localStorage.setItem('rlfc_actor', n); } catch (e) {} }
    return n;
  }
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok && j.ok !== false, status: r.status, j: j }; }); })
      .catch(function (e) { return { ok: false, status: 0, j: { error: 'No connection' }, offline: true }; });
  }
  function save(body) { return post('/.netlify/functions/save-data', Object.assign({ pin: global.PIN || '' }, body)); }
  function b64(obj) { return btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 2)))); }

  /* ── status line: the only place that says whether work is safe ────── */
  function status(kind, msg) {
    var el = $('pr-save-state'); if (!el) return;
    el.className = 'pr-save-state pr-save-state--' + kind;
    el.innerHTML = msg;
  }
  function showClubState() {
    if (PRE.deviceOnly) return status('warn', '<b>Saved on this device only.</b> Not yet saved to the club. <button type="button" class="pr-link" onclick="saveProgramme()">Save to the club now</button>');
    if (PRE.rev) return status('ok', 'Saved to the club ' + (PRE.savedAt ? dayTime(PRE.savedAt) : '') + (PRE.savedBy ? ' by ' + h(PRE.savedBy) : '') + ' · version ' + PRE.rev + '. Not published.');
    status('idle', 'Not yet saved to the club.');
  }

  /* ── load: the club's copy, read from source, plus any device copy ─── */
  PRE.loadDraft = function () {
    return save({ read: true, path: DRAFT }).then(function (r) {
      if (r.ok && r.j.exists) return r.j.data;
      if (r.ok && !r.j.exists) {
        // First run: the old single-file draft becomes version 0 of the new one.
        return save({ read: true, path: 'data/programme.json' }).then(function (r2) { var d = (r2.ok && r2.j.data) || {}; d.revision = 0; return d; });
      }
      // Could not reach the club copy. Use the site copy and say so.
      PRE.readFailed = true;
      return fetch(DRAFT + '?t=' + Date.now()).then(function (x) { return x.ok ? x.json() : null; })
        .catch(function () { return null; })
        .then(function (d) { return d || fetch('data/programme.json?t=' + Date.now()).then(function (x) { return x.ok ? x.json() : {}; }).catch(function () { return {}; }); });
    });
  };
  PRE.afterLoad = function (d) {
    d = d || {};
    PRE.rev = Number(d.revision) || 0; PRE.savedAt = d.savedAt || null; PRE.savedBy = d.savedBy || null;
    PRE.lastFixtureId = d.fixtureId || '';
    PRE.carry = d.carryReview || null;
    showClubState();
    if (PRE.readFailed) status('warn', 'Could not reach the club’s saved copy, so this may not be the latest version. Saving will be refused if someone has saved a newer one.');
    offerDeviceCopy(d);
    renderCarry(); renderOppSource(); loadRegistries();
    bindDeviceAutosave();
    offerHqFixture(d);
    prStep(1);
  };
  /* Arriving from Matchday preparation with a different fixture selected:
     ask, never switch silently (switching lists carried-over writing). */
  function offerHqFixture(d) {
    var want = ''; try { want = sessionStorage.getItem('rlfc_hq_fixture') || ''; } catch (e) {}
    if (!want || want === (d.fixtureId || '')) return;
    var f = (global._prFixtures || []).filter(function (x) { return String(x.id) === want; })[0];
    if (!f) { setTimeout(function () { if ((global._prFixtures || []).length) offerHqFixture(d); }, 800); return; }
    if (f.isHome === false) return;
    var el = document.createElement('div'); el.className = 'pr-carry'; el.id = 'pr-hq-fx';
    el.innerHTML = 'You came from Matchday preparation for <b>' + h(f.opponent) + '</b>' + (d.opponent ? '; this draft is for <b>' + h(d.opponent) + '</b>' : '') + '.' +
      '<div class="pr-carry__acts"><button type="button" class="save sec" id="pr-hq-yes">Work on ' + h(f.opponent) + '</button><button type="button" class="save sec" id="pr-hq-no">Keep this draft</button></div>';
    var host = $('pr-save-state'); host.parentNode.insertBefore(el, host.nextSibling);
    $('pr-hq-yes').onclick = function () { var sel = $('pr-fixture'); if (sel) sel.value = want; global.prProgFromFixture(want); el.remove(); };
    $('pr-hq-no').onclick = function () { try { sessionStorage.removeItem('rlfc_hq_fixture'); } catch (e) {} el.remove(); };
  }

  /* ── device copy: protects work from a dropped connection ──────────── */
  function writeDevice() {
    try {
      var doc = global.prBuildDoc();
      localStorage.setItem(DEVICE_KEY, JSON.stringify({ at: new Date().toISOString(), baseRev: PRE.rev, doc: doc }));
    } catch (e) {}
  }
  var devTimer = null;
  function bindDeviceAutosave() {
    var panel = $('panel-programme'); if (!panel || panel._preBound) return; panel._preBound = 1;
    panel.addEventListener('input', function () {
      clearTimeout(devTimer); devTimer = setTimeout(writeDevice, 800);
      if (!PRE.deviceOnly) { PRE.deviceOnly = true; showClubState(); }
    });
  }
  function offerDeviceCopy(club) {
    var raw; try { raw = JSON.parse(localStorage.getItem(DEVICE_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw || !raw.doc) return;
    var same = JSON.stringify(strip(raw.doc)) === JSON.stringify(strip(club));
    if (same) { try { localStorage.removeItem(DEVICE_KEY); } catch (e) {} return; }
    var el = $('pr-carry-device') || document.createElement('div');
    el.id = 'pr-carry-device'; el.className = 'pr-carry';
    el.innerHTML = '<b>This device has unsaved changes from ' + h(dayTime(raw.at)) + '</b>' +
      (raw.baseRev !== PRE.rev ? ' (made on version ' + raw.baseRev + '; the club now has version ' + PRE.rev + ')' : '') + '.' +
      '<div class="pr-carry__acts"><button type="button" class="save sec" id="pr-dev-restore">Restore them</button>' +
      '<button type="button" class="save sec" id="pr-dev-discard">Discard them</button></div>';
    var host = $('pr-save-state'); host.parentNode.insertBefore(el, host.nextSibling);
    $('pr-dev-restore').onclick = function () {
      global.applyProgrammeData(raw.doc); PRE.carry = raw.doc.carryReview || PRE.carry;
      var sel = $('pr-fixture'); if (sel && raw.doc.fixtureId) sel.value = raw.doc.fixtureId;
      PRE.deviceOnly = true; showClubState(); renderCarry(); el.remove();
    };
    $('pr-dev-discard').onclick = function () { try { localStorage.removeItem(DEVICE_KEY); } catch (e) {} el.remove(); };
  }
  function strip(d) { var c = JSON.parse(JSON.stringify(d || {})); ['updatedAt', 'savedAt', 'savedBy', 'revision', 'published', 'id'].forEach(function (k) { delete c[k]; }); return c; }

  /* ── SAVE ───────────────────────────────────────────────────────────── */
  global.saveProgramme = function () {
    if (PRE.saving) return Promise.resolve(false);               // a second click does nothing
    var who = me(); if (!who) { status('err', 'Add your name to save — the club records who saved each version.'); return Promise.resolve(false); }
    PRE.saving = true;
    var btn = $('pr-save-btn'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    status('busy', 'Saving to the club…');
    writeDevice();
    var doc = global.prBuildDoc();
    doc.revision = PRE.rev + 1; doc.savedAt = new Date().toISOString(); doc.savedBy = who;
    return save({ path: DRAFT, content: b64(doc), expectRevision: PRE.rev }).then(function (r) {
      if (r.ok) {
        PRE.rev = doc.revision; PRE.savedAt = doc.savedAt; PRE.savedBy = who; PRE.deviceOnly = false;
        try { localStorage.removeItem(DEVICE_KEY); } catch (e) {}
        showClubState();
        return true;
      }
      PRE.deviceOnly = true;
      if (r.status === 409) {
        var c = (r.j && r.j.current) || {};
        status('err', '<b>Not saved: someone saved a newer version</b>' + (c.savedBy ? ' (' + h(c.savedBy) + (c.savedAt ? ', ' + h(dayTime(c.savedAt)) : '') + ')' : '') +
          '. Your changes are kept on this device. <button type="button" class="pr-link" onclick="location.reload()">Load the club’s version</button> — you will be offered your changes to restore.');
      } else {
        status('err', '<b>Not saved to the club.</b> ' + h((r.j && r.j.error) || ('Error ' + r.status)) + '. Your changes are kept on this device only. <button type="button" class="pr-link" onclick="saveProgramme()">Try again</button>');
      }
      return false;
    }).then(function (ok) {
      PRE.saving = false; if (btn) { btn.disabled = false; btn.innerHTML = '&#10003; Save to the club'; }
      return ok;
    });
  };

  /* ── PDF / pages: what is on screen, handed over directly ──────────── */
  global.prPrintEdition = function () {
    var doc = global.prBuildDoc(); doc.revision = PRE.rev;
    try { localStorage.setItem('rlfc_programme_draft', JSON.stringify({ savedAt: new Date().toISOString(), doc: doc })); } catch (e) {}
    var q = 'draft=1&fx=' + encodeURIComponent(doc.fixtureId || '') + '&rev=' + PRE.rev;
    global.open('programme-print.html?' + q, '_blank');
  };
  global.prPreviewEdition = global.prPrintEdition;

  /* ── PUBLISH: through the club's edition system ────────────────────── */
  var SECTION_MAP = [
    ['welcomeNotes', 'welcome', 'Welcome to Tithe Farm'],
    ['storylines', 'preview', 'Match preview'],
    ['managerNotes', 'article:manager', 'Manager’s notes'],
    ['captainNotes', 'article:captain', 'Captain’s notes'],
    ['lookingForward', 'article:looking-forward', 'What we’re looking forward to'],
    ['oppSummary', 'article:opposition', 'The opposition'],
    ['headToHead', 'article:head-to-head', 'Head to head']
  ];
  global.publishProgramme = function () {
    if (PRE.publishing) return;
    var issues = PRE.checks();
    var must = issues.filter(function (i) { return i.level === 'must'; });
    if (must.length) { prStep(4); status('err', '<b>Not published.</b> Fix the ' + must.length + ' “Must fix” item' + (must.length === 1 ? '' : 's') + ' first.'); return; }
    var doc0 = global.prBuildDoc();
    if (!doc0.fixtureId) { status('err', '<b>Not published.</b> Choose the match in stage 1 first.'); return; }
    if (!global.confirm('Publish the programme for Rayners Lane v ' + (doc0.opponent || '') + '?\n\n' +
      'Your writing is approved for this edition. The club’s programme system publishes it on matchday morning and adds confirmed teams when they are released. Changes after that go out as corrections.')) return;
    var who = me(); if (!who) return;
    PRE.publishing = true;
    var btn = $('pr-publish-btn'); if (btn) { btn.disabled = true; btn.textContent = 'Publishing…'; }
    status('busy', 'Saving your latest changes first…');
    global.saveProgramme().then(function (saved) {
      if (!saved) throw new Error('Your changes could not be saved, so nothing was published.');
      var doc = global.prBuildDoc();
      var jobs = SECTION_MAP.filter(function (m) { return String(doc[m[0]] || '').trim(); });
      var chain = Promise.resolve(), done = [];
      jobs.forEach(function (m, i) {
        chain = chain.then(function () {
          status('busy', 'Sending ' + m[2] + ' (' + (i + 1) + ' of ' + jobs.length + ')…');
          var byline = m[0] === 'captainNotes' ? (doc.captainName || null) : null;
          return post('/.netlify/functions/programme-admin', { pin: global.PIN || '', by: who, action: 'save_section',
            fixtureId: doc.fixtureId, sectionKey: m[1], title: m[2], body: doc[m[0]], byline: byline, approve: true });
        }).then(function (r) {
          if (!r.ok) throw new Error(m[2] + ' was not accepted: ' + ((r.j && r.j.error) || ('error ' + r.status)));
          done.push(m[2]);
        });
      });
      return chain.then(function () {
        status('busy', 'Approving the edition…');
        return post('/.netlify/functions/programme-admin', { pin: global.PIN || '', by: who, action: 'approve_editorial', fixtureId: doc.fixtureId });
      }).then(function (r) {
        if (!r.ok) throw new Error('The writing was saved (' + done.join(', ') + ') but the edition was not approved: ' + ((r.j && r.j.error) || ('error ' + r.status)));
        return archiveCopy(doc, who).then(function (arch) {
          status('ok', '<b>Approved for publication.</b> ' + h((r.j && r.j.message) || '') +
            (arch ? '' : ' (The print-edition archive copy could not be updated; the published edition is unaffected.)'));
        });
      });
    }).catch(function (e) {
      status('err', '<b>Not published.</b> ' + h(e.message || e));
    }).then(function () {
      PRE.publishing = false; if (btn) { btn.disabled = false; btn.innerHTML = '&#127760; Publish to website'; }
    });
  };
  /* The print archive keeps the frozen document so the PDF can be remade
     exactly. It never replaces a published copy with a draft (server guard),
     and a concurrent publish is refused rather than overwritten. */
  function archiveCopy(doc, who) {
    var freeze = typeof global.prFreezeEdition === 'function' ? global.prFreezeEdition(doc) : Promise.resolve(doc);
    return Promise.resolve(freeze).then(function (d) { doc = d || doc; return save({ read: true, path: 'data/programmes.json' }); }).then(function (r) {
      var items = (r.ok && r.j.data && r.j.data.items) || [];
      var cur = items.filter(function (it) { return it.id === doc.id; })[0];
      var expect = {}; expect[doc.id] = cur ? (cur.revision || 0) : 0;
      doc.published = true; doc.publishedAt = doc.publishedAt || new Date().toISOString(); doc.publishedBy = who;
      doc.snapshotOf = doc.fixtureId || doc.id; doc.revision = (cur && cur.revision || 0) + 1;
      return save({ merge: true, domain: 'programmes', key: 'items', idField: 'id', upserts: [doc], expectRevisions: expect, protectPublished: true });
    }).then(function (r) { return !!r.ok; });
  }

  /* ── STAGES ─────────────────────────────────────────────────────────── */
  global.prStep = function (n) {
    document.querySelectorAll('#panel-programme .pr-stage').forEach(function (s) { s.hidden = String(s.getAttribute('data-stage')) !== String(n); });
    document.querySelectorAll('#panel-programme .pr-step').forEach(function (b) {
      var on = b.getAttribute('data-step') === String(n);
      b.classList.toggle('is-on', on); if (on) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    if (String(n) === '4') renderChecks();
    var top = $('pr-fixture-head'); if (top && top.scrollIntoView && n !== 1) top.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  /* ── ONE FIXTURE: home first, upcoming before past, and carry-over ─── */
  function fixtureOptions() {
    var sel = $('pr-fixture'); var list = global._prFixtures || []; if (!sel || !list.length) return;
    var today = new Date().toISOString().slice(0, 10), cur = sel.value;
    function lbl(f) { return (typeof global.fxFmtDate === 'function' ? global.fxFmtDate(f.date) : f.date) + (f.isHome === false ? ' @ ' : ' v ') + (f.opponent || 'TBC') + (/postpon|cancel|abandon/i.test(f.status || '') ? ' (postponed)' : ''); }
    function opt(f) { return '<option value="' + h(f.id) + '">' + h(lbl(f)) + '</option>'; }
    var up = list.filter(function (f) { return f.date >= today; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var past = list.filter(function (f) { return f.date < today; }).sort(function (a, b) { return a.date > b.date ? -1 : 1; });
    sel.innerHTML = '<option value="">— pick a fixture —</option>' +
      '<optgroup label="Upcoming home matches">' + up.filter(function (f) { return f.isHome !== false; }).map(opt).join('') + '</optgroup>' +
      '<optgroup label="Upcoming away matches">' + up.filter(function (f) { return f.isHome === false; }).map(opt).join('') + '</optgroup>' +
      '<optgroup label="Earlier matches (archive editions)">' + past.map(opt).join('') + '</optgroup>';
    if (cur) sel.value = cur;
  }
  var origFromFixture = null;
  function wrapFixtureChange() {
    if (origFromFixture || typeof global.prProgFromFixture !== 'function') return;
    origFromFixture = global.prProgFromFixture;
    global.prProgFromFixture = function (id, quiet) {
      var oldOpp = val('pr-opp'), oldId = PRE.lastFixtureId;
      var f = (global._prFixtures || []).filter(function (x) { return x.id === id; })[0];
      if (f && oldOpp && f.opponent !== oldOpp && oldId !== id) {
        var carried = STORY_FIELDS.filter(function (s) { return val(s[0]); }).map(function (s) { return { field: s[1], el: s[0], label: s[2], reviewed: false }; });
        if (carried.length) PRE.carry = { from: oldOpp, fromFixtureId: oldId || null, to: f.opponent, at: new Date().toISOString(), items: carried };
      }
      origFromFixture(id, quiet);
      PRE.lastFixtureId = id;
      renderCarry(); renderOppSource();
    };
  }
  function renderCarry() {
    var el = $('pr-carry'); if (!el) return;
    var c = PRE.carry, open = c && c.items ? c.items.filter(function (i) { return !i.reviewed; }) : [];
    if (!open.length) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = '<b>Carried over from the ' + h(c.from) + ' programme — check before using for ' + h(c.to) + '.</b>' +
      '<p>Nothing has been deleted. Each item below was written for a different match. Edit or clear it, then mark it reviewed.</p>' +
      '<ul>' + open.map(function (i) {
        return '<li><span>' + h(i.label) + '</span> <button type="button" class="pr-link" data-go="' + h(i.el) + '">Open</button> ' +
          '<button type="button" class="pr-link" data-ok="' + h(i.field) + '">Mark reviewed</button></li>';
      }).join('') + '</ul>';
    el.querySelectorAll('[data-ok]').forEach(function (b) { b.onclick = function () {
      c.items.forEach(function (i) { if (i.field === b.getAttribute('data-ok')) { i.reviewed = true; i.reviewedAt = new Date().toISOString(); } });
      PRE.deviceOnly = true; showClubState(); renderCarry();
    }; });
    el.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { goTo(b.getAttribute('data-go')); }; });
  }
  function goTo(id) {
    var e = $(id); if (!e) return;
    var st = e.closest('.pr-stage'); if (st) prStep(st.getAttribute('data-stage'));
    var det = e.closest('details'); if (det) det.open = true;
    setTimeout(function () { e.scrollIntoView({ block: 'center' }); e.focus(); }, 50);
  }

  /* ── REGISTRIES: opponents, compliance, officials names ────────────── */
  function loadRegistries() {
    fixtureOptions(); wrapFixtureChange();
    Promise.all([
      fetch('data/opponents.json?t=' + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch('data/programme-compliance.json?t=' + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch('data/programmes.json?t=' + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch('data/committee.json?t=' + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (r) {
      PRE.committee = ((r[3] && r[3].members) || []).map(function (m) { return String(m.name || '').trim(); }).filter(Boolean);
      PRE.opponents = (r[0] && r[0].opponents) || [];
      PRE.compliance = r[1] || null;
      // Names used in earlier programmes — a search aid, never a default.
      var names = {};
      ((r[2] && r[2].items) || []).forEach(function (it) { ['referee', 'assistant1', 'assistant2', 'fourthOfficial'].forEach(function (k) { var n = String(it[k] || '').trim(); if (n && !/test|tbc/i.test(n)) names[n] = 1; }); });
      var dl = $('pr-officials-dl'); if (dl) dl.innerHTML = Object.keys(names).sort().map(function (n) { return '<option value="' + h(n) + '">'; }).join('');
      renderOppSource();
    });
  }
  function profileFor(name) {
    var n = String(name || '').toLowerCase().trim(); if (!n) return null;
    return (PRE.opponents || []).filter(function (p) {
      return String(p.key || '').toLowerCase() === n || (p.aliases || []).some(function (a) { return String(a).toLowerCase() === n; });
    })[0] || null;
  }
  function renderOppSource() {
    var el = $('pr-opp-src'); if (!el) return;
    var p = profileFor(val('pr-opp'));
    if (!val('pr-opp')) { el.innerHTML = '<p class="pr-muted">Choose the match first.</p>'; return; }
    if (!p) { el.innerHTML = '<p class="pr-muted">No club profile for ' + h(val('pr-opp')) + ' yet. Write the opposition page yourself; nothing is filled in automatically.</p>'; return; }
    el.innerHTML = '<p class="pr-muted">Club profile: ' + h(p.key) + (p.founded ? ' · founded ' + h(p.founded) : '') + (p.ground ? ' · ' + h(p.ground) : '') +
      '. Source: ' + h(p.verification || p.source || 'not recorded') + (p.reviewedOn ? ' · checked ' + h(p.reviewedOn) : '') +
      (p.reviewNote ? '<br><b>Before using:</b> ' + h(p.reviewNote) : '') +
      '. Historical facts only. Current manager and recent results are not in the profile: add them for this edition, and check results close to the print deadline.</p>';
  }
  /* Fills EMPTY boxes only, and checks they are still empty at the moment of
     filling — never overwrites something typed while the profile loaded. */
  global.prFillOpposition = function () {
    var p = profileFor(val('pr-opp'));
    if (!p) { status('warn', 'There is no club profile for this opponent to fill from.'); return; }
    var filled = [];
    function fill(id, v, label) { var e = $(id); if (e && !String(e.value || '').trim() && v) { e.value = v; filled.push(label); } }
    fill('pr-oppfounded', p.founded ? String(p.founded) : '', 'founded');
    fill('pr-oppground', p.ground || '', 'ground');
    fill('pr-oppsum', p.historySummary || '', 'club history');
    PRE.oppSource = { key: p.key, source: p.verification || p.source || null, reviewedOn: p.reviewedOn || null, sources: p.sources || null };
    if (filled.length) { PRE.deviceOnly = true; showClubState(); }
    status(filled.length ? 'warn' : 'idle', filled.length ? 'Filled ' + filled.join(', ') + ' from the club profile. Not saved yet.' : 'Nothing filled: those boxes already have writing in them, which is kept.');
  };

  /* ── CHECKS ─────────────────────────────────────────────────────────── */
  var PLACEHOLDER = /\b(test(ing)?|lorem|ipsum|placeholder|xxx+|tbc|tba|asdf|dummy|sample)\b/i;
  PRE.checks = function () {
    var out = [], doc = global.prBuildDoc();
    var fx = (global._prFixtures || []).filter(function (f) { return f.id === doc.fixtureId; })[0];
    var src = PRE.compliance ? ' (' + (PRE.compliance.season || '') + ' league guidance)' : '';
    function add(level, kind, text, el) { out.push({ level: level, kind: kind, text: text, el: el }); }
    if (!fx) add('must', 'Club', 'No fixture chosen. The programme must belong to one match.', 'pr-fixture');
    else {
      if (/postpon|cancel|abandon|void/i.test(fx.status || '')) add('must', 'Club', 'This match is marked ' + fx.status + '. Do not publish a programme for it.', 'pr-fixture');
      if (fx.date < new Date().toISOString().slice(0, 10)) add('warn', 'Club', 'This match date has passed. Publishing now makes an archive edition.', 'pr-fixture');
      if (fx.opponent && doc.opponent && fx.opponent !== doc.opponent) add('must', 'Club', 'The opposition box says “' + doc.opponent + '” but the fixture is against ' + fx.opponent + '.', 'pr-opp');
    }
    // Wrong-opponent copy: another club's name in this edition's writing.
    var others = (PRE.opponents || []).map(function (p) { return p.key; }).filter(function (k) { return k && k !== doc.opponent; });
    STORY_FIELDS.forEach(function (s) {
      var t = String(doc[s[1]] || ''); if (!t) return;
      others.forEach(function (k) {
        if (new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(t)) {
          // Naming the club this copy was carried over from is almost certainly
          // the wrong preview; naming another club may be a legitimate reference.
          var fromOld = PRE.carry && PRE.carry.from === k;
          var namesUs = doc.opponent && new RegExp(doc.opponent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(t);
          if (!namesUs) fromOld = true;   // talks about another club and never this one: wrong preview
          add(fromOld ? 'must' : 'warn', 'Club', s[2] + ' mentions ' + k + ', not ' + (doc.opponent || 'this opponent') + '. Check it was written for this match.', s[0]);
        }
      });
      if (PLACEHOLDER.test(t)) add('must', 'Club', s[2] + ' contains test or placeholder text (“' + t.match(PLACEHOLDER)[0] + '”).', s[0]);
    });
    var c = PRE.carry; (c && c.items || []).filter(function (i) { return !i.reviewed; }).forEach(function (i) {
      add('must', 'Club', i.label + ' was carried over from the ' + c.from + ' programme and has not been reviewed.', i.el);
    });
    var squad = (global.prRoster && global.prRoster.active) || [];
    // Committee test data: committee members' names in the team sheet or as
    // officials (the Broadfields draft had exactly this). Committee members who
    // are genuinely in the squad are not flagged.
    var squadNames = squad.map(function (p) { return String(p.name || '').toLowerCase().trim(); });
    var notPlayers = (PRE.committee || []).filter(function (n) { return squadNames.indexOf(n.toLowerCase()) < 0; });
    [['homeXI', 'pr-xi', 'Starting XI'], ['homeSubs', 'pr-subs', 'Substitutes'], ['referee', 'pr-ref', 'Referee'], ['assistant1', 'pr-ar1', 'Assistant 1'], ['assistant2', 'pr-ar2', 'Assistant 2'], ['fourthOfficial', 'pr-4th', '4th official']].forEach(function (f) {
      var t = String(doc[f[0]] || '').toLowerCase();
      var hits = notPlayers.filter(function (n) { return t.indexOf(n.toLowerCase()) >= 0; });
      if (hits.length) add('must', 'Club', f[2] + ' contains committee members’ names (' + hits.slice(0, 3).join(', ') + (hits.length > 3 ? '…' : '') + '). This looks like test data.', f[1]);
    });
    if (!String(doc.homeXI || '').trim() && !squad.length) add('must', 'League', 'Rayners Lane player names and numbers are missing' + src + '.', 'pr-roster');
    if (fx && fx.isHome !== false && !String(doc.awayLineup || '').trim()) add('warn', 'League', 'Visiting squad names and numbers are not in yet. Ask the visiting secretary' + src + '.', 'pr-away');
    if (!doc.homeKit || !doc.awayKit) add('warn', 'League', 'Playing colours for both teams are not filled in' + src + '.', doc.homeKit ? 'pr-awaykit' : 'pr-homekit');
    else if (!doc.awayKitConfirmed) add('warn', 'League', 'The visitors’ colours are not marked as confirmed.', 'pr-kit-ok');
    if (!doc.referee) add('warn', 'League', 'No referee named. If appointments have not arrived, the programme says “to be confirmed”, never a guess' + src + '.', 'pr-ref');
    else if (doc.officialsStatus !== 'confirmed') add('warn', 'League', 'Match officials are entered but not marked confirmed.', 'pr-off-status');
    else if (!doc.officialsSource) add('warn', 'Club', 'Officials are marked confirmed but the source is blank.', 'pr-off-source');
    if (!doc.oppCrest) add('warn', 'Club', 'No opposition crest: the cover will use initials.', 'pr-oppcrest');
    var adv = (doc.customPages || []).map(function (p) { return String(p.title || '') + ' ' + String(p.caption || ''); }).join(' ');
    if (!/cherry red|mjm|pst/i.test(adv)) add('warn', 'League', 'League sponsor adverts not found among your extra pages. When a programme is produced, Rule 8.14 requires the official adverts the League supplies (currently listed: Cherry Red Records, MJM Sports, PST Sport — confirm the current set with the secretary). A sponsor logo is not the advert.', 'pr-pages-list');
    if (PRE.deviceOnly) add('warn', 'Club', 'Latest changes are on this device only. Save to the club.', 'pr-save-btn');
    if (!doc.managerNotes && !doc.storylines && !doc.welcomeNotes) add('info', 'Optional', 'No manager’s notes, preview or welcome yet. Optional, but the edition has little of its own without them.', 'pr-mgr');
    return out;
  };
  function renderChecks() {
    var el = $('pr-checks'); if (!el) return;
    var list = PRE.checks(); var order = { must: 0, warn: 1, info: 2 };
    list.sort(function (a, b) { return order[a.level] - order[b.level]; });
    if (!list.length) { el.innerHTML = '<p class="pr-check-ok">No problems found. Open the pages and check them by eye before printing.</p>'; return; }
    var name = { must: 'Must fix', warn: 'Check', info: 'Optional' };
    el.innerHTML = '<ul>' + list.map(function (i, n) {
      return '<li class="pr-ck pr-ck--' + i.level + '"><span class="pr-ck__lvl">' + name[i.level] + '</span><span class="pr-ck__kind">' + h(i.kind) + '</span>' +
        '<span class="pr-ck__t">' + h(i.text) + '</span>' + (i.el ? '<button type="button" class="pr-link" data-go="' + h(i.el) + '">Go to it</button>' : '') + '</li>';
    }).join('') + '</ul><p class="pr-muted">League = what the league asks of a programme when one is produced. Club = Rayners Lane’s own policy. Optional = editorial choice.</p>';
    el.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { goTo(b.getAttribute('data-go')); }; });
  }
  PRE.renderChecks = renderChecks;
  PRE.fixtureOptions = fixtureOptions;
})(window);
