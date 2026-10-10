/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — programme reader

   Renders ONE published edition from its immutable stored version.

   Everything on the page comes from the snapshot taken at publication — the
   sponsors, the staff, the league table and the line-ups exactly as they were
   that day. Nothing here asks for current club data, because an archived
   programme showing next season's committee would be a lie about the past.

   Mobile-first: natural vertical reading, a sticky contents bar, real text at
   real sizes. No fixed A4 canvas, no pinch-and-zoom, no page-turn animation.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var root = document.getElementById('programme-reader');
  if (!root) return;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function qs(k) {
    try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; }
  }

  var HEADINGS = {
    cover: 'Matchday', welcome: 'Welcome to The Lane', opposition: 'Today’s Opposition',
    staff: 'Committee & Football Staff', sponsors: 'Our Partners',
    standings: 'League Table', fixtures: 'Results & Fixtures',
    join: 'Join The Lane', history: 'History of The Lane', squads: 'Today’s Squads',
    result: 'Full Time', record: 'The Match Record', preview: 'Match Preview',
    chairNotes: 'From the Chair', articles: 'Features', placements: 'Match Partners',
  };
  var TEAMS_PLACEHOLDER = 'Confirmed teams will appear here when available.';
  var RETRO_MARKER = 'Archive Edition — Reconstructed from verified match records';

  function clubStamp(iso) {
    var ms = Date.parse(iso);
    if (!isFinite(ms)) return '';
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric',
      month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
  }
  function paras(text) {
    return String(text || '').split(/\n{2,}/).map(function (t) { return t.trim(); }).filter(Boolean)
      .map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('');
  }

  /* Written by a named person and approved. Generated copy never appears here. */
  function chairNotes(c) {
    if (!c || !c.body || !c.approvedBy) return '';
    return '<div class="pr-body">' + paras(c.body) + (c.byline ? '<p class="pr-byline">' + esc(c.byline) + '</p>' : '') + '</div>';
  }
  function previewSection(pv) {
    if (!pv || !pv.body) return '';
    return '<div class="pr-body">' + paras(pv.body) + '</div>';
  }
  function articles(list) {
    if (!list || !list.length) return '';
    return list.map(function (a) {
      return '<article class="pr-article"><h3 class="pr-article__h">' + esc(a.title || '') + '</h3>' +
        (a.image ? '<figure class="pr-fig"><img src="' + esc(a.image) + '" alt="' + esc(a.caption || '') + '" loading="lazy">' +
          (a.caption || a.credit ? '<figcaption>' + esc(a.caption || '') + (a.credit ? ' · ' + esc(a.credit) : '') + '</figcaption>' : '') +
          '</figure>' : '') +
        '<div class="pr-body">' + paras(a.body) + (a.byline ? '<p class="pr-byline">' + esc(a.byline) + '</p>' : '') + '</div></article>';
    }).join('');
  }
  /* Only approved commercial placements reach a version, so whatever is here
     was agreed. Nothing is inferred and nothing is substituted. */
  function placements(list) {
    if (!list || !list.length) return '';
    var NAMES = { title_sponsor: 'Programme partner', match_sponsor: 'Match sponsor', match_ball: 'Match-ball sponsor',
      full_page: 'Partner', half_page: 'Partner', quarter_page: 'Partner', directory: 'Local business directory' };
    return '<div class="pr-ads">' + list.map(function (p) {
      var art = p.artwork ? '<img class="pr-ad__art" src="' + esc(p.artwork) + '" alt="' + esc(p.sponsor) + '" loading="lazy">' : '';
      var inner = '<div class="pr-ad__k">' + esc(NAMES[p.kind] || 'Partner') + '</div>' + art +
        '<div class="pr-ad__n">' + esc(p.sponsor) + '</div>' + (p.copy ? '<p class="pr-ad__c">' + esc(p.copy) + '</p>' : '');
      var cls = 'pr-ad pr-ad--' + esc(p.kind);
      return p.website ? '<a class="' + cls + '" href="' + esc(p.website) + '" rel="noopener sponsored" target="_blank">' + inner + '</a>'
        : '<div class="' + cls + '">' + inner + '</div>';
    }).join('') + '</div>';
  }
  function record(r) {
    if (!r) return '';
    return '<p class="pr-marker">' + esc(r.marker || RETRO_MARKER) + '</p>' +
      '<div class="pr-body"><p>' + esc(r.note || '') + '</p></div>' +
      '<ul class="pr-record">' + (r.lines || []).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' +
      ((r.sources || []).length ? '<p class="pr-freshness">Source: ' + r.sources.map(function (x) { return esc(x.label + (x.ref ? ' (' + x.ref + ')' : '')); }).join('; ') + '</p>' : '');
  }

  function sec(key, n, inner) {
    if (!inner) return '';
    return '<section class="pr-sec" id="pr-' + key + '" aria-labelledby="pr-h-' + key + '">' +
      '<div class="pr-sec__n">' + (n < 10 ? '0' + n : n) + '</div>' +
      '<h2 class="pr-sec__h" id="pr-h-' + key + '">' + esc(HEADINGS[key] || key) + '</h2>' +
      inner + '</section>';
  }

  function welcome(w) {
    if (!w) return '';
    // Generated copy carries no byline. Only genuine editorial is attributed.
    return '<div class="pr-body"><p class="pr-lead">' + esc(w.lead) + '</p>' +
      (w.body ? '<p>' + esc(w.body) + '</p>' : '') + '</div>';
  }

  function opposition(o) {
    if (!o) return '';
    var facts = (o.facts || []).map(function (f) {
      return '<div class="pr-fact"><div class="pr-fact__l">' + esc(f.label) + '</div>' +
        '<div class="pr-fact__v">' + esc(f.value) + '</div></div>';
    }).join('');
    var profile = o.approvedProfile && o.approvedProfile.body
      ? '<div class="pr-body"><p>' + esc(o.approvedProfile.body) + '</p></div>' : '';
    var note = o.note ? '<div class="pr-body"><p>' + esc(o.note) + '</p></div>' : '';
    return '<div class="pr-body"><p class="pr-lead">' + esc(o.name || '') + '</p></div>' +
      profile + (facts ? '<div class="pr-facts">' + facts + '</div>' : '') + note;
  }

  function staff(s) {
    if (!s || !s.groups || !s.groups.length) return '';
    return s.groups.map(function (g) {
      return '<div class="pr-tier"><div class="pr-tier__h">' + esc(g.title) + '</div>' +
        '<div class="pr-people">' + (g.people || []).map(function (p) {
          return '<div class="pr-person"><div class="pr-person__r">' + esc(p.role) + '</div>' +
            '<div class="pr-person__n">' + esc(p.name) + '</div></div>';
        }).join('') + '</div></div>';
    }).join('');
  }

  function sponsors(s) {
    if (!s || !s.tiers || !s.tiers.length) return '';
    return '<div class="pr-body"><p>Rayners Lane FC is grateful to every partner who supports the club.</p></div>' +
      s.tiers.map(function (t) {
        return '<div class="pr-tier"><div class="pr-tier__h">' + esc(t.tier) + '</div>' +
          '<div class="pr-sponsors">' + (t.sponsors || []).map(function (sp) {
            var name = '<span>' + esc(sp.name) + '</span>';
            return sp.website
              ? '<a class="pr-sponsor" href="' + esc(sp.website) + '" target="_blank" rel="noopener">' + name + '</a>'
              : '<div class="pr-sponsor">' + name + '</div>';
          }).join('') + '</div></div>';
      }).join('');
  }

  function standings(s) {
    if (!s) return '';
    if (s.type === 'cup') {
      return '<div class="pr-body"><p class="pr-lead">' + esc(s.competition || 'Cup football') + '</p>' +
        (s.round ? '<p>' + esc(s.round) + '</p>' : '') +
        '<p>' + esc(s.note || '') + '</p></div>';
    }
    if (!s.rows || !s.rows.length) return '';
    var rows = s.rows.map(function (r) {
      var cls = r.isUs ? ' class="is-us"' : (r.isOpposition ? ' class="is-opp"' : '');
      return '<tr' + cls + '><td>' + r.position + '</td><td>' + esc(r.team) + '</td>' +
        '<td>' + r.played + '</td><td>' + r.won + '</td><td>' + r.drawn + '</td><td>' + r.lost + '</td>' +
        '<td>' + (r.goalDifference > 0 ? '+' : '') + r.goalDifference + '</td><td>' + r.points + '</td></tr>';
    }).join('');
    return '<div class="pr-table-wrap"><table class="pr-table">' +
      '<caption class="sr-only">' + esc(s.competition || 'League table') + '</caption>' +
      '<thead><tr><th scope="col">Pos</th><th scope="col">Team</th><th scope="col">P</th>' +
      '<th scope="col">W</th><th scope="col">D</th><th scope="col">L</th>' +
      '<th scope="col">GD</th><th scope="col">Pts</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      // Honest about age: this is the table as it stood on matchday, not now.
      '<p class="pr-freshness">The table as it stood on matchday.</p>';
  }

  function fixtures(fx) {
    if (!fx) return '';
    function row(f, cls) {
      var score = (f.us != null && f.them != null)
        ? '<span class="pr-fix__s">' + f.us + '–' + f.them + '</span>' : '';
      var when = f.date || f.kickoffAt || '';
      var label = (f.isHome === false ? 'Away v ' : 'Home v ') + (f.opponent || '');
      var link = f.id ? 'match-centre.html?id=' + encodeURIComponent(f.id) : null;
      var inner = '<span>' + esc(label) + '</span>' + score;
      return link
        ? '<a class="pr-fix' + cls + '" href="' + esc(link) + '">' + inner + '</a>'
        : '<div class="pr-fix' + cls + '">' + inner + '</div>';
    }
    var recent = (fx.recent || []).map(function (f) { return row(f, ''); }).join('');
    var today = fx.today
      ? '<div class="pr-fix pr-fix--today"><span>Today · ' + esc(fx.today.homeTeam) + ' v ' +
        esc(fx.today.awayTeam) + '</span><span>' + esc(fx.today.kickoff || '') + '</span></div>' : '';
    var upcoming = (fx.upcoming || []).map(function (f) { return row(f, ''); }).join('');
    return '<div class="pr-fixtures">' + recent + today + upcoming + '</div>';
  }

  function join(j) {
    if (!j) return '';
    var opts = (j.options || []).map(function (o) {
      return '<div class="pr-sponsor">' + esc(o.name) + '</div>';
    }).join('');
    return '<div class="pr-body"><p class="pr-lead">' + esc(j.lead || '') + '</p>' +
      '<p>' + esc(j.body || '') + '</p></div>' +
      (opts ? '<div class="pr-sponsors">' + opts + '</div>' : '') +
      (j.contact ? '<div class="pr-cta"><a class="btn btn-primary" href="mailto:' + esc(j.contact) + '">Enquire about sponsorship</a>' +
        '<a class="btn" href="investment.html">Sponsorship &amp; investment</a></div>' : '');
  }

  function history(h) {
    if (!h) return '';
    return '<div class="pr-body">' + (h.founded ? '<p class="pr-lead">Founded ' + esc(h.founded) + '.</p>' : '') +
      (h.body ? '<p>' + esc(h.body) + '</p>' : '') + '</div>';
  }

  /* Team sheets, side by side. A side appears ONLY once its own sheet is
     confirmed; the other keeps an honest placeholder. Never a prediction. */
  function squads(s, cover) {
    if (!s) return '';
    function row(p) {
      return '<li class="pr-xi__row"><span class="pr-xi__no">' + esc(p.number || '') + '</span>' +
        '<span>' + esc(p.name) + (p.isCaptain ? ' (C)' : '') + '</span></li>';
    }
    function side(x, crestSrc, fallbackName) {
      x = x || {};
      var head = '<div class="pr-xi__h">' +
        (crestSrc ? '<img class="pr-xi__crest" src="' + esc(crestSrc) + '" alt="" width="40" height="40">' : '') +
        '<span class="pr-xi__name">' + esc(x.team || fallbackName || '') + '</span></div>';
      var confirmed = x.confirmed !== false && (x.starters || []).length;
      if (!confirmed) return '<div class="pr-xi__side">' + head + '<p class="pr-xi__wait">' + esc(x.note || TEAMS_PLACEHOLDER) + '</p></div>';
      return '<div class="pr-xi__side">' + head +
        '<ul aria-label="' + esc((x.team || '') + ' starting eleven') + '">' + (x.starters || []).map(row).join('') + '</ul>' +
        ((x.substitutes || []).length
          ? '<div class="pr-xi__lbl">Substitutes</div><ul>' + x.substitutes.map(row).join('') + '</ul>' : '') +
        '</div>';
    }
    if (!s.confirmed && s.status !== 'partial') {
      // Nothing confirmed for either side (or an archive edition with no sheet).
      return '<p class="pr-xi__wait">' + esc(s.note || TEAMS_PLACEHOLDER) + '</p>';
    }
    var stamp = s.sourceUpdatedAt ? clubStamp(s.sourceUpdatedAt) : '';
    var corr = (s.corrections || []).length ? '<p class="pr-freshness">Corrected by the club: ' +
      s.corrections.map(function (c) { return esc(c.from + ' to ' + c.to); }).join('; ') + '.</p>' : '';
    return '<div class="pr-xi">' + side(s.home, cover && cover.homeCrest, cover && cover.homeTeam) +
      side(s.away, cover && cover.awayCrest, cover && cover.awayTeam) + '</div>' +
      (s.source && stamp ? '<p class="pr-freshness">Team sheet updated from ' + esc(s.source) + ' at ' + esc(stamp) + '.</p>' : '') +
      corr + (s.referee ? '<p class="pr-freshness">Referee: ' + esc(s.referee) + '</p>' : '');
  }

  function result(fm, fixtureId) {
    if (!fm) return '';
    var events = (fm.events || []).map(function (e) {
      var min = e.minute == null ? '' : e.minute + (e.stoppage ? '+' + e.stoppage : '') + "'";
      var what = e.type === 'own_goal' ? 'Own goal' : e.type === 'red_card' ? 'Sent off'
        : e.type === 'yellow_card' ? 'Booked' : e.type === 'substitution' ? 'Substitution' : 'Goal';
      return '<div class="pr-fix"><span>' + esc(min + ' ' + (e.player || '')) + '</span>' +
        '<span>' + esc(what) + '</span></div>';
    }).join('');
    return '<div class="pr-body"><p class="pr-lead">' +
      esc(fm.homeTeam + ' ' + fm.homeScore + '–' + fm.awayScore + ' ' + fm.awayTeam) + '</p></div>' +
      (events ? '<div class="pr-fixtures">' + events + '</div>' : '') +
      (fixtureId ? '<div class="pr-cta"><a class="btn btn-primary" href="match-centre.html?id=' +
        encodeURIComponent(fixtureId) + '">Full match details</a></div>' : '');
  }

  /* The club's identity block. Required in the programme by FA Standardised
     Rules 2.15. Rendered from what the edition STORED, so an archived
     programme keeps the footer it was published with.

     No disclaimer of responsibility appears here on purpose: Rule 8.14 says
     clubs are responsible for their programme's comments "notwithstanding any
     disclaimers to the contrary", so one would mislead rather than protect. */
  function legalFooter(l) {
    if (!l || !l.lines || !l.lines.length) return '';
    var links = (l.links || []).map(function (x) {
      return '<a href="' + esc(x.href) + '">' + esc(x.label) + '</a>';
    }).join('');
    return '<footer class="pr-legal" aria-label="Club information">' +
      l.lines.map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') +
      (links ? '<p class="pr-legal__links">' + links + '</p>' : '') +
      '</footer>';
  }

  function toc(keys) {
    return '<nav class="pr-toc" aria-label="Programme contents">' +
      keys.map(function (k) {
        return '<a href="#pr-' + k + '">' + esc(HEADINGS[k] || k) + '</a>';
      }).join('') + '</nav>';
  }

  /* One canonical URL PER EDITION.
     programme.html ships a static canonical pointing at itself, so every
     edition in the archive claimed the same URL — a search engine would see one
     page, not a collection, and the club's back catalogue would be invisible. */
  function setCanonical(fixtureId) {
    if (!fixtureId) return;
    var href = 'https://raynerslanefc.co.uk/programme.html?id=' + encodeURIComponent(fixtureId);
    var link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', href);
    var og = document.querySelector('meta[property="og:url"]');
    if (og) og.setAttribute('content', href);
  }

  /* The member gate. The programme is free — this is the reason to join, not
     a price. No "buy", no "subscribe", no "premium". */
  function gate(d) {
    var e = d.edition || {};
    var c = d.cover || {};
    var fm = d.finalMatch;
    var score = fm ? (fm.homeScore + '–' + fm.awayScore) : '';
    var signedIn = !!(window.LaneFan && window.LaneFan.state && window.LaneFan.state.member);
    var suspended = d.reason && d.reason.indexOf('membership_suspended') === 0;

    if (suspended) {
      return '<div class="pr-gate"><h2 class="pr-gate__h">Your membership needs attention</h2>' +
        '<p class="pr-gate__p">We cannot open programmes on this account at the moment. ' +
        'Email <a href="mailto:info@raynerslanefc.co.uk">info@raynerslanefc.co.uk</a> and we will sort it out.</p></div>';
    }

    return '<div class="pr-gate">' +
      (RLFCCover ? '<div class="pr-gate__cover">' + RLFCCover.render({
        homeTeam: c.homeTeam, awayTeam: c.awayTeam,
        homeCrest: c.homeCrest, awayCrest: c.awayCrest,
        competition: c.competition, kickoffAt: e.kickoffAt, season: e.season,
      }, { as: 'div' }) + '</div>' : '') +
      '<div class="pr-gate__body">' +
        '<p class="pr-gate__eyebrow">Free for Fan Zone members</p>' +
        '<h2 class="pr-gate__h">The programme is free.<br>The Lane family gets the key.</h2>' +
        '<p class="pr-gate__p">Join Fan Zone once and unlock every Rayners Lane home programme, ' +
        'your Lane Card, match check-ins and supporter rewards.</p>' +
        '<ul class="pr-gate__list">' +
          '<li>One account</li><li>Every home programme</li>' +
          '<li>Your match history</li><li>Your Lane Card</li>' +
        '</ul>' +
        '<div class="pr-gate__cta">' +
          // The return path is carried so fan-zone.html can bring them back to
          // THIS edition, and the source so the club can see which programme
          // actually brought somebody in. Both were being sent before; nothing
          // read them, so every supporter landed on a page that had forgotten
          // why they came.
          '<a class="btn btn-primary" href="fan-zone.html?join=1&amp;source=' +
            encodeURIComponent('programme:' + (e.fixtureId || '')) +
            '&amp;return=' + encodeURIComponent(location.pathname + location.search) +
            '">Join Fan Zone — free</a>' +
          (signedIn ? '' : '<a class="btn" href="fan-zone.html?signin=1&amp;return=' +
            encodeURIComponent(location.pathname + location.search) + '">Already a member? Sign in</a>') +
        '</div>' +
        (score ? '<p class="pr-gate__score">Final score · ' + esc(c.homeTeam || '') + ' ' +
          esc(score) + ' ' + esc(c.awayTeam || '') + '</p>' : '') +
        (e.fixtureId ? '<p class="pr-gate__mc"><a href="match-centre.html?id=' +
          encodeURIComponent(e.fixtureId) + '">See the match in the Match Centre</a></p>' : '') +
      '</div></div>';
  }

  function render(d) {
    var p = d.programme || {};
    var s = p.sections || {};
    setCanonical((d.edition || {}).fixtureId);
    var cover = s.cover || {};
    var ed = d.edition || {};
    var preview = !!d.preview;

    var present = [];
    var html = '';
    var n = 0;
    function add(key, inner) {
      if (!inner) return;
      n++; present.push(key); html += sec(key, n, inner);
    }

    var archive = ed.editionKind === 'retrospective' || !!cover.archiveMarker;
    var coverEdition = {
      homeTeam: cover.homeTeam, awayTeam: cover.awayTeam,
      homeCrest: cover.homeCrest, awayCrest: cover.awayCrest,
      competition: cover.competition, kickoffAt: ed.kickoffAt,
      season: cover.season, matchSponsor: cover.matchSponsor,
      editionKind: archive ? 'retrospective' : 'matchday', editionNumber: ed.editionNumber,
      // The edition stored kickoff:null when the time was never confirmed.
      kickoffTimeConfirmed: archive || cover.kickoff === null ? false : undefined,
    };

    // An archive edition was not on sale that day: its team sheet is the
    // record's, not "today's".
    HEADINGS.squads = archive ? 'Team Sheets' : 'Today’s Squads';
    add('record', record(s.record));
    add('chairNotes', chairNotes(s.chairNotes));
    add('welcome', welcome(s.welcome));
    add('preview', previewSection(s.preview));
    add('opposition', opposition(s.opposition));
    add('staff', staff(s.staff));
    add('placements', placements(s.placements));
    add('sponsors', sponsors(s.sponsors));
    add('standings', standings(s.standings));
    add('fixtures', fixtures(s.fixtures));
    add('join', join(s.join));
    add('articles', articles(s.articles));
    add('history', history(s.history));
    add('squads', squads(s.squads, cover));
    add('result', result(d.finalMatch, ed.fixtureId));

    root.innerHTML =
      (preview ? '<div class="pr-preview">Private design preview — not a published matchday edition</div>' : '') +
      // Honesty, stated once, near the top, in the club's voice. Not an
      // apology and not an explanation of the machinery.
      (archive
        ? '<p class="pr-marker pr-marker--top">' + esc(RETRO_MARKER) + '</p>'
        : (ed.afterFullTime
          ? '<div class="pr-note">This edition was published after full time as Rayners Lane introduced its ' +
            'new matchday programme platform.</div>'
          : '')) +
      (ed.postponedAt
        ? '<div class="pr-note" role="note">This match was postponed after the programme was published. ' +
          'The edition is kept as it was issued; it is not a record of a match played on this date.</div>'
        : '') +
      '<div class="pr-cover">' + RLFCCover.render(coverEdition, { as: 'div' }) + '</div>' +
      toc(present) + html +
      '<div class="pr-cta">' +
        (ed.fixtureId ? '<a class="btn btn-primary" href="match-centre.html?id=' + encodeURIComponent(ed.fixtureId) + '">Match Centre</a>' : '') +
        // The PDF is this edition through its A4 print stylesheet
        // (css/p-programme-print.css): the browser's own "Save as PDF".
        '<button class="btn" type="button" id="pr-print">Print or save as PDF</button>' +
        '<a class="btn" href="programmes.html">All programmes</a></div>' +
      '<p class="pr-credit">Rayners Lane FC · ' + (archive ? 'archive edition' : 'free digital matchday programme') +
        (ed.publishedAt ? ' · first published ' + esc(String(ed.publishedAt).slice(0, 10)) : '') +
        (ed.version ? ' · version ' + esc(ed.version) : '') +
        (ed.versionPublishedAt && ed.version > 1 ? ' (updated ' + esc(clubStamp(ed.versionPublishedAt)) + ')' : '') +
        '</p>' +
      legalFooter(d.legal);

    var pb = document.getElementById('pr-print');
    if (pb) pb.addEventListener('click', function () { window.print(); });
    document.documentElement.setAttribute('data-edition', (ed.fixtureId || '') + '@v' + (ed.version || ''));
    // A saved PDF takes the document title as its metadata title, so while
    // printing the title names the fixture, the edition and the revision.
    var screenTitle = null;
    window.addEventListener('beforeprint', function () {
      screenTitle = document.title;
      document.title = (cover.homeTeam || '') + ' v ' + (cover.awayTeam || '') + ' · ' +
        (archive ? 'Archive Edition' : 'Matchday Programme') + ' · ' + (cover.season || ed.season || '') +
        ' · ' + (ed.fixtureId || '') + ' · version ' + (ed.version || 1) + ' · Rayners Lane FC';
    });
    window.addEventListener('afterprint', function () { if (screenTitle) document.title = screenTitle; });

    if (cover.homeTeam && cover.awayTeam) {
      document.title = cover.homeTeam + ' v ' + cover.awayTeam + ' | Matchday Programme | Rayners Lane FC';
      var h1 = document.getElementById('pr-title');
      if (h1) {
        h1.innerHTML = esc(cover.homeTeam) + ' <span>v ' + esc(cover.awayTeam) + '</span>';
      }
    }
  }

  function unavailable(msg, help) {
    root.innerHTML = '<div class="pl-empty"><div class="pl-empty__h">' + esc(msg) + '</div>' +
      '<p class="pl-empty__p">' + esc(help) + '</p>' +
      '<a class="btn btn-primary" href="programmes.html">Browse programmes</a></div>';
  }

  var id = qs('id') || qs('fixture');
  if (!id) {
    unavailable('No programme selected',
      'Choose an edition from the programme library.');
    return;
  }
  /* Wait for the session before asking.

     This is the whole bug from the previous release, in one line. The fetch
     used to go out immediately; the Supabase client on this page was null, so
     no token was attached and the server correctly answered "not signed in" —
     to members and strangers alike. Nothing errored. The programme simply
     stayed shut, which is indistinguishable from a working gate.

     `LaneFan.ready` resolves once the client exists and the session has been
     restored, so the token is there to send if there is one to send. A page
     with no bootstrap at all still works: it asks anonymously and gets the
     public gate, which is the correct answer for an anonymous request. */
  var session = (window.LaneFan && window.LaneFan.ready)
    ? window.LaneFan.ready.catch(function () { return null; })
    : Promise.resolve(null);

  session.then(function () {
    return (window.LaneFan ? window.LaneFan.authedFetch : fetch)(
      '/.netlify/functions/programme-data?id=' + encodeURIComponent(id));
  })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      // A draft, a waiting edition or a withheld one is simply not public. The
      // endpoint returns 404 and so does this — no hint that a draft exists.
      if (!d || !d.ok) {
        unavailable('This programme is not available',
          'Programmes are published on matchday once both official teams are confirmed.');
        return;
      }
      // The server sent the gate, not the edition. It knows who asked; this
      // page only renders what it was given — there is no payload here to
      // reveal, because the payload was never sent.
      if (d.locked) {
        var t = (d.cover && d.cover.homeTeam && d.cover.awayTeam)
          ? d.cover.homeTeam + ' v ' + d.cover.awayTeam : 'Matchday Programme';
        var h1 = document.getElementById('pr-title');
        if (h1) h1.textContent = t;
        document.title = t + ' | Matchday Programme | Rayners Lane FC';
        setCanonical((d.edition || {}).fixtureId);
        root.innerHTML = gate(d);
        return;
      }
      render(d);

      /* One restrained line for somebody who has just joined, then it is gone.
         They came here to read a programme, not to be congratulated — so this
         is a sentence above it, never a page in front of it. */
      if (qs('joined')) {
        var w = document.createElement('p');
        w.className = 'pr-joined';
        w.setAttribute('role', 'status');
        w.textContent = 'You’re in. Every Rayners Lane programme is yours now — this one included.';
        root.insertBefore(w, root.firstChild);
        try {
          var u = new URL(location.href);
          u.searchParams.delete('joined');
          history.replaceState({}, '', u.pathname + u.search + u.hash);
        } catch (e2) {}
      }
    })
    .catch(function (err) {
      if (window.console) console.error('[programme-reader]', err && err.message);
      unavailable('Programme temporarily unavailable', 'Please try again shortly.');
    });
})();
