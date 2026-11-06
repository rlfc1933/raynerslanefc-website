/* ════════════════════════════════════════════════════════════════════════
   SQUAD HQ — "Is the first-team squad up to date?" on the Staff HQ welcome
   screen, the "Squad changes to review" list, and player photo uploads.
   Talks to squad-review / squad-photo with the person's own signed token
   (staffAdminFetch in admin.html). Says "Website updated" only when the
   server has read the public copy back; otherwise it says what is pending.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var API = '/.netlify/functions/squad-review', PHOTO = '/.netlify/functions/squad-photo';
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var when = function (iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  var WHY = 'Reviewing the first-team squad';

  async function call(body) {
    if (typeof staffAdminFetch !== 'function') return { ok: false, error: 'Please reload Staff HQ.' };
    var r = await staffAdminFetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, WHY);
    if (!r) return { ok: false, error: 'Sign-in was cancelled.' };
    var j = await r.json().catch(function () { return { ok: false, error: 'Unexpected reply (' + r.status + ').' }; });
    if (r.status === 403 && !j.error) j.error = 'Your account cannot change the squad.';
    return j;
  }
  function website(w) {
    if (!w) return '';
    return w.state === 'website_updated' ? '✓ ' + w.message : (w.state === 'queued' ? '… ' + w.message : '⚠ ' + w.message);
  }

  /* ── the welcome card ─────────────────────────────────────────────── */
  function mountCard() {
    var home = document.getElementById('dash-home');
    if (!home || document.getElementById('sq-card')) return;
    var hero = home.querySelector('.hq-hero');
    var card = document.createElement('section');
    card.id = 'sq-card'; card.className = 'sq-card'; card.setAttribute('aria-labelledby', 'sq-card-h');
    card.innerHTML = '<h2 id="sq-card-h">Is the first-team squad up to date?</h2>' +
      '<p>Please check new arrivals and departures, and add any missing player photographs before the next home programme.</p>' +
      '<div class="sq-facts" id="sq-facts" aria-live="polite"></div>' +
      '<div class="sq-acts"><button type="button" class="sq-btn sq-btn--main" data-sq="review">Review squad</button>' +
      '<button type="button" class="sq-btn" data-sq="photos">Upload player photos</button>' +
      '<button type="button" class="sq-btn sq-btn--quiet" data-sq="later">Remind me later</button></div>';
    if (hero && hero.nextSibling) home.insertBefore(card, hero.nextSibling); else home.appendChild(card);
    refreshCard();
  }
  async function refreshCard() {
    var facts = document.getElementById('sq-facts'); if (!facts) return;
    var tok = ''; try { tok = sessionStorage.getItem('rlfc_md_token') || ''; } catch (e) {}
    if (!tok) { facts.innerHTML = '<p class="sq-muted">Open “Review squad” and sign in with your own password to see what needs checking.</p>'; return; }
    var s = await call({ action: 'status' });
    if (!s.ok) { facts.innerHTML = '<p class="sq-muted">' + esc(s.error || 'Could not check the squad just now.') + '</p>'; return; }
    var card = document.getElementById('sq-card');
    if (!s.show) { card.hidden = true; return; }
    card.hidden = false;
    facts.innerHTML = '<ul>' +
      '<li><b>Last confirmed:</b> ' + (s.lastConfirmed ? esc(when(s.lastConfirmed.at)) + ' by ' + esc(s.lastConfirmed.by) : 'never') + '</li>' +
      '<li><b>Changes waiting for review:</b> ' + s.pendingCount + '</li>' +
      '<li><b>Players without a photo:</b> ' + s.missingHeadshots.length + (s.missingHeadshots.length ? ' (' + esc(s.missingHeadshots.slice(0, 6).map(function (p) { return p.name; }).join(', ')) + (s.missingHeadshots.length > 6 ? '…' : '') + ')' : '') + '</li>' +
      (s.nextHome ? '<li><b>Next home programme:</b> v ' + esc(s.nextHome.opponent) + ', ' + esc(new Date(s.nextHome.date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })) + '</li>' : '') +
      '</ul>' + (s.preview ? '<p class="sq-muted">Preview site: changes here are a rehearsal and never reach the live website.</p>' : '');
  }

  /* ── the review screen ────────────────────────────────────────────── */
  var overlay;
  function open(html) {
    if (!overlay) { overlay = document.createElement('div'); overlay.className = 'sq-overlay'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); document.body.appendChild(overlay); }
    overlay.innerHTML = '<div class="sq-sheet"><button type="button" class="sq-btn sq-close" data-sq="close">Close</button>' + html + '</div>';
    overlay.hidden = false;
    var f = overlay.querySelector('h2'); if (f) { f.tabIndex = -1; f.focus(); }
  }
  function close() { if (overlay) overlay.hidden = true; refreshCard(); }
  function note(msg, bad) { var n = overlay && overlay.querySelector('.sq-note'); if (n) { n.textContent = msg; n.className = 'sq-note' + (bad ? ' is-bad' : ''); } }

  var Q = null;
  async function review() {
    open('<h2>Squad changes to review</h2><p class="sq-note" role="status">Loading…</p>');
    Q = await call({ action: 'queue' });
    if (!Q.ok) { note(Q.error || 'Could not load the squad.', true); return; }
    var rows = Q.proposals.map(function (p) {
      var ev = (p.evidence || []).map(function (e) { return '<li>' + esc(e.source || '') + (e.season ? ', ' + esc(e.season) : '') + (e.checkedAt ? ', checked ' + esc(when(e.checkedAt)) : '') + (e.note ? ' — ' + esc(e.note) : '') + (e.url && /^https?:\/\//i.test(e.url) ? ' <a href="' + esc(e.url) + '" target="_blank" rel="noopener">source</a>' : '') + '</li>'; }).join('');
      var cands = (p.candidates || []).map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + ' (' + esc(c.status) + ')</option>'; }).join('');
      var acts = p.kind === 'departure'
        ? '<button type="button" class="sq-btn sq-btn--main" data-res="departed" data-id="' + esc(p.id) + '">Mark as departed</button>'
        : p.kind === 'duplicate' ? ''
        : '<label>Position <select data-pos="' + esc(p.id) + '"><option value="">Choose…</option><option>Goalkeeper</option><option>Defender</option><option>Midfielder</option><option>Forward</option></select></label>' +
          '<button type="button" class="sq-btn sq-btn--main" data-res="add" data-id="' + esc(p.id) + '">Add to squad</button>' +
          (cands ? '<label>Same as <select data-same="' + esc(p.id) + '">' + cands + '</select></label><button type="button" class="sq-btn" data-res="same" data-id="' + esc(p.id) + '">Same player</button>' : '');
      return '<li class="sq-item"><p class="sq-q">' + esc(p.question) + '</p><ul class="sq-ev">' + ev + '</ul><div class="sq-acts">' + acts +
        '<button type="button" class="sq-btn sq-btn--quiet" data-res="ignore" data-id="' + esc(p.id) + '">Ignore</button></div></li>';
    }).join('');
    var players = Q.players.filter(function (p) { return p.status !== 'left' && p.status !== 'released'; }).map(function (p) {
      return '<li class="sq-player"><span>' + esc(p.name) + ' <small>' + esc(p.position) + '</small></span><span class="sq-tag">' + esc(p.status.replace('_', ' ')) + '</span>' +
        '<select data-status="' + esc(p.id) + '" aria-label="Status for ' + esc(p.name) + '"><option value="">Change status…</option><option value="active">Active</option><option value="on_loan">On loan</option><option value="needs_review">Needs review</option></select>' +
        '<button type="button" class="sq-btn sq-btn--quiet" data-depart="' + esc(p.id) + '">Report as left…</button></li>';
    }).join('');
    var src = (Q.sources && Q.sources.registry) || {};
    open('<h2>Squad changes to review</h2><p class="sq-note" role="status"></p>' +
      '<section><h3>Waiting for a decision (' + Q.proposals.length + ')</h3>' + (rows ? '<ul class="sq-list">' + rows + '</ul>' : '<p class="sq-muted">Nothing waiting. Check the sources or add names from an announcement below.</p>') + '</section>' +
      '<section><h3>Check the sources</h3><p class="sq-muted">The club football registry (Football Web Pages / FA Full-Time line-ups). A line-up shows a player appeared — not that they are registered or still in the squad. Nobody is ever removed because they are missing from it.' +
      (src.lastOkAt ? ' Last checked ' + esc(when(src.lastOkAt)) + '.' : '') + (src.lastError ? ' Last attempt failed: ' + esc(src.lastError) : '') + '</p>' +
      '<button type="button" class="sq-btn" data-sq="refresh">Check sources now</button></section>' +
      '<section><h3>Add names from an announcement</h3><label>Where are they from? (link or name of the source)<input id="sq-src" class="sq-in"></label><label>Names, one per line<textarea id="sq-names" class="sq-in" rows="4"></textarea></label><button type="button" class="sq-btn" data-sq="import">Add to the review list</button></section>' +
      '<section><h3>Current squad (' + Q.players.filter(function (p) { return ['active', 'injured', 'on_loan'].indexOf(p.status) > -1; }).length + ')</h3><ul class="sq-list">' + players + '</ul></section>' +
      '<section class="sq-confirm"><h3>All checked?</h3><p class="sq-muted">This records that you have reviewed the squad today. It does not clear questions that are still waiting.</p><button type="button" class="sq-btn sq-btn--main" data-sq="confirm">Confirm squad is current</button></section>');
  }

  async function resolve(id, decision) {
    var body = { action: 'resolve', proposalId: id, decision: decision };
    if (decision === 'add') { var pos = overlay.querySelector('[data-pos="' + CSS.escape(id) + '"]'); body.position = pos ? pos.value : ''; }
    if (decision === 'same') { body.playerId = overlay.querySelector('[data-same="' + CSS.escape(id) + '"]').value; }
    note('Saving…');
    var r = await call(body);
    if (r.duplicate) {
      if (confirm(r.error + '\n\nSimilar: ' + r.matches.map(function (m) { return m.name; }).join(', ') + '\n\nAdd as a DIFFERENT person anyway?')) { body.confirmNotDuplicate = true; r = await call(body); }
      else { note('Not added. Use “Same player” if it is one of them.'); return; }
    }
    if (!r.ok) { note(r.error || 'Not saved.', true); return; }
    await review();
    note(r.already ? r.message : 'Saved. ' + website(r.website));
  }

  /* ── photos ──────────────────────────────────────────────────────── */
  var roster = [];
  async function photos() {
    open('<h2>Upload player photos</h2><p class="sq-note" role="status">Loading the squad…</p>');
    var q = await call({ action: 'queue' });
    if (!q.ok) { note(q.error || 'Could not load the squad.', true); return; }
    roster = q.players.filter(function (p) { return ['active', 'injured', 'on_loan', 'needs_review'].indexOf(p.status) > -1; });
    open('<h2>Upload player photos</h2><p class="sq-note" role="status"></p>' +
      '<p>Choose photos from your phone or computer — one or several at once. Use approved club photos only. Each photo is matched to a player you choose; a photo never creates a new player.</p>' +
      '<label class="sq-btn sq-btn--main" for="sq-files">Choose photos…</label><input id="sq-files" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple hidden>' +
      '<p class="sq-muted">iPhone photos in HEIC format: if a photo will not open, set Settings → Camera → Formats → Most Compatible, or share the photo and choose “Save as JPEG”.</p>' +
      '<ul class="sq-list" id="sq-photo-list"></ul>');
  }
  function suggest(fileName) {
    var base = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_\-.]+/g, ' ').toLowerCase().trim();
    var exact = roster.filter(function (p) { return p.name.toLowerCase() === base; });
    if (exact.length === 1) return { id: exact[0].id, sure: false };
    var parts = base.split(' ');
    var hits = roster.filter(function (p) { var n = p.name.toLowerCase(); return parts.length && parts.every(function (w) { return w.length > 1 && n.indexOf(w) > -1; }); });
    return hits.length === 1 ? { id: hits[0].id, sure: false } : { id: '', ambiguous: hits.length > 1 };
  }
  async function decode(file) {
    try { if (window.createImageBitmap) return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* fall back */ }
    return new Promise(function (ok, no) { var u = URL.createObjectURL(file), im = new Image(); im.onload = function () { ok(im); }; im.onerror = no; im.src = u; });
  }
  var items = [];
  async function addFiles(files) {
    var list = document.getElementById('sq-photo-list');
    for (var i = 0; i < files.length; i++) {
      var f = files[i], it = { file: f, zoom: 1, dx: 0, dy: 0, idx: items.length };
      var li = document.createElement('li'); li.className = 'sq-photo'; list.appendChild(li);
      if (f.size > 25 * 1024 * 1024) { li.innerHTML = '<p class="is-bad">' + esc(f.name) + ' is too large to use (over 25 MB).</p>'; continue; }
      try { it.img = await decode(f); }
      catch (e) { li.innerHTML = '<p class="is-bad">' + esc(f.name) + ' could not be opened. If it is an iPhone HEIC photo, save it as JPEG first (see above).</p>'; continue; }
      items.push(it); it.li = li;
      var s = suggest(f.name);
      li.innerHTML = '<canvas width="240" height="300" class="sq-crop" aria-label="Preview of ' + esc(f.name) + '"></canvas><div class="sq-photo__ctl">' +
        '<label>Player<select data-player="' + it.idx + '"><option value="">Choose the player…</option>' + roster.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id == s.id ? ' selected' : '') + '>' + esc(p.name) + (p.photo ? ' (has a photo)' : '') + '</option>'; }).join('') + '</select></label>' +
        (s.id ? '<p class="sq-muted">Suggested from the file name “' + esc(f.name) + '” — check it is right.</p>' : s.ambiguous ? '<p class="sq-muted">The file name matches more than one player — choose who it is.</p>' : '') +
        '<div class="sq-acts"><button type="button" class="sq-btn" data-zoom="' + it.idx + '" data-d="0.1">Zoom in</button><button type="button" class="sq-btn" data-zoom="' + it.idx + '" data-d="-0.1">Zoom out</button>' +
        '<button type="button" class="sq-btn" data-move="' + it.idx + '" data-x="0" data-y="-20">Up</button><button type="button" class="sq-btn" data-move="' + it.idx + '" data-x="0" data-y="20">Down</button>' +
        '<button type="button" class="sq-btn" data-move="' + it.idx + '" data-x="-20" data-y="0">Left</button><button type="button" class="sq-btn" data-move="' + it.idx + '" data-x="20" data-y="0">Right</button></div>' +
        '<label class="sq-check"><input type="checkbox" data-consent="' + it.idx + '"> The player has agreed to this photo being used on the website and in programmes.</label>' +
        '<label class="sq-check"><input type="checkbox" data-guardian="' + it.idx + '"> Under 18 only: a parent or guardian has agreed.</label>' +
        '<button type="button" class="sq-btn sq-btn--main" data-save="' + it.idx + '">Save photo</button><p class="sq-res" aria-live="polite"></p></div>';
      draw(it);
    }
  }
  // 4:5 portrait crop centred on the image, adjusted by zoom and position.
  function region(it) {
    var W = it.img.width, H = it.img.height, ar = 4 / 5;
    var cw = Math.min(W, H * ar) / it.zoom, ch = cw / ar;
    var x = (W - cw) / 2 + it.dx * (cw / 240), y = (H - ch) / 2 + it.dy * (ch / 300);
    x = Math.max(0, Math.min(W - cw, x)); y = Math.max(0, Math.min(H - ch, y));
    return { x: x, y: y, w: cw, h: ch };
  }
  function draw(it) { var c = it.li.querySelector('canvas'), g = c.getContext('2d'), r = region(it); g.drawImage(it.img, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height); }
  function jpeg(it, maxW, q, whole) {
    var r = whole ? { x: 0, y: 0, w: it.img.width, h: it.img.height } : region(it);
    var s = Math.min(1, maxW / r.w), c = document.createElement('canvas');
    c.width = Math.round(r.w * s); c.height = Math.round(r.h * s);
    c.getContext('2d').drawImage(it.img, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);   // re-encoding drops EXIF and location data
  }
  async function save(i) {
    var it = items.filter(function (x) { return x.idx === i; })[0], li = it.li, res = li.querySelector('.sq-res');
    var pid = li.querySelector('[data-player]').value;
    if (!pid) { res.textContent = 'Choose which player this is first.'; return; }
    res.textContent = 'Saving…';
    var body = { playerId: pid, web: jpeg(it, 800, 0.85), original: jpeg(it, 2600, 0.9, true),
      consentConfirmed: li.querySelector('[data-consent]').checked, guardianConsent: li.querySelector('[data-guardian]').checked };
    var r = await staffAdminFetch(PHOTO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'Saving a player photo');
    var j = r ? await r.json().catch(function () { return { ok: false, error: 'Unexpected reply.' }; }) : { ok: false, error: 'Sign-in was cancelled.' };
    res.textContent = j.ok ? 'Saved. ' + website(j.website) : (j.error || 'Not saved.') + (j.retry ? ' You can press Save again.' : '');
    res.className = 'sq-res' + (j.ok ? '' : ' is-bad');
  }

  /* ── events ─────────────────────────────────────────────────────── */
  document.addEventListener('click', async function (e) {
    var t = e.target.closest('[data-sq],[data-res],[data-zoom],[data-move],[data-save],[data-depart]'); if (!t) return;
    var a = t.dataset.sq;
    if (a === 'review') return review();
    if (a === 'photos') { items = []; return photos(); }
    if (a === 'close') return close();
    if (a === 'later') { var r0 = await call({ action: 'remind_later', days: 3 }); if (r0.ok) document.getElementById('sq-card').hidden = true; else if (typeof toast === 'function') toast(r0.error || 'Could not save that.', true); return; }
    if (a === 'refresh') { note('Checking…'); var r1 = await call({ action: 'refresh' }); await review(); note(r1.ok ? 'Checked ' + r1.checked + ' registry records; ' + r1.added + ' new item(s) to review.' : r1.error, !r1.ok); return; }
    if (a === 'import') { var r2 = await call({ action: 'import', sourceUrl: document.getElementById('sq-src').value, sourceName: document.getElementById('sq-src').value, names: document.getElementById('sq-names').value }); await review(); note(r2.ok ? r2.added + ' name(s) added to the review list.' : r2.error, !r2.ok); return; }
    if (a === 'confirm') { var r3 = await call({ action: 'confirm_current' }); note(r3.ok ? 'Recorded: squad confirmed by ' + r3.confirmed.by + ' at ' + when(r3.confirmed.at) + '.' : r3.error, !r3.ok); return; }
    if (t.dataset.res) return resolve(t.dataset.id, t.dataset.res);
    if (t.dataset.depart) {
      var src = prompt('Where is the departure confirmed? Paste the link to the announcement, or note who confirmed it.\n(A missing team sheet is not evidence.)');
      if (!src) return;
      var link = /^https?:\/\//i.test(src.trim());
      var r4 = await call({ action: 'report_departure', playerId: t.dataset.depart, sourceUrl: link ? src.trim() : '', note: link ? '' : src.trim() });
      await review(); note(r4.ok ? 'Added to the review list — confirm it with “Mark as departed”.' : r4.error, !r4.ok); return;
    }
    if (t.dataset.zoom != null) { var z = items.filter(function (x) { return x.idx == t.dataset.zoom; })[0]; z.zoom = Math.max(1, Math.min(3, z.zoom + Number(t.dataset.d))); draw(z); return; }
    if (t.dataset.move != null) { var m = items.filter(function (x) { return x.idx == t.dataset.move; })[0]; m.dx += Number(t.dataset.x); m.dy += Number(t.dataset.y); draw(m); return; }
    if (t.dataset.save != null) return save(Number(t.dataset.save));
  });
  document.addEventListener('change', async function (e) {
    if (e.target.id === 'sq-files') return addFiles(e.target.files);
    if (e.target.dataset && e.target.dataset.status && e.target.value) {
      note('Saving…');
      var r = await call({ action: 'set_status', playerId: e.target.dataset.status, status: e.target.value });
      await review(); note(r.ok ? 'Saved. ' + website(r.website) : r.error, !r.ok);
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay && !overlay.hidden) close(); });

  // Mount when Staff HQ's home screen appears.
  var tries = 0, iv = setInterval(function () {
    var home = document.getElementById('dash-home');
    if (home && home.style.display !== 'none') { mountCard(); clearInterval(iv); }
    if (++tries > 600) clearInterval(iv);
  }, 500);
})();
