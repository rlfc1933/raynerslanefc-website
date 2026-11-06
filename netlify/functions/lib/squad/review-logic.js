// ════════════════════════════════════════════════════════════════════════════
// SQUAD REVIEW — what a source suggests, turned into questions for a person.
//
// Pure functions: given the roster, what the sources say and what staff have
// already decided, produce the list of things to review. Nothing here changes
// anybody's squad membership. Three rules are absolute:
//
//   1. ABSENCE IS NOT EVIDENCE. A player missing from a team sheet, a feed or a
//      failed source run is never proposed as a departure. Departures come only
//      from an explicit report with a source.
//   2. NAMES ARE NOT IDENTITIES. A similar name produces a QUESTION ("same
//      player?"), never a merge. Matching uses the provider's stable id and the
//      club's own decisions first.
//   3. A DECISION STICKS. Once a person has answered for a source record, that
//      record never comes back as a new question.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const crypto = require('crypto');

function norm(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/[’']/g, "'").replace(/[^a-z' -]/g, ' ').replace(/\s+/g, ' ').trim();
}

function distance(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const d = Array.from({ length: m + 1 }, (_, i) => [i].concat(new Array(n).fill(0)));
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[m][n];
}

/**
 * Could these be the same person, spelled differently? Same surname with a
 * matching / initial / shortened first name (Temi ↔ Temiloluwa), or the whole
 * name within two letters (Adefolami ↔ Adefolarni). A YES here is a question.
 */
function similar(a, b) {
  const A = norm(a), B = norm(b);
  if (!A || !B) return false;
  if (A === B) return true;
  const pa = A.split(' '), pb = B.split(' ');
  const sa = pa[pa.length - 1], sb = pb[pb.length - 1], fa = pa[0], fb = pb[0];
  if (sa === sb && (fa === fb || (fa.length === 1 && fb[0] === fa) || (fb.length === 1 && fa[0] === fb) ||
      fa.startsWith(fb) || fb.startsWith(fa))) return true;
  // Same first name and one name carries an extra surname (Mateo Dos Reis ↔
  // Mateo Dos Reis Guerra): every part of the shorter, in order, at the start.
  const short = pa.length <= pb.length ? pa : pb, long = pa.length <= pb.length ? pb : pa;
  if (short.length >= 2 && short.length < long.length && short.every((t, i) => long[i] === t)) return true;
  // Shortened first name and a surname one letter out (Josh Andrew ↔ Joshua Andrews).
  if ((fa.startsWith(fb) || fb.startsWith(fa)) && Math.min(fa.length, fb.length) >= 3 && sa.length > 3 && distance(sa, sb) <= 1) return true;
  return A.length > 6 && distance(A, B) <= 2;
}

function idFor(kind, key) {
  return kind + ':' + crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 16);
}

/**
 * @param roster   [{id, name, status}]
 * @param sourceRows [{sourceKey, name, evidence:{source,url,season,checkedAt,note}}]
 *        e.g. registry players for our team. Never contains "absent" rows.
 * @param state    the review document (aliases: decisions per sourceKey)
 * @returns proposals to add (deterministic ids — re-running adds nothing new)
 */
function proposalsFromSource(roster, sourceRows, state) {
  const aliases = (state && state.aliases) || {};
  const out = [];
  (sourceRows || []).forEach((r) => {
    if (!r || !r.sourceKey || !r.name) return;
    if (aliases[r.sourceKey]) return;                         // a person already answered
    if (r.linkedPlayerId && roster.some((p) => String(p.id) === String(r.linkedPlayerId) || p.slug === r.linkedPlayerId)) return;
    const exact = roster.filter((p) => norm(p.name) === norm(r.name));
    const near = roster.filter((p) => norm(p.name) !== norm(r.name) && similar(p.name, r.name));
    let kind, question;
    if (exact.length === 1) { kind = 'confirm_link'; question = 'The source lists ' + r.name + '. Is this the same person as ' + exact[0].name + ' in the squad?'; }
    else if (exact.length > 1 || near.length) { kind = 'name_variant'; question = 'The source spells a name ' + r.name + '. Is this one of the players below, or somebody new?'; }
    else { kind = 'new_player'; question = r.name + ' appears in the source but is not in the squad. Add them?'; }
    out.push({ id: idFor('src', r.sourceKey), kind, sourceKey: r.sourceKey, name: r.name, question,
      candidates: exact.concat(near).map((p) => ({ id: p.id, name: p.name, status: p.status })),
      evidence: [r.evidence], status: 'pending', createdAt: new Date().toISOString() });
  });
  return out;
}

/** Pairs in the CURRENT squad that may be one person entered twice. */
function duplicateProposals(roster, current) {
  const cur = roster.filter((p) => current.indexOf(p.status) > -1);
  const out = [];
  for (let i = 0; i < cur.length; i++) for (let j = i + 1; j < cur.length; j++) {
    if (similar(cur[i].name, cur[j].name)) {
      const key = [cur[i].id, cur[j].id].map(String).sort().join('|');
      out.push({ id: idFor('dup', key), kind: 'duplicate', name: cur[i].name + ' / ' + cur[j].name,
        question: 'These two squad entries may be the same person. Check before the next programme.',
        candidates: [cur[i], cur[j]].map((p) => ({ id: p.id, name: p.name, status: p.status })),
        evidence: [{ source: 'Club squad list', note: 'Two current entries with very similar names.' }],
        status: 'pending', createdAt: new Date().toISOString() });
    }
  }
  return out;
}

/** Merge new proposals in, never resurrecting one a person has resolved. */
function mergeProposals(existing, incoming) {
  const byId = {};
  existing.forEach((p) => { byId[p.id] = p; });
  const added = [];
  incoming.forEach((p) => {
    const cur = byId[p.id];
    if (!cur) { byId[p.id] = p; added.push(p); return; }
    if (cur.status === 'pending') {                 // refresh evidence on an open question
      const seen = {}; (cur.evidence || []).forEach((e) => { seen[JSON.stringify(e)] = 1; });
      (p.evidence || []).forEach((e) => { if (!seen[JSON.stringify(e)]) cur.evidence.push(e); });
      cur.candidates = p.candidates;
    }
  });
  return { list: Object.keys(byId).map((k) => byId[k]), added };
}

/** Is a review due? Returns the reasons, in plain words. */
function due(doc, ctx) {
  const c = ctx || {};
  const now = c.now || Date.now();
  const reasons = [];
  const last = (doc.reviews || [])[0];
  const pending = (doc.proposals || []).filter((p) => p.status === 'pending').length;
  if (!last) reasons.push('The squad has not been confirmed in Staff HQ yet.');
  else if (now - Date.parse(last.at) > 14 * 864e5) reasons.push('The squad was last confirmed more than two weeks ago.');
  if (pending) reasons.push(pending + (pending === 1 ? ' change is' : ' changes are') + ' waiting for review.');
  if (c.nextHome && Date.parse(c.nextHome.date) - now < 8 * 864e5 && (!last || Date.parse(last.at) < now - 3 * 864e5)) {
    reasons.push('The next home programme (v ' + c.nextHome.opponent + ') is coming up.');
  }
  return reasons;
}

module.exports = { norm, similar, distance, idFor, proposalsFromSource, duplicateProposals, mergeProposals, due };
