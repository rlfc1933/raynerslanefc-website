// Build data/opponents.json from Wikipedia.
//
// Same discipline as the venue book: VERIFIED OR BLANK. Every field is read
// from the club's own Wikipedia page and carries the URL it came from. Nothing
// is inferred, nothing is guessed, and a club with no page gets an empty record
// rather than an invented one — because this feeds an AUTOMATED post that goes
// out with the club's badge on it and nobody reading it first. A wrong founding
// year about Cockfosters, published weekly, unattended, is exactly the failure
// this file exists to prevent.
//
// Wikipedia text is CC BY-SA, so every record keeps its source URL and the site
// attributes it. Run: node opponents.js
const fs = require('fs');
const UA = { 'User-Agent': 'RaynersLaneFC/1.0 (https://raynerslanefc.co.uk; club website)' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// fixture opponent name -> Wikipedia title. Explicit, because "Hilltop" and
// "Burnham" are ambiguous on Wikipedia and a fuzzy search would happily return
// a village in Somerset.
const TITLES = {
  'Cockfosters': 'Cockfosters F.C.',
  'Metropolitan Police FC': 'Metropolitan Police F.C.',
  'Wallingford & Crowmarsh': 'Wallingford & Crowmarsh F.C.',
  'Broadfields United': 'Broadfields United F.C.',
  'Hilltop': 'Hilltop F.C.',
  'Burnham': 'Burnham F.C.',
  'Harefield United': 'Harefield United F.C.',
  'Ardley United': 'Ardley United F.C.',
  'North Greenford United': 'North Greenford United F.C.',
  'Holyport': 'Holyport F.C.',
  'Northwood': 'Northwood F.C.',
  'Wokingham Town': 'Wokingham & Emmbrook F.C.',
  'Bedfont': 'Bedfont Sports F.C.',
  'Easington Sports': 'Easington Sports F.C.',
  'North Leigh': 'North Leigh F.C.',
  'Reading City': 'Reading City F.C.',
  'Amersham Town': 'Amersham Town F.C.',
  'Penn & Tylers Green': 'Penn & Tylers Green F.C.',
  'Thatcham Town': 'Thatcham Town F.C.',
  'Abingdon United': 'Abingdon United F.C.',
  'Kidlington': 'Kidlington F.C.',
  'London Lions': 'London Lions F.C.',
  'New Bradwell St Peter': 'New Bradwell St Peter F.C.',
  'Punjab Utd FC': null,           // no Wikipedia page found — left blank on purpose
  'Hayes & Yeading United': 'Hayes & Yeading United F.C.',
};


// "Burnham F.C. is a non-League club..." — splitting on ". " cuts at the F.C.
// and leaves you with "Burnham F.C.". Protect the common football abbreviations
// first, split, then put them back.
function firstSentence(t) {
  let x = String(t || '').replace(/\s+/g, ' ').trim();
  if (!x) return '';
  const ABBR = [['F.C.', '\u0001'], ['A.F.C.', '\u0002'], ['St.', '\u0003'], ['Utd.', '\u0004'], ['No.', '\u0005']];
  ABBR.forEach(([a, t2]) => { x = x.split(a).join(t2); });
  let out = x.split(/(?<=\.)\s/)[0];
  ABBR.forEach(([a, t2]) => { out = out.split(t2).join(a); });
  return out.trim();
}
// Infoboxes list several nicknames separated by <br> — strip the tags without
// separating them and you get "MetThe Old BillThe Blues and Twos".
function splitBr(v) {
  return String(v || '').replace(/<\s*br\s*\/?\s*>/gi, '|').split('|')[0];
}

async function summary(title) {
  const r = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_')), { headers: UA });
  if (!r.ok) return null;
  const j = await r.json();
  return j.type === 'standard' ? j : null;
}

// Pull the infobox via the API rather than scraping HTML — less to go wrong.
async function infobox(title) {
  const u = 'https://en.wikipedia.org/w/api.php?action=parse&page=' + encodeURIComponent(title.replace(/ /g, '_')) +
            '&prop=wikitext&section=0&format=json&formatversion=2';
  const r = await fetch(u, { headers: UA });
  if (!r.ok) return {};
  const j = await r.json();
  const wt = (j.parse && j.parse.wikitext) || '';
  // Capture to end of LINE, not to the next pipe: Wikipedia writes
  // "| founded = {{start date and age|1926}}" and stopping at the first | grabs
  // "{{start date and age" — throwing the year away. That cost 9 clubs.
  const raw = (k) => {
    const m = wt.match(new RegExp('\\|\\s*' + k + '\\s*=\\s*([^\\n]+)', 'i'));
    return m ? m[1] : '';
  };
  // For plain text fields we still want to stop at a genuine field separator,
  // but only one that ISN'T inside a {{template}}.
  const rawField = (k) => raw(k).replace(/\{\{[^}]*\}\}/g, m => m.replace(/\|/g, '\u0007')).split('|')[0].replace(/\u0007/g, '|');
  const clean = (v) => String(v || '')
      .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')   // [[link|text]] -> text
      .replace(/\{\{[^}]*\}\}/g, '')                    // templates
      .replace(/<[^>]*>/g, '').replace(/'''?/g, '')
      .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const grab = (k) => clean(rawField(k));
  const grabList = (k) => clean(splitBr(rawField(k)));   // first nickname only
  return {
    // RAW, not cleaned: the year usually lives inside {{start date and age|1926}}
    // and clean() removes templates entirely.
    founded: raw('founded') || raw('established') || raw('formed'),
    ground: grab('ground'),
    nickname: grabList('nickname') || grabList('nicknames'),
    _extract: '',
    capacity: grab('capacity'),
    website: grab('website'),
  };
}
// "1946" out of "1946; 78 years ago" etc. Only a clean 4-digit year is kept —
// anything we can't read cleanly stays blank rather than becoming a guess.
function year(s) {
  const m = String(s || '').match(/\b(1[6-9]\d{2}|20[0-2]\d)\b/);
  return m ? m[1] : '';
}

(async () => {
  const out = [];
  for (const [club, title] of Object.entries(TITLES)) {
    if (!title) { out.push({ club, wikipedia: '', founded: '', nickname: '', summary: '', source: 'No Wikipedia article found — left blank rather than invented' }); console.log('  --   ' + club + '  (no page)'); continue; }
    let s = null, ib = {};
    try { s = await summary(title); } catch (e) {}
    await sleep(900);
    if (s) { try { ib = await infobox(title); } catch (e) {} await sleep(900); }
    if (!s) { out.push({ club, wikipedia: '', founded: '', nickname: '', summary: '', source: 'No Wikipedia article found — left blank rather than invented' }); console.log('  MISS ' + club); continue; }
    const rec = {
      club,
      wikipedia: s.content_urls.desktop.page,
      founded: year(ib.founded) || year((s.extract || '').match(/found(?:ed|ing)[^.]{0,24}?(1[6-9]\d{2}|20[0-2]\d)/i)?.[1]),
      nickname: (ib.nickname || '').replace(/^The\s+/i, '').split(',')[0].replace(/\s*\(.*$/, '').trim(),
      ground: ib.ground || '',
      // One sentence, straight from Wikipedia's own opening line. Not rewritten,
      // not embellished — so it can be attributed honestly.
      summary: firstSentence(s.extract),
      source: 'Wikipedia (CC BY-SA) — ' + s.content_urls.desktop.page,
    };
    out.push(rec);
    console.log('  OK   ' + club.padEnd(24) + (rec.founded || '----') + '  ' + (rec.nickname || '').padEnd(14) + rec.summary.slice(0, 46));
  }
  const doc = {
    _note: 'Opponent background for automated match previews. Sourced from each club\'s own Wikipedia article (CC BY-SA) and attributed on the site. VERIFIED OR BLANK: a club with no article gets an empty record, never an invented one — this feeds posts that publish automatically with nobody reading them first.',
    updatedAt: new Date().toISOString(),
    opponents: out,
  };
  fs.writeFileSync('/Users/directoressence/Downloads/rayners-lane-website-FINAL/data/opponents.json', JSON.stringify(doc, null, 2));
  const withF = out.filter(o => o.founded).length;
  console.log('\n  ' + out.length + ' clubs | founded year: ' + withF + ' | no article: ' + out.filter(o => !o.wikipedia).length);
})();
