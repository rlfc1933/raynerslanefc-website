/* Rayners Lane FC - Squad Page */
document.addEventListener('DOMContentLoaded', loadSquad);

var SHEET = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR1-egjqN8gi8QpgL5-oGC_hMSzH5MzC5fFYL0ZxoTxT9dyb4YAGOPx9m9KT3pUtI2oCBUJ4ptRX9qz/pub?output=csv';
var POS_ORDER = ['Goalkeeper','Defender','Midfielder','Forward'];
var POS_COLOUR = {Goalkeeper:'#1A5C32',Defender:'#1A3A6E',Midfielder:'#6B3A1F',Forward:'#8B0000'};
var POS_IMG = {
  Goalkeeper:'img/players/player-gk-1.svg',
  Defender:'img/players/player-def-1.svg',
  Midfielder:'img/players/player-mid-1.svg',
  Forward:'img/players/player-forward-1.svg'
};
var FALLBACK_IMG = 'img/players/player-forward-1.svg';

async function loadSquad() {
  // 1. Try admin data/squad.json
  try {
    var r = await fetch('data/squad.json?t=' + Date.now());
    if (r.ok) {
      var d = await r.json();
      if (d.players && d.players.length) { renderSquad(d.players); return; }
    }
  } catch(e) {}
  // 2. Try Google Sheet
  try {
    var res = await fetch(SHEET);
    if (res.ok) {
      var csv = await res.text();
      var players = csvToPlayers(csv);
      if (players.length) { renderSquad(players); return; }
    }
  } catch(e) {}
  // 3. Show placeholder
  renderSquad([
    {number:1,  name:'TBC', position:'Goalkeeper'},
    {number:2,  name:'TBC', position:'Defender'},
    {number:6,  name:'TBC', position:'Midfielder'},
    {number:9,  name:'TBC', position:'Forward'},
  ]);
}

function csvToPlayers(csv) {
  var lines = csv.trim().split('\n');
  var out = [];
  for (var i = 1; i < lines.length; i++) {
    var c = lines[i].split(',');
    if (!c[1]) continue;
    out.push({
      number: parseInt(c[0])||0,
      name: c[1].trim().replace(/"/g,''),
      position: c[2].trim().replace(/"/g,''),
      apps: parseInt(c[3])||0,
      goals: parseInt(c[4])||0,
      bio: (c[6]||'').trim().replace(/"/g,''),
    });
  }
  return out;
}

function renderSquad(players) {
  var grid = document.getElementById('squad-grid');
  if (!grid) return;
  grid.innerHTML = '';

  var byPos = {};
  POS_ORDER.forEach(function(p) { byPos[p] = []; });
  players.forEach(function(p) {
    var pos = p.position || p.pos || 'Forward';
    if (!byPos[pos]) byPos[pos] = [];
    byPos[p.position || p.pos || 'Forward'].push(p);
  });

  POS_ORDER.forEach(function(pos) {
    var group = byPos[pos];
    if (!group || !group.length) return;

    var section = document.createElement('div');
    section.className = 'squad-group';
    section.setAttribute('data-pos', String(pos).toLowerCase()); // for the GK/DEF/MID/FWD filter

    var label = document.createElement('div');
    label.className = 'squad-group-label';
    label.style.background = POS_COLOUR[pos];
    label.textContent = pos + 's';
    section.appendChild(label);

    var row = document.createElement('div');
    row.className = 'squad-row';

    group.forEach(function(p) {
      var name = p.name || 'TBC';
      var num  = p.number || p.no || '';
      var img  = p.photo || POS_IMG[pos] || FALLBACK_IMG;
      var id   = 'player-' + name.toLowerCase().replace(/\s+/g, '-');

      var card = document.createElement('a');
      card.href = 'player.html?id=' + id;
      card.className = 'player-card';
      card.setAttribute('data-pos', String(pos).toLowerCase()); // for the GK/DEF/MID/FWD filter
      card.style.textDecoration = 'none';
      // Open a profile pop-up instead of navigating (link still works if JS off)
      card.addEventListener('click', function(ev) {
        ev.preventDefault();
        openPlayerModal(id, { name: name, number: num, position: pos, role: (p.role || ''), age: (p.age || ''), photo: (p.photo || ''), fallback: img });
      });

      var imgWrap = document.createElement('div');
      imgWrap.className = 'player-card__img';
      // A real headshot gets cropped to fill the card; the cartoon placeholder
      // is an illustration and has to be fitted whole, or it loses its head.
      if (!p.photo) imgWrap.classList.add('is-placeholder');
      var imgEl = document.createElement('img');
      imgEl.src = img;
      imgEl.alt = name;
      imgEl.loading = 'lazy';
      // Only swap the source on error — do NOT reclassify the card as a
      // placeholder here. img.js re-points images at Netlify's image CDN, which
      // 404s anywhere that CDN isn't running (localhost, previews) and fires
      // this handler even though img.js then falls back and the real photo
      // loads fine. Marking the card a placeholder on that transient error
      // shrank real headshots into a green box. Placeholder is decided by the
      // DATA (does this player have a photo), never by a load event.
      imgEl.addEventListener('error', function() {
        if (this.src.indexOf(FALLBACK_IMG) === -1) this.src = FALLBACK_IMG;
      });
      imgWrap.appendChild(imgEl);

      var numEl = document.createElement('div');
      numEl.className = 'player-card__num';
      numEl.style.background = POS_COLOUR[pos];
      numEl.textContent = num;

      var nameEl = document.createElement('div');
      nameEl.className = 'player-card__name';
      nameEl.textContent = name;

      var posEl = document.createElement('div');
      posEl.className = 'player-card__pos';
      posEl.textContent = pos;

      card.appendChild(imgWrap);
      card.appendChild(numEl);
      card.appendChild(nameEl);
      card.appendChild(posEl);
      row.appendChild(card);
    });

    section.appendChild(row);
    grid.appendChild(section);
  });
}

/* ── PLAYER PROFILE POP-UP ── */
var _profiles = {};
(function(){
  fetch('data/players.json?t=' + Date.now())
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(d){ if (d && d.players) d.players.forEach(function(p){ _profiles[p.id] = p; }); })
    .catch(function(){});
  // inject modal styles + container once
  var st = document.createElement('style');
  st.textContent =
    '.pm-overlay{position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;z-index:99999!important;background:rgba(6,6,6,.82);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;padding:18px;opacity:0;transition:opacity .2s}' +
    '.pm-overlay.on{display:flex!important;opacity:1}' +
    '.pm-card{position:relative;width:100%;max-width:440px;max-height:92vh;overflow:auto;background:linear-gradient(180deg,#141414,#0b0b0b);border:1px solid var(--border);border-radius:20px;transform:translateY(14px) scale(.98);transition:transform .25s cubic-bezier(.2,.7,.2,1)}' +
    '.pm-overlay.on .pm-card{transform:none}' +
    '.pm-hero{position:relative;background:linear-gradient(160deg,var(--green) 0%,#06120a 100%);padding:26px 24px 18px;display:flex;align-items:flex-end;gap:18px;overflow:hidden}' +
    '.pm-hero::after{content:"";position:absolute;right:-30px;top:-30px;width:150px;height:150px;border-radius:50%;background:radial-gradient(circle,rgba(255,209,0,.18),transparent 70%)}' +
    '.pm-photo{width:104px;height:104px;border-radius:16px;object-fit:cover;border:2px solid rgba(255,255,255,.15);background:#000;flex-shrink:0;position:relative;z-index:1}' +
    '.pm-num{position:absolute;top:18px;right:20px;font-family:var(--font-d);font-size:64px;color:rgba(255,255,255,.12);line-height:1;z-index:0}' +
    '.pm-id{position:relative;z-index:1}' +
    '.pm-pos{display:inline-block;font-family:var(--font-c);font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#fff;padding:4px 10px;border-radius:4px;margin-bottom:8px}' +
    '.pm-name{font-family:var(--font-d);font-size:34px;letter-spacing:.03em;color:#fff;line-height:.95}' +
    '.pm-nat{font-family:var(--font-c);font-size:12px;letter-spacing:.08em;color:rgba(255,255,255,.6);margin-top:4px}' +
    '.pm-body{padding:20px 24px 26px}' +
    '.pm-nick{font-family:var(--font-c);font-size:14px;color:var(--yellow);letter-spacing:.06em;margin-bottom:12px}' +
    '.pm-bio{font-family:var(--font-b);font-size:14px;color:var(--lgrey);line-height:1.7}' +
    '.pm-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;margin-top:18px;background:var(--border);border-radius:10px;overflow:hidden}' +
    '.pm-stat{background:#111;padding:14px 6px;text-align:center}' +
    '.pm-stat b{display:block;font-family:var(--font-d);font-size:26px;color:var(--yellow);line-height:1}' +
    '.pm-stat span{font-family:var(--font-c);font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--grey)}' +
    '.pm-close{position:absolute;top:14px;right:14px;z-index:3;width:34px;height:34px;border-radius:50%;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.2);color:#fff;font-size:18px;cursor:pointer;line-height:1}' +
    '.pm-empty{font-family:var(--font-c);font-size:12px;color:var(--grey);margin-top:14px;letter-spacing:.04em}';
  document.head.appendChild(st);
  var ov = document.createElement('div');
  ov.className = 'pm-overlay'; ov.id = 'pm-overlay';
  ov.innerHTML = '<div class="pm-card" id="pm-card"></div>';
  ov.addEventListener('click', function(e){ if (e.target === ov) closePlayerModal(); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closePlayerModal(); });
  document.addEventListener('DOMContentLoaded', function(){ document.body.appendChild(ov); });
})();

function pmEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
/* Stats engine lands in Phase 2 — until a game is actually recorded, show '–'
   rather than a 0 that looks like a real (bad) statistic. */
function pmStat(v){ return (v == null || Number(v) === 0) ? '–' : v; }
function closePlayerModal(){ var o=document.getElementById('pm-overlay'); if(o) o.classList.remove('on'); document.body.style.overflow=''; }

function openPlayerModal(id, basic) {
  var p = _profiles[id] || {};
  var name = p.name || basic.name || 'TBC';
  var pos  = p.position || basic.position || '';
  var num  = p.number || basic.number || '';
  var photo = p.photo || basic.photo || '';
  var colour = {Goalkeeper:'#1A5C32',Defender:'#1A3A6E',Midfielder:'#6B3A1F',Forward:'#8B0000'}[pos] || 'var(--green)';
  var img = photo
    ? '<img class="pm-photo" src="'+pmEsc(photo)+'" alt="'+pmEsc(name)+'">'
    : '<img class="pm-photo" src="'+pmEsc(basic.fallback||'')+'" alt="'+pmEsc(name)+'" onerror="this.style.display=\'none\'">';
  var role = p.role || basic.role || '';
  var age  = p.age || basic.age || '';
  var hasProfile = !!(p.bio || p.nickname || p.nationality || p.role || p.age || p.apps || p.goals || p.assists);
  var stats = hasProfile
    ? '<div class="pm-stats">' +
        // Stats haven't started (season kicks off 1 Aug). Show an honest dash —
        // a hard 0 reads as "played and scored nothing", which isn't true.
        '<div class="pm-stat"><b>'+pmStat(p.apps)+'</b><span>Apps</span></div>' +
        '<div class="pm-stat"><b>'+pmStat(p.goals)+'</b><span>Goals</span></div>' +
        '<div class="pm-stat"><b>'+pmStat(p.assists)+'</b><span>Assists</span></div>' +
        '<div class="pm-stat"><b>'+(num||'–')+'</b><span>Squad No</span></div>' +
      '</div>'
    : '';
  var body = '<div class="pm-body">' +
    (p.nickname ? '<div class="pm-nick">"'+pmEsc(p.nickname)+'"</div>' : '') +
    (p.bio ? '<div class="pm-bio">'+pmEsc(p.bio)+'</div>' : (hasProfile ? '' : '<div class="pm-empty">Full profile coming soon.</div>')) +
    stats +
  '</div>';
  document.getElementById('pm-card').innerHTML =
    '<button class="pm-close" onclick="closePlayerModal()" aria-label="Close">&times;</button>' +
    '<div class="pm-hero">' +
      (num ? '<div class="pm-num">'+pmEsc(num)+'</div>' : '') + img +
      '<div class="pm-id">' +
        (pos ? '<span class="pm-pos" style="background:'+colour+'">'+pmEsc(pos)+'</span>' : '') +
        '<div class="pm-name">'+pmEsc(name)+'</div>' +
        ((role || age) ? '<div class="pm-nat">'+pmEsc([role, age ? 'Age '+age : ''].filter(Boolean).join(' · '))+'</div>' : '') +
        (p.nationality ? '<div class="pm-nat">'+pmEsc(p.nationality)+'</div>' : '') +
      '</div>' +
    '</div>' + body;
  var o = document.getElementById('pm-overlay');
  o.classList.add('on'); document.body.style.overflow = 'hidden';
}
