/**
 * THE CLUB TOOL REGISTRY — one description of every tool in the portal.
 *
 * The portal grew to 39 panels laid out as 31 flat tiles, all the same size,
 * 22 of them below the fold. A volunteer had to already know which one they
 * wanted. This registry is what lets the new Home lead with WHAT NEEDS DOING
 * instead of WHAT EXISTS.
 *
 * IMPORTANT — this file changes NAVIGATION ONLY.
 *   · panel ids are untouched, so every #hash bookmark still works
 *   · openPanel() is untouched, so the back button still works
 *   · no save function, API call or data path is touched by this file
 *
 * Every field is written for a volunteer, not a developer:
 *   id        the existing panel id (never renamed — it is the URL)
 *   name      plain English, task-shaped
 *   desc      one sentence: what it does, in the club's own words
 *   effect    'public'   changes the website fans see
 *             'internal' club records only
 *             'download' produces a file on this device
 *             'view'     shows information, changes nothing
 *   area      which of the six club areas it belongs to
 *   roles     who normally uses it (personalisation, NOT a lock)
 *   danger    true = destructive or high-consequence, kept away from routine work
 *   chairman  true = already gated by the existing chair-only rule
 *   href      for the few tools that are a separate page rather than a panel
 */
(function (global) {
  'use strict';

  // Each area leads with the question a committee member actually asks, and
  // names the job they most often want, so nobody has to know a tool name
  // before choosing where to go.
  var AREAS = [
    { key: 'match',      name: 'Match Days',
      ask: 'Are you preparing for a match?',
      likely: 'Most often: check the fixture, then fill in the attendance and takings.' },
    { key: 'team',       name: 'Team and Players',
      ask: 'Do you need to update a player?',
      likely: 'Most often: add someone to the squad, or update a profile photograph.' },
    { key: 'website',    name: 'Website and Communications',
      ask: 'Are you publishing something to the website?',
      likely: 'Most often: write a news story or add match photographs.' },
    { key: 'commercial', name: 'Commercial',
      ask: 'Are you checking sponsors or club income?',
      likely: 'Most often: read new enquiries, or update the sponsor board.' },
    { key: 'supporters', name: 'Supporters',
      ask: 'Are you helping supporters?',
      likely: 'Most often: check members in on a match day, or add an offer.' },
    { key: 'admin',      name: 'Club Administration',
      ask: 'Are you managing internal club records?',
      likely: 'Most often: write up a meeting, or look something up in the handbook.' },
    { key: 'system',     name: 'System',
      ask: 'Are you fixing or restoring something?',
      likely: 'Only if something has gone wrong. Most people never need this.' }
  ];

  var TOOLS = [
    // ── MATCH DAYS ────────────────────────────────────────────────────────
    { id: 'fixtures', name: 'Fixtures and Results', area: 'match', effect: 'public',
      desc: 'Update the season’s matches, kick-off times and final scores. Changes appear on the public website.',
      roles: ['Committee', 'Match Day Secretary', 'Club Secretary', 'Club Management', 'Chairman', 'V Chairman'] },

    { id: 'mdops', name: 'Match-Day Attendance and Takings', area: 'match', effect: 'internal',
      desc: 'Complete the attendance and takings sheet for each home match. Internal only.',
      roles: ['Committee', 'Match Day Secretary', 'Club Secretary', 'Club Management', 'Chairman', 'V Chairman'] },

    { id: 'matchday', name: 'Live Scoreboard', area: 'match', effect: 'public',
      desc: 'Turn the live score on during a game and tap the score as it changes. Fans see it within seconds.',
      roles: ['Committee', 'Match Day Secretary'] },

    { id: 'programme', name: 'Programme', area: 'match', effect: 'public',
      desc: 'Write the match-day programme notes and preview.',
      roles: ['Committee', 'Match Day Secretary', 'Marketing/Media'] },

    { id: 'matchreport', name: 'Match Reports', area: 'match', effect: 'public',
      desc: 'Write the post-match report. It appears on the News page.',
      roles: ['Marketing/Media', 'Committee'] },

    { id: 'poststudio', name: 'Post Studio', area: 'match', effect: 'download',
      desc: 'Make match-day graphics for social media.',
      roles: ['Marketing/Media', 'Committee'] },

    { id: 'fwp', name: 'Match Tweet Cards', area: 'match', effect: 'download',
      desc: 'Ready-made match graphics sized for X/Twitter.',
      roles: ['Marketing/Media'] },

    { id: 'monthlyfix', name: 'Monthly Fixture Posters', area: 'match', effect: 'download',
      desc: 'A portrait poster listing every game in a month.',
      roles: ['Marketing/Media'] },

    { id: 'venues', name: 'Venues', area: 'match', effect: 'public',
      desc: 'Grounds and addresses. These power every Directions button on the website.',
      roles: ['Committee', 'Match Day Secretary', 'Club Secretary'] },

    // ── TEAM AND PLAYERS ──────────────────────────────────────────────────
    { id: 'squad', name: 'Squad', area: 'team', effect: 'public',
      desc: 'The first-team squad list and shirt numbers shown on the Squad page.',
      roles: ['Club Management', 'Marketing/Media', 'Committee'] },

    { id: 'players', name: 'Player Profiles', area: 'team', effect: 'public',
      desc: 'Player photos, bios and stats. Adding a player to the squad does not publish a profile — do that here.',
      roles: ['Club Management', 'Marketing/Media'] },

    { id: 'committee', name: 'Committee and Staff', area: 'team', effect: 'public',
      desc: 'Who does what at the club. Shown on the About and Policies pages.',
      roles: ['Club Secretary', 'Chairman', 'V Chairman', 'Committee'] },

    { id: 'staff', name: 'Staff and Management Profiles', area: 'team', effect: 'internal',
      desc: 'Private contact and medical details. Never shown on the website.',
      roles: ['Club Secretary', 'Chairman', 'V Chairman'] },

    // ── WEBSITE AND COMMUNICATIONS ────────────────────────────────────────
    { id: 'news', name: 'Club News', area: 'website', effect: 'public',
      desc: 'Write and publish an article to the News page.',
      roles: ['Marketing/Media', 'Committee', 'Club Secretary'] },

    { id: 'signoff', name: 'Review Drafted Stories', area: 'website', effect: 'public',
      desc: 'Check and approve match posts the site has drafted for you. Nothing goes out until you approve it.',
      roles: ['Marketing/Media', 'Committee'] },

    { id: 'gallery', name: 'Gallery', area: 'website', effect: 'public',
      desc: 'Upload match-day and squad photographs to the public Gallery.',
      roles: ['Marketing/Media', 'Committee'] },

    { id: 'social', name: 'Social Media', area: 'website', effect: 'internal',
      desc: 'The club’s posting plan, ready-to-copy captions and a post planner.',
      roles: ['Marketing/Media'] },

    { id: 'motm', name: 'Man of the Match', area: 'website', effect: 'public',
      desc: 'Feature your star man as a card on the home page.',
      roles: ['Marketing/Media', 'Committee'] },

    { id: 'signing', name: 'New Signing', area: 'website', effect: 'public',
      desc: 'Announce a new signing as a card on the home page.',
      roles: ['Marketing/Media', 'Committee'] },

    { id: 'mail', name: 'Club Email', area: 'website', effect: 'view',
      desc: 'Quick links to sign in to the club email inboxes.',
      roles: ['Committee', 'Club Secretary', 'Chairman'] },

    { id: 'livesite', name: 'View the Public Website', area: 'website', effect: 'view',
      desc: 'See the site exactly as supporters see it.',
      roles: ['Committee', 'Marketing/Media', 'Chairman', 'V Chairman'] },

    // ── COMMERCIAL ────────────────────────────────────────────────────────
    { id: 'sponsors', name: 'Sponsors', area: 'commercial', effect: 'public',
      desc: 'Sponsor logos and partners shown on the website and in the programme.',
      roles: ['Chairman', 'V Chairman', 'Committee', 'Marketing/Media'] },

    { id: 'radar', name: 'Sponsor Prospects', area: 'commercial', effect: 'internal',
      desc: 'Local businesses worth approaching. Nothing here is public.',
      roles: ['Chairman', 'V Chairman', 'Committee'] },

    { id: 'sponsorhub', name: 'Commercial Pipeline', area: 'commercial', effect: 'internal',
      desc: 'Sponsorship deals in progress — enquiries, quotes and payments.',
      roles: ['Chairman', 'V Chairman', 'Committee'] },

    { id: 'records', name: 'Club Enquiries', area: 'commercial', effect: 'internal',
      desc: 'Read messages and applications sent through the website. Internal only.',
      roles: ['Club Secretary', 'Committee', 'Chairman'] },

    { id: 'trialists', name: 'Trial Applications', area: 'commercial', effect: 'internal',
      desc: 'People who have asked to attend a trial.',
      roles: ['Club Management', 'Club Secretary', 'Committee'] },

    // ── SUPPORTERS ────────────────────────────────────────────────────────
    { id: 'supporters', name: 'Supporters', area: 'supporters', effect: 'internal',
      desc: 'Every Fan Zone member, how they found the club, and whether the club is being told when somebody joins. Read-only.',
      roles: ['Committee', 'Chairman'] },

    { id: 'fanclub', name: 'Fan Club', area: 'supporters', effect: 'public',
      desc: 'Champion your supporters on the public Fan Zone wall, and award loyalty hearts.',
      roles: ['Marketing/Media', 'Committee'] },

    { id: 'perks', name: 'Supporter Offers', area: 'supporters', effect: 'public',
      desc: 'Vouchers, promotions and members-only news shown in the Fan Zone.',
      roles: ['Marketing/Media', 'Committee'] },

    { id: 'scanner', name: 'Membership Check-in Scanner', area: 'supporters', effect: 'internal',
      href: 'scan.html',
      desc: 'Scan supporter membership cards at the turnstile. Opens in its own screen.',
      roles: ['Committee', 'Match Day Secretary'] },

    // ── CLUB ADMINISTRATION ───────────────────────────────────────────────
    { id: 'meetings', name: 'Committee Meetings', area: 'admin', effect: 'internal',
      desc: 'The club’s minute book — who attended, what was decided and next steps.',
      roles: ['Club Secretary', 'Chairman', 'V Chairman', 'Committee'] },

    { id: 'clubstats', name: 'Club Overview', area: 'admin', effect: 'view',
      desc: 'How the club is doing this season — supporters, sponsorship and income.',
      roles: ['Chairman', 'V Chairman', 'Club Management', 'Club Secretary', 'Committee'] },

    { id: 'swot', name: 'Club Plans', area: 'admin', effect: 'view',
      desc: 'Where the club stands and what to watch.',
      roles: ['Chairman', 'V Chairman', 'Club Secretary'] },

    { id: 'playbook', name: 'Income and Growth Plan', area: 'admin', effect: 'internal',
      desc: 'Commercial ideas and plans to help the club grow.',
      roles: ['Chairman', 'V Chairman', 'Committee', 'Club Secretary'] },

    { id: 'siteguide', name: 'Guides and Handbook', area: 'admin', effect: 'view',
      desc: 'How to run the site, what every section is for, and club facts — all in one place.',
      roles: ['Committee', 'Marketing/Media', 'Club Secretary', 'Match Day Secretary', 'Club Management', 'Chairman', 'V Chairman'] },

    { id: 'analytics', name: 'Historic Match-Day Takings', area: 'admin', effect: 'view', archived: true,
      desc: 'Historic takings recorded before Match-Day Attendance and Takings. Read-only.',
      roles: ['Chairman', 'V Chairman'] },

    { id: 'users', name: 'Staff Logins', area: 'admin', effect: 'internal', chairman: true,
      desc: 'Add or remove logins, set passwords and see who has signed in.',
      roles: ['Chairman'] },

    // ── SYSTEM ────────────────────────────────────────────────────────────
    { id: 'settings', name: 'Website Status', area: 'system', effect: 'view',
      desc: 'Check everything is connected, and republish the site if needed.',
      roles: ['Chairman', 'V Chairman', 'Club Secretary'] },

    { id: 'undo', name: 'Emergency Controls', area: 'system', effect: 'public', danger: true,
      desc: 'Take the live scoreboard down, or roll back a bad update. Use only if something has gone wrong.',
      roles: ['Chairman', 'V Chairman', 'Club Secretary', 'Match Day Secretary'] },

    { id: 'developer', name: 'Developer Reference', area: 'system', effect: 'view', chairman: true,
      desc: 'How the site is built — for whoever maintains it.',
      roles: ['Chairman'] },

    // The Lane Lowdown keeps its name; it lives inside Guides but is also a
    // tool in its own right so nothing becomes unreachable.
    { id: 'lowdown', name: 'The Lane Lowdown', area: 'admin', effect: 'view',
      desc: 'Club facts, history and talking points.',
      roles: ['Committee', 'Marketing/Media', 'Chairman', 'V Chairman', 'Club Secretary'] }
  ];

  // ── ROLE HOME DEFAULTS ────────────────────────────────────────────────
  // "My Club Work" — the 5 tools each role reaches for. This REORDERS and
  // RECOMMENDS. It never hides: "View all club tools" is always one tap away,
  // because the club still shares one committee password and we must not hide
  // the wrong thing from the wrong person.
  var ROLE_HOME = {
    'Committee':            ['fixtures', 'mdops', 'news', 'gallery', 'records'],
    'Match Day Secretary':  ['mdops', 'fixtures', 'matchday', 'programme', 'venues'],
    'Club Secretary':       ['fixtures', 'committee', 'records', 'meetings', 'mdops'],
    'Marketing/Media':      ['poststudio', 'news', 'gallery', 'squad', 'social'],
    'Club Management':      ['fixtures', 'squad', 'mdops', 'clubstats', 'committee'],
    'V Chairman':           ['clubstats', 'mdops', 'sponsors', 'committee', 'fixtures'],
    'Chairman':             ['clubstats', 'sponsors', 'users', 'fixtures', 'mdops']
  };
  var ROLE_HOME_DEFAULT = ROLE_HOME['Committee'];

  function byId(id) {
    for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].id === id) return TOOLS[i];
    return null;
  }
  function byArea(key) {
    return TOOLS.filter(function (t) { return t.area === key && !t.archived; });
  }
  function homeFor(role) {
    return (ROLE_HOME[role] || ROLE_HOME_DEFAULT).map(byId).filter(Boolean);
  }
  function areaOf(id) {
    var t = byId(id);
    if (!t) return null;
    for (var i = 0; i < AREAS.length; i++) if (AREAS[i].key === t.area) return AREAS[i];
    return null;
  }
  /** Plain-English wording for what pressing save in this tool will do. */
  var EFFECT_LABEL = {
    public:   'Changes the public website',
    internal: 'Internal only — not public',
    download: 'Downloads a file to your device',
    view:     'Information only'
  };

  global.PortalTools = {
    AREAS: AREAS, TOOLS: TOOLS, ROLE_HOME: ROLE_HOME, EFFECT_LABEL: EFFECT_LABEL,
    byId: byId, byArea: byArea, homeFor: homeFor, areaOf: areaOf
  };
}(window));
