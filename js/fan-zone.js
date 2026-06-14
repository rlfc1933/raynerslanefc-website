/* Rayners Lane FC — Fan Zone
   - Fan Card lives on the FAN'S device (localStorage). No personal data is
     ever sent to the public site.
   - The official sign-up posts privately to Netlify Forms (staff-only).
   - The Patrons Wall reads data/patrons.json (public, safe fields only). */

var FAN_KEY = 'rlfc_fan';

// Loyalty tiers by games attended
var TIERS = [
  { min: 50, name: 'Terrace Royalty', perk: 'Legend status. First call on everything The Lane does.' },
  { min: 25, name: 'Lane Legend',     perk: 'Featured Patron. Priority for matchday rewards & events.' },
  { min: 10, name: 'Loyal Laner',     perk: 'Patron of The Lane — your name on the wall.' },
  { min: 5,  name: 'Regular',         perk: 'One of the faithful. Shout-outs & early news.' },
  { min: 1,  name: 'Matchgoer',       perk: 'You showed up. That\'s what counts at The Lane.' },
  { min: 0,  name: 'New Lane',        perk: 'Welcome to the family. Get to a game!' },
];
function tierFor(games) { for (var i = 0; i < TIERS.length; i++) if (games >= TIERS[i].min) return TIERS[i]; return TIERS[TIERS.length - 1]; }

function getFan()  { try { return JSON.parse(localStorage.getItem(FAN_KEY)) || null; } catch (e) { return null; } }
function setFan(f) { localStorage.setItem(FAN_KEY, JSON.stringify(f)); }
function esc(s)    { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function initFanZone() {
  renderLadder(getFan());
  renderFanCard();
  renderWall();
}

/* ---------- FAN CARD ---------- */
function renderFanCard() {
  var mount = document.getElementById('fancard-mount');
  if (!mount) return;
  var f = getFan();
  if (!f) {
    mount.innerHTML =
      '<div class="fancard" style="text-align:center;padding:34px 24px">' +
        '<div style="font-family:var(--font-d);font-size:30px;letter-spacing:.03em;margin-bottom:8px">Create Your Free Card</div>' +
        '<p style="font-family:var(--font-b);color:var(--grey);font-size:14px;line-height:1.6;margin-bottom:20px">It lives on your phone. Add a photo, check in at games, watch your Lane story grow.</p>' +
        '<button class="fz-btn fz-btn--y" style="max-width:240px;margin:0 auto" onclick="openCardEditor()">Build My Lane Card</button>' +
      '</div>';
    return;
  }
  var games = (f.attended || []).length;
  var tier = tierFor(games);
  var initials = (f.username || 'L').trim().slice(0, 2).toUpperCase();
  var photo = f.photo
    ? '<img class="fancard__photo" src="' + f.photo + '" alt="">'
    : '<div class="fancard__photo" style="display:flex;align-items:center;justify-content:center;font-family:var(--font-d);font-size:30px;color:#fff">' + esc(initials) + '</div>';
  mount.innerHTML =
    '<div class="fancard">' +
      '<div class="fancard__top">' + photo +
        '<div class="fancard__id">' +
          '<span class="fancard__tier">' + esc(tier.name) + '</span>' +
          '<div class="fancard__name">' + esc(f.username || 'Lane Fan') + '</div>' +
          '<div class="fancard__since">' + (f.since ? 'Member since ' + esc(f.since) : 'The Lane Family') + (f.town ? ' &middot; ' + esc(f.town) : '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="fancard__stats">' +
        '<div class="fancard__stat"><div class="fancard__num">' + games + '</div><div class="fancard__lbl">Games</div></div>' +
        '<div class="fancard__stat"><div class="fancard__num">' + (f.since ? (2026 - parseInt(f.since) || 0) : 0) + '</div><div class="fancard__lbl">Years</div></div>' +
        '<div class="fancard__stat"><div class="fancard__num">' + nextMilestone(games) + '</div><div class="fancard__lbl">To Next Tier</div></div>' +
      '</div>' +
      (f.meaning ? '<div class="fancard__meaning">&ldquo;' + esc(f.meaning) + '&rdquo;</div>' : '') +
      '<div class="fancard__foot">' +
        '<button class="fz-btn fz-btn--y" onclick="checkInToday()">&#9917; I Was There</button>' +
        '<button class="fz-btn fz-btn--g" onclick="openCardEditor()">Edit Card</button>' +
      '</div>' +
    '</div>';
}
function nextMilestone(games) {
  var ups = [1, 5, 10, 25, 50];
  for (var i = 0; i < ups.length; i++) if (games < ups[i]) return ups[i] - games;
  return 0;
}

/* ---------- CHECK IN ---------- */
async function checkInToday() {
  var f = getFan(); if (!f) return;
  f.attended = f.attended || [];
  var today = new Date().toISOString().slice(0, 10);
  if (f.attended.some(function (a) { return a.date === today; })) { toast('Already checked in today — see you next game!'); return; }
  var opp = '';
  try { var m = await (await fetch('data/matchday.json?t=' + Date.now())).json(); opp = m.opponent || ''; } catch (e) {}
  f.attended.push({ date: today, opponent: opp });
  setFan(f);
  var games = f.attended.length;
  renderFanCard(); renderLadder(f);
  var tier = tierFor(games);
  toast('Checked in! ' + games + ' game' + (games > 1 ? 's' : '') + ' &middot; ' + tier.name + ' 💛');
}

/* ---------- CARD EDITOR ---------- */
function openCardEditor() {
  var f = getFan() || {};
  var ov = document.getElementById('fz-editor');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'fz-editor';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(6,6,6,.85);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:18px';
    document.body.appendChild(ov);
  }
  ov.innerHTML =
    '<div style="width:100%;max-width:400px;max-height:92vh;overflow:auto;background:linear-gradient(180deg,#141414,#0b0b0b);border:1px solid var(--border);border-top:3px solid var(--yellow);border-radius:18px;padding:24px">' +
      '<div style="font-family:var(--font-d);font-size:26px;letter-spacing:.03em;margin-bottom:14px">Your Lane Card</div>' +
      '<label class="fl" style="display:block;font-family:var(--font-c);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--grey);margin-bottom:6px">Display name</label>' +
      '<input id="fc-name" value="' + esc(f.username || '') + '" placeholder="YellowArmyJoe" style="width:100%;background:#0f0f0f;border:1px solid var(--border);border-radius:8px;color:#fff;font-family:var(--font-b);font-size:15px;padding:11px 13px;margin-bottom:12px">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div><label class="fl" style="display:block;font-family:var(--font-c);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--grey);margin-bottom:6px">Town</label><input id="fc-town" value="' + esc(f.town || '') + '" placeholder="Harrow" style="width:100%;background:#0f0f0f;border:1px solid var(--border);border-radius:8px;color:#fff;font-family:var(--font-b);font-size:15px;padding:11px 13px"></div>' +
        '<div><label class="fl" style="display:block;font-family:var(--font-c);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--grey);margin-bottom:6px">Fan since</label><input id="fc-since" type="number" min="1933" max="2026" value="' + esc(f.since || '') + '" placeholder="2011" style="width:100%;background:#0f0f0f;border:1px solid var(--border);border-radius:8px;color:#fff;font-family:var(--font-b);font-size:15px;padding:11px 13px"></div>' +
      '</div>' +
      '<label class="fl" style="display:block;font-family:var(--font-c);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--grey);margin:12px 0 6px">What The Lane means to you</label>' +
      '<textarea id="fc-meaning" rows="2" placeholder="My Saturday religion." style="width:100%;background:#0f0f0f;border:1px solid var(--border);border-radius:8px;color:#fff;font-family:var(--font-b);font-size:15px;padding:11px 13px">' + esc(f.meaning || '') + '</textarea>' +
      '<label class="fl" style="display:block;font-family:var(--font-c);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--grey);margin:12px 0 6px">Profile photo</label>' +
      '<input id="fc-photo" type="file" accept="image/*" onchange="fcPhoto(this)" style="width:100%;color:var(--grey);font-family:var(--font-c);font-size:13px">' +
      '<div style="display:flex;gap:8px;margin-top:18px">' +
        '<button class="fz-btn fz-btn--y" onclick="saveCard()">Save Card</button>' +
        '<button class="fz-btn fz-btn--g" onclick="closeEditor()">Cancel</button>' +
      '</div>' +
    '</div>';
  ov.style.display = 'flex';
  ov._photo = f.photo || '';
}
function closeEditor() { var ov = document.getElementById('fz-editor'); if (ov) ov.style.display = 'none'; }
function fcPhoto(input) {
  var file = input.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = function (e) {
    var img = new Image();
    img.onload = function () {
      // resize to max 300px to keep localStorage small
      var max = 300, w = img.width, h = img.height;
      if (w > h && w > max) { h = h * max / w; w = max; } else if (h > max) { w = w * max / h; h = max; }
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      document.getElementById('fz-editor')._photo = c.toDataURL('image/jpeg', 0.8);
      toast('Photo ready ✓');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function saveCard() {
  var name = (document.getElementById('fc-name').value || '').trim();
  if (!name) { toast('Add a display name', true); return; }
  var f = getFan() || { attended: [] };
  f.username = name;
  f.town = (document.getElementById('fc-town').value || '').trim();
  f.since = (document.getElementById('fc-since').value || '').trim();
  f.meaning = (document.getElementById('fc-meaning').value || '').trim();
  var ov = document.getElementById('fz-editor');
  if (ov._photo) f.photo = ov._photo;
  setFan(f);
  closeEditor();
  renderFanCard(); renderLadder(f);
  toast('Card saved to your phone 💛');
}

/* ---------- LADDER ---------- */
function renderLadder(f) {
  var el = document.getElementById('fz-ladder'); if (!el) return;
  var games = f ? (f.attended || []).length : -1;
  var rungs = [
    { g: 1, t: 'Matchgoer', d: 'Your first game in. You\'re one of us.' },
    { g: 5, t: 'Regular', d: 'Shout-outs & early team news.' },
    { g: 10, t: 'Loyal Laner', d: 'Become a Patron — your name on the wall.' },
    { g: 25, t: 'Lane Legend', d: 'Priority for matchday rewards & events.' },
    { g: 50, t: 'Terrace Royalty', d: 'First call on everything The Lane does.' },
  ];
  el.innerHTML = rungs.map(function (r) {
    var on = games >= r.g;
    return '<div class="fz-rung' + (on ? ' on' : '') + '"><div class="fz-rung__g">' + r.g + '</div>' +
      '<div class="fz-rung__t">' + r.t + (on ? ' ✓' : '') + '</div>' +
      '<div class="fz-rung__d">' + r.d + '</div></div>';
  }).join('');
}

/* ---------- PATRONS WALL ---------- */
async function renderWall() {
  var el = document.getElementById('fz-wall'); if (!el) return;
  try {
    var d = await (await fetch('data/patrons.json?t=' + Date.now())).json();
    var list = d.patrons || [];
    if (!list.length) {
      el.innerHTML = '<div style="grid-column:1/-1;text-align:center;font-family:var(--font-b);color:var(--grey);padding:30px">Our patrons wall is just getting started. Get to the games, climb the ladder, and be one of the first names up here. 💛</div>';
      return;
    }
    var fom = d.fanOfMonth;
    el.innerHTML = list.map(function (p) {
      var featured = p.featured || p.id === fom;
      var photo = p.photo
        ? '<img class="patron__photo" src="' + esc(p.photo) + '" alt="">'
        : '<div class="patron__photo">' + esc((p.username || 'L').slice(0, 2).toUpperCase()) + '</div>';
      var badges = (p.badges || []).map(function (b) { return '<span class="patron__badge">' + esc(b) + '</span>'; }).join('');
      var years = p.since ? (2026 - parseInt(p.since)) : null;
      return '<div class="patron' + (featured ? ' patron--featured' : '') + '">' +
        (featured ? '<div class="patron__crown">★ Fan of the Month</div>' : '') +
        photo +
        '<div class="patron__name">' + esc(p.username || 'Lane Fan') + '</div>' +
        '<div class="patron__meta">' + (p.town ? esc(p.town) + ' &middot; ' : '') + (years != null ? years + ' yrs a fan' : '') + (p.games ? ' &middot; ' + p.games + ' games' : '') + '</div>' +
        (p.quote ? '<div class="patron__quote">&ldquo;' + esc(p.quote) + '&rdquo;</div>' : '') +
        (badges ? '<div class="patron__badges">' + badges + '</div>' : '') +
      '</div>';
    }).join('');
  } catch (e) {
    el.innerHTML = '';
  }
}

/* ---------- OFFICIAL SIGN-UP (private → Netlify Forms) ---------- */
function fanSignup(form) {
  var data = new FormData(form);
  var body = new URLSearchParams();
  data.forEach(function (v, k) { body.append(k, v); });
  fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() })
    .then(function () { fanThanks(form); })
    .catch(function () { fanThanks(form); });
  return false;
}
function fanThanks(form) {
  form.innerHTML = '<div style="text-align:center;padding:20px"><div style="font-family:var(--font-d);font-size:30px;color:var(--yellow);margin-bottom:8px">You\'re in the family! 💛</div>' +
    '<p style="font-family:var(--font-b);color:var(--lgrey);line-height:1.6">The Lane has your back. Keep your fan card handy and we\'ll see you at Tithe Farm.</p></div>';
}

/* ---------- toast ---------- */
function toast(msg, err) {
  var t = document.getElementById('fz-toast');
  if (!t) { t = document.createElement('div'); t.id = 'fz-toast'; t.style.cssText = 'position:fixed;bottom:84px;left:50%;transform:translateX(-50%) translateY(120px);background:#22C55E;color:#fff;font-family:var(--font-c);font-weight:700;letter-spacing:.04em;padding:12px 22px;border-radius:8px;z-index:100000;transition:transform .3s;max-width:90vw;text-align:center'; document.body.appendChild(t); }
  t.innerHTML = msg; t.style.background = err ? '#EF4444' : '#22C55E';
  t.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(t._t); t._t = setTimeout(function () { t.style.transform = 'translateX(-50%) translateY(120px)'; }, 3000);
}
