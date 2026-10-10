/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — Programme HQ

   The committee's programme desk, on programmes.html?hq=1. Usable on a phone.
   Calm and operational: the next home fixture and what it still needs, then
   the season's reconciliation as a table, then an inspector for any edition's
   history. Every action goes to /.netlify/functions/programme-admin, which
   checks the committee password and records WHO did it.

   Inert for supporters: without ?hq=1 this file does nothing at all.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!/[?&]hq=1\b/.test(location.search)) return;
  var mount = document.getElementById('programme-hq');
  if (!mount) return;

  var css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = 'css/p-programme-hq.css?v=1';
  document.documentElement.classList.add('is-phq');
  document.head.appendChild(css);
  var robots = document.createElement('meta');
  robots.name = 'robots'; robots.content = 'noindex';
  document.head.appendChild(robots);

  var ENDPOINT = '/.netlify/functions/programme-admin';
  var S = { pin: null, by: null, data: null };
  try { S.pin = sessionStorage.getItem('rlfc_prog_pin'); S.by = sessionStorage.getItem('rlfc_prog_by'); } catch (e) {}

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function day(iso, withTime) {
    var ms = Date.parse(iso);
    if (!isFinite(ms)) return '—';
    var o = { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' };
    if (withTime) { o.hour = 'numeric'; o.minute = '2-digit'; }
    return new Intl.DateTimeFormat('en-GB', o).format(new Date(ms));
  }

  function post(body) {
    return fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ pin: S.pin, by: S.by }, body)) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'HTTP ' + r.status }; }); })
      .catch(function (e) { return { ok: false, error: 'Network error: ' + e.message }; });
  }

  function say(msg, bad) {
    var el = document.getElementById('phq-msg');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'phq-msg' + (bad ? ' phq-msg--bad' : '');
  }

  /* ── sign in ──────────────────────────────────────────────────────────── */
  function signIn(err) {
    mount.hidden = false;
    mount.innerHTML = '<section class="phq" aria-labelledby="phq-h"><h2 class="phq-h" id="phq-h">Programme HQ</h2>' +
      '<form class="phq-signin" id="phq-signin">' +
      '<label>Committee password<input type="password" name="pin" autocomplete="current-password" required></label>' +
      '<label>Your name<input type="text" name="by" autocomplete="name" required value="' + esc(S.by || '') + '"></label>' +
      '<button class="phq-btn phq-btn--primary" type="submit">Open Programme HQ</button>' +
      (err ? '<p class="phq-msg phq-msg--bad" role="alert">' + esc(err) + '</p>' : '') +
      '<p class="phq-note">Your name is recorded against every approval and change.</p></form></section>';
    document.getElementById('phq-signin').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      S.pin = f.pin.value; S.by = f.by.value.trim();
      try { sessionStorage.setItem('rlfc_prog_pin', S.pin); sessionStorage.setItem('rlfc_prog_by', S.by); } catch (x) {}
      load();
    });
  }

  /* ── the desk ─────────────────────────────────────────────────────────── */
  var STATUS_CLASS = {
    'Published': 'ok', 'Not required': 'muted', 'Draft only': 'muted', 'Never generated': 'muted',
    'Awaiting approval': 'act', 'Historical edition missing': 'act', 'Requires manual evidence': 'warn',
    'Published but inaccessible': 'warn', 'Publication error': 'warn',
    'Fixture postponed': 'muted', 'Fixture cancelled': 'muted', 'Fixture abandoned': 'muted',
  };

  function nextPanel(n) {
    if (!n) return '<section class="phq-card"><h3 class="phq-h3">Next home fixture</h3><p>No home fixture is scheduled.</p></section>';
    var f = n.fixture, ed = n.edition || {};
    var ready = (n.missing || []).filter(function (m) { return !/optional/.test(m); }).length === 0 && !!ed.mandatory_content_valid;
    var latest = (n.versions || [])[0];
    var chair = (n.sections || []).filter(function (s) { return s.section_key === 'chairNotes' && s.edition_id; })[0] || {};
    return '<section class="phq-card" aria-labelledby="phq-next-h">' +
      '<h3 class="phq-h3" id="phq-next-h">Next home fixture</h3>' +
      '<p class="phq-fixture">Rayners Lane v ' + esc(f.opponent) + '</p>' +
      '<p class="phq-sub">' + esc(day(f.kickoffAt, f.kickoffTimeConfirmed)) + ' · ' + esc(f.competition || '') + '</p>' +
      '<dl class="phq-facts">' +
        '<div><dt>Programme</dt><dd>' + esc(f.status) + '</dd></div>' +
        '<div><dt>Approval</dt><dd>' + (ed.editorial_approved_by ? 'Approved by ' + esc(ed.editorial_approved_by) : 'Not yet approved') + '</dd></div>' +
        '<div><dt>Team sheets</dt><dd>' + esc(ed.teams_status || 'pending') + '</dd></div>' +
        '<div><dt>Latest version</dt><dd>' + (latest ? 'v' + esc(latest.version) + ' · ' + esc(latest.stage || '') : 'none yet') + '</dd></div>' +
        '<div><dt>Data</dt><dd>' + esc(S.data.sources.fwpApi) + '</dd></div>' +
      '</dl>' +
      ((n.missing || []).length ? '<h4 class="phq-h4">Still needed</h4><ul class="phq-list">' +
        n.missing.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>' : '') +
      ((n.sponsorIssues || []).length ? '<h4 class="phq-h4">Sponsor artwork</h4><ul class="phq-list phq-list--warn">' +
        n.sponsorIssues.map(function (i) { return '<li>' + esc(i.sponsor + ': ' + i.issue) + '</li>'; }).join('') + '</ul>' : '') +
      (ed.last_error ? '<p class="phq-msg phq-msg--bad">' + esc(ed.last_error) + '</p>' : '') +
      '<div class="phq-actions">' +
        (!ed.published_at && ed.id ? '<button class="phq-btn phq-btn--primary" data-act="approve" data-id="' + esc(f.fixtureId) + '"' +
          (ready || !ed.editorial_approved_at ? '' : ' disabled') + '>Approve editorial edition</button>' : '') +
        (ed.published_at ? '<a class="phq-btn" href="programme.html?id=' + encodeURIComponent(f.fixtureId) + '" target="_blank" rel="noopener">Preview published edition</a>' : '') +
        '<button class="phq-btn" data-act="run">Refresh programme data</button>' +
        (ed.id ? '<button class="phq-btn" data-act="history" data-id="' + esc(f.fixtureId) + '">History and versions</button>' : '') +
      '</div>' +
      (ed.id ? '<details class="phq-edit"><summary>Chairman’s notes</summary>' +
        '<form data-form="chair" data-id="' + esc(f.fixtureId) + '">' +
        '<label>Notes<textarea name="body" rows="6">' + esc(chair.body || '') + '</textarea></label>' +
        '<label>Byline (the person whose words these are)<input name="byline" value="' + esc(chair.byline || '') + '"></label>' +
        '<label class="phq-check"><input type="checkbox" name="approve"' + (chair.approved_by ? ' checked' : '') + '> These are his words and he has approved them</label>' +
        '<button class="phq-btn" type="submit">Save notes</button></form></details>' +
        '<details class="phq-edit"><summary>Match preview or article</summary>' +
        '<form data-form="section" data-id="' + esc(f.fixtureId) + '">' +
        '<label>Section<select name="sectionKey"><option value="preview">Match preview</option><option value="welcome">Welcome</option>' +
        '<option value="article:feature">Feature article</option></select></label>' +
        '<label>Title<input name="title"></label><label>Text<textarea name="body" rows="6"></textarea></label>' +
        '<label class="phq-check"><input type="checkbox" name="approve"> Approved for publication</label>' +
        '<button class="phq-btn" type="submit">Save section</button></form></details>' +
        '<details class="phq-edit"><summary>Sponsor placement</summary>' +
        '<form data-form="placement" data-id="' + esc(f.fixtureId) + '">' +
        '<label>Sponsor<input name="sponsorName" required></label>' +
        '<label>Placement<select name="kind"><option value="match_sponsor">Match sponsor</option><option value="match_ball">Match-ball sponsor</option>' +
        '<option value="full_page">Full-page advert</option><option value="half_page">Half-page advert</option><option value="quarter_page">Quarter-page advert</option>' +
        '<option value="title_sponsor">Programme title sponsor</option><option value="directory">Local business directory</option></select></label>' +
        '<label>Artwork path (for adverts)<input name="artworkPath" placeholder="img/sponsors/…"></label>' +
        '<label>Website<input name="website" type="url"></label>' +
        '<label class="phq-check"><input type="checkbox" name="agreed"> This is an agreed, approved commercial deal</label>' +
        '<p class="phq-note">Without that box ticked it is saved as a proposal and never appears in a programme.</p>' +
        '<button class="phq-btn" type="submit">Save placement</button></form></details>' : '') +
      '</section>';
  }

  function table(rec) {
    var rows = rec.rows.filter(function (r) { return r.officialHome; });
    return '<section class="phq-card" aria-labelledby="phq-rec-h"><h3 class="phq-h3" id="phq-rec-h">Season reconciliation</h3>' +
      '<p class="phq-sub">' + rec.summary.eligibleHome + ' eligible home fixtures (' + rec.summary.cupHome + ' cup), ' +
      rec.summary.published + ' published, ' + rec.summary.historicalMissing.length + ' missing, ' +
      rec.summary.postponed.length + ' postponed. Away fixtures are left out: home status is the official designation, never the venue.</p>' +
      '<div class="phq-tablewrap"><table class="phq-table"><thead><tr><th scope="col">Date</th><th scope="col">Fixture</th>' +
      '<th scope="col">Match</th><th scope="col">Programme</th><th scope="col">Next step</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>' +
      rows.map(function (r) {
        var cls = STATUS_CLASS[r.status] || 'muted';
        var acts = '';
        if (r.recordExists && r.matchStatus === 'played' && !r.published) {
          acts += '<button class="phq-btn phq-btn--sm" data-act="retro" data-id="' + esc(r.fixtureId) + '">Authorise archive edition</button>';
        }
        if (r.publiclyAccessible) acts += '<button class="phq-btn phq-btn--sm" data-act="unpublish" data-id="' + esc(r.fixtureId) + '">Unpublish</button>';
        if (r.status === 'Published but inaccessible') acts += '<button class="phq-btn phq-btn--sm" data-act="restore" data-id="' + esc(r.fixtureId) + '">Restore</button>';
        if (r.recordExists) acts += '<button class="phq-btn phq-btn--sm" data-act="history" data-id="' + esc(r.fixtureId) + '">History</button>';
        return '<tr><td>' + esc(r.date || 'unknown') + '</td><td>v ' + esc(r.opponent) +
          '<span class="phq-cell-sub">' + esc(r.competition || '') + (r.externalId ? ' · FWP ' + esc(r.externalId) : '') + '</span></td>' +
          '<td>' + esc(r.matchStatus) + (r.result ? ' ' + esc(r.result.us + '–' + r.result.them) : '') +
          (r.supersededBy ? '<span class="phq-cell-sub">replaced by ' + esc(r.supersededBy) + '</span>' : '') + '</td>' +
          '<td><span class="phq-st phq-st--' + cls + '">' + esc(r.status) + '</span>' +
          (r.errors.length ? '<span class="phq-cell-sub">' + esc(r.errors.join('; ')) + '</span>' : '') + '</td>' +
          '<td>' + esc(r.repairAction) + '</td><td><div class="phq-rowacts">' + acts + '</div></td></tr>';
      }).join('') + '</tbody></table></div></section>';
  }

  function inspector(h, fixtureId) {
    var el = document.getElementById('phq-inspector');
    if (!el) return;
    el.hidden = false;
    el.innerHTML = '<section class="phq-card" aria-labelledby="phq-ins-h"><h3 class="phq-h3" id="phq-ins-h">History · ' + esc(fixtureId) + '</h3>' +
      '<h4 class="phq-h4">Versions</h4>' + ((h.versions || []).length ? '<ol class="phq-list" reversed>' + h.versions.map(function (v) {
        return '<li><strong>v' + esc(v.version) + '</strong> · ' + esc(v.stage || 'published') + ' · ' + esc(day(v.published_at, true)) +
          (v.revision_reason ? ' · ' + esc(v.revision_reason) : '') +
          ' <button class="phq-btn phq-btn--sm" data-act="rollback" data-id="' + esc(fixtureId) + '" data-v="' + esc(v.version) + '">Restore this version</button></li>';
      }).join('') + '</ol>' : '<p>No versions yet.</p>') +
      '<h4 class="phq-h4">Correct a name on the team sheet</h4>' +
      '<form data-form="correct" data-id="' + esc(fixtureId) + '" class="phq-inline">' +
      '<label>Side<select name="side"><option value="home">Home</option><option value="away">Away</option></select></label>' +
      '<label>Name as printed<input name="from" required></label><label>Correct name<input name="to" required></label>' +
      '<button class="phq-btn" type="submit">Correct</button></form>' +
      '<h4 class="phq-h4">Events</h4><ul class="phq-list">' + (h.events || []).map(function (e) {
        return '<li>' + esc(day(e.created_at, true)) + ' · ' + esc(e.event_type.replace(/_/g, ' ')) + ' · ' + esc(e.actor) +
          (e.reason ? ' · ' + esc(e.reason) : '') + '</li>';
      }).join('') + '</ul></section>';
    el.scrollIntoView({ block: 'start' });
  }

  function paint() {
    var d = S.data;
    mount.hidden = false;
    mount.innerHTML = '<section class="phq" aria-labelledby="phq-h">' +
      '<div class="phq-top"><h2 class="phq-h" id="phq-h">Programme HQ</h2>' +
      '<p class="phq-sub">Signed in as ' + esc(S.by) + ' · <button class="phq-link" data-act="signout">Sign out</button></p></div>' +
      '<p id="phq-msg" class="phq-msg" role="status" aria-live="polite"></p>' +
      nextPanel(d.next) + table(d.reconciliation) + '<div id="phq-inspector" hidden></div></section>';
  }

  function load() {
    mount.hidden = false;
    mount.innerHTML = '<p class="phq-msg" role="status">Loading Programme HQ…</p>';
    post({ action: 'status' }).then(function (d) {
      if (!d || d.ok !== true) {
        if (d && /signed in/i.test(d.error || '')) { S.pin = null; return signIn('That password was not recognised.'); }
        mount.innerHTML = '<section class="phq"><h2 class="phq-h">Programme HQ</h2><p class="phq-msg phq-msg--bad" role="alert">' +
          esc((d && d.error) || 'Programme HQ could not load.') + '</p><button class="phq-btn" data-act="reload">Try again</button></section>';
        return;
      }
      S.data = d;
      paint();
    });
  }

  function after(r, okMsg) {
    say(r && r.ok !== false ? (r.message || okMsg || 'Done.') : ((r && r.error) || 'That did not work.'), !(r && r.ok !== false));
    if (r && r.ok !== false) setTimeout(load, 900);
  }

  mount.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act'), id = b.getAttribute('data-id');
    if (act === 'signout') { try { sessionStorage.removeItem('rlfc_prog_pin'); } catch (x) {} S.pin = null; return signIn(); }
    if (act === 'reload') return load();
    if (act === 'run') { say('Refreshing…'); return post({ action: 'run' }).then(function (r) { after(r, 'Programme data refreshed.'); }); }
    if (act === 'approve') {
      if (!confirm('Approve this editorial edition? It publishes on matchday morning; confirmed teams are added when they are released.')) return;
      return post({ action: 'approve_editorial', fixtureId: id }).then(after);
    }
    if (act === 'retro') {
      if (!confirm('Publish an Archive Edition for this match?\n\nIt is dated TODAY, labelled "Archive Edition — Reconstructed from verified match records", and contains only the verified record.')) return;
      var why = prompt('Why is it being published now? (optional)') || '';
      say('Publishing the archive edition…');
      return post({ action: 'authorise_retrospective', fixtureId: id, reason: why }).then(after);
    }
    if (act === 'unpublish') {
      var reason = prompt('Why is this edition being unpublished? (required — it is kept, not deleted)');
      if (!reason) return;
      return post({ action: 'unpublish', fixtureId: id, reason: reason }).then(after);
    }
    if (act === 'restore') return post({ action: 'restore', fixtureId: id }).then(after);
    if (act === 'history') return post({ action: 'history', fixtureId: id }).then(function (h) {
      if (h && h.ok) inspector(h, id); else say((h && h.error) || 'No history.', true);
    });
    if (act === 'rollback') {
      var v = b.getAttribute('data-v');
      if (!confirm('Restore version ' + v + '? It becomes a new version; nothing is deleted.')) return;
      return post({ action: 'rollback', fixtureId: id, toVersion: Number(v), reason: prompt('Reason (optional)') || '' }).then(after);
    }
  });

  mount.addEventListener('submit', function (e) {
    var f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    var kind = f.getAttribute('data-form'), id = f.getAttribute('data-id');
    if (kind === 'chair') {
      return post({ action: 'save_section', fixtureId: id, sectionKey: 'chairNotes', body: f.body.value,
        byline: f.byline.value, approve: f.approve.checked }).then(after);
    }
    if (kind === 'section') {
      return post({ action: 'save_section', fixtureId: id, sectionKey: f.sectionKey.value, title: f.title.value,
        body: f.body.value, approve: f.approve.checked }).then(after);
    }
    if (kind === 'placement') {
      return post({ action: 'add_placement', fixtureId: id, sponsorName: f.sponsorName.value, kind: f.kind.value,
        artworkPath: f.artworkPath.value, website: f.website.value, approve: f.agreed.checked, confirmAgreed: f.agreed.checked }).then(after);
    }
    if (kind === 'correct') {
      return post({ action: 'correct_player', fixtureId: id, side: f.side.value, from: f.from.value, to: f.to.value }).then(after);
    }
  });

  if (S.pin && S.by) load(); else signIn();
})();
