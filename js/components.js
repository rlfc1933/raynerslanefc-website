/* ── Optional integrations (Phase 4) — set these to switch them ON; blank = off.
   Both degrade to nothing when empty, so the site never shows a dead widget. ──
   LANE_WHATSAPP : international number, digits only, no "+" (e.g. '447700900000')
                   → shows a floating WhatsApp click-to-chat button site-wide.
   LANE_HS_CHAT  : your HubSpot tracking-code src (HubSpot → Settings → Tracking
                   code), e.g. '//js-eu1.hs-scripts.com/1234567.js'
                   → loads HubSpot's free live chat on every page. */
var LANE_WHATSAPP = '';
var LANE_HS_CHAT  = '';

// Phase 1 image pipeline: load the Netlify Image CDN optimizer on public pages
// (components.js runs here but NOT on admin.html, so Post Studio canvas exports
// are untouched). Self-initialising, progressive, reversible.
(function () { var s = document.createElement('script'); s.src = 'js/img.js'; s.defer = true; document.head.appendChild(s); })();

// Floating WhatsApp click-to-chat button (only if a number is configured).
function initWhatsApp() {
  if (!LANE_WHATSAPP || document.getElementById('lane-wa')) return;
  var a = document.createElement('a');
  a.id = 'lane-wa';
  a.href = 'https://wa.me/' + LANE_WHATSAPP;
  a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('aria-label', 'Chat with us on WhatsApp');
  a.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9998;width:54px;height:54px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(0,0,0,.4);text-decoration:none';
  a.innerHTML = '<svg viewBox="0 0 32 32" width="30" height="30" fill="#fff"><path d="M16 3C9 3 3.5 8.5 3.5 15.5c0 2.4.7 4.7 1.9 6.7L3 29l7-1.8c1.9 1 4 1.6 6.1 1.6 7 0 12.5-5.5 12.5-12.5S23 3 16 3zm0 22.7c-1.9 0-3.7-.5-5.3-1.5l-.4-.2-4.1 1.1 1.1-4-.2-.4c-1.1-1.7-1.6-3.6-1.6-5.6C5.5 9.8 10.2 5.2 16 5.2s10.5 4.6 10.5 10.3S21.8 25.7 16 25.7zm5.8-7.7c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7.1c-1.9-.9-3.1-1.7-4.3-3.8-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.6s-.7-1.7-1-2.3c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-1.1 1.1-1.1 2.6-.1 4.1 1.5 2.3 3.1 4 5.6 5 .8.3 1.4.5 1.9.7.8.2 1.5.2 2.1.1.6-.1 1.9-.8 2.2-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4z"/></svg>';
  document.body.appendChild(a);
}

// Inject HubSpot's free live-chat tracking code (only if configured).
function initHubSpotChat() {
  if (!LANE_HS_CHAT || document.getElementById('hs-script-loader')) return;
  var s = document.createElement('script');
  s.id = 'hs-script-loader'; s.async = true; s.defer = true; s.type = 'text/javascript';
  s.src = LANE_HS_CHAT;
  document.head.appendChild(s);
}

// a11y: a "Skip to content" link (first thing a keyboard/screen-reader user hits)
// that jumps past the nav to the main content. Works on every page without needing
// per-page ids — it focuses the first meaningful region.
function initSkipLink() {
  if (document.getElementById('lane-skip')) return;
  var a = document.createElement('a');
  a.id = 'lane-skip'; a.className = 'skip-link'; a.href = '#';
  a.textContent = 'Skip to content';
  a.addEventListener('click', function (e) {
    e.preventDefault();
    var main = document.querySelector('main, [role="main"], .hero__left, .hero, section, h1');
    if (main) { main.setAttribute('tabindex', '-1'); main.focus(); main.scrollIntoView(); }
  });
  document.body.insertBefore(a, document.body.firstChild);
}

function dismissPWA() {
  localStorage.setItem('rlfc_pwa_dismissed', '1');
  var b = document.getElementById('pwa-banner');
  if (b) b.remove();
}

function acceptCookies() {
  localStorage.setItem('rlfc_cookies_accepted', '1');
  var b = document.getElementById('cookie-banner');
  if (b) b.remove();
}
function declineCookies() {
  localStorage.setItem('rlfc_cookies_accepted', '0');
  var b = document.getElementById('cookie-banner');
  if (b) b.remove();
}

// ── GOOGLE ANALYTICS 4 ──────────────────
(function() {
  var s1 = document.createElement('script');
  s1.async = true;
  s1.src = 'https://www.googletagmanager.com/gtag/js?id=G-F79MK3P0SR';
  document.head.appendChild(s1);
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-F79MK3P0SR');
  window.gtag = gtag;
})();

/* ─────────────────────────────────────────
   RAYNERS LANE FC — Shared Components
   ───────────────────────────────────────── */

const PAGES = [
  { href: 'index.html',     label: 'Home'      },
  { href: 'fixtures.html',  label: 'Fixtures'  },
  { href: 'squad.html',     label: 'The Squad' },
  { href: 'programme.html', label: 'Programme' },
  { href: 'about.html',     label: 'The Club'  },
  { href: 'contact.html',   label: 'Contact'   },
  { href: 'investment.html',label: 'Sponsors'  },
  { href: 'shop.html',      label: 'Shop'      },
  { href: 'policies.html',  label: 'Policies'  },
];

const TICKER_ITEMS = [
  "The Lane 2026-27: Combined Counties Premier Division North — Step 5",
  "Gary Pitt appointed First Team Manager — new era at Tithe Farm",
  "Summer Trials 2026 open — register on Pitchero now",
  "Harrow's club since 1933. Yellow & Green. Always.",
  "Fully integrated members section of Tithe Farm Sports & Social Club LTD",
  "Club vacancies — join the backroom team",
  "Get fixtures straight to your iPhone or Android — Fixtures page",
  "Affiliated: Middlesex County FA · The FA · FA Charter Standard",
  "Follow us @RaynersLaneFC · Home shirt sponsor: Hanlon Dry Lining",
];

const CREST_IMG = `<img src="img/badge.png" alt="Rayners Lane FC" style="width:100%;height:100%;object-fit:contain;border-radius:50%">`;

function buildNav(currentPage) {
  const links = [
    { label:'Home',        href:'index.html'      },
    { label:'News',        href:'news.html'       },
    { label:'Fixtures',    href:'fixtures.html'   },
    { label:'The Squad',   href:'squad.html'      },
    { label:'Programme',   href:'programme.html'  },
    { label:'Gallery',     href:'gallery.html'    },
    { label:'History',     href:'history.html'    },
    { label:'Membership',  href:'membership.html' },
    { label:'Fan Zone',    href:'fan-zone.html'   },
    { label:'Volunteer',   href:'volunteer.html'  },
    { label:'The Club',    href:'about.html'      },
    { label:'Contact',     href:'contact.html'    },
  ];

  var ico = {
    home:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    news:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h13v15H5a1 1 0 0 1-1-1z"/><path d="M17 8h3v9a2 2 0 0 1-2 2"/><path d="M7 9h7M7 13h7M7 17h4"/></svg>',
    fix:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    squad:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.5a3 3 0 0 1 0 5M20.5 20a5.5 5.5 0 0 0-4-5.3"/></svg>',
    more:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  };
  const bottomPrimary = [
    { label:'Home',     href:'index.html',    icon:ico.home  },
    { label:'News',     href:'news.html',     icon:ico.news  },
    { label:'Fixtures', href:'fixtures.html', icon:ico.fix   },
    { label:'Squad',    href:'squad.html',    icon:ico.squad },
  ];
  // "More" is active whenever we're not on one of the four primary tabs.
  const moreActive = bottomPrimary.every(function (l) { return l.href !== currentPage; });

  // Full mobile menu sheet — grouped links to EVERY page. Both the top ☰ and the
  // bottom "More" open this same sheet, so no page is unreachable on a phone.
  const menuGroups = [
    { h:'Matchday',     items:[['Fixtures & Results','fixtures.html'],['Match Programme','programme.html'],['The Squad','squad.html'],['Gallery','gallery.html']] },
    { h:'The Club',     items:[['About The Club','about.html'],['Our History','history.html'],['News','news.html'],['Contact','contact.html']] },
    { h:'Get Involved', items:[['Membership','membership.html'],['Fan Zone','fan-zone.html'],['Volunteer','volunteer.html'],['Player Trials','trials.html']] },
    { h:'Commercial',   items:[['Sponsorship','investment.html'],['Club Shop','shop.html']] },
  ];
  const mLink = function (label, href) {
    var on = currentPage === href;
    return `<a href="${href}" class="lane-menu__link${on ? ' lane-menu__link--active' : ''}"${on ? ' aria-current="page"' : ''}>${label}</a>`;
  };
  const menuSheet = `
  <div class="lane-menu" id="lane-menu" role="dialog" aria-modal="true" aria-label="Site menu" aria-hidden="true">
    <div class="lane-menu__scrim" onclick="laneMenuClose()"></div>
    <div class="lane-menu__panel">
      <div class="lane-menu__head">
        <span class="lane-menu__title">Menu</span>
        <button type="button" class="lane-menu__close" onclick="laneMenuClose()" aria-label="Close menu">&#10005;</button>
      </div>
      <div class="lane-menu__group">${mLink('Home', 'index.html')}</div>
      ${menuGroups.map(function (g) {
        return `<div class="lane-menu__group"><div class="lane-menu__gh">${g.h}</div>${g.items.map(function (it) { return mLink(it[0], it[1]); }).join('')}</div>`;
      }).join('')}
      <div class="lane-menu__foot">
        <button type="button" class="nav__install" onclick="laneMenuClose();laneInstall()">Install App</button>
      </div>
    </div>
  </div>`;

  const navLinks = links.map(l =>
    `<a href="${l.href}" class="nav__link${currentPage===l.href?' nav__link--active':''}">${l.label}</a>`
  ).join('');

  const bottomNav = bottomPrimary.map(l =>
    `<a href="${l.href}" class="bnav__item${currentPage===l.href?' bnav__item--active':''}">
      <span class="bnav__icon">${l.icon}</span>
      <span class="bnav__label">${l.label}</span>
    </a>`
  ).join('') +
    `<button type="button" class="bnav__item bnav__more${moreActive?' bnav__item--active':''}" data-menu-btn aria-controls="lane-menu" aria-expanded="false" aria-label="Open menu" onclick="laneMenuToggle()">
      <span class="bnav__icon">${ico.more}</span>
      <span class="bnav__label">More</span>
    </button>`;

  return `<nav class="nav" role="navigation">
    <div class="nav__i">
      <a href="index.html" class="nav__brand">
        <img src="img/badge.png" alt="Rayners Lane FC" class="nav__badge">
        <div class="nav__title">
          <span class="nav__title-main">Rayners Lane</span>
          <span class="nav__title-sub">FC &middot; Est. 1933 &middot; Harrow</span>
        </div>
      </a>
      <div class="nav__links" id="nav-links">${navLinks}</div>
      <div class="nav__actions">
        <button class="nav__install js-install" onclick="laneInstall()" title="Install the app">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M12 7v7M9 11l3 3 3-3"/></svg>
          <span>Install App</span>
        </button>
        <a href="fixtures.html" class="btn btn-primary nav__cta">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          Fixtures
        </a>
        <button type="button" class="nav__menu-btn" data-menu-btn aria-controls="lane-menu" aria-expanded="false" aria-label="Open menu" onclick="laneMenuToggle()">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
      </div>
    </div>
  </nav>
  <nav class="bnav" role="navigation" aria-label="Mobile navigation">
    ${bottomNav}
  </nav>
  ${menuSheet}`;
}

// ── Mobile menu sheet: open/close with a11y (scrim, Esc, back gesture, focus
//    trap). Both the top ☰ and the bottom "More" call laneMenuToggle(). ──
var _laneMenuOpener = null;
function _laneMenuBtns() { return document.querySelectorAll('[data-menu-btn]'); }
window.laneMenuOpen = function () {
  var m = document.getElementById('lane-menu');
  if (!m || m.classList.contains('open')) return;
  _laneMenuOpener = document.activeElement;
  m.classList.add('open'); m.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  _laneMenuBtns().forEach(function (b) { b.setAttribute('aria-expanded', 'true'); });
  var c = m.querySelector('.lane-menu__close'); if (c) c.focus();
  try { history.pushState({ laneMenu: 1 }, ''); } catch (e) {}
};
window.laneMenuClose = function (fromPop) {
  var m = document.getElementById('lane-menu');
  if (!m || !m.classList.contains('open')) return;
  m.classList.remove('open'); m.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  _laneMenuBtns().forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
  if (_laneMenuOpener && _laneMenuOpener.focus) { try { _laneMenuOpener.focus(); } catch (e) {} }
  // if we opened via a pushed history state, unwind it (unless this close WAS the back)
  if (!fromPop) { try { if (history.state && history.state.laneMenu) history.back(); } catch (e) {} }
};
window.laneMenuToggle = function () {
  var m = document.getElementById('lane-menu');
  if (m && m.classList.contains('open')) window.laneMenuClose(); else window.laneMenuOpen();
};
window.addEventListener('popstate', function () {
  var m = document.getElementById('lane-menu');
  if (m && m.classList.contains('open')) window.laneMenuClose(true); // Android back closes it
});
document.addEventListener('keydown', function (e) {
  var m = document.getElementById('lane-menu');
  if (!m || !m.classList.contains('open')) return;
  if (e.key === 'Escape') { window.laneMenuClose(); return; }
  if (e.key === 'Tab') { // focus trap inside the sheet
    var f = m.querySelectorAll('a[href],button:not([disabled])');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});


function buildTwitterSection() {
  return `
    <div style="background:var(--dark);border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:56px 0">
      <div class="container">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center">

          <div>
            <span style="font-family:var(--font-c);font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--yellow);display:block;margin-bottom:14px">Follow The Lane</span>
            <h2 style="font-family:var(--font-d);font-size:clamp(40px,5vw,68px);letter-spacing:.03em;color:var(--white);line-height:.95;margin-bottom:20px">
              Stay in the<br><span style="color:var(--yellow)">Loop</span>
            </h2>
            <p style="font-family:var(--font-b);font-size:15px;color:var(--grey);line-height:1.7;max-width:340px;margin-bottom:28px">
              News, results, signings and matchday updates. Follow The Lane on every platform.
            </p>
            <div style="display:flex;flex-direction:column;gap:10px;max-width:280px">
              <a href="https://twitter.com/RaynersLaneFC" target="_blank" rel="noopener"
                 style="display:flex;align-items:center;gap:12px;background:var(--black);border:1px solid var(--border);padding:13px 18px;font-family:var(--font-c);font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--white);text-decoration:none;transition:border-color .2s,color .2s"
                 onmouseover="this.style.borderColor='var(--yellow)';this.style.color='var(--yellow)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--white)'">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.738l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                @RaynersLaneFC on X
              </a>
              <a href="https://instagram.com/raynerslanefc" target="_blank" rel="noopener"
                 style="display:flex;align-items:center;gap:12px;background:var(--black);border:1px solid var(--border);padding:13px 18px;font-family:var(--font-c);font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--white);text-decoration:none;transition:border-color .2s,color .2s"
                 onmouseover="this.style.borderColor='var(--yellow)';this.style.color='var(--yellow)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--white)'">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/></svg>
                @raynerslanefc on Instagram
              </a>
              <a href="https://youtube.com/channel/UCN6SkwSIRK86x9Wk0AFoydA" target="_blank" rel="noopener"
                 style="display:flex;align-items:center;gap:12px;background:var(--black);border:1px solid var(--border);padding:13px 18px;font-family:var(--font-c);font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--white);text-decoration:none;transition:border-color .2s,color .2s"
                 onmouseover="this.style.borderColor='var(--yellow)';this.style.color='var(--yellow)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--white)'">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/></svg>
                YouTube Channel
              </a>
              <a href="https://www.pitchero.com/clubs/raynerslanefc" target="_blank" rel="noopener"
                 style="display:flex;align-items:center;gap:12px;background:var(--yellow);border:1px solid var(--yellow);padding:13px 18px;font-family:var(--font-c);font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--black);text-decoration:none;transition:opacity .2s"
                 onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
                Club Page on Pitchero
              </a>
            </div>
          </div>

          <div style="background:var(--black);border:1px solid var(--border);padding:32px;text-align:center">
            <img src="img/badge.png" alt="Rayners Lane FC" style="width:100px;height:100px;object-fit:contain;margin:0 auto 20px;display:block">
            <div style="font-family:var(--font-d);font-size:32px;letter-spacing:.04em;color:var(--white);margin-bottom:8px">Rayners Lane FC</div>
            <div style="font-family:var(--font-c);font-size:12px;color:var(--grey);letter-spacing:.1em;text-transform:uppercase;margin-bottom:24px">Est. 1933 &middot; Harrow &middot; The Lane</div>
            <div style="display:flex;justify-content:center;gap:16px">
              <a href="https://twitter.com/RaynersLaneFC" target="_blank" style="width:44px;height:44px;background:var(--card);border:1px solid var(--border);border-radius:3px;display:flex;align-items:center;justify-content:center;transition:border-color .2s" onmouseover="this.style.borderColor='var(--yellow)'" onmouseout="this.style.borderColor='var(--border)'">
                <svg viewBox="0 0 24 24" fill="white" width="16" height="16"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.738l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
              <a href="https://instagram.com/raynerslanefc" target="_blank" style="width:44px;height:44px;background:var(--card);border:1px solid var(--border);border-radius:3px;display:flex;align-items:center;justify-content:center;transition:border-color .2s" onmouseover="this.style.borderColor='var(--yellow)'" onmouseout="this.style.borderColor='var(--border)'">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="16" height="16"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="white" stroke="none"/></svg>
              </a>
              <a href="https://youtube.com/channel/UCN6SkwSIRK86x9Wk0AFoydA" target="_blank" style="width:44px;height:44px;background:var(--card);border:1px solid var(--border);border-radius:3px;display:flex;align-items:center;justify-content:center;transition:border-color .2s" onmouseover="this.style.borderColor='var(--yellow)'" onmouseout="this.style.borderColor='var(--border)'">
                <svg viewBox="0 0 24 24" fill="white" width="16" height="16"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/></svg>
              </a>
            </div>
          </div>

        </div>
      </div>
    </div>
  `;
}

function buildFooter() {
  return `
    <footer class="footer">
      <div class="container">
        <div class="footer__grid">
          <div class="footer__brand">
            <div class="nav__crest" style="background:transparent;box-shadow:none;width:56px;height:56px;margin-bottom:16px;padding:2px">${CREST_IMG}</div>
            <div class="footer__brand-name">RAYNERS LANE FC</div>
            <!-- Newsletter signup -->
            <div style="margin-bottom:20px">
              <div style="font-family:var(--font-c);font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--yellow);margin-bottom:8px">Stay in the Loop</div>
              <form name="newsletter" method="POST" data-netlify="true" style="display:flex;gap:0">
                <input type="hidden" name="form-name" value="newsletter">
                <input type="email" name="email" placeholder="Your email" required
                  style="flex:1;background:var(--dark);border:1px solid var(--border);border-right:none;color:var(--white);font-family:var(--font-b);font-size:14px;padding:10px 14px;outline:none">
                <button type="submit"
                  style="background:var(--yellow);color:var(--black);font-family:var(--font-c);font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:10px 16px;border:none;cursor:pointer;white-space:nowrap">
                  Sign Up
                </button>
              </form>
            </div>
            <p class="footer__brand-sub">
              Est. 1933. A fully integrated members section of Tithe Farm Sports &amp; Social Club LTD.<br>
              151 Rayners Lane, Harrow, Middlesex HA2 0XH.<br>
              Affiliated to Middlesex County FA &middot; The FA &middot; FA Charter Standard.
            </p>
            <div class="footer__social">
              <a href="https://twitter.com/RaynersLaneFC" target="_blank" rel="noopener" aria-label="X">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.738l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
              <a href="https://instagram.com/raynerslanefc" target="_blank" rel="noopener" aria-label="Instagram">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/></svg>
              </a>
              <a href="https://youtube.com/channel/UCN6SkwSIRK86x9Wk0AFoydA" target="_blank" rel="noopener" aria-label="YouTube">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/></svg>
              </a>
              <a href="https://www.pitchero.com/clubs/raynerslanefc" target="_blank" rel="noopener" aria-label="Pitchero">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
              </a>
            </div>
          </div>

          <div class="footer__col">
            <h4>The Club</h4>
            <ul>
              <li><a href="about.html">Club History</a></li>
              <li><a href="about.html#chairman">Pete Singh — Chairman</a></li>
              <li><a href="about.html#manager">Gary Pitt — Manager</a></li>
              <li><a href="about.html#committee">Committee</a></li>
              <li><a href="about.html#ground">Tithe Farm</a></li>
              <li><a href="media.html">Media</a></li>
            </ul>
          </div>

          <div class="footer__col">
            <h4>Match Day</h4>
            <ul>
              <li><a href="fixtures.html">All Fixtures</a></li>
              <li><a href="fixtures.html#fx-results">Results</a></li>
              <li><a href="fixtures.html#calendar">Sync to Phone</a></li>
              <li><a href="programme.html">Programme</a></li>
              <li><a href="squad.html">The Squad</a></li>
            </ul>
          </div>

          <div class="footer__col">
            <h4>Get Involved</h4>
            <ul>
              <li><a href="investment.html">Sponsorship</a></li>
              <li><a href="shop.html">Club Shop</a></li>
              <li><a href="https://www.easyfundraising.org.uk/causes/raynerslanefc" target="_blank">Easy Fundraising</a></li>
              <li><a href="volunteer.html">Volunteer</a></li>
              <li><a href="trials.html">Player Trials</a></li>
              <li><a href="contact.html">Contact Us</a></li>
              <li><a href="mailto:info@raynerslanefc.co.uk" style="color:var(--yellow)">info@raynerslanefc.co.uk</a></li>
              <li><a href="policies.html">Club Policies</a></li>
            </ul>
          </div>
        </div>

        <div class="footer__bottom">
          <p class="footer__legal">
            &copy; 2026 Rayners Lane FC. Tithe Farm Sports &amp; Social Club LTD. All rights reserved. &middot; <a href='mailto:info@raynerslanefc.co.uk' style='color:var(--yellow)'>info@raynerslanefc.co.uk</a> &middot; <a href='admin.html' style='color:rgba(255,255,255,.18);font-size:11px;letter-spacing:.06em'>Staff Admin</a>
          </p>
          <div class="affils">
            <span class="affil-item">FA Charter Standard</span>
            <span class="affil-item">Middlesex County FA</span>
            <span class="affil-item">The FA</span>
            <span class="affil-item">Kick It Out</span>
            <span class="affil-item">Football Foundation</span>
          </div>
        </div>
      </div>
    </footer>
  `;
}


// ── BACKGROUND IMAGERY ──────────────────
// Fades player/club images in and out behind every page
// Connect Instagram API later to use real match photos
const BG_IMAGES = [
  'img/players/player-forward-1.svg',
  'img/players/player-forward-2.svg',
  'img/players/player-gk-1.svg',
  'img/players/player-def-1.svg',
  'img/players/player-mid-1.svg',
  'img/players/player-mid-2.svg',
  'img/news/news-trials.svg',
  'img/news/news-signing.svg',
  'img/news/news-matchday.svg',
  'img/badge.png',
];

function initBgImagery() {
  // Create container
  const wrap = document.createElement('div');
  wrap.id = 'bg-imagery';

  // Create two layers for crossfade
  const a = document.createElement('div');
  const b = document.createElement('div');
  a.className = 'bg-img';
  b.className = 'bg-img';
  wrap.appendChild(a);
  wrap.appendChild(b);
  document.body.insertBefore(wrap, document.body.firstChild);

  let current = 0;
  let useA = true;

  function shuffle(arr) {
    const a = [...arr];
    for (let i=a.length-1;i>0;i--) {
      const j = Math.floor(Math.random()*(i+1));
      [a[i],a[j]] = [a[j],a[i]];
    }
    return a;
  }

  let shuffled = shuffle(BG_IMAGES);

  function next() {
    const img = shuffled[current % shuffled.length];
    current++;
    if (current >= shuffled.length) { shuffled = shuffle(BG_IMAGES); current = 0; }

    const active  = useA ? a : b;
    const inactive= useA ? b : a;

    active.style.backgroundImage = `url('${img}')`;
    // Slight random position for variety
    const positions = ['center top','center center','40% center','60% center','center 30%'];
    active.style.backgroundPosition = positions[Math.floor(Math.random()*positions.length)];
    active.style.backgroundSize = Math.random() > 0.5 ? 'contain' : 'cover';

    // Fade in active, fade out inactive
    inactive.classList.remove('visible');
    setTimeout(() => { active.classList.add('visible'); }, 50);
    useA = !useA;
  }

  next();
  setInterval(next, 7000);
}

// Resilient: run now if the DOM is already parsed, else wait for it. A bare
// addEventListener('DOMContentLoaded') silently no-ops if the event already
// fired (e.g. after a service-worker reload) — which is exactly why the nav
// used to vanish on some loads.
function laneOnReady(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
  else fn();
}

// Background imagery (the rotating cartoon player/mascot SVG illustrations) is
// DISABLED — replaced by a clean dark void behind the cinematic hero pitch, and
// soon a club background video. initBgImagery is left defined (unused) so it can
// be re-enabled in one line if ever wanted. To restore: laneOnReady(initBgImagery);
// laneOnReady(initBgImagery);




// Dynamic per-page SEO for client-rendered pages (news-article, player):
// unique title/description/canonical + OG/Twitter overrides + optional JSON-LD.
// (Google renders JS, so these are indexed; for social scrapers that don't run
// JS, a Netlify Edge meta-inject is the follow-up — see SEO-SETUP.md.)
function setPageSEO(o) {
  function upsert(key, keyAttr, val) {
    if (val == null || val === '') return;
    var m = document.head.querySelector('meta[' + keyAttr + '="' + key + '"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute(keyAttr, key); document.head.appendChild(m); }
    m.setAttribute('content', val);
  }
  if (o.title) { document.title = o.title; upsert('og:title', 'property', o.title); upsert('twitter:title', 'name', o.title); }
  if (o.description) { upsert('description', 'name', o.description); upsert('og:description', 'property', o.description); upsert('twitter:description', 'name', o.description); }
  if (o.image) { upsert('og:image', 'property', o.image); upsert('twitter:image', 'name', o.image); }
  if (o.canonical) {
    upsert('og:url', 'property', o.canonical);
    var l = document.head.querySelector('link[rel="canonical"]');
    if (!l) { l = document.createElement('link'); l.rel = 'canonical'; document.head.appendChild(l); }
    l.setAttribute('href', o.canonical);
  }
  upsert('og:type', 'property', o.ogType || 'article');
  if (o.jsonld) injectJSONLD(o.jsonldId || 'lane-page-ld', o.jsonld);
}
window.setPageSEO = setPageSEO;

// Inject a JSON-LD <script> once (id-guarded so it never duplicates).
function injectJSONLD(id, obj) {
  if (document.getElementById(id)) return;
  var s = document.createElement('script');
  s.type = 'application/ld+json'; s.id = id;
  s.textContent = JSON.stringify(obj);
  document.head.appendChild(s);
}
function initComponents(currentPage) {
  // Idempotent: whichever caller fires first (the page's own DOMContentLoaded
  // handler OR the self-healing boot at the bottom of this file) builds the
  // chrome exactly once. Prevents double nav/banners if both fire.
  if (window._laneChromeReady) return;
  window._laneChromeReady = true;

  // Google Search Console verification
  if (!document.querySelector('meta[name="google-site-verification"]')) {
    const gsc = document.createElement('meta');
    gsc.name = 'google-site-verification';
    gsc.content = '0mC_yWKrjp9LeMkDd_Xsux52BaiD8eRsaAE2nrjsaRA';
    document.head.appendChild(gsc);
  }

  // Inject Open Graph meta tags for social sharing
  const ogTags = [
    ['og:site_name',    'Rayners Lane FC'],
    ['og:type',         'website'],
    ['og:image',        'https://raynerslanefc.co.uk/img/og-card.jpg'],
    ['twitter:card',    'summary_large_image'],
    ['twitter:site',    '@RaynersLaneFC'],
    ['twitter:image',   'https://raynerslanefc.co.uk/img/og-card.jpg'],
  ];
  ogTags.forEach(([prop, content]) => {
    if (!document.querySelector(`meta[property="${prop}"],meta[name="${prop}"]`)) {
      const m = document.createElement('meta');
      m.setAttribute(prop.startsWith('twitter') ? 'name' : 'property', prop);
      m.setAttribute('content', content);
      document.head.appendChild(m);
    }
  });

  // ── Local SEO: site-wide SportsTeam + LocalBusiness identity (areaServed,
  //    geo, opening hours, sameAs) + a per-page BreadcrumbList. Data-driven,
  //    on every page. index.html keeps its own #team + FAQPage; Google merges
  //    same-@id nodes, so this simply enriches it with local signals. ──
  injectJSONLD('lane-org', {
    '@context': 'https://schema.org',
    '@type': ['SportsTeam', 'LocalBusiness'],
    '@id': 'https://raynerslanefc.co.uk/#team',
    name: 'Rayners Lane FC', alternateName: 'The Lane', sport: 'Soccer', foundingDate: '1933',
    url: 'https://raynerslanefc.co.uk/',
    logo: 'https://raynerslanefc.co.uk/img/badge.png',
    image: 'https://raynerslanefc.co.uk/img/og-card.jpg',
    email: 'info@raynerslanefc.co.uk',
    description: "Rayners Lane FC ('The Lane') — a community football club founded in 1933, playing non-league football at Tithe Farm, Harrow, in the Combined Counties Premier Division North.",
    memberOf: { '@type': 'SportsOrganization', name: 'Combined Counties Football League', url: 'https://www.combinedcountiesleague.co.uk' },
    address: { '@type': 'PostalAddress', streetAddress: '151 Rayners Lane', addressLocality: 'Harrow', addressRegion: 'Greater London', postalCode: 'HA2 0XH', addressCountry: 'GB' },
    geo: { '@type': 'GeoCoordinates', latitude: 51.5699654, longitude: -0.3651601 },
    areaServed: ['Harrow', 'Rayners Lane', 'Pinner', 'South Harrow', 'Ruislip', 'Northwood', 'Wembley'].map(function (n) { return { '@type': 'Place', name: n }; })
      .concat([{ '@type': 'AdministrativeArea', name: 'London Borough of Harrow' }]),
    openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: 'Saturday', opens: '14:00', closes: '17:00', description: 'Matchday' }],
    sameAs: [
      'https://twitter.com/RaynersLaneFC',
      'https://instagram.com/raynerslanefc',
      'https://www.youtube.com/channel/UCN6SkwSIRK86x9Wk0AFoydA',
      'https://www.pitchero.com/clubs/raynerslanefc'
    ]
  });

  const nav     = document.getElementById('nav-placeholder');
  const footer  = document.getElementById('footer-placeholder');
  const twitter = document.getElementById('twitter-placeholder');
  if (nav) nav.innerHTML = buildNav(currentPage);

  // BreadcrumbList on inner pages (Home › This page) — uses the active nav label.
  if (currentPage && currentPage !== 'index.html') {
    var act = document.querySelector('.nav__link--active');
    var label = (act && act.textContent.trim()) || (document.title || '').split('|')[0].trim() || 'Page';
    injectJSONLD('lane-breadcrumb', {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://raynerslanefc.co.uk/' },
        { '@type': 'ListItem', position: 2, name: label, item: 'https://raynerslanefc.co.uk/' + currentPage }
      ]
    });
  }
  // Portal the mobile menu sheet OUT of #nav-placeholder onto <body>. Every body
  // child gets `z-index:1` (see style.css), which is a stacking context that would
  // otherwise TRAP the sheet's z-index behind later page content — making it look
  // see-through AND letting clicks fall through to the content. As a direct body
  // child (excluded from that clamp in CSS) its z-index:10000 finally wins.
  var _sheet = document.getElementById('lane-menu');
  if (_sheet && _sheet.parentElement !== document.body) document.body.appendChild(_sheet);
  if (twitter) twitter.innerHTML = buildTwitterSection();
  if (footer)  footer.innerHTML  = buildFooter();

  initWhatsApp();      // floating WhatsApp button (Phase 4) — only if configured
  initHubSpotChat();   // HubSpot live chat (Phase 4) — only if configured
  initSkipLink();      // a11y: keyboard "skip to content" link




  // ── PWA / ADD TO HOME SCREEN ──
  var pwaHead = [
    '<link rel="manifest" href="/manifest.json">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
    '<meta name="apple-mobile-web-app-title" content="The Lane">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/img/icon-apple-180.png">',
    '<meta name="theme-color" content="#FFD100">',
  ];
  pwaHead.forEach(function(tag) {
    var tmp = document.createElement('div');
    tmp.innerHTML = tag;
    var el = tmp.firstChild;
    if (!document.querySelector('[rel="'+el.getAttribute('rel')+'"]') &&
        !document.querySelector('[name="'+el.getAttribute('name')+'"]')) {
      document.head.appendChild(el);
    }
  });

  // Register service worker + auto-reload once when a new version takes over,
  // so an updated site is never stuck behind a stale cache.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function(){});
    var _swRefreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (_swRefreshing) return;
      _swRefreshing = true;
      window.location.reload();
    });
  }

  // ── ONE-TAP INSTALL ("Add to Home Screen") ──
  // Captures the native install prompt (Android/Chrome) so any button can
  // trigger it; on iOS/desktop it shows the manual steps instead.
  window._lanePrompt = null;
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    window._lanePrompt = e;
    document.querySelectorAll('.js-install').forEach(function(b){ b.style.display = ''; });
  });
  window.addEventListener('appinstalled', function(){
    document.querySelectorAll('.js-install').forEach(function(b){ b.style.display = 'none'; });
  });
  // Already installed? Hide install buttons.
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
    document.querySelectorAll('.js-install').forEach(function(b){ b.style.display = 'none'; });
  }
  window.laneInstall = function() {
    if (window._lanePrompt) {
      window._lanePrompt.prompt();
      window._lanePrompt.userChoice.finally(function(){ window._lanePrompt = null; });
      return;
    }
    var iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    alert(iOS
      ? 'To install The Lane app:\n\n1. Tap the Share button (the square with an arrow)\n2. Scroll down and tap "Add to Home Screen"\n3. Tap Add — done!'
      : 'To install The Lane app:\n\nOpen your browser menu (⋮) and choose "Install app" or "Add to Home screen".');
  };

  // ── MATCH ALERTS (Web Push) ──
  // Opt-in: ask permission, subscribe with the club's VAPID key, store the
  // subscription server-side. Degrades gracefully everywhere it can't run.
  function urlB64ToUint8(base64) {
    var pad = '='.repeat((4 - base64.length % 4) % 4);
    var b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(b64), arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }
  window.laneEnableAlerts = async function (btn) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      var iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      alert(iOS
        ? 'Match alerts need the app installed first.\n\nTap Share → "Add to Home Screen", open The Lane from your home screen, then tap "Enable Match Alerts" again.'
        : 'Your browser doesn\'t support push alerts. Try Chrome, Edge or install the app from your browser menu.');
      return;
    }
    try {
      if (btn) { btn.disabled = true; btn.dataset.lbl = btn.textContent; btn.textContent = 'Turning on…'; }
      var cfg = await (await fetch('/.netlify/functions/push-key')).json();
      if (!cfg.enabled || !cfg.key) { alert('Match alerts aren\'t switched on by the club yet — check back soon. 💛'); return; }
      var perm = await Notification.requestPermission();
      if (perm !== 'granted') { alert('No problem — you can enable match alerts any time from this button.'); return; }
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(cfg.key) });
      var res = await (await fetch('/.netlify/functions/push-subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub })
      })).json();
      if (res.ok) {
        alert('You\'re in! 💛 We\'ll send a notification for kick-offs, goals and big club news.');
        if (btn) { btn.textContent = '✓ Match Alerts On'; return; }
      } else { alert('Couldn\'t save that just now — please try again in a moment.'); }
    } catch (e) {
      alert('Couldn\'t turn on alerts: ' + (e && e.message ? e.message : 'unknown error'));
    } finally {
      if (btn && btn.dataset.lbl && btn.textContent === 'Turning on…') { btn.textContent = btn.dataset.lbl; }
      if (btn) btn.disabled = false;
    }
  };
  var _notifyBtn = document.getElementById('notify-btn');
  if (_notifyBtn) {
    _notifyBtn.addEventListener('click', function () { window.laneEnableAlerts(_notifyBtn); });
    // (Fix B) Don't show a dead control. Hide "Enable Match Alerts" until the
    // club has actually configured Web Push (VAPID keys set → push-key reports
    // enabled). It reappears automatically the moment keys are added in Netlify.
    _notifyBtn.style.display = 'none';
    fetch('/.netlify/functions/push-key')
      .then(function (r) { return r.json(); })
      .then(function (cfg) { if (cfg && cfg.enabled && cfg.key) _notifyBtn.style.display = ''; })
      .catch(function () {});
  }


  // ── PWA INSTALL PROMPT ──
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!isStandalone) {
    var banner = document.createElement('div');
    banner.id = 'pwa-banner';
    banner.style.cssText = 'background:#FFD100;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;position:relative;z-index:10001;';
    var icon = isIOS
      ? '&#11014; Tap <strong>Share</strong> then <strong>Add to Home Screen</strong> to install The Lane app'
      : '&#11014; Tap <strong>Add to Home Screen</strong> to install The Lane app';
    banner.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;flex:1">' +
        '<img src="/img/badge.png" style="width:32px;height:32px;object-fit:contain;flex-shrink:0">' +
        '<div style="font-family:var(--font-c);font-size:12px;font-weight:600;color:#000;letter-spacing:.02em;line-height:1.4">' + icon + '</div>' +
      '</div>' +
      '<button onclick="dismissPWA()" style="background:rgba(0,0,0,.15);border:none;color:#000;font-family:var(--font-c);font-size:11px;font-weight:700;letter-spacing:.08em;padding:6px 10px;cursor:pointer;flex-shrink:0;-webkit-tap-highlight-color:transparent">✕</button>';
    document.body.insertBefore(banner, document.body.firstChild);
  }

  // ── COOKIE BANNER ──
  if (!localStorage.getItem('rlfc_cookies_accepted')) {
    var banner = document.createElement('div');
    banner.id = 'cookie-banner';
    banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#111;border-top:2px solid var(--yellow);padding:16px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;z-index:10000;flex-wrap:wrap;';
    banner.innerHTML = '<div style="font-family:var(--font-c);font-size:12px;color:var(--lgrey);letter-spacing:.04em;flex:1;min-width:200px">' +
      '<span style="color:var(--yellow);font-weight:700">🍪 Cookies</span> — We use cookies to improve your experience and track site visits via Google Analytics. ' +
      '<a href="policies.html" style="color:var(--yellow);text-decoration:underline">Learn more</a>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-shrink:0">' +
      '<button onclick="acceptCookies()" style="background:var(--yellow);color:var(--black);font-family:var(--font-c);font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:10px 20px;border:none;cursor:pointer;-webkit-tap-highlight-color:transparent">Accept</button>' +
      '<button onclick="declineCookies()" style="background:none;color:var(--grey);font-family:var(--font-c);font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:10px 16px;border:1px solid var(--border);cursor:pointer;-webkit-tap-highlight-color:transparent">Decline</button>' +
      '</div>';
    document.body.appendChild(banner);
  }

}

// ── SELF-HEALING CHROME BOOT ────────────────────────────────────────────
// Single source of truth: the nav + footer ALWAYS render on every page, even
// if that page forgot to call initComponents (squad.html) or its own
// DOMContentLoaded handler fired too late to attach. Derives the active page
// from the URL so the correct tab highlights. initComponents is idempotent,
// so a page's explicit call and this safety net never double-build.
(function () {
  function currentPageFile() {
    var p = (location.pathname || '').split('/').pop();
    return p && p.indexOf('.html') > -1 ? p : 'index.html';
  }
  function bootChrome() {
    try {
      var ph = document.getElementById('nav-placeholder');
      if (ph && !window._laneChromeReady) initComponents(currentPageFile());
    } catch (e) {}
  }
  laneOnReady(bootChrome);
})();

/* ── THE LANE CURSOR ─────────────────────────────────────────────────────
   A glowing yellow energy orb that trails the pointer, stretches with velocity,
   and blooms into a ring over anything interactive. It RIDES ALONGSIDE the
   native cursor (doesn't hide it) so forms, the admin panel and accessibility
   are never compromised. Desktop fine-pointers only; off under reduced-motion. */
function initLaneCursor() {
  if (window._laneCursorReady) return;
  var fine = window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  if (!fine || reduce) return;
  window._laneCursorReady = true;

  var css = document.createElement('style');
  css.textContent =
    '.lane-cur,.lane-ring{position:fixed;top:0;left:0;pointer-events:none;z-index:2147483600;' +
    'transform:translate3d(-50%,-50%,0);will-change:transform,opacity;mix-blend-mode:screen}' +
    '.lane-cur{width:14px;height:14px;border-radius:50%;' +
    'background:radial-gradient(circle,rgba(255,233,128,.95),rgba(255,209,0,.55) 45%,rgba(255,209,0,0) 70%);' +
    'filter:blur(1px)}' +
    '.lane-ring{width:34px;height:34px;border-radius:50%;border:1.5px solid rgba(255,209,0,.55);' +
    'box-shadow:0 0 18px 2px rgba(255,209,0,.18);transition:width .25s cubic-bezier(.2,.8,.2,1),' +
    'height .25s cubic-bezier(.2,.8,.2,1),border-color .25s,opacity .3s}' +
    '.lane-ring.is-hot{width:62px;height:62px;border-color:rgba(255,233,128,.9);box-shadow:0 0 28px 6px rgba(255,209,0,.28)}' +
    '.lane-ring.is-down{width:24px;height:24px}';
  document.head.appendChild(css);

  var orb = document.createElement('div'); orb.className = 'lane-cur';
  var ring = document.createElement('div'); ring.className = 'lane-ring';
  orb.style.opacity = ring.style.opacity = '0';
  document.body.appendChild(orb); document.body.appendChild(ring);

  var mx = window.innerWidth / 2, my = window.innerHeight / 2;
  var ox = mx, oy = my, rx = mx, ry = my, px = mx, py = my, raf = 0, shown = false;
  var SEL = 'a,button,input,textarea,select,summary,label,[role=button],.tile,.btn,.li-del';

  window.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    mx = e.clientX; my = e.clientY;
    if (!shown) { shown = true; orb.style.opacity = '1'; ring.style.opacity = '1'; }
  }, { passive: true });
  document.addEventListener('pointerover', function (e) {
    if (e.target && e.target.closest && e.target.closest(SEL)) ring.classList.add('is-hot');
  }, { passive: true });
  document.addEventListener('pointerout', function (e) {
    if (e.target && e.target.closest && e.target.closest(SEL) &&
        !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(SEL))) ring.classList.remove('is-hot');
  }, { passive: true });
  document.addEventListener('pointerdown', function () { ring.classList.add('is-down'); }, { passive: true });
  document.addEventListener('pointerup', function () { ring.classList.remove('is-down'); }, { passive: true });
  document.addEventListener('mouseleave', function () { orb.style.opacity = ring.style.opacity = '0'; });

  function loop() {
    raf = requestAnimationFrame(loop);
    ox += (mx - ox) * 0.85; oy += (my - oy) * 0.85;   // orb tracks tightly
    rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;   // ring lags → trailing energy
    var vx = mx - px, vy = my - py; px = mx; py = my;
    var speed = Math.min(Math.hypot(vx, vy), 60);
    var stretch = 1 + speed * 0.012, squash = 1 - speed * 0.006;
    var ang = Math.atan2(vy, vx) * 180 / Math.PI;
    orb.style.transform = 'translate3d(' + (ox - 7) + 'px,' + (oy - 7) + 'px,0) rotate(' + ang + 'deg) scale(' + stretch + ',' + squash + ')';
    ring.style.transform = 'translate3d(-50%,-50%,0)';
    ring.style.left = rx + 'px'; ring.style.top = ry + 'px';
  }
  loop();
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) cancelAnimationFrame(raf); else loop();
  });
}
laneOnReady(initLaneCursor);
