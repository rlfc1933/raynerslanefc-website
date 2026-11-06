// ════════════════════════════════════════════════════════════════════════════
// PROGRAMME STUDIO DOCUMENT — what a saved draft may contain.
//
// The browser is not trusted: everything is rebuilt from known page types and
// known fields, text is length-limited plain text (rendered escaped), and a
// picture is either a stored asset ("asset:<sha256>") or a same-site path.
// tests/programme-studio.test.js checks this list against js/programme-studio.js.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const TYPES = {
  cover:      ['headline', 'sponsor', 'photo'],
  contents:   [],
  notes:      ['label', 'author', 'body', 'photo'],
  article:    ['label', 'headline', 'body', 'photo', 'caption'],
  opposition: ['body', 'source'],
  squad:      ['part'],
  teams:      ['away'],
  results:    [],
  fixtures:   [],
  info:       ['body'],
  advert:     ['label', 'photo', 'size'],
  back:       ['body', 'photo'],
};
// Section a page publishes to on the website (lib/programme/lifecycle.js applySections).
const ROLES = ['chair', 'manager', 'preview', 'history', 'history2', 'directory', 'report', 'community', 'sponsors', 'feature', 'opposition'];
const IMAGE_FIELDS = ['photo'];
const LIMIT = { body: 12000, away: 2000, headline: 140, label: 80, author: 80, caption: 200, source: 200, sponsor: 80, size: 10, part: 2 };
const STATUSES = ['draft', 'review', 'approved'];

function isImageRef(v) {
  return /^asset:[a-f0-9]{64}$/.test(v) || /^\/?img\/[\w\/.-]{1,160}$/.test(v);
}
function str(v, n) { return typeof v === 'string' ? v.replace(/\r\n?/g, '\n').slice(0, n) : ''; }

/** @returns {{ok:true, doc}|{ok:false, error}} */
function clean(input) {
  const d = input && typeof input === 'object' ? input : null;
  if (!d || !d.fixture || !Array.isArray(d.pages)) return { ok: false, error: 'This is not a programme draft.' };
  if (d.pages.length < 1 || d.pages.length > 64) return { ok: false, error: 'A programme has between 1 and 64 pages.' };
  const f = d.fixture;
  const fixture = {
    id: str(f.id, 60), date: str(f.date, 10), kickoff: str(f.kickoff, 5), opponent: str(f.opponent, 80),
    oppCrest: isImageRef(String(f.oppCrest || '')) ? String(f.oppCrest) : '', competition: str(f.competition, 80),
    venue: str(f.venue, 120), season: str(f.season, 9),
  };
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(fixture.id) || !/^\d{4}-\d{2}-\d{2}$/.test(fixture.date)) return { ok: false, error: 'The match details are incomplete.' };
  const ids = {};
  const pages = [];
  for (const p of d.pages) {
    if (!p || !Object.prototype.hasOwnProperty.call(TYPES, p.type)) return { ok: false, error: 'Unknown page type.' };
    const id = /^[a-z0-9]{4,20}$/.test(String(p.id || '')) && !ids[p.id] ? p.id : Math.random().toString(36).slice(2, 12);
    ids[id] = 1;
    const q = { id, type: p.type, hidden: !!p.hidden };
    if (ROLES.indexOf(p.role) > -1) q.role = p.role;
    TYPES[p.type].forEach((k) => {
      if (p[k] == null || p[k] === '') return;
      if (IMAGE_FIELDS.indexOf(k) > -1) { if (isImageRef(String(p[k]))) q[k] = String(p[k]); if (/^\d{1,5}×\d{1,5}$/.test(String(p[k + 'Px'] || ''))) q[k + 'Px'] = p[k + 'Px']; return; }
      q[k] = str(p[k], LIMIT[k] || 200);
    });
    if (p.type === 'advert' && p.source === 'pdf') q.source = 'pdf';
    pages.push(q);
  }
  const status = STATUSES.indexOf(d.status) > -1 ? d.status : 'draft';
  const printDeadline = /^\d{4}-\d{2}-\d{2}$/.test(String(d.printDeadline || '')) ? d.printDeadline : '';
  return { ok: true, doc: { fixture, pages, status, printDeadline, squadAsOf: str(d.squadAsOf, 30), template: 'a5-24-v1' } };
}

module.exports = { TYPES, ROLES, STATUSES, clean, isImageRef };
