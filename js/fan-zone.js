/* Rayners Lane FC — Fan Zone
   - Fan Card lives on the FAN'S device (localStorage). No personal data is
     ever sent to the public site.
   - The official sign-up posts privately to Netlify Forms (staff-only).
   - The Patrons Wall reads data/patrons.json (public, safe fields only). */

var FAN_KEY = 'rlfc_fan';

// ── LOYALTY: 5 tiers by total games attended ──
var TIERS = [
  { min: 50, name: 'Terrace Royalty', icon: '👑' },
  { min: 25, name: 'Lane Legend',     icon: '🏆' },
  { min: 10, name: 'Lane Loyal',      icon: '💛' },
  { min: 5,  name: 'Yellow Regular',  icon: '⚽' },
  { min: 1,  name: 'Local Laner',     icon: '🧣' },
  { min: 0,  name: 'New to The Lane', icon: '✨' },
];
function tierFor(games) { for (var i = 0; i < TIERS.length; i++) if (games >= TIERS[i].min) return TIERS[i]; return TIERS[TIERS.length - 1]; }

// ── REWARDS by HOME games (mostly free / sponsor-funded) ──
var REWARDS = [
  { home: 5,  title: '6th home game FREE',        note: 'Your next home match is on us. Show this at the gate.', sponsor: '' },
  { home: 10, title: 'A drink on the house',      note: 'Show this at the bar.', sponsor: "McCafferty's" },
  { home: 20, title: 'Matchday VIP',              note: 'Half-time shout-out, programme mention & toss the coin.', sponsor: '' },
  { home: 38, title: 'After-Season Party invite', note: 'An ever-present at The Lane. You earned your seat.', sponsor: '' },
];
// Official attendance is awarded by the CLUB (back end) — the fan's hearts come
// from data/attendance.json, matched on their unique Lane number. Staff enter
// the Lane numbers seen at the turnstile after each game.
var fanAttendance = [];
async function loadAttendance() {
  try { var d = await (await fetch('data/attendance.json?t=' + Date.now())).json(); fanAttendance = d.matches || []; }
  catch (e) { fanAttendance = []; }
}
function officialFor(laneNo) {
  var t = 0, h = 0;
  if (laneNo) fanAttendance.forEach(function (m) {
    if ((m.lanes || []).indexOf(String(laneNo)) > -1) { t++; if (m.home) h++; }
  });
  return { total: t, home: h };
}
function homeGames(f)  { return officialFor(f && f.laneNo).home; }
function totalGames(f) { return officialFor(f && f.laneNo).total; }
// Consecutive most-recent matches attended (a streak breaks the moment one is missed)
function attendStreak(f) {
  if (!f || !f.laneNo) return 0;
  var ms = fanAttendance.slice().sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
  var streak = 0;
  for (var i = ms.length - 1; i >= 0; i--) {
    if ((ms[i].lanes || []).indexOf(String(f.laneNo)) > -1) streak++; else break;
  }
  return streak;
}
// Previous reward threshold the fan has already passed (for the progress bar)
function prevRewardThreshold(home) { var p = 0; REWARDS.forEach(function (r) { if (home >= r.home) p = r.home; }); return p; }

// Each member gets a permanent unique Lane number (kept on their device + given
// to the club when they register, so the turnstile can match them).
function ensureLaneNo(f) {
  if (f.laneNo) return f.laneNo;
  var s = (f.username || '') + (f.since || '') + new Date().getTime() + Math.floor(Math.random() * 9999);
  var hash = 0; for (var i = 0; i < s.length; i++) { hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0; }
  f.laneNo = String(Math.abs(hash) % 9000 + 1000);
  setFan(f);
  return f.laneNo;
}
function renderQR(id, text) {
  if (typeof qrcode === 'undefined') return;
  try { var qr = qrcode(0, 'M'); qr.addData(text); qr.make(); var el = document.getElementById(id); if (el) el.src = qr.createDataURL(5, 6); } catch (e) {}
}
function unlockedRewards(f) { var h = homeGames(f); return REWARDS.filter(function (r) { return h >= r.home; }); }
function nextReward(f) { var h = homeGames(f); for (var i = 0; i < REWARDS.length; i++) if (h < REWARDS[i].home) return { reward: REWARDS[i], left: REWARDS[i].home - h }; return null; }

function getFan()  { try { return JSON.parse(localStorage.getItem(FAN_KEY)) || null; } catch (e) { return null; } }
function setFan(f) { localStorage.setItem(FAN_KEY, JSON.stringify(f)); }
function esc(s)    { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function initFanZone() {
  await loadAttendance();
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
        '<div style="font-family:var(--font-d);font-size:30px;letter-spacing:.03em;margin-bottom:8px">Get Your Lane Membership</div>' +
        '<p style="font-family:var(--font-b);color:var(--grey);font-size:14px;line-height:1.6;margin-bottom:20px">A free digital membership card — your own Lane number &amp; QR code. Show it at the turnstile and collect a yellow heart every game.</p>' +
        '<button class="fz-btn fz-btn--y" style="max-width:240px;margin:0 auto" onclick="openCardEditor()">Create My Card</button>' +
      '</div>';
    return;
  }
  var laneNo = ensureLaneNo(f);
  var games = totalGames(f);
  var home = homeGames(f);
  var tier = tierFor(games);
  var initials = (f.username || 'L').trim().slice(0, 2).toUpperCase();
  var photo = f.photo
    ? '<img class="fancard__photo" src="' + f.photo + '" alt="">'
    : '<div class="fancard__photo" style="display:flex;align-items:center;justify-content:center;font-family:var(--font-d);font-size:30px;color:#fff">' + esc(initials) + '</div>';
  var maxHearts = 16, hearts = '';
  for (var i = 0; i < Math.min(games, maxHearts); i++) hearts += '💛';
  if (games > maxHearts) hearts += ' <span style="font-family:var(--font-c);font-size:12px;color:var(--yellow);font-weight:700">+' + (games - maxHearts) + '</span>';
  var streak = attendStreak(f);
  var streakBadge = streak >= 2
    ? '<span style="float:right;font-family:var(--font-c);font-size:12px;font-weight:800;letter-spacing:.04em;color:#fb923c;background:rgba(251,146,60,.14);border:1px solid rgba(251,146,60,.3);border-radius:999px;padding:2px 10px">🔥 ' + streak + ' in a row</span>'
    : '';
  var heartsRow = games
    ? '<div style="padding:14px 18px 4px;font-size:17px;line-height:1.5;letter-spacing:1px">' + streakBadge + hearts + '</div>'
    : '<div style="padding:14px 18px 2px;font-family:var(--font-b);font-size:12.5px;color:var(--grey);line-height:1.5">No hearts yet — show your card at the gate and the club adds a 💛 after every game.</div>';

  // Progress bar to the next reward (anticipation)
  var nr = nextReward(f);
  var nextHtml = '';
  if (nr) {
    var prev = prevRewardThreshold(home), span = (nr.reward.home - prev) || 1;
    var pct = Math.max(4, Math.min(100, Math.round(((home - prev) / span) * 100)));
    nextHtml =
      '<div style="padding:8px 18px 14px">' +
        '<div style="display:flex;justify-content:space-between;font-family:var(--font-c);font-size:11px;letter-spacing:.04em;margin-bottom:6px">' +
          '<span style="color:#fff;font-weight:700">' + esc(nr.reward.title) + '</span>' +
          '<span style="color:var(--yellow);font-weight:700">' + nr.left + ' to go</span>' +
        '</div>' +
        '<div style="height:9px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden">' +
          '<div style="height:100%;width:' + pct + '%;border-radius:999px;background:linear-gradient(90deg,#FFD100,#fbbf24)"></div>' +
        '</div>' +
      '</div>';
  }

  // All rewards — unlocked shine, locked tease (mystery), each "powered by" its sponsor
  var rewardsHtml =
    '<div style="padding:2px 18px 16px"><div style="font-family:var(--font-c);font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--yellow);margin-bottom:8px">🎁 Rewards</div>' +
    REWARDS.map(function (r) {
      var got = home >= r.home;
      var powered = r.sponsor ? '<span style="display:inline-block;font-family:var(--font-c);font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#4ade80;background:rgba(34,197,94,.12);border-radius:4px;padding:2px 7px;margin-top:5px">⚡ Powered by ' + esc(r.sponsor) + '</span>' : '';
      if (got) {
        return '<div style="background:rgba(255,209,0,.08);border:1px solid rgba(255,209,0,.3);border-radius:8px;padding:9px 12px;margin-bottom:6px">' +
          '<div style="font-family:var(--font-c);font-size:13px;font-weight:700;color:#fff">✓ ' + esc(r.title) + '</div>' +
          '<div style="font-family:var(--font-b);font-size:11px;color:var(--grey);line-height:1.4">' + esc(r.note) + '</div>' + powered + '</div>';
      }
      return '<div style="background:rgba(255,255,255,.02);border:1px dashed var(--border);border-radius:8px;padding:9px 12px;margin-bottom:6px;opacity:.72">' +
        '<div style="font-family:var(--font-c);font-size:13px;font-weight:700;color:var(--lgrey,#bbb)">🔒 ' + esc(r.title) + '</div>' +
        '<div style="font-family:var(--font-b);font-size:11px;color:var(--grey)">' + (r.home - home) + ' more home game' + ((r.home - home) > 1 ? 's' : '') + ' to unlock</div>' + powered + '</div>';
    }).join('') + '</div>';
  mount.innerHTML =
    '<div class="fancard" id="lane-card">' +
      '<div class="memcard__bar">' +
        '<img class="memcard__badge" src="img/badge.png" alt="RLFC">' +
        '<div style="flex:1"><div class="memcard__title">The Lane Membership</div><div class="memcard__no">No. ' + esc(laneNo) + '</div></div>' +
        '<span class="fancard__tier">' + (tier.icon ? tier.icon + ' ' : '') + esc(tier.name) + '</span>' +
      '</div>' +
      '<div class="fancard__top">' + photo +
        '<div class="fancard__id">' +
          '<div class="fancard__name">' + esc(f.username || 'Lane Fan') + '</div>' +
          '<div class="fancard__since">' + (f.since ? 'Member since ' + esc(f.since) : 'The Lane Family') + (f.town ? ' &middot; ' + esc(f.town) : '') + '</div>' +
        '</div>' +
      '</div>' +
      heartsRow +
      '<div class="fancard__stats">' +
        '<div class="fancard__stat"><div class="fancard__num">' + games + '</div><div class="fancard__lbl">Hearts</div></div>' +
        '<div class="fancard__stat"><div class="fancard__num">' + home + '</div><div class="fancard__lbl">At Home</div></div>' +
        '<div class="fancard__stat"><div class="fancard__num">' + nextMilestone(games) + '</div><div class="fancard__lbl">To Next Tier</div></div>' +
      '</div>' +
      (f.meaning ? '<div class="fancard__meaning">&ldquo;' + esc(f.meaning) + '&rdquo;</div>' : '') +
      nextHtml + rewardsHtml +
      '<div class="memcard__qr"><img id="memcard-qr" alt="Membership QR code"><div class="memcard__qrnote">Show at the turnstile to collect your 💛</div></div>' +
      '<div class="fancard__foot">' +
        '<button class="fz-btn fz-btn--y" onclick="saveToPhone()">📲 Save to Phone</button>' +
        '<button class="fz-btn fz-btn--g" onclick="openCardEditor()">Edit Card</button>' +
      '</div>' +
    '</div>';
  renderQR('memcard-qr', 'RLFC LANE-' + laneNo + ' ' + (f.username || ''));
  var li = document.getElementById('sg-lane'); if (li) li.value = 'LANE-' + laneNo;
}
function saveToPhone() {
  toast('To save your card: take a screenshot, or tap your browser Share → "Add to Home Screen". Wallet passes coming soon!');
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
  var opp = '', home = true;
  try { var m = await (await fetch('data/matchday.json?t=' + Date.now())).json(); opp = m.opponent || ''; home = m.isHome !== false; } catch (e) {}
  var beforeRewards = unlockedRewards(f).length;
  f.attended.push({ date: today, opponent: opp, home: home });
  setFan(f);
  var games = totalGames(f);
  renderFanCard(); renderLadder(f);
  var afterRewards = unlockedRewards(f).length;
  if (afterRewards > beforeRewards) {
    var r = unlockedRewards(f)[afterRewards - 1];
    toast('🎉 REWARD UNLOCKED: ' + r.title + '!');
  } else {
    toast('Checked in! 💛 ' + games + ' game' + (games > 1 ? 's' : '') + ' &middot; ' + tierFor(games).name);
  }
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
  var games = f ? totalGames(f) : -1;
  var rungs = [
    { g: 1,  t: 'Local Laner',     i: '🧣', d: 'Your first game in. You\'re one of us.' },
    { g: 5,  t: 'Yellow Regular',  i: '⚽', d: 'Shout-outs, early team news + your 6th home game free.' },
    { g: 10, t: 'Lane Loyal',      i: '💛', d: 'Name on the Patrons wall + a drink on the house.' },
    { g: 25, t: 'Lane Legend',     i: '🏆', d: 'Matchday VIP — shout-outs, programme mention, coin toss.' },
    { g: 50, t: 'Terrace Royalty', i: '👑', d: 'Ever-present. After-season party invite + club pin badge.' },
  ];
  el.innerHTML = rungs.map(function (r) {
    var on = games >= r.g;
    return '<div class="fz-rung' + (on ? ' on' : '') + '"><div class="fz-rung__g">' + r.i + ' ' + r.g + '</div>' +
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
