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

function initialsOf(name) {
  return String(name || '').split(/\s+/).filter(Boolean).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
}
// A player with no photo yet gets his initials set in Bebas on the dark field,
// not a cartoon stand-in: the line-up is real photography or plain type.
function typeTile(wrap, name) {
  wrap.classList.add('is-placeholder');
  wrap.innerHTML = '';
  var t = document.createElement('span');
  t.className = 'player-card__init'; t.setAttribute('aria-hidden', 'true');
  t.textContent = initialsOf(name);
  wrap.appendChild(t);
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
    byPos[pos].push(p);
  });

  POS_ORDER.forEach(function(pos) {
    var group = byPos[pos];
    if (!group || !group.length) return;

    var section = document.createElement('section');
    section.className = 'squad-group';
    section.setAttribute('data-pos', String(pos).toLowerCase()); // for the position filter
    var hid = 'sq-h-' + String(pos).toLowerCase();
    section.setAttribute('aria-labelledby', hid);

    // The group is headed by how many there are, set big: a count, not a rank.
    var label = document.createElement('h2');
    label.className = 'squad-group-label';
    label.id = hid;
    label.innerHTML = '<span class="squad-group-label__n" data-kl-count="' + group.length + '">' + group.length + '</span> <span class="squad-group-label__t">' + pos + 's</span>';
    section.appendChild(label);

    var row = document.createElement('ol');
    row.className = 'squad-row';

    group.forEach(function(p) {
      var name = p.name || 'TBC';
      var num  = Number(p.number || p.no) > 0 ? String(p.number || p.no) : '';
      var role = p.role || pos;
      // The roster's own id, which is what the registry is keyed on. Deriving
      // one from the name breaks on apostrophes and hyphens and would quietly
      // detach a player from his record.
      var id   = p.id || ('player-' + name.toLowerCase().replace(/\s+/g, '-'));

      var li = document.createElement('li');
      li.className = 'squad-row__item';
      var card = document.createElement('a');
      card.href = 'player.html?id=' + id;
      card.className = 'player-card';
      card.setAttribute('data-pos', String(pos).toLowerCase());
      // Open a profile pop-up instead of navigating (link still works if JS off)
      card.addEventListener('click', function(ev) {
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1) return; // new-tab clicks still navigate
        ev.preventDefault();
        openPlayerModal(id, { name: name, number: num, position: pos, role: (p.role || ''), age: (p.age || ''), photo: (p.photo || ''), fallback: '' });
      });

      var imgWrap = document.createElement('div');
      imgWrap.className = 'player-card__img';
      if (p.photo) {
        var imgEl = document.createElement('img');
        imgEl.src = p.photo;
        imgEl.alt = '';
        imgEl.width = 800; imgEl.height = 1071;
        imgEl.loading = 'lazy'; imgEl.decoding = 'async';
        // Never reclassify on a load error. img.js re-points images at
        // Netlify's image CDN, which 404s anywhere that CDN isn't running
        // (localhost, previews) and fires error even though img.js then falls
        // back and the photo loads fine. The placeholder is decided by the
        // DATA (does this player have a photo), never by a load event.
        imgWrap.appendChild(imgEl);
      } else {
        typeTile(imgWrap, name);
      }

      card.appendChild(imgWrap);
      if (num) {
        var numEl = document.createElement('span');
        numEl.className = 'player-card__num';
        numEl.setAttribute('aria-hidden', 'true');
        numEl.textContent = num;
        card.appendChild(numEl);
      }

      var parts = name.split(/\s+/);
      var nameEl = document.createElement('span');
      nameEl.className = 'player-card__name';
      nameEl.innerHTML = (parts.length > 1 ? '<span class="player-card__first">' + pmEsc(parts[0]) + '</span> ' : '') +
        '<span class="player-card__last">' + pmEsc(parts.length > 1 ? parts.slice(1).join(' ') : name) + '</span>';

      var posEl = document.createElement('span');
      posEl.className = 'player-card__pos';
      posEl.textContent = role + (num ? ' · No. ' + num : '');

      card.appendChild(nameEl);
      card.appendChild(posEl);
      li.appendChild(card);
      row.appendChild(li);
    });

    section.appendChild(row);
    grid.appendChild(section);
  });
}

/* ── PLAYER PROFILE POP-UP ── */
var _profiles = {};
// GATE 7 — the club's computed record, keyed by the same player id the roster
// uses. The roster stays data/players.json; this only adds what the matches say.
var _record = {};
(function(){
  if (window.LaneRecord) {
    window.LaneRecord.season().then(function (m) { _record = m || {}; });
  }
  fetch('data/players.json?t=' + Date.now())
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(d){ if (d && d.players) d.players.forEach(function(p){ _profiles[p.id] = p; }); })
    .catch(function(){});
  // inject modal styles + container once
  var st = document.createElement('style');
  st.textContent =
    '.pm-overlay{position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;z-index:99999!important;background:rgba(8,8,8,.9);display:none;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity var(--dur-base,.24s) var(--ease-out,ease)}' +
    '.pm-overlay.on{display:flex!important;opacity:1}' +
    '.pm-card{position:relative;width:100%;max-width:460px;max-height:92vh;overflow:auto;background:#0E0E0E;border-top:4px solid var(--yellow);border-radius:0;transform:translateY(12px);transition:transform var(--dur-base,.24s) var(--ease-out,ease)}' +
    '.pm-overlay.on .pm-card{transform:none}' +
    '.pm-hero{position:relative;display:flex;gap:18px;align-items:flex-end;padding:24px 24px 20px;border-bottom:1px solid rgba(245,243,237,.14);overflow:hidden}' +
    '.pm-photo{width:112px;flex:0 0 112px;aspect-ratio:3/4;height:auto;object-fit:cover;object-position:center 20%;background:#141414;position:relative;z-index:1;display:block}' +
    '.pm-num{position:absolute;top:-6px;right:60px;font-family:var(--font-display);font-size:120px;color:var(--yellow);line-height:1;z-index:0;font-variant-numeric:tabular-nums}' +
    '.pm-id{position:relative;z-index:1;padding-right:36px}' +
    '.pm-pos{display:block;font-family:var(--font-body);font-size:13px;font-weight:800;color:var(--yellow);margin-bottom:6px}' +
    '.pm-name{font-family:var(--font-display);font-size:44px;text-transform:uppercase;color:var(--white);line-height:.88}' +
    '.pm-nat{font-family:var(--font-body);font-size:13px;font-weight:600;color:#AAAAAA;margin-top:8px}' +
    '.pm-body{padding:20px 24px 26px}' +
    '.pm-nick{font-family:var(--font-body);font-weight:800;font-size:15px;color:var(--yellow);margin-bottom:12px}' +
    '.pm-bio{font-family:var(--font-body);font-size:15px;color:var(--white);line-height:1.65}' +
    '.pm-stats{display:grid;grid-template-columns:repeat(4,1fr);margin-top:18px;border-top:1px solid rgba(245,243,237,.14)}' +
    '.pm-stat{padding:14px 4px 0 10px;border-right:1px solid rgba(245,243,237,.14)}.pm-stat:first-child{padding-left:0}.pm-stat:last-child{border-right:0}' +
    '.pm-stat b{display:block;font-family:var(--font-display);font-weight:400;font-size:44px;color:var(--white);line-height:.9;font-variant-numeric:tabular-nums}' +
    '.pm-stat span{font-family:var(--font-body);font-size:12px;font-weight:700;color:#AAAAAA}' +
    '.pm-close{position:absolute;top:10px;right:10px;z-index:3;width:44px;height:44px;border-radius:var(--r-sm);background:#080808;border:1px solid rgba(245,243,237,.3);color:var(--white);font-size:22px;cursor:pointer;line-height:1}' +
    '.pm-close:focus-visible,.pm-full:focus-visible{outline:3px solid var(--yellow);outline-offset:2px}' +
    '.pm-empty{font-family:var(--font-body);font-size:14px;color:#AAAAAA;margin-top:4px}' +
    '.pm-full{display:inline-flex;align-items:center;min-height:44px;margin-top:12px;font-family:var(--font-body);font-size:14px;font-weight:800;color:var(--white);text-decoration:underline;text-decoration-color:var(--yellow);text-decoration-thickness:2px;text-underline-offset:5px}' +
    '@media (prefers-reduced-motion: reduce){.pm-overlay,.pm-card{transition:none}}';
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
/* A number the matches have established, or an em-dash. Never a fabricated 0. */
function pmRec(v){ return (v == null) ? '–' : String(v); }
function closePlayerModal(){ var o=document.getElementById('pm-overlay'); if(o) o.classList.remove('on'); document.body.style.overflow=''; }

function openPlayerModal(id, basic) {
  var p = _profiles[id] || {};
  var name = p.name || basic.name || 'TBC';
  var pos  = p.position || basic.position || '';
  var num  = Number(p.number) > 0 ? p.number : (basic.number || '');
  var photo = p.photo || basic.photo || '';
  var img = photo
    ? '<img class="pm-photo" src="'+pmEsc(photo)+'" alt="">'
    : '';
  var role = p.role || basic.role || '';
  var age  = p.age || basic.age || '';
  // The computed record outranks the hand-maintained figures: it is derived
  // from the matches themselves and follows every correction.
  var rec = _record[id] || null;
  var hasRec = window.LaneRecord && window.LaneRecord.hasRecord(rec);
  var hasProfile = hasRec || !!(p.bio || p.nickname || p.nationality || p.role || p.age || p.apps || p.goals || p.assists);
  var mins = (window.LaneRecord && window.LaneRecord.minutes(rec));
  var stats = hasRec
    ? '<div class="pm-stats">' +
        '<div class="pm-stat"><b>'+pmRec(rec.appearances)+'</b><span>Apps</span></div>' +
        '<div class="pm-stat"><b>'+pmRec(rec.goals)+'</b><span>Goals</span></div>' +
        // Minutes only where the match record supports a figure. Where it does
        // not, the slot shows the squad number rather than a guess.
        (mins != null
          ? '<div class="pm-stat"><b>'+mins+'</b><span>Minutes</span></div>'
          : '<div class="pm-stat"><b>'+pmRec(rec.starts)+'</b><span>Starts</span></div>') +
        '<div class="pm-stat"><b>'+(num||'–')+'</b><span>Squad No</span></div>' +
      '</div>' +
      (rec.playerPage ? '<a class="pm-full" href="'+pmEsc(rec.playerPage)+'">Full record &rarr;</a>' : '')
    : (hasProfile
      ? '<div class="pm-stats">' +
          // Nothing has been recorded yet. An honest dash — a hard 0 reads as
          // "played and scored nothing", which is a different claim.
          '<div class="pm-stat"><b>'+pmStat(p.apps)+'</b><span>Apps</span></div>' +
          '<div class="pm-stat"><b>'+pmStat(p.goals)+'</b><span>Goals</span></div>' +
          '<div class="pm-stat"><b>'+pmStat(p.assists)+'</b><span>Assists</span></div>' +
          '<div class="pm-stat"><b>'+(num||'–')+'</b><span>Squad No</span></div>' +
        '</div>'
      : '');
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
        (pos ? '<span class="pm-pos">'+pmEsc(pos)+'</span>' : '') +
        '<div class="pm-name">'+pmEsc(name)+'</div>' +
        ((role || age) ? '<div class="pm-nat">'+pmEsc([role, age ? 'Age '+age : ''].filter(Boolean).join(' · '))+'</div>' : '') +
        (p.nationality ? '<div class="pm-nat">'+pmEsc(p.nationality)+'</div>' : '') +
      '</div>' +
    '</div>' + body;
  var o = document.getElementById('pm-overlay');
  o.classList.add('on'); document.body.style.overflow = 'hidden';
}
