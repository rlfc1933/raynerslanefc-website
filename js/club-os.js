/* ════════════════════════════════════════════════════════════════════════
   CLUB OS — Staff HQ screens for the club's working records.
   One engine, eight areas, identical behaviour everywhere:
     list → open a record → change what's true → move it to its next stage.
   The server (netlify/functions/club-os.js) decides what is allowed; this
   file only ever asks, shows the answer, and explains a refusal in plain words.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var API = '/.netlify/functions/club-os';
  var ACTOR_KEY = 'rlfc_actor';

  // ── who is working (every change is signed) ────────────────────────────
  function actor() { try { return localStorage.getItem(ACTOR_KEY) || ''; } catch (e) { return ''; } }
  function askActor(force) {
    var cur = actor();
    if (cur && !force) return cur;
    var n = prompt('Your name — so the club knows who made each change (e.g. "Pete Singh").', cur || '');
    n = (n || '').trim().slice(0, 80);
    if (n) { try { localStorage.setItem(ACTOR_KEY, n); } catch (e) {} }
    paintActor();
    return n;
  }
  function paintActor() { document.querySelectorAll('[data-cos-actor]').forEach(function (el) { el.textContent = actor() || 'Set your name'; }); }

  function call(action, body) {
    var b = Object.assign({ action: action, pin: global.PIN || '', actor: actor() }, body || {});
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'The server answered with something unreadable (' + r.status + ').' }; }); })
      .catch(function () { return { ok: false, error: 'No connection — nothing was saved. Check signal and try again.', offline: true }; });
  }
  function write(action, body) {
    if (!actor() && !askActor()) return Promise.resolve({ ok: false, error: 'Add your name first — every change is signed.' });
    return call(action, body);
  }

  // ── helpers ─────────────────────────────────────────────────────────────
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lbl(s) { s = String(s || '').replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); }
  function money(p) { return p == null ? '—' : '£' + (p / 100).toLocaleString('en-GB', { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 }); }
  function day(d) { if (!d) return ''; var x = new Date(d + (d.length === 10 ? 'T12:00:00Z' : '')); return x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: x.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function dueChip(d, closed) {
    if (!d) return closed ? '' : '<span class="cos-chip cos-chip--muted">No date</span>';
    if (closed) return '<span class="cos-chip cos-chip--muted">' + day(d) + '</span>';
    var t = today();
    if (d < t) return '<span class="cos-chip cos-chip--late">Overdue · ' + day(d) + '</span>';
    if (d === t) return '<span class="cos-chip cos-chip--today">Today</span>';
    return '<span class="cos-chip">' + day(d) + '</span>';
  }
  var CLOSED = ['done', 'cancelled', 'closed', 'won', 'lost', 'not_interested', 'not_applicable', 'paid', 'void', 'replied', 'withdrawn',
    'ineligible', 'awarded', 'declined', 'complete', 'published', 'shared'];
  function stageChip(s) { var c = CLOSED.indexOf(s) > -1 ? ' cos-stage--closed' : (/late|overdue|blocked/.test(s) ? ' cos-stage--warn' : ''); return '<span class="cos-stage' + c + '">' + h(lbl(s)) + '</span>'; }
  function toast(msg, bad) { if (global.toast) global.toast(msg, bad); else alert(msg); }

  // Status feedback (Motion mini, 8 KB, HQ only): after a change, the thing that
  // changed settles into place so the eye finds it. Never on load, never decorative,
  // and nothing at all under reduced motion.
  var _motion = null;
  function settle(els) {
    els = [].filter.call(els || [], Boolean); if (!els.length) return;
    var reduce = (global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.documentElement.classList.contains('a11y-reduce-motion');
    if (reduce) return;
    (_motion = _motion || import('/js/vendor/motion-mini-13.4.3.mjs')).then(function (m) {
      els.forEach(function (el, i) { m.animate(el, { opacity: [0.35, 1], transform: ['translateY(6px)', 'translateY(0)'] }, { duration: 0.24, delay: Math.min(i, 12) * 0.03, ease: [0.22, 1, 0.36, 1] }); });
    }).catch(function () {});
  }

  function notSetUp(el, r) {
    el.innerHTML = '<div class="cos-empty"><strong>Not connected yet.</strong><p>' + h(r.error) + '</p></div>';
  }

  // ── area configuration ─────────────────────────────────────────────────
  // fields: what a person fills in. `k` maps to the API: title, owner, due_date,
  // next_action, value, estimate, in_kind, or data.<key>.
  var F = {
    title: { k: 'title', label: 'Title', req: true },
    owner: { k: 'owner', label: 'Owner (who is responsible)' },
    due: { k: 'due_date', label: 'Due date', type: 'date' },
    next: { k: 'next_action', label: 'Next action' },
    value: { k: 'value', label: 'Agreed value (£)', type: 'money' },
    estimate: { k: 'estimate', label: 'Estimated value (£)', type: 'money' },
    inkind: { k: 'in_kind', label: 'In-kind (goods/services, not cash)', type: 'check' },
    notes: { k: 'data.notes', label: 'Notes', type: 'area' },
  };
  function d(key, label, type, opts) { return { k: 'data.' + key, label: label, type: type, opts: opts }; }

  var AREAS = {
    commercial: { kinds: [
      { kind: 'enquiry', tab: 'Enquiries', blurb: 'Sponsorship enquiries from the website land here automatically, with the 48-hour reply clock running. Give each one an owner.',
        fields: [F.title, F.owner, F.due, F.next, d('interest', 'Interested in'), d('budget', 'Indicative budget'), d('message', 'Their message', 'area'), F.notes] },
      { kind: 'opportunity', tab: 'Pipeline', blurb: 'Every deal from first idea to signed. Compliance (can we contact them?) lives on the organisation, separate from the commercial stage.',
        fields: [F.title, F.owner, F.due, F.next, d('package', 'Package', 'select', 'inventory'), d('season', 'Season', 'text'), F.estimate, F.value, F.inkind,
          d('renewal_date', 'Renewal date', 'date'), d('proposal_link', 'Proposal document (link)'), d('contract_link', 'Contract (link)'), F.notes] },
      { kind: 'invoice', tab: 'Invoices', blurb: 'Draft → approved by a named person → issued (number assigned) → paid from bank evidence. Nothing is sent or charged from here.',
        fields: [F.title, F.owner, F.due, F.value, d('terms_days', 'Payment terms (days)', 'number'), d('vat', 'VAT treatment'), d('bill_to', 'Bill to (address)', 'area'), F.notes], pay: true },
      { kind: 'fulfilment', tab: 'Fulfilment', blurb: 'Created automatically when a deal is won — what the club promised, and proof it was delivered.',
        fields: [F.title, F.owner, F.due, d('evidence_link', 'Evidence (link/photo)'), F.notes] },
    ], orgs: true, inventory: true },
    outreach: { kinds: [
      { kind: 'outreach', tab: 'Approaches', blurb: 'Draft → approved by someone else → sent from the club mailbox → logged. Sending is refused here unless the business may lawfully be contacted and is not suppressed.',
        fields: [F.title, F.owner, d('to', 'To (email)'), d('subject', 'Subject'), d('body', 'Message', 'area'), d('offer', 'What we are offering'), F.next, F.due, F.notes], send: true },
      { kind: 'opportunity', tab: 'Prospects in pipeline', blurb: 'Prospects you have qualified. Research → Qualified → Contact approved → Contacted …', fields: null },
    ], orgs: 'prospect', suppression: true, ch: true },
    funding: { kinds: [
      { kind: 'grant', tab: 'Grants & funding', blurb: 'Every opportunity carries its source, the date it was checked and a written eligibility assessment. Nothing is submitted from here; “Submitted” needs the funder’s reference.',
        fields: [F.title, F.owner, F.due, F.next, d('source_url', 'Official source (link)'), d('last_verified', 'Last verified', 'date'), d('amount', 'Potential amount'),
          d('eligibility_note', 'Eligibility assessment', 'area'), d('match_funding', 'Match funding needed'), d('evidence_needed', 'Missing evidence checklist', 'area'), d('draft_link', 'Draft application (link)'), F.notes] },
    ] },
    compliance: { kinds: [
      { kind: 'compliance', tab: 'Compliance register', blurb: 'What the club must do, by when, who owns it, and where the evidence is. Due dates come from the real documents — none are guessed. Welfare and DBS records stay with the Welfare Officer, never here.',
        fields: [F.title, F.owner, F.due, F.next, d('authority', 'Governing authority'), d('source_url', 'Source (link)'), d('role', 'Club role'), d('evidence', 'Evidence location'), d('last_reviewed', 'Last reviewed', 'date'), F.notes] },
    ] },
    commsdesk: { kinds: [
      { kind: 'comms', tab: 'Comms approvals', blurb: 'Draft → review → approved by someone other than the writer → scheduled → published. Verify scores, names and quotes before approval. “Published” means it is actually live — record the link.',
        fields: [F.title, F.owner, F.due, d('channel', 'Channel', 'select', ['Website news', 'Instagram', 'X', 'Facebook', 'Newsletter', 'Press release', 'Programme']),
          d('body', 'Copy', 'area'), d('facts_checked', 'Facts checked (scores, names, quotes)', 'check'), d('permissions', 'Permissions (player/photo)'), d('publish_at', 'Publish at', 'datetime-local'), d('live_link', 'Live link (once published)'), F.notes] },
    ] },
    coaching: { kinds: [
      { kind: 'analysis', tab: 'Match analysis', blurb: 'Manually tagged events from authorised footage (or Kinovea exports). No ratings or xG are invented — only what a coach saw and timestamped.',
        fields: [F.title, F.owner, d('fixture', 'Fixture / date'), d('footage', 'Footage (link — club-authorised only)'), d('summary', 'Coaching summary', 'area'),
          d('priorities', 'Training priorities', 'area'), F.notes], events: true },
    ] },
    clubtasks: { kinds: [
      { kind: 'task', tab: 'Club tasks', blurb: 'Anything someone has to do. Matchday checklists are created here from the next home fixture.',
        fields: [F.title, F.owner, F.due, F.next, d('area', 'Area', 'select', ['Matchday', 'Commercial', 'Football', 'Finance', 'Governance', 'Communications', 'Community', 'Ground', 'Other']), F.notes] },
    ], matchday: true },
  };
  var EVENT_TYPES = ['Goal', 'Shot on target', 'Shot off target', 'Big chance', 'Defensive error', 'Successful press', 'Unsuccessful press', 'Corner',
    'Free kick', 'Penalty', 'High turnover', 'Possession lost', 'Substitution', 'Tactical adjustment', 'Set piece', 'Other'];

  // What a stage move needs from a person, asked at the moment of the move.
  var NEEDS = {
    'opportunity:won': [{ k: 'value', q: 'Agreed value in £ (leave blank if this is purely in-kind and you ticked in-kind):' }],
    'opportunity:contacted': [{ k: 'owner', q: 'Who owns this relationship?', ifMissing: 'owner' }],
    'enquiry:assigned': [{ k: 'owner', q: 'Who will reply? (They get a task due in 2 days.)', ifMissing: 'owner' }],
    'invoice:void': [{ k: 'reason', q: 'Why is this invoice being voided?' }],
    'grant:eligible': [{ k: 'eligibility_note', q: 'Why is the club eligible? (entity type, step level, project)' }],
    'grant:ineligible': [{ k: 'reason', q: 'Why not eligible?' }],
    'grant:submitted': [{ k: 'reference', q: 'Funder’s confirmation / reference number:' }],
    'grant:preparing': [{ k: 'owner', q: 'Who is preparing the application?', ifMissing: 'owner' }],
    'compliance:complete': [{ k: 'evidence', q: 'Where is the evidence? (document, reference, who holds it)' }],
    'compliance:in_progress': [{ k: 'owner', q: 'Who owns this?', ifMissing: 'owner' }],
    'comms:review': [{ k: 'owner', q: 'Who wrote it / owns it?', ifMissing: 'owner' }],
    'comms:scheduled': [{ k: 'publish_at', q: 'Publish date and time (e.g. 2026-10-17 09:00):' }],
    'outreach:sent': [{ k: 'channel', q: 'Sent how? (e.g. "club mailbox info@raynerslanefc.co.uk")' }],
  };
  var DANGER = { void: 1, lost: 1, not_interested: 1, withdrawn: 1, cancelled: 1, ineligible: 1, declined: 1 };

  // ── panel renderer ─────────────────────────────────────────────────────
  var state = {};
  function mount(area) {
    var el = document.querySelector('[data-cos="' + area + '"]'); if (!el) return;
    var cfg = AREAS[area]; state[area] = state[area] || { tab: 0 };
    var st = state[area];
    var tabs = cfg.kinds.map(function (k, i) { return '<button class="cos-tab' + (st.tab === i ? ' is-on' : '') + '" data-tab="' + i + '">' + h(k.tab) + '</button>'; });
    if (cfg.orgs) tabs.push('<button class="cos-tab' + (st.tab === 'orgs' ? ' is-on' : '') + '" data-tab="orgs">' + (cfg.orgs === 'prospect' ? 'Businesses' : 'Organisations') + '</button>');
    if (cfg.inventory) tabs.push('<button class="cos-tab' + (st.tab === 'inv' ? ' is-on' : '') + '" data-tab="inv">Inventory</button>');
    if (cfg.suppression) tabs.push('<button class="cos-tab' + (st.tab === 'sup' ? ' is-on' : '') + '" data-tab="sup">Do-not-contact</button>');
    el.innerHTML = '<div class="cos-bar"><div class="cos-tabs" role="tablist">' + tabs.join('') + '</div>' +
      '<button class="cos-who" type="button" title="Change who is working"><span class="cos-who__k">Working as</span> <b data-cos-actor>' + h(actor() || 'Set your name') + '</b></button></div>' +
      '<div class="cos-body" aria-live="polite"><div class="cos-loading">Loading…</div></div>';
    el.querySelectorAll('.cos-tab').forEach(function (b) { b.onclick = function () { var t = b.getAttribute('data-tab'); st.tab = /^\d+$/.test(t) ? +t : t; mount(area); }; });
    el.querySelector('.cos-who').onclick = function () { askActor(true); };
    var body = el.querySelector('.cos-body');
    if (st.tab === 'orgs') return renderOrgs(area, body, cfg);
    if (st.tab === 'inv') return renderInventory(body);
    if (st.tab === 'sup') return renderSuppression(area, body);
    renderList(area, body, cfg.kinds[st.tab], cfg);
  }

  function renderList(area, body, k, cfg) {
    var st = state[area];
    call('list', { kind: k.kind }).then(function (r) {
      if (!r.ok) return r.notSetUp ? notSetUp(body, r) : (body.innerHTML = '<div class="cos-empty">' + h(r.error) + '</div>');
      var showClosed = !!st.showClosed;
      var items = (r.items || []).filter(function (i) { return showClosed || CLOSED.indexOf(i.stage) < 0; });
      var closedN = (r.items || []).length - (r.items || []).filter(function (i) { return CLOSED.indexOf(i.stage) < 0; }).length;
      var html = '<p class="cos-blurb">' + h(k.blurb) + '</p><div class="cos-actions">' +
        (k.fields ? '<button class="cos-btn cos-btn--primary" data-new>+ New</button>' : '') +
        (cfg.matchday ? '<button class="cos-btn" data-matchday>Create checklist for next home match</button>' : '') +
        '<label class="cos-toggle"><input type="checkbox" data-closed ' + (showClosed ? 'checked' : '') + '> Show finished (' + closedN + ')</label>' +
        '<button class="cos-btn cos-btn--ghost" data-export>Export CSV</button></div>';
      if (!items.length) html += '<div class="cos-empty"><strong>Nothing open.</strong><p>' + (k.fields ? 'Add the first one with “+ New”.' : 'Qualified prospects appear here.') + '</p></div>';
      else html += '<ul class="cos-list">' + items.map(function (i) {
        var closed = CLOSED.indexOf(i.stage) > -1;
        var meta = [i.owner ? h(i.owner) : '<span class="cos-warn">No owner</span>'];
        if (i.value_pence != null) meta.push(money(i.value_pence) + (i.kind === 'invoice' && i.paid_pence ? ' · paid ' + money(i.paid_pence) : ''));
        else if (i.estimate_pence != null) meta.push('est. ' + money(i.estimate_pence));
        if (i.in_kind) meta.push('in-kind');
        return '<li><button class="cos-row" data-id="' + i.id + '"><span class="cos-row__t">' + h(i.title) + '</span>' +
          '<span class="cos-row__m">' + stageChip(i.stage) + ' ' + dueChip(i.due_date, closed) + ' <span class="cos-row__who">' + meta.join(' · ') + '</span></span>' +
          (i.next_action && !closed ? '<span class="cos-row__n">Next: ' + h(i.next_action) + '</span>' : '') + '</button></li>';
      }).join('') + '</ul>';
      body.innerHTML = html;
      var nb = body.querySelector('[data-new]'); if (nb) nb.onclick = function () { openEditor(area, k, null); };
      var md = body.querySelector('[data-matchday]'); if (md) md.onclick = function () { matchdayChecklist(area); };
      body.querySelector('[data-closed]').onchange = function (e) { st.showClosed = e.target.checked; renderList(area, body, k, cfg); };
      body.querySelector('[data-export]').onclick = function () { exportCsv(k.kind); };
      body.querySelectorAll('.cos-row').forEach(function (b) { b.onclick = function () { openRecord(area, k, b.getAttribute('data-id')); }; });
    });
  }

  // ── record drawer ──────────────────────────────────────────────────────
  function drawer(html) {
    var dl = document.getElementById('cos-drawer');
    if (!dl) {
      dl = document.createElement('dialog'); dl.id = 'cos-drawer'; dl.className = 'cos-drawer';
      dl.addEventListener('click', function (e) { if (e.target === dl) dl.close(); });
      document.body.appendChild(dl);
    }
    dl.innerHTML = '<div class="cos-drawer__in"><button class="cos-x" aria-label="Close" data-close>&times;</button>' + html + '</div>';
    dl.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = function () { dl.close(); }; });
    if (!dl.open) dl.showModal();
    return dl;
  }
  function fieldVal(item, f) {
    if (f.k.indexOf('data.') === 0) return ((item && item.data) || {})[f.k.slice(5)];
    if (f.k === 'value') return item && item.value_pence != null ? item.value_pence / 100 : '';
    if (f.k === 'estimate') return item && item.estimate_pence != null ? item.estimate_pence / 100 : '';
    return item ? item[f.k] : '';
  }
  function inputFor(f, v, i) {
    var id = 'cosf-' + i, opts = f.opts === 'inventory' ? (global.ClubOSInventory || []).map(function (p) { return [p.key, p.name]; }) : (f.opts || []).map(function (o) { return [o, o]; });
    var lab = '<label class="cos-fl" for="' + id + '">' + h(f.label) + (f.req ? ' *' : '') + '</label>';
    if (f.type === 'area') return '<div class="cos-f">' + lab + '<textarea id="' + id + '" rows="4">' + h(v || '') + '</textarea></div>';
    if (f.type === 'check') return '<div class="cos-f cos-f--check"><label><input type="checkbox" id="' + id + '" ' + (v ? 'checked' : '') + '> ' + h(f.label) + '</label></div>';
    if (f.type === 'select') return '<div class="cos-f">' + lab + '<select id="' + id + '"><option value="">—</option>' + opts.map(function (o) { return '<option value="' + h(o[0]) + '"' + (String(v) === String(o[0]) ? ' selected' : '') + '>' + h(o[1]) + '</option>'; }).join('') + '</select></div>';
    var type = f.type === 'money' ? 'text" inputmode="decimal' : (f.type || 'text');
    return '<div class="cos-f">' + lab + '<input id="' + id + '" type="' + type + '" value="' + h(v == null ? '' : v) + '"' + (f.req ? ' required' : '') + '></div>';
  }
  function readFields(dl, fields) {
    var out = { data: {} };
    fields.forEach(function (f, i) {
      var el = dl.querySelector('#cosf-' + i); if (!el) return;
      var v = f.type === 'check' ? el.checked : el.value.trim();
      if (f.k.indexOf('data.') === 0) out.data[f.k.slice(5)] = v === '' ? null : v; else out[f.k] = v;
    });
    return out;
  }

  function openEditor(area, k, item, extra) {
    var fields = k.fields;
    var html = '<h3 class="cos-h">' + (item ? 'Edit' : 'New') + ' — ' + h(k.tab) + '</h3><form class="cos-form" novalidate>' +
      fields.map(function (f, i) { return inputFor(f, item ? fieldVal(item, f) : (extra && extra[f.k]) || '', i); }).join('') +
      '<p class="cos-err" role="alert"></p><div class="cos-actions"><button class="cos-btn cos-btn--primary" type="submit">' + (item ? 'Save changes' : 'Create') + '</button>' +
      '<button class="cos-btn cos-btn--ghost" type="button" data-close>Cancel</button></div></form>';
    var dl = drawer(html);
    var form = dl.querySelector('form'), err = dl.querySelector('.cos-err'), btn = form.querySelector('[type=submit]');
    var key = 'ui:' + area + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 8);   // one form = one record, however often Save is pressed
    form.onsubmit = function (e) {
      e.preventDefault();
      var v = readFields(dl, fields);
      if (!item && !v.title) { err.textContent = 'Give it a title.'; return; }
      btn.disabled = true; btn.textContent = 'Saving…'; err.textContent = '';
      var p = item ? write('update', Object.assign({ id: item.id }, v)) : write('create', Object.assign({ kind: k.kind, idempotency_key: key }, extra && extra.org_id ? { org_id: extra.org_id } : {}, v));
      p.then(function (r) {
        btn.disabled = false; btn.textContent = item ? 'Save changes' : 'Create';
        if (!r.ok) { err.textContent = r.error; return; }
        toast(item ? 'Saved' : 'Created');
        dl.close(); mount(area);
        if (r.item) openRecord(area, k, r.item.id);
      });
    };
  }

  function openRecord(area, k, id, fx) {
    var dl = drawer('<div class="cos-loading">Loading…</div>');
    call('get', { id: id }).then(function (r) {
      if (!r.ok) { dl.querySelector('.cos-drawer__in').innerHTML = '<p class="cos-err">' + h(r.error) + '</p>'; return; }
      var it = r.item, cfgk = k.fields ? k : AREAS.commercial.kinds[1];
      var rows = (cfgk.fields || []).filter(function (f) { var v = fieldVal(it, f); return v !== '' && v != null && f.k !== 'title'; }).map(function (f) {
        var v = fieldVal(it, f);
        if (f.type === 'money') v = money(Math.round(v * 100)); else if (f.type === 'date') v = day(v); else if (f.type === 'check') v = v ? 'Yes' : 'No';
        var isLink = /^https?:\/\//.test(String(v));
        return '<div class="cos-kv"><dt>' + h(f.label) + '</dt><dd>' + (isLink ? '<a href="' + h(v) + '" target="_blank" rel="noopener">' + h(v) + '</a>' : h(v)).replace(/\n/g, '<br>') + '</dd></div>';
      });
      if (it.kind === 'invoice') rows.unshift('<div class="cos-kv"><dt>Invoice</dt><dd>' + h((it.data || {}).invoice_no || 'Number assigned when issued') + ' · ' + money(it.value_pence) + ' · paid ' + money(it.paid_pence) + '</dd></div>');
      if ((it.data || {}).approved_by) rows.push('<div class="cos-kv"><dt>Approved</dt><dd>' + h(it.data.approved_by) + ' · ' + day(String(it.data.approved_at).slice(0, 10)) + '</dd></div>');
      var org = r.org ? '<p class="cos-org">Organisation: <button class="cos-link" data-org="' + r.org.id + '">' + h(r.org.name) + '</button> · ' + h(lbl(r.org.relationship)) + ' · permission: ' + h(lbl(r.org.permission)) + '</p>' : '';
      var moves = (r.flow || []).map(function (to) { return '<button class="cos-btn' + (DANGER[to] ? ' cos-btn--danger' : '') + '" data-to="' + to + '">' + h(lbl(to)) + '</button>'; }).join('');
      var kids = (r.children || []).length ? '<h4 class="cos-h4">Linked records</h4><ul class="cos-kids">' + r.children.map(function (c) {
        var done = CLOSED.indexOf(c.stage) > -1;
        return '<li class="' + (done ? 'is-done' : '') + '">' + (c.kind === 'fulfilment' ? '<input type="checkbox" data-ful="' + c.id + '" data-stage="' + c.stage + '" ' + (c.stage === 'done' ? 'checked' : '') + ' aria-label="' + h(c.title) + ' done">' : '') +
          '<span>' + h(c.title) + '</span> ' + stageChip(c.stage) + (c.owner ? ' <small>' + h(c.owner) + '</small>' : '') + '</li>';
      }).join('') + '</ul>' : '';
      var events = k.events ? renderEvents(it) : '';
      var hist = '<details class="cos-hist"><summary>History (' + (r.history || []).length + ')</summary><ol>' + (r.history || []).map(function (a) {
        return '<li><time>' + new Date(a.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) + '</time> <b>' + h(a.actor) + '</b> ' + h(a.action) +
          (a.after && a.after.stage ? ' → ' + h(lbl(a.after.stage)) : '') + (a.note ? ' — ' + h(a.note) : '') + '</li>';
      }).join('') + '</ol></details>';
      var payBtn = it.kind === 'invoice' && ['issued', 'part_paid', 'overdue'].indexOf(it.stage) > -1 ? '<button class="cos-btn" data-pay>Record a payment</button>' : '';
      var sendBtn = it.kind === 'outreach' && it.stage === 'approved' ? '<a class="cos-btn" data-mailto href="#">Open in email</a>' : '';
      dl.querySelector('.cos-drawer__in').innerHTML = '<button class="cos-x" aria-label="Close" data-close>&times;</button>' +
        '<p class="cos-kicker">' + h(lbl(it.kind)) + '</p><h3 class="cos-h">' + h(it.title) + '</h3><p>' + stageChip(it.stage) + ' ' + dueChip(it.due_date, CLOSED.indexOf(it.stage) > -1) + ' ' + (it.owner ? 'Owner: <b>' + h(it.owner) + '</b>' : '<span class="cos-warn">No owner yet</span>') + '</p>' +
        org + '<dl class="cos-dl">' + rows.join('') + '</dl>' +
        '<div class="cos-actions">' + (k.fields ? '<button class="cos-btn" data-edit>Edit</button>' : '') + payBtn + sendBtn + '</div>' +
        (moves ? '<h4 class="cos-h4">Move to</h4><div class="cos-actions cos-moves">' + moves + '</div>' : '<p class="cos-muted">This record is finished.</p>') +
        '<p class="cos-err" role="alert"></p>' + events + kids + hist;
      var err = dl.querySelector('.cos-err');
      dl.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = function () { dl.close(); }; });
      var eb = dl.querySelector('[data-edit]'); if (eb) eb.onclick = function () { openEditor(area, k, it); };
      var ob = dl.querySelector('[data-org]'); if (ob) ob.onclick = function () { openOrg(area, ob.getAttribute('data-org')); };
      dl.querySelectorAll('[data-to]').forEach(function (b) {
        b.onclick = function () {
          var to = b.getAttribute('data-to'), ctx = { id: it.id, to: to };
          var needs = NEEDS[it.kind + ':' + to] || [];
          for (var i = 0; i < needs.length; i++) {
            var n = needs[i]; if (n.ifMissing && it[n.ifMissing]) continue;
            var v = prompt(n.q, ''); if (v === null) return; ctx[n.k] = v.trim();
          }
          if (DANGER[to] && !confirm('Move “' + it.title + '” to ' + lbl(to) + '?')) return;
          b.disabled = true; err.textContent = '';
          write('move', ctx).then(function (m) {
            b.disabled = false;
            if (!m.ok) { err.textContent = m.error; return; }
            toast(lbl(to) + (m.effects && m.effects.length ? ' · created ' + m.effects.length + ' follow-up record(s)' : ''));
            mount(area); openRecord(area, k, it.id, { moved: true });
          });
        };
      });
      dl.querySelectorAll('[data-ful]').forEach(function (c) {
        c.onchange = function () {
          write('move', { id: c.getAttribute('data-ful'), to: c.checked ? 'done' : 'todo' }).then(function (m) { if (!m.ok) { err.textContent = m.error; c.checked = !c.checked; } });
        };
      });
      var pb = dl.querySelector('[data-pay]'); if (pb) pb.onclick = function () {
        var amt = prompt('Amount received (£):', ''); if (!amt) return;
        var ev = prompt('How do you know? (bank reference and date)', ''); if (!ev) return;
        write('pay', { id: it.id, amount: amt, evidence: ev }).then(function (m) { if (!m.ok) { err.textContent = m.error; return; } toast('Payment recorded'); mount(area); openRecord(area, k, it.id); });
      };
      var mb = dl.querySelector('[data-mailto]'); if (mb) {
        var dd = it.data || {};
        mb.href = 'mailto:' + encodeURIComponent(dd.to || '') + '?subject=' + encodeURIComponent(dd.subject || '') + '&body=' + encodeURIComponent((dd.body || '') +
          '\n\n—\nRayners Lane FC · Tithe Farm, 151 Rayners Lane, Harrow HA2 0XH\nIf you would rather not hear from the club again, reply "no thanks" and we will remove you.');
      }
      if (k.events) wireEvents(dl, it, area, k);
      if (fx && fx.moved) settle([dl.querySelector('.cos-stage')].concat([].slice.call(dl.querySelectorAll('.cos-kids li'))));
    });
  }

  // ── match analysis: timestamped events ─────────────────────────────────
  function renderEvents(it) {
    var ev = ((it.data || {}).events || []);
    return '<h4 class="cos-h4">Tagged events (' + ev.length + ')</h4>' +
      '<form class="cos-ev-add"><input name="t" placeholder="mm:ss" pattern="\\d{1,3}:\\d{2}" aria-label="Time in footage (mm:ss)" required>' +
      '<select name="type" aria-label="Event">' + EVENT_TYPES.map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select>' +
      '<input name="who" placeholder="Player (optional)" aria-label="Player"><input name="note" placeholder="What happened" aria-label="Note">' +
      '<button class="cos-btn cos-btn--primary">Add</button></form>' +
      '<p class="cos-muted">Kinovea users: export key images as CSV and paste rows as “mm:ss, Event, Player, Note”.</p><textarea class="cos-ev-paste" rows="2" placeholder="Paste CSV rows…" aria-label="Paste events"></textarea><button class="cos-btn cos-btn--ghost" data-paste>Import pasted rows</button>' +
      (ev.length ? '<table class="cos-ev"><thead><tr><th>Time</th><th>Event</th><th>Player</th><th>Note</th><th>By</th></tr></thead><tbody>' +
        ev.slice().sort(function (a, b) { return secs(a.t) - secs(b.t); }).map(function (e) { return '<tr><td>' + h(e.t) + '</td><td>' + h(e.type) + '</td><td>' + h(e.who || '') + '</td><td>' + h(e.note || '') + '</td><td>' + h(e.by || '') + '</td></tr>'; }).join('') +
        '</tbody></table><p class="cos-muted">Totals: ' + countBy(ev) + '</p>' : '');
  }
  function secs(t) { var p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function countBy(ev) { var c = {}; ev.forEach(function (e) { c[e.type] = (c[e.type] || 0) + 1; }); return Object.keys(c).map(function (k) { return k + ' ' + c[k]; }).join(' · '); }
  function wireEvents(dl, it, area, k) {
    function save(add) {
      var ev = ((it.data || {}).events || []).concat(add);
      return write('update', { id: it.id, data: { events: ev } }).then(function (m) { if (!m.ok) { dl.querySelector('.cos-err').textContent = m.error; return; } openRecord(area, k, it.id); });
    }
    var f = dl.querySelector('.cos-ev-add');
    f.onsubmit = function (e) { e.preventDefault(); var fd = new FormData(f); if (!/^\d{1,3}:\d{2}$/.test(fd.get('t'))) return; save([{ t: fd.get('t'), type: fd.get('type'), who: fd.get('who'), note: fd.get('note'), by: actor() }]); };
    dl.querySelector('[data-paste]').onclick = function () {
      var rows = dl.querySelector('.cos-ev-paste').value.split('\n').map(function (l) { return l.split(',').map(function (x) { return x.trim(); }); })
        .filter(function (r) { return /^\d{1,3}:\d{2}$/.test(r[0]); }).map(function (r) { return { t: r[0], type: r[1] || 'Other', who: r[2] || '', note: r.slice(3).join(', '), by: actor() + ' (import)' }; });
      if (!rows.length) { dl.querySelector('.cos-err').textContent = 'No rows recognised — each line needs to start with mm:ss.'; return; }
      save(rows);
    };
  }

  // ── organisations ──────────────────────────────────────────────────────
  var ORG_FIELDS = [
    ['name', 'Name *'], ['relationship', 'Relationship', ['prospect', 'sponsor', 'former_sponsor', 'partner', 'funder', 'other']],
    ['kind', 'Type', ['business', 'funder', 'community', 'school', 'charity', 'other']], ['sector', 'Sector'], ['town', 'Town'], ['website', 'Website'],
    ['legal_form', 'Legal form (decides outreach rules)', ['unknown', 'limited_company', 'llp', 'plc', 'sole_trader', 'partnership', 'charity', 'public_body']],
    ['companies_house_no', 'Companies House number'], ['contact_name', 'Contact name'], ['contact_email', 'Business email'], ['contact_phone', 'Phone'],
    ['permission', 'Contact permission', ['research_only', 'corporate_lawful_basis', 'express_consent', 'existing_relationship', 'legal_review', 'opted_out', 'do_not_contact']],
    ['permission_note', 'Permission note (what was agreed, when)'], ['source_url', 'Where we found them (link)'], ['verified_at', 'Last verified (date)', 'date'],
    ['public_listing', 'Show on the website partner directory (club-approved only)', 'check'], ['notes', 'Notes', 'area'],
  ];
  var SCORE_F = [['proximity', 'Local (Rayners Lane, Harrow, Pinner…)'], ['audience', 'Our supporters are their customers'], ['community', 'Community connection'],
    ['packageFit', 'A package fits their size'], ['activity', 'Publicly active business'], ['contactable', 'Verified contact & permission'], ['value', 'Likely partnership value'], ['known', 'We have the facts (not guesses)']];

  function renderOrgs(area, body, cfg) {
    call('orgs', { relationship: cfg.orgs === 'prospect' ? 'prospect' : undefined }).then(function (r) {
      if (!r.ok) return r.notSetUp ? notSetUp(body, r) : (body.innerHTML = '<div class="cos-empty">' + h(r.error) + '</div>');
      var list = r.orgs || [];
      body.innerHTML = '<p class="cos-blurb">' + (cfg.orgs === 'prospect' ? 'Businesses being researched. A prospect is not a partner: nothing here appears on the website unless the club approves a listing.' : 'Every business and organisation the club deals with — one record each (duplicates are refused).') + '</p>' +
        '<div class="cos-actions"><button class="cos-btn cos-btn--primary" data-new>+ Add organisation</button>' + (cfg.ch ? '<button class="cos-btn" data-ch>Companies House lookup</button>' : '') + '<button class="cos-btn cos-btn--ghost" data-export>Export CSV</button></div>' +
        (list.length ? '<ul class="cos-list">' + list.map(function (o) {
          return '<li><button class="cos-row" data-org="' + o.id + '"><span class="cos-row__t">' + h(o.name) + '</span><span class="cos-row__m">' + stageChip(o.relationship) +
            ' <span class="cos-chip' + (/opted|do_not/.test(o.permission) ? ' cos-chip--late' : /research|legal/.test(o.permission) ? ' cos-chip--muted' : '') + '">' + h(lbl(o.permission)) + '</span>' +
            (o.score != null ? ' <span class="cos-chip">Score ' + o.score + '</span>' : '') + ' <span class="cos-row__who">' + h([o.sector, o.town].filter(Boolean).join(' · ')) + '</span></span></button></li>';
        }).join('') + '</ul>' : '<div class="cos-empty"><strong>No organisations yet.</strong><p>Add one, or load the club’s starting records from the Command Centre.</p></div>');
      body.querySelector('[data-new]').onclick = function () { orgEditor(area, null, cfg.orgs === 'prospect' ? { relationship: 'prospect' } : {}); };
      body.querySelector('[data-export]').onclick = function () { exportCsv('orgs'); };
      var ch = body.querySelector('[data-ch]'); if (ch) ch.onclick = chLookup;
      body.querySelectorAll('[data-org]').forEach(function (b) { b.onclick = function () { openOrg(area, b.getAttribute('data-org')); }; });
    });
  }
  function orgEditor(area, org, defaults) {
    org = org || defaults || {};
    var sf = (org.score_breakdown || {});
    var html = '<h3 class="cos-h">' + (org.id ? 'Edit organisation' : 'New organisation') + '</h3><form class="cos-form">' + ORG_FIELDS.map(function (f, i) {
      var id = 'coso-' + i, v = org[f[0]];
      if (f[2] === 'check') return '<div class="cos-f cos-f--check"><label><input type="checkbox" id="' + id + '" ' + (v ? 'checked' : '') + '> ' + h(f[1]) + '</label></div>';
      if (f[2] === 'area') return '<div class="cos-f"><label class="cos-fl" for="' + id + '">' + h(f[1]) + '</label><textarea id="' + id + '" rows="3">' + h(v || '') + '</textarea></div>';
      if (Array.isArray(f[2])) return '<div class="cos-f"><label class="cos-fl" for="' + id + '">' + h(f[1]) + '</label><select id="' + id + '">' + f[2].map(function (o) { return '<option value="' + o + '"' + (v === o ? ' selected' : '') + '>' + h(lbl(o)) + '</option>'; }).join('') + '</select></div>';
      return '<div class="cos-f"><label class="cos-fl" for="' + id + '">' + h(f[1]) + '</label><input id="' + id + '" type="' + (f[2] || 'text') + '" value="' + h(v || '') + '"></div>';
    }).join('') +
      '<fieldset class="cos-score"><legend>Prospect score — tick what is TRUE and evidenced (it shows its working; it is not a prediction)</legend>' +
      SCORE_F.map(function (s, i) { return '<label><input type="checkbox" id="coss-' + i + '" ' + (sf[s[0]] ? 'checked' : '') + '> ' + h(s[1]) + '</label>'; }).join('') + '</fieldset>' +
      '<p class="cos-err" role="alert"></p><div class="cos-actions"><button class="cos-btn cos-btn--primary" type="submit">Save</button><button class="cos-btn cos-btn--ghost" type="button" data-close>Cancel</button></div></form>';
    var dl = drawer(html), form = dl.querySelector('form'), err = dl.querySelector('.cos-err');
    form.onsubmit = function (e) {
      e.preventDefault();
      var b = { id: org.id };
      ORG_FIELDS.forEach(function (f, i) { var el = dl.querySelector('#coso-' + i); b[f[0]] = f[2] === 'check' ? el.checked : el.value.trim(); });
      b.score_factors = {}; SCORE_F.forEach(function (s, i) { b.score_factors[s[0]] = dl.querySelector('#coss-' + i).checked ? 1 : 0; });
      b.score_factors.doNotContact = /opted|do_not/.test(b.permission);
      write('saveOrg', b).then(function (r) {
        if (!r.ok) { err.innerHTML = h(r.error) + (r.duplicate_of ? ' <button class="cos-link" type="button" data-dup>Open it</button>' : ''); var dd = err.querySelector('[data-dup]'); if (dd) dd.onclick = function () { openOrg(area, r.duplicate_of); }; return; }
        toast('Saved'); dl.close(); mount(area); openOrg(area, r.org.id);
      });
    };
  }
  function openOrg(area, id) {
    var dl = drawer('<div class="cos-loading">Loading…</div>');
    call('org', { id: id }).then(function (r) {
      if (!r.ok) { dl.querySelector('.cos-drawer__in').innerHTML = '<p class="cos-err">' + h(r.error) + '</p>'; return; }
      var o = r.org, sb = o.score_breakdown || {};
      dl.querySelector('.cos-drawer__in').innerHTML = '<button class="cos-x" aria-label="Close" data-close>&times;</button><p class="cos-kicker">' + h(lbl(o.relationship)) + '</p><h3 class="cos-h">' + h(o.name) + '</h3>' +
        '<p class="cos-send ' + (r.send.ok ? 'is-ok' : 'is-no') + '">' + (r.send.ok ? 'May be emailed (' + h(lbl(r.send.basis)) + '), with an opt-out in every message.' : 'Do not email: ' + h(r.send.why)) + '</p>' +
        '<dl class="cos-dl">' + ORG_FIELDS.filter(function (f) { return o[f[0]] != null && o[f[0]] !== '' && f[0] !== 'name'; }).map(function (f) { return '<div class="cos-kv"><dt>' + h(f[1]) + '</dt><dd>' + h(f[2] === 'check' ? (o[f[0]] ? 'Yes' : 'No') : Array.isArray(f[2]) ? lbl(o[f[0]]) : o[f[0]]) + '</dd></div>'; }).join('') +
        (o.score != null ? '<div class="cos-kv"><dt>Prospect score</dt><dd><b>' + o.score + '</b>/100 · ' + h(sb.band || '') + '<br><small>' + Object.keys(sb).filter(function (k) { return k !== 'band'; }).map(function (k) { return h(k) + ' ' + sb[k]; }).join(' · ') + '</small></dd></div>' : '') + '</dl>' +
        '<div class="cos-actions"><button class="cos-btn" data-edit>Edit</button><button class="cos-btn" data-opp>+ Opportunity</button><button class="cos-btn" data-out>+ Draft approach</button></div>' +
        '<h4 class="cos-h4">Records</h4>' + ((r.items || []).length ? '<ul class="cos-kids">' + r.items.map(function (i) { return '<li><span>' + h(lbl(i.kind)) + ': ' + h(i.title) + '</span> ' + stageChip(i.stage) + '</li>'; }).join('') + '</ul>' : '<p class="cos-muted">None yet.</p>');
      dl.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = function () { dl.close(); }; });
      dl.querySelector('[data-edit]').onclick = function () { orgEditor(area, o); };
      dl.querySelector('[data-opp]').onclick = function () { openEditor(area, AREAS.commercial.kinds[1], null, { title: o.name + ' — sponsorship', org_id: o.id }); };
      dl.querySelector('[data-out]').onclick = function () { openEditor(area, AREAS.outreach.kinds[0], null, { title: 'Introduction — ' + o.name, org_id: o.id, 'data.to': o.contact_email || '' }); };
    });
  }
  function chLookup() {
    var term = prompt('Company name or number:'); if (!term) return;
    call('companiesHouse', { q: term }).then(function (r) {
      if (!r.ok) return drawer('<h3 class="cos-h">Companies House</h3><p>' + h(r.error) + '</p>');
      drawer('<h3 class="cos-h">Companies House results</h3><p class="cos-muted">Official register. A match tells you the legal form — which decides how the club may contact them.</p><ul class="cos-kids">' +
        r.results.map(function (c) { return '<li><b>' + h(c.name) + '</b> · ' + h(c.number) + ' · ' + h(lbl(c.type)) + ' · ' + h(c.status) + '<br><small>' + h(c.address || '') + '</small></li>'; }).join('') + '</ul>');
    });
  }

  function renderInventory(body) {
    body.innerHTML = '<p class="cos-blurb">What the club can sell. Exclusive rights (shirts, training kit) can only be won once per season — the server refuses a second sale. Prices appear only when the club approves them; until then every package is “price on application”.</p>' +
      '<table class="cos-ev"><thead><tr><th>Package</th><th>Exclusive</th><th>Sold per</th></tr></thead><tbody>' + (global.ClubOSInventory || []).map(function (p) {
        return '<tr><td>' + h(p.name) + '</td><td>' + (p.exclusive ? 'Yes — one per season' : 'No') + '</td><td>' + h(p.per || 'season') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  function renderSuppression(area, body) {
    body.innerHTML = '<p class="cos-blurb">Anyone who asks not to be contacted goes here — by address or whole domain. It is checked before any approach can be marked sent, permanently.</p>' +
      '<form class="cos-form cos-inline"><div class="cos-f"><label class="cos-fl" for="cos-sv">Email or @domain</label><input id="cos-sv" required></div><div class="cos-f"><label class="cos-fl" for="cos-sr">Reason / date</label><input id="cos-sr" required></div><button class="cos-btn cos-btn--primary">Add</button><p class="cos-err" role="alert"></p></form>';
    var f = body.querySelector('form');
    f.onsubmit = function (e) { e.preventDefault(); write('suppress', { value: f.querySelector('#cos-sv').value, reason: f.querySelector('#cos-sr').value }).then(function (r) { if (!r.ok) { f.querySelector('.cos-err').textContent = r.error; return; } toast('Added to do-not-contact'); f.reset(); }); };
  }

  function exportCsv(what) {
    call('export', { what: what }).then(function (r) {
      if (!r.ok) return toast(r.error, true);
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv' })); a.download = r.filename; a.click();
    });
  }

  // ── matchday checklist from the next home fixture ──────────────────────
  var MATCHDAY_TASKS = ['Confirm fixture, kick-off and officials', 'Pitch and facilities ready', 'Stewards and volunteers confirmed', 'Turnstile float and card reader ready',
    'First aid cover confirmed', 'Programme printed / published', 'Sponsor obligations for this match (boards, hospitality, announcements)', 'Hospitality set up',
    'Kit, balls and equipment', 'Matchday announcements approved', 'After the match: attendance and takings reconciled in Match Day Ops', 'After the match: result entered and report drafted'];
  function matchdayChecklist(area) {
    fetch('data/fixtures.json?t=' + Date.now()).then(function (r) { return r.json(); }).then(function (d) {
      var t = today(), list = (d.fixtures || d.matches || d || []);
      var next = list.filter(function (f) { var dt = String(f.date || f.kickoff || '').slice(0, 10); var home = f.home === true || f.venue === 'H' || /home/i.test(f.ha || f.homeAway || f.location || '') || /rayners/i.test(String(f.homeTeam || '')); return dt >= t && home && !/postponed|cancel/i.test(f.status || ''); })
        .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); })[0];
      if (!next) return toast('No upcoming home fixture found in the fixtures list.', true);
      var dt = String(next.date || next.kickoff).slice(0, 10), opp = next.opponent || next.awayTeam || next.away || 'opponent', fid = next.id || dt;
      if (!confirm('Create the ' + MATCHDAY_TASKS.length + '-item checklist for ' + opp + ' (' + day(dt) + ')? Running it twice creates nothing new.')) return;
      var jobs = MATCHDAY_TASKS.map(function (title, i) {
        var due = i >= 10 ? new Date(Date.parse(dt) + 2 * 864e5).toISOString().slice(0, 10) : dt;
        return write('create', { kind: 'task', title: title + ' — v ' + opp, due_date: due, idempotency_key: 'matchday:' + fid + ':' + i, source: 'fixture:' + fid, data: { area: 'Matchday', fixture: fid } });
      });
      Promise.all(jobs).then(function (rs) {
        var bad = rs.filter(function (r) { return !r.ok; }); var made = rs.filter(function (r) { return r.ok && !r.duplicate; }).length;
        toast(bad.length ? bad[0].error : (made ? made + ' tasks created — now give each an owner.' : 'Checklist already exists for this match.'), !!bad.length);
        mount(area);
      });
    }).catch(function () { toast('Could not read the fixtures list.', true); });
  }

  // ── Command Centre ─────────────────────────────────────────────────────
  function commandCentre() {
    var el = document.querySelector('[data-cos="command"]'); if (!el) return;
    el.innerHTML = '<div class="cos-bar"><p class="cos-blurb" style="margin:0">What needs a person today — every line opens the real record.</p><button class="cos-who" type="button"><span class="cos-who__k">Working as</span> <b data-cos-actor>' + h(actor() || 'Set your name') + '</b></button></div><div class="cos-body"><div class="cos-loading">Loading…</div></div>';
    el.querySelector('.cos-who').onclick = function () { askActor(true); };
    var body = el.querySelector('.cos-body');
    call('summary').then(function (r) {
      if (!r.ok) return r.notSetUp ? notSetUp(body, r) : (body.innerHTML = '<div class="cos-empty">' + h(r.error) + '</div>');
      var a = r.attention, m = r.money;
      function block(title, list, tone) {
        return '<section class="cos-cc"><h4 class="cos-h4">' + h(title) + ' <span class="cos-count' + (tone ? ' cos-count--' + tone : '') + '">' + list.length + '</span></h4>' +
          (list.length ? '<ul class="cos-list cos-list--tight">' + list.slice(0, 12).map(function (i) {
            return '<li><button class="cos-row" data-kind="' + i.kind + '" data-id="' + i.id + '"><span class="cos-row__t">' + h(i.title) + '</span><span class="cos-row__m">' + stageChip(i.stage) + ' ' + dueChip(i.due_date) + ' <span class="cos-row__who">' + (i.owner ? h(i.owner) : '<span class="cos-warn">No owner</span>') + '</span></span></button></li>';
          }).join('') + '</ul>' : '<p class="cos-muted">Nothing.</p>') + '</section>';
      }
      var tiles = [['Contracted (sponsorship)', money(m.contracted_pence)], ['Invoiced', money(m.invoiced_pence)], ['Collected', money(m.collected_pence)], ['Owed to the club', money(m.owed_pence)], ['In-kind (estimated)', money(m.in_kind_estimate_pence)]];
      body.innerHTML = (r.open === 0 ? '<div class="cos-empty"><strong>No records yet.</strong><p>Load the verified starting records: funding opportunities (with eligibility already assessed against the club’s legal form), the compliance register (no guessed dates), and the published sponsors.</p><button class="cos-btn cos-btn--primary" data-seed>Load starting records</button></div>' : '') +
        '<div class="cos-money">' + tiles.map(function (t) { return '<div class="cos-stat"><span class="cos-stat__v">' + t[1] + '</span><span class="cos-stat__k">' + t[0] + '</span></div>'; }).join('') + '</div>' +
        '<p class="cos-muted">Money figures come only from recorded deals and bank-evidenced payments. Nothing is estimated except where it says so.</p>' +
        '<div class="cos-cc-grid">' + block('Overdue', a.overdue, 'late') + block('Due today', a.today, 'today') + block('Next 7 days', a.week) +
        block('Nobody owns these', a.unowned, 'warn') + block('Enquiries past the 48-hour promise', a.enquiriesOver48h, 'late') + block('Unpaid invoices', a.invoicesUnpaid) + '</div>' +
        '<div class="cos-actions"><button class="cos-btn cos-btn--ghost" data-hist>Recent changes (audit)</button></div>';
      var sd = body.querySelector('[data-seed]'); if (sd) sd.onclick = function () {
        sd.disabled = true; sd.textContent = 'Loading…';
        write('seed').then(function (s) { if (!s.ok) { toast(s.error, true); sd.disabled = false; return; } toast('Loaded ' + s.loaded.grants + ' funding, ' + s.loaded.compliance + ' compliance, ' + s.loaded.sponsors + ' sponsors'); commandCentre(); });
      };
      body.querySelectorAll('[data-id]').forEach(function (b) {
        b.onclick = function () {
          var kind = b.getAttribute('data-kind'), area = Object.keys(AREAS).filter(function (ar) { return AREAS[ar].kinds.some(function (k) { return k.kind === kind && k.fields; }); })[0];
          var k = AREAS[area].kinds.filter(function (x) { return x.kind === kind; })[0];
          openRecord(area, k, b.getAttribute('data-id'));
        };
      });
      body.querySelector('[data-hist]').onclick = function () {
        call('history', { limit: 150 }).then(function (hres) {
          drawer('<h3 class="cos-h">Recent changes</h3><ol class="cos-audit">' + (hres.audit || []).map(function (x) { return '<li><time>' + new Date(x.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) + '</time> <b>' + h(x.actor) + '</b> ' + h(x.action) + ' ' + h(x.entity) + (x.after && x.after.title ? ' “' + h(x.after.title) + '”' : '') + (x.after && x.after.stage ? ' → ' + h(lbl(x.after.stage)) : '') + (x.note ? ' — ' + h(x.note) : '') + '</li>'; }).join('') + '</ol>');
        });
      };
    });
  }

  // ── rewards redemption ─────────────────────────────────────────────────
  function rewards() {
    var el = document.querySelector('[data-cos="rewards"]'); if (!el) return;
    el.innerHTML = '<p class="cos-blurb">Check a supporter’s reward against VERIFIED check-ins (scanned at the gate) before handing it over. Each reward can be redeemed once a season — the database refuses a second time, even on two phones at once.</p>' +
      '<form class="cos-form cos-inline"><div class="cos-f"><label class="cos-fl" for="cos-lane">Lane number (from their card)</label><input id="cos-lane" inputmode="numeric" autocomplete="off" required></div><button class="cos-btn cos-btn--primary">Check</button></form><div class="cos-body" aria-live="polite"></div>';
    var f = el.querySelector('form'), out = el.querySelector('.cos-body');
    f.onsubmit = function (e) {
      e.preventDefault(); var lane = f.querySelector('#cos-lane').value.trim(); out.innerHTML = '<div class="cos-loading">Checking…</div>';
      call('rewards', { lane_no: lane }).then(function (r) {
        if (!r.ok) return r.notSetUp ? notSetUp(out, r) : (out.innerHTML = '<p class="cos-err">' + h(r.error) + '</p>');
        out.innerHTML = '<p><b>Lane #' + h(r.lane_no) + '</b> · ' + r.verified_home_visits + ' verified home visit(s) in ' + h(r.season) + '</p><ul class="cos-kids">' + r.rewards.map(function (x) {
          return '<li class="' + (x.redeemed ? 'is-done' : '') + '"><span>' + h(x.title) + ' <small>(' + x.games + ' home games)</small></span> ' +
            (x.redeemed ? stageChip('redeemed') : x.earned ? '<button class="cos-btn cos-btn--primary" data-redeem="' + x.key + '">Redeem now</button>' : '<span class="cos-chip cos-chip--muted">' + (x.games - r.verified_home_visits) + ' to go</span>') + '</li>';
        }).join('') + '</ul><p class="cos-err" role="alert"></p>';
        out.querySelectorAll('[data-redeem]').forEach(function (b) {
          b.onclick = function () {
            if (!confirm('Hand over this reward now and record it as used?')) return;
            b.disabled = true;
            write('redeem', { lane_no: r.lane_no, reward_key: b.getAttribute('data-redeem') }).then(function (m) {
              if (!m.ok) { out.querySelector('.cos-err').textContent = m.error; b.disabled = false; return; }
              toast('Redeemed: ' + m.redeemed); f.onsubmit(new Event('submit'));
            });
          };
        });
      });
    };
  }

  // Inventory list mirrors lib/club-os.js INVENTORY (display only; the server enforces).
  global.ClubOSInventory = [
    { key: 'home-shirt', name: 'Home shirt', exclusive: true }, { key: 'away-shirt', name: 'Away shirt', exclusive: true }, { key: 'training-kit', name: 'Training kit', exclusive: true },
    { key: 'match', name: 'Match sponsor', per: 'home game' }, { key: 'matchball', name: 'Matchball sponsor', per: 'home game' }, { key: 'player', name: 'Player sponsor', per: 'player' },
    { key: 'board', name: 'Pitch-side board' }, { key: 'programme', name: 'Programme advert' }, { key: 'website', name: 'Website partner placement' },
    { key: 'hospitality', name: 'Matchday hospitality', per: 'home game' }, { key: 'community', name: 'Community project sponsor' }, { key: 'bespoke', name: 'Bespoke partnership' },
  ];

  global.ClubOS = {
    open: function (name) {
      if (name === 'command') return commandCentre();
      if (name === 'rewards') return rewards();
      if (AREAS[name]) return mount(name);
    },
    PANELS: ['command', 'commercial', 'outreach', 'funding', 'compliance', 'commsdesk', 'coaching', 'clubtasks', 'rewards'],
    _AREAS: AREAS,
  };
})(window);
