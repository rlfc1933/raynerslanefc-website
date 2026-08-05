// PORTAL RELEASE 2 — committee usability and safety closeout.
//
// Release 1 built the front door. This protects the things that make it safe
// to actually use: named form fields, destructive controls that are legible
// and deliberate, honest wording about where things go, and a mobile home
// short enough to read.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
const safety = fs.readFileSync(path.join(ROOT, 'js/portal-safety.js'), 'utf8');
const tools = fs.readFileSync(path.join(ROOT, 'js/portal-tools.js'), 'utf8');
const home = fs.readFileSync(path.join(ROOT, 'js/portal-home.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css/portal-home.css'), 'utf8');

// Relative luminance / contrast, so the assertion is the real WCAG maths
// rather than a string match on a hex value.
function lum(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ── FIXTURES ACCESSIBILITY (the Release 1 findings) ────────────────────────
test('destructive buttons meet WCAG AA contrast', () => {
  const rule = admin.match(/\.li-del\{[^}]*\}/)[0];
  const colour = rule.match(/color:(#[0-9A-Fa-f]{6})/)[1];
  // axe measured the composited background as #2c1b1b — the red tint over the
  // card. The old #ef4444 gave 4.36:1, which is why 40 nodes failed.
  const r = ratio(colour, '#2c1b1b');
  assert.ok(r >= 4.5, `destructive button contrast is ${r.toFixed(2)}:1, needs 4.5`);
  assert.ok(!/color:var\(--re\)/.test(rule), 'the failing token must no longer be used here');
});

test('destructive buttons still read as destructive', () => {
  const rule = admin.match(/\.li-del\{[^}]*\}/)[0];
  const colour = rule.match(/color:(#[0-9A-Fa-f]{6})/)[1].toLowerCase();
  const h = colour.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  assert.ok(r > g + 40 && r > b + 40, `${colour} must still be recognisably red`);
  assert.ok(/background:rgba\(239,68,68/.test(rule), 'and keep its red tint');
});

test('destructive buttons are large enough and show focus', () => {
  const rule = admin.match(/\.li-del\{[^}]*\}/)[0];
  assert.ok(/min-height:40px/.test(rule), 'a 6px-padded 11px button was too small to hit');
  assert.ok(/font-size:12px/.test(rule), 'and too small to read');
  assert.ok(/\.li-del:focus-visible\{outline:3px solid/.test(admin),
    'keyboard users must see where they are');
});

test('every form field gets a real accessible name', () => {
  // 273 label.fl elements carried no `for` at all, so a screen reader
  // announced every field in the portal as blank.
  assert.ok(/label\.fl:not\(\[for\]\)/.test(safety), 'unlabelled captions must be paired up');
  assert.ok(/lab\.setAttribute\('for', ctrl\.id\)/.test(safety), 'by a real for/id association');
  assert.ok(/c\.setAttribute\('aria-label'/.test(safety), 'with an aria-label fallback');
  assert.ok(/ctrl\.type === 'hidden'/.test(safety), 'hidden inputs must be skipped');
  assert.ok(/PortalSafety\.init\(\)/.test(admin), 'and it must actually run');
  assert.ok(/global\.openPanel = function/.test(safety),
    'panels render lists on open, so pairing must re-run per panel');
});

// ── DESTRUCTIVE ACTION SAFETY ──────────────────────────────────────────────
test('removal prompts say where it goes and whether it comes back', () => {
  assert.ok(/function confirmRemove\(what, where, recovery\)/.test(safety));
  assert.ok(/disappear from the public website/.test(safety), 'public removals say so');
  assert.ok(/Supporters will not see any change/.test(safety), 'internal removals say so');
  assert.ok(/only affects this browser on this device/.test(safety), 'device-only removals say so');
  assert.ok(/cannot be undone/.test(safety) && /Emergency Controls if this was a mistake/.test(safety),
    'recoverability must be stated honestly, both ways');
  const calls = (admin.match(/PortalSafety\.confirmRemove\(/g) || []).length;
  assert.ok(calls >= 14, `expected the removals to use the shared prompt, found ${calls}`);
});

test('high-risk actions require a typed word', () => {
  assert.ok(/function confirmTyped\(word, title, consequence\)/.test(safety));
  ['REMOVE', 'DELETE', 'REPUBLISH'].forEach(w => {
    assert.ok(new RegExp(`confirmTyped\\('${w}'`).test(admin), `${w} must be typed to proceed`);
  });
  // Release 1's rollback gate must survive untouched.
  assert.ok(/Type RESTORE to continue/.test(admin), 'Emergency Controls keeps its RESTORE gate');
  assert.ok(/!== 'RESTORE'/.test(admin));
});

test('no destructive action is left as a bare unexplained confirm', () => {
  const bare = [...admin.matchAll(/if \(!confirm\((.{0,120}?)\)\) return;/g)].map(m => m[1]);
  bare.forEach(t => {
    assert.ok(!/^'(Remove|Delete)/i.test(t.trim()),
      `still a bare destructive confirm: ${t.slice(0, 60)}`);
  });
});

// ── MOBILE HOME LENGTH ─────────────────────────────────────────────────────
test('club areas are compact by default so the mobile home is short', () => {
  // Every area previously rendered its whole grid of tool cards, which is what
  // made the mobile home 4.13 screens at 320px.
  assert.ok(!/<details class="ph-area"[^>]*\s+open/.test(home),
    'no area may render expanded by default');
  assert.ok(/ph-area__ask/.test(home), 'each area leads with its club question');
  assert.ok(/ph-area__chev/.test(home), 'and shows it can be opened');
  assert.ok(/min-height: 64px/.test(css), 'the row stays a comfortable target');
});

test('each area orients without needing tool names', () => {
  // Written as a shape rather than a list of exact sentences. The groups were
  // renamed when the club chose its own eight headings, and a test that
  // pinned the old wording would have failed for saying the right thing
  // differently. What must never change is that EVERY group asks the question
  // a volunteer arrives with, and names the job they usually want.
  const asks = (tools.match(/ask: '[^']+'/g) || []);
  const likely = (tools.match(/likely: '[^']+'/g) || []);
  const groups = (tools.match(/\{ key: '[a-z]+', name: '/g) || []).length;
  assert.ok(groups >= 8, 'expected the club’s groups to be present');
  assert.strictEqual(asks.length, groups, 'every group asks the volunteer’s question');
  assert.strictEqual(likely.length, groups, 'every group states the job people usually want');
  asks.forEach(a => assert.ok(a.trim().endsWith("?'"), `not phrased as a question: ${a}`));
});

test('the System area is visually marked as not routine work', () => {
  assert.ok(/ph-area--care/.test(home) && /ph-area--care/.test(css));
});

// ── HELP ───────────────────────────────────────────────────────────────────
test('help is reachable and answers the questions volunteers actually ask', () => {
  assert.ok(/hlp-btn[\s\S]{0,120}openPanel\('siteguide'\)/.test(admin), 'a Help control in the header');
  assert.ok(/id="portal-help"/.test(admin));
  ['Where do I start?', 'How do I know whether something is public?',
   'What does &ldquo;draft&rdquo; mean?', 'What is stored only on this device?',
   'How do I get back?', 'What if I make a mistake?',
   'Who should use Emergency Controls?', 'Why do other people see different shortcuts?',
   'The portal looks out of date'].forEach(q => {
    assert.ok(admin.includes(q), `Help must answer: ${q}`);
  });
  // It must live inside the existing handbook, not become a second guide.
  const helpIdx = admin.indexOf('id="portal-help"');
  const panelIdx = admin.lastIndexOf('id="panel-siteguide"', helpIdx);
  assert.ok(panelIdx > -1 && helpIdx - panelIdx < 4000, 'Help belongs inside Guides and Handbook');
  assert.ok(/The Lane Lowdown/.test(admin), 'and the Lowdown branding stays');
});

// ── RELEASE 1 GUARANTEES MUST SURVIVE ──────────────────────────────────────
test('Release 1 behaviour is intact', () => {
  assert.ok(/function paintCrumb\(name, panel\)/.test(admin), 'breadcrumbs');
  assert.ok(/history\.pushState\(\{ panel: name \}/.test(admin), 'hash + back');
  assert.ok(/function portalSaid\(kind, detail\)/.test(admin), 'one feedback vocabulary');
  assert.ok(/published:.*sticky: true/.test(admin), 'public confirmations stay until dismissed');
  assert.ok(/View all club tools/.test(home), 'the escape hatch');
  assert.ok(/\(name === 'users' \|\| name === 'developer'\) && !staffIsChairman\(\)/.test(admin),
    'chairman gating');
  assert.ok(!/>&#10003; Save to Site<\/button>/.test(admin), 'no bare publish labels');
  assert.ok(/on this device only/.test(admin), 'device-only rollback disclosed');
  assert.ok(/managed in HubSpot/.test(admin), 'HubSpot honesty');
});

test('no competing notification system was introduced', () => {
  // portalSaid stays the single vocabulary; PortalSafety must not grow its own.
  assert.ok(!/function .*[Tt]oast/.test(safety), 'PortalSafety must not define a toast');
  assert.ok(!/portal-said/.test(safety), 'nor its own sticky banner');
});

test('Match Day Ops permissions are untouched', () => {
  const auth = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/md-auth.js'), 'utf8');
  assert.ok(/'Committee':\s*\[CAP\.RECORD\]/.test(auth));
  assert.ok(/ELEVATED = \[CAP\.APPROVE, CAP\.REOPEN, CAP\.PRICES, CAP\.FINANCE\]/.test(auth));
});

test('reduced motion is respected where motion exists', () => {
  assert.ok(/@media \(prefers-reduced-motion: reduce\)/.test(css));
});

// ── PROTECTED DATA ─────────────────────────────────────────────────────────
test('this release touches no club data', () => {
  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/fixtures.json'), 'utf8'));
  assert.strictEqual(fx.fixtures.length, 40, 'fixture count must be unchanged');
  const sq = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/squad.json'), 'utf8'));
  assert.strictEqual((sq.players || []).length, 26, 'squad count must be unchanged');
  const sp = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/sponsors.json'), 'utf8'));
  assert.ok((sp.sponsors || []).length > 0, 'sponsors must still be present');
});
