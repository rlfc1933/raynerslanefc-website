/* ─────────────────────────────────────────
   RAYNERS LANE FC — Pitchero Live Feed
   Pulls news, fixtures & results from
   the club's Pitchero page automatically.
   ───────────────────────────────────────── */

const PITCHERO_RSS  = 'https://www.pitchero.com/clubs/raynerslanefc/rss.xml';
const CORS_PROXY    = 'https://api.allorigins.win/get?url=';

// ── FETCH & PARSE RSS ───────────────────────
async function fetchPitcheroFeed() {
  try {
    const url = CORS_PROXY + encodeURIComponent(PITCHERO_RSS);
    const res  = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Feed fetch failed');
    const json = await res.json();
    const parser = new DOMParser();
    const xml    = parser.parseFromString(json.contents, 'text/xml');
    const items  = xml.querySelectorAll('item');
    return Array.from(items).slice(0, 6).map(item => {
      const raw  = item.querySelector('description')?.textContent || '';
      // Strip HTML tags for plain text excerpt
      const desc = raw.replace(/<[^>]+>/g, '').trim().slice(0, 140);
      // Try to get image from media:content or enclosure
      const img  = item.querySelector('enclosure')?.getAttribute('url')
                || item.querySelector('content')?.getAttribute('url')
                || '';
      const rawDate = item.querySelector('pubDate')?.textContent || '';
      const date = rawDate ? new Date(rawDate).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric'
      }) : '';
      return {
        title: item.querySelector('title')?.textContent?.trim() || 'Club News',
        link:  item.querySelector('link')?.textContent?.trim()  || 'https://www.pitchero.com/clubs/raynerslanefc/news',
        date,
        desc,
        img,
      };
    });
  } catch (err) {
    console.warn('Pitchero RSS unavailable, using fallback:', err.message);
    return null;
  }
}

// ── CATEGORY BADGE + IMAGE ────────────────────────
function getCat(title) {
  const t = title.toUpperCase();
  if (t.includes('RESULT') || t.includes('WIN') || t.includes('DRAW') || t.includes('LOST')) return ['Result', '', 'img/news/news-matchday.svg'];
  if (t.includes('SIGN') || t.includes('JOIN') || t.includes('WELCOME'))  return ['Signing', 'green', 'img/news/news-signing.svg'];
  if (t.includes('TRIAL'))     return ['Trials', '',       'img/news/news-trials.svg'];
  if (t.includes('SPONSOR') || t.includes('COMMERCIAL') || t.includes('PARTNER')) return ['Commercial', '', 'img/news/news-commercial.svg'];
  if (t.includes('LEAGUE') || t.includes('ALLOC') || t.includes('TABLE'))  return ['League', 'green', 'img/news/news-league.svg'];
  if (t.includes('MATCH') || t.includes('PREVIEW') || t.includes('FIXTURE')) return ['Preview', '', 'img/news/news-matchday.svg'];
  if (t.includes('VACANC') || t.includes('RECRUIT') || t.includes('JOIN'))  return ['Vacancy', '', 'img/news/news-vacancies.svg'];
  if (t.includes('MANAGER') || t.includes('GAFFER') || t.includes('PITT'))  return ['Manager', 'green', 'img/news/news-signing.svg'];
  return ['News', '', 'img/news/news-default.svg'];
}

// ── RENDER NEWS GRID ────────────────────────
function renderNews(items) {
  const grid = document.getElementById('news-grid');
  if (!grid || !items || !items.length) return;

  const cards = items.map((item, i) => {
    const [cat, catClass, fallbackImg] = getCat(item.title);
    const featured = i === 0;
    const imgSrc = item.img || fallbackImg || 'img/news/news-default.svg';
    const imgHtml = `<img src="${imgSrc}" alt="${item.title}" style="width:100%;height:100%;object-fit:cover" loading="lazy">`;

    if (featured) {
      return `
        <a class="news-card news-card--featured" href="${item.link}" target="_blank" rel="noopener">
          <div class="news-card__img">${imgHtml}</div>
          <div class="news-card__content">
            <span class="news-card__cat ${catClass}">${cat}</span>
            <h3 class="news-card__title">${item.title}</h3>
            <p class="news-card__date">${item.date}</p>
          </div>
          <div class="news-card__arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </a>`;
    }

    return `
      <a class="news-card" href="${item.link}" target="_blank" rel="noopener">
        <div class="news-card__img" style="aspect-ratio:16/8">${imgHtml}</div>
        <div class="news-card__content">
          <span class="news-card__cat ${catClass}">${cat}</span>
          <h3 class="news-card__title">${item.title}</h3>
          ${item.desc ? `<p style="font-family:var(--font-b);font-size:14px;color:var(--grey);margin-bottom:10px;line-height:1.6">${item.desc}...</p>` : ''}
          <p class="news-card__date">${item.date}</p>
        </div>
        <div class="news-card__arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
      </a>`;
  });

  grid.innerHTML = cards.join('');
}

// ── SKELETON LOADER ─────────────────────────
function showNewsSkeleton() {
  const grid = document.getElementById('news-grid');
  if (!grid) return;
  grid.innerHTML = [0,1,2].map(i => `
    <div class="news-card" style="pointer-events:none">
      <div class="skeleton" style="width:100%;aspect-ratio:${i===0?'4/5':'16/8'}"></div>
      <div style="padding:20px 24px">
        <div class="skeleton" style="height:18px;width:60px;margin-bottom:12px;border-radius:2px"></div>
        <div class="skeleton" style="height:28px;width:90%;margin-bottom:8px;border-radius:2px"></div>
        <div class="skeleton" style="height:16px;width:50%;border-radius:2px"></div>
      </div>
    </div>`).join('');
}

// ── FALLBACK STATIC NEWS ─────────────────────
const FALLBACK_NEWS = [
  {
    title: 'Rayners Lane FC 2026-27 Commercial Sponsorship',
    link:  'https://www.pitchero.com/clubs/raynerslanefc/news/rayners-lane-fc-202627-commercial-sponsorship-2980361.html',
    date:  '22 May 2026',
    desc:  'Our commercial guide for the 2026-27 season is out now. Get involved.',
    img:   'img/news/news-commercial.svg',
  },
  {
    title: 'League Allocation 2026-27 Confirmed',
    link:  'https://www.pitchero.com/clubs/raynerslanefc/news/league-allocation-20262027-2979103.html',
    date:  '14 May 2026',
    desc:  "We're back at Step 5 in the Combined Counties Premier Division North. New manager Gary Pitt leads the charge.",
    img:   'img/news/news-league.svg',
  },
  {
    title: '1st Team Summer Trials 2026',
    link:  'https://www.pitchero.com/clubs/raynerslanefc/news/1st-team-summer-trials-2026-2977642.html',
    date:  '5 May 2026',
    desc:  'Manager Gary Pitt is building his squad. Register for trials this summer at Tithe Farm.',
    img:   'img/news/news-trials.svg',
  },
];

// ── INIT ─────────────────────────────────────
function fmtNewsDate(s){ return s ? new Date(s).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : ''; }

async function initPitcheroNews() {
  var items = [], seen = {};
  function push(it){ if (it && it.title && !seen[it.title]) { seen[it.title] = true; items.push(it); } }

  // 1) Render the club's OWN news from data/news.json INSTANTLY (no slow proxy)
  try {
    const r = await fetch('data/news.json?t='+Date.now());
    if (r.ok) {
      const d = await r.json();
      (d.articles || []).forEach(function(a){
        push({ title:a.title, link:'news-article.html?id='+a.id, date:fmtNewsDate(a.date), desc:(a.excerpt||'').slice(0,140), img:a.image || '' });
      });
    }
  } catch(e) {}
  renderNews(items.length ? items.slice(0,6) : FALLBACK_NEWS);

  // 2) Quietly top up with external feeds via our own fast Netlify function
  //    (server-side, no CORS, short timeout — never blocks the page).
  try {
    const ctl = new AbortController();
    const tm = setTimeout(function(){ ctl.abort(); }, 6000);
    const res = await fetch('/.netlify/functions/fetch-news', { signal: ctl.signal });
    clearTimeout(tm);
    if (res.ok) {
      const data = await res.json();
      (data.articles || []).forEach(function(a){
        push({ title:a.title, link:a.link || '#', date:fmtNewsDate(a.date), desc:(a.excerpt||'').slice(0,140), img:a.image || '' });
      });
      if (items.length) renderNews(items.slice(0,6));
    }
  } catch(e) {}
}
