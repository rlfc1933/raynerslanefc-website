function toggleMobileNav() {
  var links = document.getElementById('nav-links');
  var burger = document.getElementById('nav-burger');
  if (!links) return;
  var isOpen = links.getAttribute('data-open') === '1';
  if (isOpen) {
    links.setAttribute('data-open','0');
    links.style.display = 'none';
    if (burger) burger.setAttribute('data-open','0');
  } else {
    links.setAttribute('data-open','1');
    links.style.cssText = 'display:flex !important;position:fixed;top:var(--nav-h);left:0;right:0;flex-direction:column;background:#0A0A0A;border-bottom:3px solid #FFD100;z-index:9999;padding:0;margin:0;box-shadow:0 8px 32px rgba(0,0,0,.9)';
    if (burger) burger.setAttribute('data-open','1');
  }
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
    { label:'Volunteer',   href:'volunteer.html'  },
    { label:'The Club',    href:'about.html'      },
    { label:'Contact',     href:'contact.html'    },
  ];

  const bottomLinks = [
    { label:'Home',     href:'index.html',     icon:'&#127968;' },
    { label:'News',     href:'news.html',      icon:'&#128240;' },
    { label:'Fixtures', href:'fixtures.html',  icon:'&#9917;'   },
    { label:'Squad',    href:'squad.html',     icon:'&#128101;' },
    { label:'More',     href:'about.html',     icon:'&#8942;'   },
  ];

  const navLinks = links.map(l =>
    `<a href="${l.href}" class="nav__link${currentPage===l.href?' nav__link--active':''}">${l.label}</a>`
  ).join('');

  const bottomNav = bottomLinks.map(l =>
    `<a href="${l.href}" class="bnav__item${currentPage===l.href?' bnav__item--active':''}">
      <span class="bnav__icon">${l.icon}</span>
      <span class="bnav__label">${l.label}</span>
    </a>`
  ).join('');

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
      <a href="fixtures.html" class="btn btn-primary nav__cta">&#9917; Fixtures</a>
    </div>
  </nav>
  <nav class="bnav" role="navigation" aria-label="Mobile navigation">
    ${bottomNav}
  </nav>`;
}


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
            </ul>
          </div>

          <div class="footer__col">
            <h4>Match Day</h4>
            <ul>
              <li><a href="fixtures.html">All Fixtures</a></li>
              <li><a href="fixtures.html#results">Results</a></li>
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
              <li><a href="contact.html">Sponsorship</a></li>
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

document.addEventListener('DOMContentLoaded', initBgImagery);




function initComponents(currentPage) {
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
    ['og:image',        'https://raynerslanefc.co.uk/img/badge.png'],
    ['twitter:card',    'summary'],
    ['twitter:site',    '@RaynersLaneFC'],
    ['twitter:image',   'https://raynerslanefc.co.uk/img/badge.png'],
  ];
  ogTags.forEach(([prop, content]) => {
    if (!document.querySelector(`meta[property="${prop}"],meta[name="${prop}"]`)) {
      const m = document.createElement('meta');
      m.setAttribute(prop.startsWith('twitter') ? 'name' : 'property', prop);
      m.setAttribute('content', content);
      document.head.appendChild(m);
    }
  });
  const nav     = document.getElementById('nav-placeholder');
  const footer  = document.getElementById('footer-placeholder');
  const twitter = document.getElementById('twitter-placeholder');
  if (nav) {
    nav.innerHTML = buildNav(currentPage);
    var burger = document.getElementById('nav-burger');
    var links  = document.getElementById('nav-links');
    if (burger) {
      burger.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleMobileNav();
      });
    }
    // Close on link click
    if (links) {
      links.querySelectorAll('a').forEach(function(a) {
        a.addEventListener('click', function() {
          links.style.display = 'none';
          links.setAttribute('data-open','0');
        });
      });
    }
    // Close on outside click
    document.addEventListener('click', function(e) {
      if (links && links.getAttribute('data-open')==='1') {
        if (!links.contains(e.target) && burger && !burger.contains(e.target)) {
          links.style.display = 'none';
          links.setAttribute('data-open','0');
        }
      }
    });
  }
  if (twitter) twitter.innerHTML = buildTwitterSection();
  if (footer)  footer.innerHTML  = buildFooter();




  // ── PWA / ADD TO HOME SCREEN ──
  var pwaHead = [
    '<link rel="manifest" href="/manifest.json">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
    '<meta name="apple-mobile-web-app-title" content="The Lane">',
    '<link rel="apple-touch-icon" href="/img/badge.png">',
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

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function(){});
  }


  // ── PWA INSTALL PROMPT ──
  var isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
  var isAndroid = /android/.test(navigator.userAgent.toLowerCase());
  var isMobile = isIOS || isAndroid;
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  var dismissed = localStorage.getItem('rlfc_pwa_dismissed');

  if (isMobile && !isStandalone && !dismissed) {
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

  document.addEventListener('click', e => {
    const btn  = document.getElementById('hamburger');
    const menu = document.getElementById('mob-menu');
    if (!btn || !menu) return;
    if (btn.contains(e.target))       menu.classList.toggle('open');
    else if (!menu.contains(e.target)) menu.classList.remove('open');
  });
}
