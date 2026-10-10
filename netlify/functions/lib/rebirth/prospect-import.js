// ════════════════════════════════════════════════════════════════════════
//  PROSPECT IMPORT — upload → preview → validate → stage. Pure functions.
//
//  The club has a list of local businesses researched earlier. It is NOT in
//  this repository and nothing here pretends otherwise: this module only
//  makes it safe to bring that list (or any later one) in.
//
//  Rules a person would otherwise get wrong:
//   - every imported row is staged as a PROSPECT with permission
//     "research_only" — whatever the spreadsheet says. A list is not consent.
//   - every imported email must be re-checked before it can be used
//     (email_checked_at stays empty; sendPermission refuses until it is set).
//   - each row carries where it came from (row source, else the batch source).
//   - duplicates (inside the file and against existing records) are skipped,
//     never merged silently.
//   - personal mailboxes (gmail, hotmail …) are flagged: probably an
//     individual subscriber under PECR, so consent is needed.
//   - nothing is contacted. Staging creates records, nothing else.
// ════════════════════════════════════════════════════════════════════════
'use strict';
const OS = require('../club-os');

const MAX_ROWS = 500;
const MAX_BYTES = 1024 * 1024;

// Header synonyms → our field names. Lower-cased, punctuation stripped.
const HEADERS = {
  name: ['name', 'business', 'businessname', 'company', 'companyname', 'organisation', 'organization', 'tradingname'],
  website: ['website', 'web', 'url', 'site', 'websiteurl'],
  contact_email: ['email', 'emailaddress', 'contactemail', 'businessemail', 'mail'],
  contact_phone: ['phone', 'telephone', 'tel', 'phonenumber', 'contactphone'],
  contact_name: ['contact', 'contactname', 'owner', 'person'],
  town: ['town', 'area', 'location', 'locality', 'city', 'district'],
  sector: ['sector', 'category', 'type', 'industry', 'businesstype'],
  legal_form: ['legalform', 'legalstatus', 'entity', 'entitytype', 'structure'],
  companies_house_no: ['companieshouse', 'companieshouseno', 'companynumber', 'companyno', 'crn', 'chnumber'],
  address: ['address', 'streetaddress', 'postaddress'],
  postcode: ['postcode', 'zip', 'postalcode'],
  source: ['source', 'sourceurl', 'foundat', 'where', 'reference'],
  notes: ['notes', 'note', 'comments', 'comment'],
};

// The directive's geographic priorities, first ring first.
const PRIORITY_AREAS = ['Rayners Lane', 'South Harrow', 'North Harrow', 'Harrow', 'Pinner', 'Eastcote', 'Ruislip', 'Wealdstone', 'Hatch End'];
const PERSONAL_DOMAINS = ['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'live.co.uk', 'yahoo.com',
  'yahoo.co.uk', 'icloud.com', 'me.com', 'aol.com', 'btinternet.com', 'sky.com', 'virginmedia.com', 'talktalk.net', 'msn.com', 'protonmail.com'];

/** RFC-4180-ish CSV: quotes, doubled quotes, commas/newlines inside quotes, CRLF, BOM. */
function parseCsv(text) {
  const s = String(text || '').replace(/^﻿/, '');
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

function keyOf(h) { return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function mapHeaders(header) {
  const map = {}; const unknown = [];
  header.forEach((h, i) => {
    const k = keyOf(h);
    const field = Object.keys(HEADERS).find((f) => HEADERS[f].includes(k));
    if (field && map[field] == null) map[field] = i; else if (k) unknown.push(String(h).trim());
  });
  return { map, unknown };
}

function normLegalForm(v) {
  const s = String(v || '').toLowerCase();
  if (!s.trim()) return 'unknown';
  if (/\bllp\b/.test(s)) return 'llp';
  if (/\bplc\b/.test(s)) return 'plc';
  if (/\b(ltd|limited|company)\b/.test(s)) return 'limited_company';
  if (/sole/.test(s)) return 'sole_trader';
  if (/partnership/.test(s)) return 'partnership';
  if (/charit|cio\b/.test(s)) return 'charity';
  if (/council|nhs|public|school|government/.test(s)) return 'public_body';
  return 'unknown';
}
function priorityArea(town, address) {
  const hay = (String(town || '') + ' ' + String(address || '')).toLowerCase();
  // Most specific first ("South Harrow" before "Harrow").
  const hit = PRIORITY_AREAS.slice().sort((a, b) => b.length - a.length).find((a) => hay.includes(a.toLowerCase()));
  return hit || null;
}

/**
 * Validate a parsed sheet against the records already held.
 * @returns {{ ok, error?, columns, unknownColumns, rows:[{line, status:'ok'|'warn'|'error'|'duplicate', issues:[], org}], counts }}
 */
function preview(text, existingOrgs = [], opts = {}) {
  if (String(text || '').length > MAX_BYTES) return { ok: false, error: 'That file is larger than 1 MB. Split it into smaller files.' };
  const grid = parseCsv(text);
  if (grid.length < 2) return { ok: false, error: 'No rows found. The first line must be column headings (e.g. Name, Website, Email, Town).' };
  const { map, unknown } = mapHeaders(grid[0]);
  if (map.name == null) return { ok: false, error: 'No business name column found. Name one column "Name" or "Business".' };
  const body = grid.slice(1);
  if (body.length > MAX_ROWS) return { ok: false, error: `That file has ${body.length} rows; the limit is ${MAX_ROWS} per import. Start with a smaller, highly relevant batch.` };
  const batchSource = String(opts.source || '').trim();
  const seen = [];
  const rows = body.map((cells, idx) => {
    const v = (f) => (map[f] == null ? '' : String(cells[map[f]] || '').trim());
    const issues = []; let status = 'ok';
    const name = v('name').slice(0, 200);
    const email = v('contact_email').toLowerCase();
    const website = v('website');
    const chRaw = v('companies_house_no').toUpperCase().replace(/\s/g, '');
    const legal = normLegalForm(v('legal_form'));
    const rowSource = v('source');
    const org = {
      name, website: website || null, website_host: website ? OS.hostOf(website) : null,
      contact_email: email || null, contact_phone: v('contact_phone') || null, contact_name: v('contact_name') || null,
      town: v('town') || null, sector: v('sector') || null, legal_form: legal,
      companies_house_no: chRaw ? chRaw.padStart(8, '0') : null,
      source_label: rowSource || batchSource || null,
      notes: [v('address'), v('postcode'), v('notes')].filter(Boolean).join(' · ') || null,
      relationship: 'prospect', kind: 'business', permission: 'research_only',
    };
    const err = (m) => { issues.push(m); status = 'error'; };
    const warn = (m) => { issues.push(m); if (status === 'ok') status = 'warn'; };
    if (!name) err('No business name.');
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) err('Email address is not valid.');
    if (website && !org.website_host) err('Website is not a valid address.');
    if (org.companies_house_no && !/^[A-Z0-9]{8}$/.test(org.companies_house_no)) { warn('Companies House number looks wrong — left out.'); org.companies_house_no = null; }
    if (!org.source_label) err('No source. Add a "Source" column or describe where this list came from.');
    if (email) {
      const dom = email.split('@')[1];
      if (PERSONAL_DOMAINS.includes(dom)) warn('Personal mailbox — probably an individual (PECR): consent needed before any marketing email.');
      else if (/^[a-z]+[._][a-z]+@/.test(email)) warn('Looks like a named person’s address — check it is a published business contact.');
      warn('Email must be re-checked (source, accuracy, relevance) before use.');
    }
    if (legal === 'unknown') warn('Legal form unknown — treated as an individual (consent needed) until checked.');
    if (legal === 'sole_trader' || legal === 'partnership') warn('Sole trader / partnership: individual subscriber under PECR — consent needed for email marketing.');
    org.priority_area = priorityArea(org.town, v('address'));
    if (!org.priority_area) warn('Not in a priority area (Rayners Lane, Harrow, Pinner …). Check relevance.');
    if (status !== 'error') {
      const dupHere = OS.findDuplicate(org, seen);
      const dupDb = OS.findDuplicate(org, existingOrgs);
      if (dupDb) { status = 'duplicate'; issues.unshift(`Already on record as “${dupDb.name}” — skipped.`); org.duplicate_of = dupDb.id || null; }
      else if (dupHere) { status = 'duplicate'; issues.unshift(`Repeats “${dupHere.name}” earlier in this file — skipped.`); }
      else seen.push(Object.assign({ name_key: OS.nameKey(org.name) }, org));
    }
    return { line: idx + 2, status, issues, org };
  });
  const counts = rows.reduce((c, r) => { c[r.status] = (c[r.status] || 0) + 1; return c; }, { ok: 0, warn: 0, error: 0, duplicate: 0 });
  counts.stageable = counts.ok + counts.warn;
  return { ok: true, columns: Object.keys(map), unknownColumns: unknown, rows, counts };
}

/** The org row that staging writes. Permission is forced; email is unchecked. */
function stagedOrg(org, batchId, actor) {
  const o = Object.assign({}, org);
  delete o.priority_area; delete o.duplicate_of;
  o.permission = 'research_only';
  o.permission_note = 'Imported from a research list. Not contacted. Check legal form, lawful basis and the email address before any approach.';
  o.relationship = 'prospect';
  o.import_batch_id = batchId;
  o.email_checked_at = null;
  o.town = o.town || null;
  o.created_by = actor;
  if (org.priority_area) o.notes = ['Priority area: ' + org.priority_area, o.notes].filter(Boolean).join(' · ');
  return o;
}

module.exports = { parseCsv, mapHeaders, preview, stagedOrg, normLegalForm, priorityArea, PRIORITY_AREAS, PERSONAL_DOMAINS, MAX_ROWS };
