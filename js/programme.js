/* ─────────────────────────────────────────
   RAYNERS LANE FC — Magazine Programme
   Auto-generates from Google Form + FWP
   ───────────────────────────────────────── */

const PROGRAMME_SHEET = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTRSP-SHAmuC-8B_MpbxvFJn4E8cdEgwNY6gKz0L_hUFbfdpa3_19la4qzCxLNQlg3EPaUUIpbqUpoG/pub?output=csv';
const SQUAD_SHEET     = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR1-egjqN8gi8QpgL5-oGC_hMSzH5MzC5fFYL0ZxoTxT9dyb4YAGOPx9m9KT3pUtI2oCBUJ4ptRX9qz/pub?output=csv';

// ── CSV PARSER ───────────────────────────
function parseLastRow(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return {};
  const headers = lines[0].split(',').map(h =>
    h.replace(/^"|"$/g,'').trim().toLowerCase()
     .replace(/[^a-z0-9]+/g,'_').replace(/_$/, '')
  );
  const lastLine = lines[lines.length - 1];
  const cols = []; let cur = '', inQ = false;
  for (const ch of lastLine) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cols.push(cur.trim());
  const obj = {};
  headers.forEach((h,i) => { obj[h] = (cols[i]||'').replace(/^"|"$/g,'').trim(); });
  return obj;
}

function parseSquad(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g,'_'));
  return lines.slice(1).map(line => {
    const cols = []; let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    cols.push(cur.trim());
    const obj = {};
    headers.forEach((h,i) => { obj[h] = cols[i]||''; });
    return { no: parseInt(obj.squad_no||0), name: obj.full_name||'', pos: obj.position||'' };
  }).filter(p => p.name && p.name !== 'TBC' && p.name !== 'Full_Name');
}

// ── WIKIPEDIA LOGO FETCH ─────────────────
async function fetchOppositionLogo(teamName) {
  if (!teamName) return null;
  const variants = [
    teamName + ' F.C.',
    teamName + ' FC',
    teamName,
    teamName.replace(' FC','').replace(' F.C.','') + ' F.C.',
  ];
  for (const q of variants) {
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(q)}&prop=pageimages&format=json&pithumbsize=300&origin=*`;
      const res  = await fetch(url);
      const json = await res.json();
      const pages = json.query?.pages || {};
      for (const page of Object.values(pages)) {
        if (page.thumbnail?.source) return page.thumbnail.source;
      }
    } catch(e) { /* try next */ }
  }
  return null;
}

// ── INITIALS BADGE FALLBACK ──────────────
function initialsLogo(name) {
  const words = name.replace(/F\.?C\.?/gi,'').trim().split(/\s+/);
  const initials = words.slice(0,3).map(w=>w[0]?.toUpperCase()||'').join('');
  return `data:image/svg+xml,${encodeURIComponent(`<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><circle cx="60" cy="60" r="58" fill="%231A1A1A" stroke="%23333" stroke-width="2"/><text x="60" y="70" text-anchor="middle" font-family="Arial Black" font-size="${initials.length>2?'28':'34'}" font-weight="900" fill="white">${initials}</text></svg>`)}`;
}

// ── SET HELPERS ──────────────────────────
function setText(id, val, fb='') {
  const el = document.getElementById(id);
  if (el) el.textContent = val||fb;
}
function setHTML(id, val) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = val||'';
}
function formatNotes(text, fallback) {
  if (!text) return `<p class="prog-placeholder">${fallback||'Notes coming soon.'}</p>`;
  return text.split('\n').filter(l=>l.trim())
    .map(l=>`<p class="prog-body-text">${l}</p>`).join('');
}

// ── SQUAD RENDER ─────────────────────────
function renderSquad(players) {
  const el = document.getElementById('prog-squad-grid');
  if (!el) return;
  const POS = ['Goalkeeper','Defender','Midfielder','Forward'];
  const COLOUR = { Goalkeeper:'#1A5C32', Defender:'#1A3A6E', Midfielder:'#6B3A1F', Forward:'#6B1A1A' };
  let html = '';
  POS.forEach(pos => {
    const group = players.filter(p=>p.pos===pos).sort((a,b)=>(a.no||99)-(b.no||99));
    if (!group.length) return;
    html += `<div class="squad-pos-block">
      <div class="squad-pos-label">${pos}s</div>
      ${group.map(p=>`
        <div class="squad-player-row" style="border-left:3px solid ${COLOUR[pos]||'var(--yellow)'}">
          <span class="squad-player-num">${p.no||''}</span>
          <span class="squad-player-name">${p.name||'TBC'}</span>
          <span class="squad-player-pos">${p.pos}</span>
        </div>`).join('')}
    </div>`;
  });
  if (!html) html = '<p class="prog-placeholder">Squad to be confirmed by the manager.</p>';
  el.innerHTML = html;
}

// ── MAIN LOAD ────────────────────────────
async function loadProgramme() {
  let data = {};

  // 1. Try data/programme.json (set by admin panel)
  try {
    const r = await fetch('data/programme.json?t='+Date.now());
    if (r.ok) {
      const d = await r.json();
      if (d && d.opponent) {
        data = d;
        data.opposition = d.opponent;
        data.match_date = d.date;
        data.manager_s_notes = d.managerNotes;
        data.welcome_to_our_guests = d.welcomeNotes;
        data.what_we_re_looking_forward_to = d.lookingForward;
        data.head_to_head_notes = d.headToHead;
      }
    }
  } catch(e) { /* fall through */ }

  // 2. Fallback: Fetch from Google Form sheet
  if (!data || !data.opponent) try {
    const res = await fetch(PROGRAMME_SHEET + '&t=' + Date.now(), { cache:'no-cache' });
    data = parseLastRow(await res.text());
  } catch(e) { console.warn('Programme sheet:', e); }

  // 2. Extract fields (handle Google Forms column naming)
  const opp        = data.opposition || data.opposition_team || '';
  const matchDate  = data.match_date || data.date || '';
  const comp       = data.competition || 'Combined Counties Premier Division North';
  const mgrNotes   = data.manager_s_notes || data.managers_notes || data["manager_s_notes"] || '';
  const welcome    = data.welcome_to_our_guests || data.welcome || '';
  const lookFwd    = data.what_we_re_looking_forward_to || data.looking_forward || '';
  const h2h        = data.head_to_head_notes || data.head_to_head || '';

  // 3. Populate cover
  setText('prog-opp-name',   opp || 'TBC — Season 2026-27');
  setText('prog-match-date', matchDate || '');
  setText('prog-competition', comp);
  setText('prog-vs-text',    opp ? `vs ${opp}` : 'vs TBC');
  setText('prog-welcome-team', opp || 'our guests');
  document.title = opp ? `Programme: Rayners Lane vs ${opp} | RLFC` : 'Match Day Programme | Rayners Lane FC';

  // 4. Fetch opposition logo from Wikipedia
  const oppLogoEl = document.getElementById('prog-opp-logo');
  if (oppLogoEl && opp) {
    oppLogoEl.src = initialsLogo(opp); // set fallback immediately
    const logoUrl = await fetchOppositionLogo(opp);
    if (logoUrl) {
      oppLogoEl.src = logoUrl;
      oppLogoEl.style.filter = 'none';
    }
  }

  // 5. Populate text sections
  setHTML('prog-manager-notes', formatNotes(mgrNotes, 'The manager\'s notes will appear here before kick-off.'));
  setHTML('prog-welcome-notes', formatNotes(welcome, `Welcome to Tithe Farm. Notes about ${opp||'our guests'} will appear here.`));
  setHTML('prog-looking-forward', formatNotes(lookFwd, 'The preview will appear here before match day.'));
  setHTML('prog-h2h-notes', formatNotes(h2h, 'Head to head history will appear here.'));

  // 6. Load squad
  try {
    const res = await fetch(SQUAD_SHEET + '&t=' + Date.now(), { cache:'no-cache' });
    renderSquad(parseSquad(await res.text()));
  } catch(e) { renderSquad([]); }
}

document.addEventListener('DOMContentLoaded', () => {
  initComponents('programme.html');
  loadProgramme();
});
