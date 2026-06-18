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

// ── FA STEP 5 PROGRAMME EXTRAS ───────────
const PROG_DEFAULTS = {
  admission: 'Adults £5 · Concessions £3 · Under 16s free',
  rules: 'No smoking or vaping in the stand · Respect all officials · Supporters welcome behind the barriers',
  firstaid: 'First aid is available at the clubhouse — ask any committee member.',
  respect: "Rayners Lane FC proudly supports The FA's Respect programme. We ask every player, coach, supporter and official to back positive, respectful football — win, lose or draw.",
  safe: 'The wellbeing of children and young people is paramount. Rayners Lane FC is committed to safeguarding; concerns can be raised in confidence with our Club Welfare Officer via info@raynerslanefc.co.uk.',
  equality: 'Football is for everyone. Rayners Lane FC opposes discrimination of every kind and welcomes players, supporters and volunteers of all backgrounds, abilities, ages, faiths, genders, sexualities and ethnicities.',
  affil: 'Rayners Lane FC is affiliated to Middlesex County FA and plays in the Combined Counties Football League, Premier Division North — Step 5 of the National League System. An FA Charter Standard Community Club, est. 1933.'
};
function prog12to(t) { // "15:00" → "3:00 PM"
  if (!t || !/^\d{1,2}:\d{2}/.test(t)) return t || '';
  const p = t.split(':'); let h = parseInt(p[0], 10); const m = p[1].slice(0, 2);
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12; if (h === 0) h = 12;
  return h + ':' + m + ' ' + ap;
}
function progEscX(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function progLineList(text) {
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return '';
  return lines.map(l => '<div style="font-family:var(--font-b);font-size:14px;color:#ddd;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05)">' + progEscX(l) + '</div>').join('');
}
function populateProgrammeExtras(d) {
  d = d || {};
  // Cover datebar
  if (d.venue) setText('prog-venue', d.venue);
  if (d.kickoff) setText('prog-kickoff', prog12to(d.kickoff));
  // Team sheets
  const xi = progLineList(d.homeXI), subs = progLineList(d.homeSubs), away = progLineList(d.awayLineup);
  const hasTeams = !!(xi || subs || away || (d.staff || '').trim());
  const sec = document.getElementById('prog-teamsheets-sec');
  if (sec) sec.style.display = hasTeams ? '' : 'none';
  if (hasTeams) {
    setHTML('prog-home-xi', xi || '<span class="prog-placeholder">Line-up confirmed at kick-off.</span>');
    if (subs) { setHTML('prog-home-subs', subs); const w = document.getElementById('prog-home-subs-wrap'); if (w) w.style.display = ''; }
    setHTML('prog-staff', d.staff ? progEscX(d.staff) : '');
    if (d.opponent) setText('prog-away-label', d.opponent);
    setHTML('prog-away-lineup', away || '<span class="prog-placeholder">To be confirmed.</span>');
    // Officials
    const offs = [];
    if (d.referee) offs.push('<b style="color:#fff">Referee:</b> ' + progEscX(d.referee));
    if (d.assistant1) offs.push('<b style="color:#fff">Assistants:</b> ' + progEscX(d.assistant1) + (d.assistant2 ? ' &amp; ' + progEscX(d.assistant2) : ''));
    else if (d.assistant2) offs.push('<b style="color:#fff">Assistant:</b> ' + progEscX(d.assistant2));
    if (d.fourthOfficial) offs.push('<b style="color:#fff">4th Official:</b> ' + progEscX(d.fourthOfficial));
    const offEl = document.getElementById('prog-officials');
    if (offEl) { if (offs.length) { offEl.innerHTML = '<span style="font-family:var(--font-c);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--grey);display:block;margin-bottom:6px">Match Officials</span>' + offs.join(' &nbsp;·&nbsp; '); offEl.style.display = ''; } else offEl.style.display = 'none'; }
  }
  // Matchday info (defaults if blank)
  setText('prog-admission', d.admission || PROG_DEFAULTS.admission);
  setText('prog-rules', d.groundRules || PROG_DEFAULTS.rules);
  setText('prog-firstaid', d.firstAid || PROG_DEFAULTS.firstaid);
  // Club statements (FA standard — defaults if blank)
  setText('prog-respect', d.respect || PROG_DEFAULTS.respect);
  setText('prog-safe', d.safeguarding || PROG_DEFAULTS.safe);
  setText('prog-equality', d.equality || PROG_DEFAULTS.equality);
  setText('prog-affil', d.affiliation || PROG_DEFAULTS.affil);
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

  // 5b. FA Step 5 extras — match details, team sheets, officials, info & statements
  populateProgrammeExtras(data);

  // 6. Load squad
  try {
    const res = await fetch(SQUAD_SHEET + '&t=' + Date.now(), { cache:'no-cache' });
    renderSquad(parseSquad(await res.text()));
  } catch(e) { renderSquad([]); }
}

// ── LIVE LEAGUE TABLE + FIXTURES (own feed — replaces the dead FWP embeds) ──
function progEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function loadProgrammeLiveData() {
  var tableEl = document.getElementById('prog-table');
  var fixEl   = document.getElementById('prog-fixtures');

  if (tableEl) {
    try {
      var t = await (await fetch('/.netlify/functions/fetch-table')).json();
      if (t && t.table && t.table.length) {
        var rows = t.table.map(function (r) {
          return '<tr class="' + (r.rlfc ? 'me' : '') + '"><td>' + r.pos + '</td><td>' + progEsc(r.team) +
            '</td><td>' + r.pld + '</td><td>' + r.w + '</td><td>' + r.d + '</td><td>' + r.l +
            '</td><td>' + r.gd + '</td><td><strong>' + r.pts + '</strong></td></tr>';
        }).join('');
        tableEl.innerHTML = '<table><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>' + rows + '</tbody></table>';
      }
    } catch (e) {}
  }

  if (fixEl) {
    try {
      var fx = await (await fetch('/.netlify/functions/fetch-fixtures')).json();
      var html = '';
      if (fx && fx.next && fx.next.opponent && fx.next.opponent !== 'TBC') {
        var d = fx.next.date ? new Date(fx.next.date + 'T' + (fx.next.kickoff || '15:00') + ':00') : null;
        var ds = d ? d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
        html += '<div class="mag-res"><span style="color:var(--yellow)">Next &middot; Rayners Lane ' + (fx.next.isHome ? 'vs ' : '@ ') + progEsc(fx.next.opponent) + '</span><span style="color:var(--grey)">' + ds + ' ' + (fx.next.kickoff || '15:00') + '</span></div>';
      }
      if (fx && fx.results && fx.results.length) {
        html += fx.results.slice(0, 6).map(function (r) {
          var col = r.us > r.them ? '#22C55E' : (r.us === r.them ? '#FBBF24' : '#EF4444');
          var rd = r.date ? new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
          return '<div class="mag-res"><span>Rayners Lane ' + (r.isHome ? 'vs ' : '@ ') + progEsc(r.opponent) +
            ' <span style="color:var(--grey)">&middot; ' + rd + '</span></span><b style="color:' + col + '">' + r.us + '–' + r.them + '</b></div>';
        }).join('');
      }
      if (html) fixEl.innerHTML = html;
    } catch (e) {}
  }
}

function progInit() {
  try { initComponents('programme.html'); } catch (e) {}
  loadProgramme();
  loadProgrammeLiveData();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', progInit);
else progInit();
