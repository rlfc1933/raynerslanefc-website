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

// Founding Laner — anyone who joins during the club's launch season gets a
// permanent badge. Scarcity by time (the window closes), belonging forever.
var FOUNDING_CUTOFF = '2027-06-01';
function isFounding(f) { return f && f.joined && f.joined < FOUNDING_CUTOFF; }

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
  if (!f.joined) f.joined = new Date().toISOString().slice(0, 10); // founding-season stamp
  if (f.laneNo) { setFan(f); return f.laneNo; }
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

function esc(s)    { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ---------- ACCOUNTS ----------
   REAL accounts (email + username + password, unique, cross-device) run on
   Supabase the moment js/supabase-config.js is filled in. Until then everything
   below falls back to the on-device Lane Card (no password) so the site still
   works. SB === null means "not configured → device mode". */
var SBCFG = (window.RLFC_SUPABASE || {});
var SB = (SBCFG.url && SBCFG.anonKey && window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(SBCFG.url, SBCFG.anonKey) : null;
var sbUser = null, sbProfile = null;
var SESSION_OUT = 'rlfc_signedout';

async function sbLoadProfile() {
  if (!SB || !sbUser) { sbProfile = null; return; }
  try { var r = await SB.from('fans').select('*').eq('id', sbUser.id).single(); sbProfile = r.data || null; }
  catch (e) { sbProfile = null; }
}
async function sbRestore() {
  if (!SB) return;
  try { var s = await SB.auth.getSession(); sbUser = (s.data && s.data.session) ? s.data.session.user : null; } catch (e) { sbUser = null; }
  await sbLoadProfile();
}
async function sbUsernameTaken(u) { try { var r = await SB.rpc('username_taken', { u: u }); return !!r.data; } catch (e) { return false; } }
function sbRandLane() { return String(Math.floor(Math.random() * 9000) + 1000); }
async function sbSignUp(d) {
  var email = (d.email || '').trim(), pass = d.password || '', username = (d.username || '').trim();
  var name = (d.name || '').trim(), town = (d.town || '').trim();
  if (!email || !pass || !username || !name) return { error: 'Please fill in your name, email, username and password.' };
  if (pass.length < 6) return { error: 'Password must be at least 6 characters.' };
  if (!/^[a-zA-Z0-9_.]{3,}$/.test(username)) return { error: 'Username: 3+ letters, numbers, _ or . only.' };
  if (await sbUsernameTaken(username)) return { error: 'That username is already taken — pick another.' };
  var su = await SB.auth.signUp({ email: email, password: pass });
  if (su.error) return { error: su.error.message };
  if (!su.data.user) return { error: 'Could not create the account.' };
  if (!su.data.session) return { needConfirm: true };       // email-confirmation is on
  sbUser = su.data.user;
  var ok = false, tries = 0;
  while (!ok && tries < 6) {
    tries++;
    var ins = await SB.from('fans').insert({ id: sbUser.id, username: username, name: name, town: town, since: d.since || '', lane_no: sbRandLane() });
    if (!ins.error) { ok = true; break; }
    if (/lane_no/.test(ins.error.message || '')) continue;
    if (/username/.test(ins.error.message || '')) return { error: 'That username was just taken — try another.' };
    return { error: ins.error.message };
  }
  await sbLoadProfile();
  return { ok: true };
}
async function sbLogin(email, pass) {
  var r = await SB.auth.signInWithPassword({ email: (email || '').trim(), password: pass || '' });
  if (r.error) return { error: r.error.message };
  sbUser = r.data.user; await sbLoadProfile();
  if (!sbProfile) return { error: 'Logged in, but no Lane profile found for this account.' };
  return { ok: true };
}
async function sbLogout() { try { await SB.auth.signOut(); } catch (e) {} sbUser = null; sbProfile = null; }

function getFan() {
  if (SB) {
    if (!sbProfile) return null;
    return { username: sbProfile.name || sbProfile.username, handle: sbProfile.username, town: sbProfile.town,
             since: sbProfile.since, laneNo: sbProfile.lane_no, meaning: sbProfile.meaning,
             joined: (sbProfile.created_at || '').slice(0, 10), photo: sbProfile.photo || '' };
  }
  try { return JSON.parse(localStorage.getItem(FAN_KEY)) || null; } catch (e) { return null; }
}
function setFan(f) { if (SB) return; localStorage.setItem(FAN_KEY, JSON.stringify(f)); }
function isSignedIn() { return SB ? (!!sbUser && !!sbProfile) : (!!getFan() && localStorage.getItem(SESSION_OUT) !== '1'); }
function joinOrCreate(mode) { if (SB) openAuth(mode || 'signup'); else openCardEditor(); }
function signIn() {
  if (SB) { openAuth('login'); return; }
  if (!getFan()) { openCardEditor(); return; }
  localStorage.removeItem(SESSION_OUT); refreshFanUI(); toast('Welcome back 💛');
}
async function signOut() {
  if (SB) { await sbLogout(); refreshFanUI(); toast('Logged out 💛'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  localStorage.setItem(SESSION_OUT, '1'); refreshFanUI(); toast('Logged out — your card is safe on this device. Log back in any time.'); window.scrollTo({ top: 0, behavior: 'smooth' });
}
function refreshFanUI() {
  // Let the rest of the site know they're a member, so the homepage join-prompt
  // never pesters someone who already has an account.
  try { if (getFan()) localStorage.setItem('rlfc_member', '1'); } catch (e) {}
  renderAccountBar(); renderFanCard(); renderMembers(); renderLadder(getFan());
}

function renderAccountBar() {
  var el = document.getElementById('fz-account'); if (!el) return;
  var f = getFan();
  if (!f || !isSignedIn()) {
    var sub = SB ? 'Create your free account — log in from any device.' : 'Create your free card to unlock member perks &amp; vouchers.';
    var btns = SB
      ? '<button class="fz-acct__btn" onclick="openAuth(\'login\')">Log in</button><button class="fz-acct__btn fz-acct__btn--y" style="margin-left:6px" onclick="openAuth(\'signup\')">Join</button>'
      : (f ? '<button class="fz-acct__btn fz-acct__btn--y" onclick="signIn()">Log in</button>' : '<button class="fz-acct__btn fz-acct__btn--y" onclick="openCardEditor()">Join Free</button>');
    el.innerHTML = '<div class="fz-acct"><div class="fz-acct__av">&#10024;</div>' +
      '<div class="fz-acct__main"><div class="fz-acct__hi">' + (f && !SB ? 'Welcome back' : 'Join The Lane') + '</div>' +
      '<div class="fz-acct__sub">' + sub + '</div></div>' + btns + '</div>';
    return;
  }
  var laneNo = ensureLaneNo(f);
  var initials = (f.username || 'L').trim().slice(0, 2).toUpperCase();
  var av = f.photo ? '<img src="' + f.photo + '" alt="">' : esc(initials);
  el.innerHTML = '<div class="fz-acct">' +
    '<div class="fz-acct__av">' + av + '</div>' +
    '<div class="fz-acct__main"><div class="fz-acct__hi">Hi, ' + esc(f.username || 'Lane Fan') + '</div>' +
    '<div class="fz-acct__sub">' + (f.handle ? '@' + esc(f.handle) + ' &middot; ' : '') + 'Lane <b>#' + esc(laneNo) + '</b> &middot; signed in</div></div>' +
    '<button class="fz-acct__btn" onclick="signOut()">Log out</button></div>';
}

/* ---------- LOGIN / SIGN-UP MODAL (Supabase) ---------- */
function authErr(msg) { var e = document.getElementById('au-err'); if (e) { e.innerHTML = msg; e.style.display = 'block'; } }
function openAuth(mode) {
  if (!SB) { openCardEditor(); return; }
  mode = mode || 'login';
  var ov = document.getElementById('fz-editor');
  if (!ov) { ov = document.createElement('div'); ov.id = 'fz-editor'; ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(6,6,6,.85);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:18px'; document.body.appendChild(ov); }
  function fld(id, label, type, ph) {
    return '<label style="display:block;font-family:var(--font-c);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--grey);margin:11px 0 5px">' + label + '</label>' +
      '<input id="' + id + '" type="' + type + '" placeholder="' + (ph || '') + '" autocomplete="off" style="width:100%;background:#0f0f0f;border:1px solid var(--border);border-radius:8px;color:#fff;font-family:var(--font-b);font-size:15px;padding:11px 13px">';
  }
  var login = fld('au-email', 'Email', 'email', 'you@email.com') + fld('au-pass', 'Password', 'password', '') +
    '<button class="fz-btn fz-btn--y" style="width:100%;margin-top:16px" onclick="doLogin()">Log In</button>' +
    '<p style="text-align:center;font-family:var(--font-b);font-size:13px;color:var(--grey);margin-top:14px">New here? <a onclick="openAuth(\'signup\')" style="color:var(--yellow);cursor:pointer;font-weight:700">Create an account</a></p>';
  var signup = fld('au-name', 'Your name', 'text', 'Sukh Banwait') + fld('au-town', 'Town', 'text', 'Slough') +
    fld('au-email', 'Email', 'email', 'you@email.com') + fld('au-user', 'Username (your handle)', 'text', 'sukh_b') + fld('au-pass', 'Password (min 6)', 'password', '') +
    '<button class="fz-btn fz-btn--y" style="width:100%;margin-top:16px" onclick="doSignup()">Create My Account</button>' +
    '<p style="text-align:center;font-family:var(--font-b);font-size:13px;color:var(--grey);margin-top:14px">Already a member? <a onclick="openAuth(\'login\')" style="color:var(--yellow);cursor:pointer;font-weight:700">Log in</a></p>';
  ov.innerHTML = '<div style="width:100%;max-width:400px;max-height:92vh;overflow:auto;background:linear-gradient(180deg,#141414,#0b0b0b);border:1px solid var(--border);border-top:3px solid var(--yellow);border-radius:18px;padding:24px">' +
    '<div style="font-family:var(--font-d);font-size:26px;letter-spacing:.03em">' + (mode === 'signup' ? 'Join The Lane' : 'Welcome back') + '</div>' +
    '<div style="font-family:var(--font-b);font-size:13px;color:var(--grey);margin:4px 0 8px">' + (mode === 'signup' ? 'Your free Lane membership — works on any device.' : 'Log in to your Lane account.') + '</div>' +
    '<div id="au-err" style="display:none;font-family:var(--font-b);font-size:13px;color:#fca5a5;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:9px 12px;margin:6px 0"></div>' +
    (mode === 'signup' ? signup : login) +
    '<button class="fz-btn fz-btn--g" style="width:100%;margin-top:8px" onclick="closeEditor()">Cancel</button>' +
    '</div>';
  ov.style.display = 'flex';
}
async function doLogin() {
  var email = (document.getElementById('au-email').value || '').trim(), pass = document.getElementById('au-pass').value || '';
  if (!email || !pass) { authErr('Enter your email and password.'); return; }
  authErr('Logging in…');
  var r = await sbLogin(email, pass);
  if (r.error) { authErr(r.error); return; }
  closeEditor(); refreshFanUI(); toast('Welcome back 💛');
}
async function doSignup() {
  authErr('Creating your account…');
  var r = await sbSignUp({
    name: document.getElementById('au-name').value || '', town: document.getElementById('au-town').value || '',
    email: document.getElementById('au-email').value || '', username: document.getElementById('au-user').value || '',
    password: document.getElementById('au-pass').value || ''
  });
  if (r && r.error) { authErr(r.error); return; }
  if (r && r.needConfirm) { authErr('Account created — check your email to confirm, then log in.'); return; }
  closeEditor(); refreshFanUI(); toast('Welcome to The Lane! 💛');
}

/* ---------- MEMBERS AREA (vouchers, promos, member news) ---------- */
async function renderMembers() {
  var el = document.getElementById('fz-members'); if (!el) return;
  if (!isSignedIn()) {
    el.innerHTML = '<div class="fz-locked"><div class="fz-locked__ic">&#128274;</div>' +
      '<div class="fz-locked__t">Members-only perks</div>' +
      '<div class="fz-locked__p">Vouchers, promos and exclusive member news live here. Create your free Lane account (or log in) to unlock them.</div>' +
      '<button class="fz-btn fz-btn--y" style="max-width:240px;margin:0 auto" onclick="signIn()">' + (getFan() ? 'Log in' : 'Join Free') + '</button></div>';
    return;
  }
  var perks = [], news = [];
  try { var d = await (await fetch('data/perks.json?t=' + Date.now())).json(); perks = d.perks || []; news = d.news || []; } catch (e) {}
  var html = '';
  if (perks.length) {
    html += '<div class="fz-perks">' + perks.map(function (p) {
      return '<div class="fz-voucher"><span class="fz-voucher__tag">' + (p.sponsor ? esc(p.sponsor) : 'The Lane') + '</span>' +
        '<div class="fz-voucher__title">' + esc(p.title) + '</div>' +
        '<div class="fz-voucher__detail">' + esc(p.detail) + '</div>' +
        '<div class="fz-voucher__foot">' +
          (p.code ? '<span class="fz-voucher__code">' + esc(p.code) + '</span>' : '<span class="fz-voucher__exp">Show your Lane Card</span>') +
          (p.expiry ? '<span class="fz-voucher__exp">' + esc(p.expiry) + '</span>' : '') +
        '</div></div>';
    }).join('') + '</div>';
  }
  if (news.length) {
    html += '<div class="fz-mnews">' + news.map(function (n) {
      var dt = n.date ? new Date(n.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      return '<div class="fz-mnews__item"><div class="fz-mnews__t">' + esc(n.title) + '</div>' +
        '<div class="fz-mnews__b">' + esc(n.body) + '</div>' + (dt ? '<div class="fz-mnews__d">' + dt + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  }
  if (!html) html = '<div class="fz-locked"><div class="fz-locked__ic">&#128153;</div><div class="fz-locked__t">You&rsquo;re all set</div><div class="fz-locked__p">No perks live right now — as a member you&rsquo;ll be first to know when they drop.</div></div>';
  el.innerHTML = html;
}

async function initFanZone() {
  await loadAttendance();
  if (SB) {
    await sbRestore();
    // The old no-password "Join the Family List" form is replaced by real
    // accounts — hide it so there's one clear way in.
    var oldForm = document.querySelector('form[name="fan-signup"]');
    if (oldForm) { var s = oldForm.closest('.fz-sec'); if (s) s.style.display = 'none'; }
  }
  renderAccountBar();
  renderLadder(getFan());
  renderFanCard();
  renderMembers();
  renderWall();
  renderByNumbers();
}

// Social proof — adaptive: only shows numbers that are real, so it never looks
// empty at launch (heritage stats always show; community stats appear as they grow).
async function renderByNumbers() {
  var el = document.getElementById('fz-nums'); if (!el) return;
  var hearts = 0;
  (fanAttendance || []).forEach(function (m) { hearts += (m.lanes || []).length; });
  var patrons = 0;
  try { var p = await (await fetch('data/patrons.json?t=' + Date.now())).json(); patrons = (p.patrons || []).length; } catch (e) {}
  var stats = [{ b: '1933', s: 'Founded' }, { b: '90+', s: 'Years a Family' }];
  if (hearts > 0)  stats.push({ b: hearts.toLocaleString('en-GB'), s: 'Hearts Awarded' });
  if (patrons > 0) stats.push({ b: patrons, s: 'Patrons Championed' });
  el.innerHTML = stats.map(function (x) { return '<div class="fz-num"><b>' + x.b + '</b><span>' + x.s + '</span></div>'; }).join('');
  document.getElementById('nums-sec').style.display = 'block';
}

/* ---------- FAN CARD ---------- */
function renderFanCard() {
  var mount = document.getElementById('fancard-mount');
  if (!mount) return;
  var f = getFan();
  if (f && !isSignedIn()) {
    mount.innerHTML =
      '<div class="fancard" style="text-align:center;padding:34px 24px">' +
        '<div style="font-family:var(--font-d);font-size:28px;letter-spacing:.03em;margin-bottom:8px">You&rsquo;re logged out</div>' +
        '<p style="font-family:var(--font-b);color:var(--grey);font-size:14px;line-height:1.6;margin-bottom:20px">Your Lane Card is safely saved on this device. Log in to see it, your hearts and your member perks.</p>' +
        '<button class="fz-btn fz-btn--y" style="max-width:260px;margin:0 auto" onclick="signIn()">Log in as ' + esc(f.username || 'me') + '</button>' +
      '</div>';
    return;
  }
  if (!f) {
    mount.innerHTML =
      '<div class="fancard" style="text-align:center;padding:34px 24px">' +
        '<div style="font-family:var(--font-d);font-size:30px;letter-spacing:.03em;margin-bottom:8px">Get Your Lane Membership</div>' +
        '<p style="font-family:var(--font-b);color:var(--grey);font-size:14px;line-height:1.6;margin-bottom:20px">A free membership card — your own Lane number &amp; QR code. Show it at the turnstile and collect a yellow heart every game.</p>' +
        '<button class="fz-btn fz-btn--y" style="max-width:240px;margin:0 auto" onclick="joinOrCreate(\'signup\')">' + (SB ? 'Create My Account' : 'Create My Card') + '</button>' +
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
  var avatar = f.photo
    ? '<img class="vipcard__av" src="' + f.photo + '" alt="">'
    : '<div class="vipcard__av">' + esc(initials) + '</div>';
  var metaLine = (f.handle ? '@' + esc(f.handle) + ' &middot; ' : '') +
    (f.since ? 'Member since ' + esc(f.since) : 'The Lane Family') + (f.town ? ' &middot; ' + esc(f.town) : '');
  mount.innerHTML =
    // ── the card itself (this is what "Save to Phone" captures) ──
    '<div class="vipcard" id="lane-card">' +
      '<div class="vipcard__crestbg"></div><div class="vipcard__sheen"></div>' +
      '<div class="vipcard__head">' +
        '<img class="vipcard__crest" src="img/badge.png" alt="Rayners Lane FC">' +
        '<div class="vipcard__brand"><div class="vipcard__club">Rayners Lane FC</div><div class="vipcard__estd">Official Member &middot; Est. 1933</div></div>' +
        '<span class="vipcard__tier">' + (tier.icon ? tier.icon + ' ' : '') + esc(tier.name) + '</span>' +
      '</div>' +
      '<div class="vipcard__body">' + avatar +
        '<div class="vipcard__who">' +
          '<div class="vipcard__vlabel">Valued Member</div>' +
          '<div class="vipcard__name">' + esc(f.username || 'Lane Fan') + '</div>' +
          '<div class="vipcard__meta">' + metaLine + '</div>' +
          (isFounding(f) ? '<div class="vipcard__founding">⭐ Founding Laner</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="vipcard__strip">' +
        '<div class="vipcard__no"><span>Lane No.</span><b>' + esc(laneNo) + '</b></div>' +
        '<div class="vipcard__qr"><img id="memcard-qr" alt="Membership QR"></div>' +
      '</div>' +
      '<div class="vipcard__foot">Show at the turnstile &middot; raynerslanefc.co.uk</div>' +
    '</div>' +
    // ── everything else lives below the card, not on it ──
    '<div class="fz-extras">' +
      heartsRow +
      '<div class="fancard__stats" style="border:1px solid var(--border);border-radius:14px;overflow:hidden;background:var(--card);margin-top:8px">' +
        '<div class="fancard__stat"><div class="fancard__num">' + games + '</div><div class="fancard__lbl">Hearts</div></div>' +
        '<div class="fancard__stat"><div class="fancard__num">' + home + '</div><div class="fancard__lbl">At Home</div></div>' +
        '<div class="fancard__stat"><div class="fancard__num">' + nextMilestone(games) + '</div><div class="fancard__lbl">To Next Tier</div></div>' +
      '</div>' +
      (f.meaning ? '<div class="fancard__meaning" style="padding:14px 2px 4px">&ldquo;' + esc(f.meaning) + '&rdquo;</div>' : '') +
      '<div style="margin-top:10px">' + nextHtml + rewardsHtml + '</div>' +
      '<div class="fancard__foot" style="padding:6px 0 0">' +
        '<button class="fz-btn fz-btn--y" onclick="saveToPhone()">📲 Save to Phone</button>' +
        '<button class="fz-btn fz-btn--g" onclick="openCardEditor()">Edit Profile</button>' +
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
async function saveCard() {
  var name = (document.getElementById('fc-name').value || '').trim();
  if (!name) { toast('Add your name', true); return; }
  var ov = document.getElementById('fz-editor');
  // Real account: update the Supabase profile.
  if (SB) {
    if (!sbUser) { toast('Please log in first', true); return; }
    var upd = {
      name: name,
      town: (document.getElementById('fc-town').value || '').trim(),
      since: (document.getElementById('fc-since').value || '').trim(),
      meaning: (document.getElementById('fc-meaning').value || '').trim()
    };
    if (ov && ov._photo) upd.photo = ov._photo;
    var r = await SB.from('fans').update(upd).eq('id', sbUser.id);
    if (r.error) { toast(r.error.message, true); return; }
    await sbLoadProfile();
    closeEditor(); refreshFanUI(); toast('Profile updated 💛');
    return;
  }
  // Device mode: on-phone card.
  var f = getFan() || { attended: [] };
  f.username = name;
  f.town = (document.getElementById('fc-town').value || '').trim();
  f.since = (document.getElementById('fc-since').value || '').trim();
  f.meaning = (document.getElementById('fc-meaning').value || '').trim();
  if (ov && ov._photo) f.photo = ov._photo;
  setFan(f);
  localStorage.removeItem(SESSION_OUT);
  closeEditor();
  refreshFanUI();
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
  // Joining the Family List also creates an on-device Lane account + signs them
  // in, so they immediately get their card, Lane number and member perks.
  var f = getFan() || { attended: [] };
  if (!f.username) f.username = (data.get('name') || '').trim();
  if (!f.town)     f.town     = (data.get('town') || '').trim();
  if (!f.since)    f.since    = (data.get('since') || '').trim();
  if (!f.meaning)  f.meaning  = (data.get('meaning') || '').trim();
  setFan(f);
  ensureLaneNo(f);
  localStorage.removeItem(SESSION_OUT);
  refreshFanUI();
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
