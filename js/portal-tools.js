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
 *   roles     who normally uses it (personalisation, NOT a lock)
 *   danger    true = destructive or high-consequence, kept away from routine work
 *   chairman  true = already gated by the existing chair-only rule
 *   href      for the few tools that are a separate page rather than a panel
 *
 * A tool's group is NOT a field on the tool. It is membership of one of the
 * lists below, so a tool cannot silently belong to two places or to none —
 * the coverage test reads these lists and fails if any panel is missing.
 */
(function (global) {
  'use strict';

  // ── ALL CLUB TOOLS ────────────────────────────────────────────────────────
  // The eight groups the club asked for, in the club's own words, plus two
  // that had to exist for the list to be complete:
  //
  //   · Team and Squad     — Squad, Player Profiles and Trials had no home in
  //                          the eight, and they are among the most-used tools
  //                          in the portal.
  //   · System and Recovery — Emergency Controls takes the live scoreboard
  //                          down and rolls back a bad update. Filing that
  //                          under "Help" would put a destructive tool
  //                          alongside the handbook, which is exactly where a
  //                          volunteer would open it by accident.
  //
  // Each group leads with the question a committee member actually asks, so
  // nobody has to know a tool's name before choosing where to go.
  var AREAS = [
    { key: 'match', name: 'Match Day',
      ask: 'Are you preparing for a match, or running one?',
      likely: 'Most often: check the fixture, then fill in the attendance and takings.',
      ids: ['fixtures', 'matchday', 'mdops', 'venues', 'scanner'] },

    { key: 'team', name: 'Team and Squad',
      ask: 'Do you need to update a player?',
      likely: 'Most often: add someone to the squad, or update a profile photograph.',
      ids: ['squad', 'players', 'trialists'] },

    { key: 'programme', name: 'Programme',
      ask: 'Are you working on the match-day programme?',
      likely: 'Home matches only. It builds itself from what the club already holds.',
      ids: ['programme'] },

    { key: 'website', name: 'News and Website',
      ask: 'Are you publishing something to the website?',
      likely: 'Most often: write a news story, or check a drafted one before it goes out.',
      ids: ['news', 'signoff', 'matchreport', 'motm', 'signing', 'livesite', 'mail'] },

    { key: 'social', name: 'Social and Marketing',
      ask: 'Are you posting, or making something to post?',
      likely: 'Most often: make a match graphic in Post Studio and share it to your phone.',
      ids: ['poststudio', 'fwp', 'monthlyfix', 'social', 'fanclub', 'perks'] },

    { key: 'media', name: 'Photos and Media',
      ask: 'Are you adding photographs?',
      likely: 'Most often: upload match-day photographs to the public Gallery.',
      ids: ['gallery'] },

    { key: 'sponsors', name: 'Sponsors',
      ask: 'Are you working on sponsorship?',
      likely: 'Most often: update the sponsor board, or look at who is worth approaching.',
      ids: ['sponsors', 'radar', 'sponsorhub'] },

    { key: 'committee', name: 'Reports and Committee',
      ask: 'Are you managing internal club records?',
      likely: 'Most often: write up a meeting, or read enquiries sent through the website.',
      ids: ['meetings', 'committee', 'staff', 'records', 'supporters', 'clubstats',
            'swot', 'playbook', 'analytics', 'users'] },

    { key: 'help', name: 'Help',
      ask: 'Do you want to look something up?',
      likely: 'The handbook, your own guide, and the club facts everyone quotes.',
      ids: ['siteguide', 'lowdown'] },

    { key: 'system', name: 'System and Recovery',
      ask: 'Has something gone wrong?',
      likely: 'Only if something has gone wrong. Most people never need this.',
      ids: ['settings', 'undo', 'developer'] }
  ];

  var TOOLS = [
    // ── MATCH DAYS ────────────────────────────────────────────────────────
    { id: 'fixtures', name: 'Fixtures and Results', effect: 'public',
      desc: 'Update the season’s matches, kick-off times and final scores. Changes appear on the public website.',
      roles: ['Committee', 'Match Day Secretary', 'Club Secretary', 'Club Management', 'Chairman', 'V Chairman'] },

    { id: 'mdops', name: 'Match-Day Attendance and Takings', effect: 'internal',
      desc: 'Complete the attendance and takings sheet for each home match. Internal only.',
      roles: ['Committee', 'Match Day Secretary', 'Club Secretary', 'Club Management', 'Chairman', 'V Chairman'] },

    { id: 'matchday', name: 'Live Scoreboard', effect: 'public',
      desc: 'Turn the live score on during a game and tap the score as it changes. Fans see it within seconds.',
      roles: ['Committee', 'Match Day Secretary'] },

    { id: 'programme', name: 'Programme', effect: 'public',
      desc: 'Write the match-day programme notes and preview.',
      roles: ['Committee', 'Match Day Secretary', 'Marketing/Media'] },

    { id: 'matchreport', name: 'Match Reports', effect: 'public',
      desc: 'Write the post-match report. It appears on the News page.',
      roles: ['Marketing/Media', 'Committee'] },

    { id: 'poststudio', name: 'Post Studio', effect: 'download',
      desc: 'Make match-day graphics for social media.',
      roles: ['Marketing/Media', 'Committee'] },

    { id: 'fwp', name: 'Match Tweet Cards', effect: 'download',
      desc: 'Ready-made match graphics sized for X/Twitter.',
      roles: ['Marketing/Media'] },

    { id: 'monthlyfix', name: 'Monthly Fixture Posters', effect: 'download',
      desc: 'A portrait poster listing every game in a month.',
      roles: ['Marketing/Media'] },

    { id: 'venues', name: 'Venues', effect: 'public',
      desc: 'Grounds and addresses. These power every Directions button on the website.',
      roles: ['Committee', 'Match Day Secretary', 'Club Secretary'] },

    // ── TEAM AND PLAYERS ──────────────────────────────────────────────────
    { id: 'squad', name: 'Squad', effect: 'public',
      desc: 'The first-team squad list and shirt numbers shown on the Squad page.',
      roles: ['Club Management', 'Marketing/Media', 'Committee'] },

    { id: 'players', name: 'Player Profiles', effect: 'public',
      desc: 'Player photos, bios and stats. Adding a player to the squad does not publish a profile — do that here.',
      roles: ['Club Management', 'Marketing/Media'] },

    { id: 'committee', name: 'Committee and Staff', effect: 'public',
      desc: 'Who does what at the club. Shown on the About and Policies pages.',
      roles: ['Club Secretary', 'Chairman', 'V Chairman', 'Committee'] },

    { id: 'staff', name: 'Staff and Management Profiles', effect: 'internal',
      desc: 'Private contact and medical details. Never shown on the website.',
      roles: ['Club Secretary', 'Chairman', 'V Chairman'] },

    // ── WEBSITE AND COMMUNICATIONS ────────────────────────────────────────
    { id: 'news', name: 'Club News', effect: 'public',
      desc: 'Write and publish an article to the News page.',
      roles: ['Marketing/Media', 'Committee', 'Club Secretary'] },

    { id: 'signoff', name: 'Review Drafted Stories', effect: 'public',
      desc: 'Check and approve match posts the site has drafted for you. Nothing goes out until you approve it.',
      roles: ['Marketing/Media', 'Committee'] },

    { id: 'gallery', name: 'Gallery', effect: 'public',
      desc: 'Upload match-day and squad photographs to the public Gallery.',
      roles: ['Marketing/Media', 'Committee'] },

    { id: 'social', name: 'Social Media', effect: 'internal',
      desc: 'The club’s posting plan, ready-to-copy captions and a post planner.',
      roles: ['Marketing/Media'] },

    { id: 'motm', name: 'Man of the Match', effect: 'public',
      desc: 'Feature your star man as a card on the home page.',
      roles: ['Marketing/Media', 'Committee'] },

    { id: 'signing', name: 'New Signing', effect: 'public',
      desc: 'Announce a new signing as a card on the home page.',
      roles: ['Marketing/Media', 'Committee'] },

    { id: 'mail', name: 'Club Email', effect: 'view',
      desc: 'Quick links to sign in to the club email inboxes.',
      roles: ['Committee', 'Club Secretary', 'Chairman'] },

    { id: 'livesite', name: 'View the Public Website', effect: 'view',
      desc: 'See the site exactly as supporters see it.',
      roles: ['Committee', 'Marketing/Media', 'Chairman', 'V Chairman'] },

    // ── COMMERCIAL ────────────────────────────────────────────────────────
    { id: 'sponsors', name: 'Sponsors', effect: 'public',
      desc: 'Sponsor logos and partners shown on the website and in the programme.',
      roles: ['Chairman', 'V Chairman', 'Committee', 'Marketing/Media'] },

    { id: 'radar', name: 'Sponsor Prospects', effect: 'internal',
      desc: 'Local businesses worth approaching. Nothing here is public.',
      roles: ['Chairman', 'V Chairman', 'Committee'] },

    { id: 'sponsorhub', name: 'Commercial Pipeline', effect: 'internal',
      desc: 'Sponsorship deals in progress — enquiries, quotes and payments.',
      roles: ['Chairman', 'V Chairman', 'Committee'] },

    { id: 'records', name: 'Club Enquiries', effect: 'internal',
      desc: 'Read messages and applications sent through the website. Internal only.',
      roles: ['Club Secretary', 'Committee', 'Chairman'] },

    { id: 'trialists', name: 'Trial Applications', effect: 'internal',
      desc: 'People who have asked to attend a trial.',
      roles: ['Club Management', 'Club Secretary', 'Committee'] },

    // ── SUPPORTERS ────────────────────────────────────────────────────────
    { id: 'supporters', name: 'Supporters', effect: 'internal',
      desc: 'Every Fan Zone member, how they found the club, and whether the club is being told when somebody joins. Read-only.',
      roles: ['Committee', 'Chairman'] },

    { id: 'fanclub', name: 'Fan Club', effect: 'public',
      desc: 'Champion your supporters on the public Fan Zone wall, and award loyalty hearts.',
      roles: ['Marketing/Media', 'Committee'] },

    { id: 'perks', name: 'Supporter Offers', effect: 'public',
      desc: 'Vouchers, promotions and members-only news shown in the Fan Zone.',
      roles: ['Marketing/Media', 'Committee'] },

    { id: 'scanner', name: 'Membership Check-in Scanner', effect: 'internal',
      href: 'scan.html',
      desc: 'Scan supporter membership cards at the turnstile. Opens in its own screen.',
      roles: ['Committee', 'Match Day Secretary'] },

    // ── CLUB ADMINISTRATION ───────────────────────────────────────────────
    { id: 'meetings', name: 'Committee Meetings', effect: 'internal',
      desc: 'The club’s minute book — who attended, what was decided and next steps.',
      roles: ['Club Secretary', 'Chairman', 'V Chairman', 'Committee'] },

    { id: 'clubstats', name: 'Club Overview', effect: 'view',
      desc: 'How the club is doing this season — supporters, sponsorship and income.',
      roles: ['Chairman', 'V Chairman', 'Club Management', 'Club Secretary', 'Committee'] },

    { id: 'swot', name: 'Club Plans', effect: 'view',
      desc: 'Where the club stands and what to watch.',
      roles: ['Chairman', 'V Chairman', 'Club Secretary'] },

    { id: 'playbook', name: 'Income and Growth Plan', effect: 'internal',
      desc: 'Commercial ideas and plans to help the club grow.',
      roles: ['Chairman', 'V Chairman', 'Committee', 'Club Secretary'] },

    { id: 'siteguide', name: 'Guides and Handbook', effect: 'view',
      desc: 'How to run the site, what every section is for, and club facts — all in one place.',
      roles: ['Committee', 'Marketing/Media', 'Club Secretary', 'Match Day Secretary', 'Club Management', 'Chairman', 'V Chairman'] },

    { id: 'analytics', name: 'Historic Match-Day Takings', effect: 'view', archived: true,
      desc: 'Historic takings recorded before Match-Day Attendance and Takings. Read-only.',
      roles: ['Chairman', 'V Chairman'] },

    // Not `chairman: true`. The Vice Chairman must be able to REACH this screen
    // to disable a compromised account — what he sees inside is trimmed to the
    // capabilities he actually holds, and the server decides the rest.
    { id: 'users', name: 'Staff Access', effect: 'internal', staffAccess: true,
      desc: 'Invite people, disable an account, and see who has signed in.',
      roles: ['Chairman', 'V Chairman'] },

    // ── SYSTEM ────────────────────────────────────────────────────────────
    { id: 'settings', name: 'Website Status', effect: 'view',
      desc: 'Check everything is connected, and republish the site if needed.',
      roles: ['Chairman', 'V Chairman', 'Club Secretary'] },

    { id: 'undo', name: 'Emergency Controls', effect: 'public', danger: true,
      desc: 'Take the live scoreboard down, or roll back a bad update. Use only if something has gone wrong.',
      roles: ['Chairman', 'V Chairman', 'Club Secretary', 'Match Day Secretary'] },

    { id: 'developer', name: 'Developer Reference', effect: 'view', chairman: true,
      desc: 'How the site is built — for whoever maintains it.',
      roles: ['Chairman'] },

    // The Lane Lowdown keeps its name; it lives inside Guides but is also a
    // tool in its own right so nothing becomes unreachable.
    { id: 'lowdown', name: 'The Lane Lowdown', effect: 'view',
      desc: 'Club facts, history and talking points.',
      roles: ['Committee', 'Marketing/Media', 'Chairman', 'V Chairman', 'Club Secretary'] }
  ];

  // ── ROLE PROFILES ─────────────────────────────────────────────────────────
  // THIRTEEN GENERIC JOBS, NOT THIRTEEN NAMED PEOPLE.
  //
  // The club has seven people on the committee today. Writing seven layouts
  // keyed to their names would mean editing this file every time somebody
  // steps down, joins, or takes on a second job — and the person who has to do
  // that editing is not on the committee. So the unit is the JOB. A profile is
  // assigned to an account; when Gary hands the team over, the new manager is
  // given the Team Manager profile and the portal is correct on day one.
  //
  // A profile REORDERS AND RECOMMENDS. It never hides. Every tool in the
  // portal stays one tap away under All Club Tools, for two reasons: a
  // volunteer covering for somebody must be able to find their tools, and
  // hiding a tool would imply a permission that the profile does not actually
  // enforce. The real permission boundary is the server, in lib/authz.js.
  //
  //   home    the tools this job reaches for — shown as My Club Work
  //   quick   up to four one-tap jobs — the things done weekly, not monthly
  //   guide   the written guide for this job
  //   blurb   what this job is, in one line, for the person holding it
  var PROFILES = {
    'System Maintainer': {
      title: 'System Maintainer',
      blurb: 'You keep the site working. Everything is open to you, and every action carries your name.',
      home:  ['settings', 'undo', 'users', 'developer', 'clubstats'],
      quick: [
        { label: 'Check the website status', panel: 'settings' },
        { label: 'Manage staff access',      panel: 'users' },
        { label: 'Developer reference',      panel: 'developer' }
      ],
      guide: null
    },
    'Chairman': {
      title: 'Chairman',
      blurb: 'Oversight of the club, and the only person who can create a staff account.',
      home:  ['clubstats', 'users', 'sponsors', 'meetings', 'fixtures'],
      quick: [
        { label: 'Invite somebody to the portal', panel: 'users' },
        { label: 'See how the club is doing',     panel: 'clubstats' },
        { label: 'Write up a meeting',            panel: 'meetings' }
      ],
      guide: 'pete-singh-chairman'
    },
    'V Chairman': {
      title: 'Vice Chairman',
      blurb: 'Cover for the Chairman, and the second person who can shut down an account.',
      home:  ['clubstats', 'users', 'mdops', 'sponsors', 'meetings'],
      quick: [
        { label: 'See how the club is doing', panel: 'clubstats' },
        { label: 'Check staff access',        panel: 'users' },
        { label: 'Write up a meeting',        panel: 'meetings' }
      ],
      guide: 'nigel-hanlon-vice-chairman'
    },
    'Club Secretary': {
      title: 'Secretary',
      blurb: 'Fixtures, officials, results and the club’s records.',
      home:  ['fixtures', 'venues', 'committee', 'meetings', 'records'],
      quick: [
        { label: 'Check the next fixture',   panel: 'fixtures' },
        { label: 'Add the match officials',  panel: 'committee' },
        { label: 'Read new enquiries',       panel: 'records' },
        { label: 'Write up a meeting',       panel: 'meetings' }
      ],
      guide: 'jenny-pitt-secretary'
    },
    'Treasurer': {
      title: 'Treasurer',
      blurb: 'Match-day takings only. The club’s accounts live in accounting software, not here.',
      home:  ['mdops', 'clubstats', 'sponsorhub', 'records', 'meetings'],
      quick: [
        { label: 'Finish a takings sheet',    panel: 'mdops' },
        { label: 'See how the club is doing', panel: 'clubstats' }
      ],
      guide: 'russell-nugent-programme-sponsors'
    },
    'Team Manager': {
      title: 'Team Manager',
      blurb: 'The squad and the team. Your selection is private and never reaches the website.',
      home:  ['squad', 'players', 'fixtures', 'trialists', 'programme'],
      quick: [
        { label: 'Update the squad',       panel: 'squad' },
        { label: 'Check the next fixture', panel: 'fixtures' },
        { label: 'Read trial requests',    panel: 'trialists' }
      ],
      guide: 'gary-pitt-team-manager'
    },
    'Assistant Manager': {
      title: 'Assistant Manager',
      blurb: 'Cover for the manager on squad and player information.',
      home:  ['squad', 'players', 'fixtures', 'trialists', 'motm'],
      quick: [
        { label: 'Update the squad',       panel: 'squad' },
        { label: 'Check the next fixture', panel: 'fixtures' }
      ],
      guide: 'gary-pitt-team-manager'
    },
    'Coach': {
      title: 'Coach',
      blurb: 'Squad information and the fixture list.',
      home:  ['fixtures', 'squad', 'players', 'venues', 'trialists'],
      quick: [
        { label: 'Check the next fixture', panel: 'fixtures' },
        { label: 'Look up a venue',        panel: 'venues' }
      ],
      guide: 'gary-pitt-team-manager'
    },
    'Match Day Secretary': {
      title: 'Match Day Secretary',
      blurb: 'Running the match day itself — the gate, the scoreboard, the sheet.',
      home:  ['mdops', 'matchday', 'fixtures', 'scanner', 'venues'],
      quick: [
        { label: 'Prepare match day',        panel: 'mdops' },
        { label: 'Turn the scoreboard on',   panel: 'matchday' },
        { label: 'Check members in',         panel: 'scanner' },
        { label: 'Check the next fixture',   panel: 'fixtures' }
      ],
      guide: 'jenny-pitt-secretary'
    },
    'Programme Editor': {
      title: 'Programme Editor',
      blurb: 'The match-day programme. Home matches only.',
      home:  ['programme', 'fixtures', 'squad', 'sponsors', 'news'],
      quick: [
        { label: 'Open the programme',     panel: 'programme' },
        { label: 'Check the next fixture', panel: 'fixtures' }
      ],
      guide: 'russell-nugent-programme-sponsors'
    },
    'Marketing/Media': {
      title: 'Social and Media',
      blurb: 'Graphics, captions and news. Nothing you write goes out until it is approved.',
      home:  ['poststudio', 'news', 'gallery', 'social', 'signoff'],
      quick: [
        { label: 'Make a match graphic',      panel: 'poststudio' },
        { label: 'Write a news story',        panel: 'news' },
        { label: 'Add photographs',           panel: 'gallery' },
        { label: 'Check drafted stories',     panel: 'signoff' }
      ],
      guide: 'smallz-social-media'
    },
    'Sponsorship': {
      title: 'Sponsorship and Commercial',
      blurb: 'Sponsors, prospects and deals in progress.',
      home:  ['sponsors', 'sponsorhub', 'radar', 'programme', 'clubstats'],
      quick: [
        { label: 'Update the sponsor board', panel: 'sponsors' },
        { label: 'Check deals in progress',  panel: 'sponsorhub' },
        { label: 'Find someone to approach', panel: 'radar' }
      ],
      guide: 'darren-nugent-programme-sponsors'
    },
    'Committee': {
      title: 'Committee Member',
      blurb: 'General club work. Everything is available to you.',
      home:  ['fixtures', 'mdops', 'news', 'gallery', 'meetings'],
      quick: [
        { label: 'Check the next fixture', panel: 'fixtures' },
        { label: 'Prepare match day',      panel: 'mdops' },
        { label: 'Write a news story',     panel: 'news' }
      ],
      guide: null
    },
    'Volunteer': {
      title: 'Volunteer',
      blurb: 'Helping out on a match day.',
      home:  ['fixtures', 'venues', 'scanner', 'gallery', 'siteguide'],
      quick: [
        { label: 'Check the next fixture', panel: 'fixtures' },
        { label: 'Check members in',       panel: 'scanner' }
      ],
      guide: null
    }
  };

  // ── WHAT THE INTERFACE MAY SHOW ───────────────────────────────────────────
  // A MIRROR of DEFAULT_CAPS in netlify/functions/lib/authz.js, kept here so
  // the portal can decide what to DRAW. It decides nothing else.
  //
  // This is not a permission. The server re-checks every action against the
  // signed session, and a hidden button is not a locked door — a test asserts
  // that the two lists agree, and separate tests assert the server still
  // refuses an action whose button was merely hidden.
  //
  // It exists because the opposite was worse: Nigel holds DISABLE_ACCOUNT
  // permanently — the club's continuity rule, so a compromised login can be
  // shut down even when the Chairman is the problem — and the interface was
  // hiding the only screen where he could use it. A capability nobody can
  // reach is not a capability.
  var STAFF_CAPS = {
    // Same bundle as Chairman: somebody has to be able to repair the permission
    // system, including when the permission system is what is broken.
    'System Maintainer': ['can_view_staff', 'can_manage_users', 'can_disable_account',
                          'can_reset_credentials', 'can_assign_roles', 'can_assign_admin_roles',
                          'can_confirm_player_identity', 'can_manage_first_team_roster'],
    'Chairman':   ['can_view_staff', 'can_manage_users', 'can_disable_account',
                   'can_reset_credentials', 'can_assign_roles', 'can_assign_admin_roles',
                   'can_confirm_player_identity', 'can_manage_first_team_roster'],
    'V Chairman': ['can_view_staff', 'can_disable_account'],
    // Holds no administrative power: he is the person who knows which of two
    // same-named players actually played, and who is in his squad.
    'Team Manager': ['can_confirm_player_identity', 'can_manage_first_team_roster'],
    // The roster and nothing else — a Thursday signing has to reach Saturday's
    // programme without waiting for anybody technical.
    'Programme Editor': ['can_manage_first_team_roster'],
  };

  /** Does this role hold this capability BY DEFAULT? Drawing only. */
  function roleHas(role, cap) {
    var caps = STAFF_CAPS[profileKey(role)] || STAFF_CAPS[String(role || '')] || [];
    return caps.indexOf(cap) > -1;
  }

  // Older accounts, and the seven role names the sign-in screen already
  // offers, must keep working. An unknown role falls through to Committee —
  // never to nothing, and never to Chairman.
  var PROFILE_ALIAS = {
    'Vice Chairman': 'V Chairman',
    'Secretary': 'Club Secretary',
    'Club Management': 'Team Manager',
    'Manager': 'Team Manager',
    'Media': 'Marketing/Media',
    'Social Media': 'Marketing/Media',
    'Marketing': 'Marketing/Media',
    'Commercial': 'Sponsorship',
    'Programme': 'Programme Editor'
  };
  var PROFILE_DEFAULT = 'Committee';

  function profileKey(role) {
    var r = String(role || '');
    if (PROFILES[r]) return r;
    if (PROFILE_ALIAS[r] && PROFILES[PROFILE_ALIAS[r]]) return PROFILE_ALIAS[r];
    return PROFILE_DEFAULT;
  }
  function profileFor(role) { return PROFILES[profileKey(role)]; }

  // Kept for anything still reading the old shape.
  var ROLE_HOME = {};
  Object.keys(PROFILES).forEach(function (k) { ROLE_HOME[k] = PROFILES[k].home; });

  function byId(id) {
    for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].id === id) return TOOLS[i];
    return null;
  }
  function areaByKey(key) {
    for (var i = 0; i < AREAS.length; i++) if (AREAS[i].key === key) return AREAS[i];
    return null;
  }
  function byArea(key) {
    var a = areaByKey(key);
    if (!a) return [];
    return a.ids.map(byId).filter(function (t) { return t && !t.archived; });
  }
  function homeFor(role) {
    return profileFor(role).home.map(byId).filter(Boolean);
  }
  function quickFor(role) {
    return profileFor(role).quick.filter(function (q) { return !!byId(q.panel); });
  }
  function guideFor(role) {
    return profileFor(role).guide || null;
  }
  function areaOf(id) {
    for (var i = 0; i < AREAS.length; i++) if (AREAS[i].ids.indexOf(id) > -1) return AREAS[i];
    return null;
  }
  /** Plain-English wording for what pressing save in this tool will do. */
  var EFFECT_LABEL = {
    public:   'Changes the public website',
    internal: 'Internal only — not public',
    download: 'Downloads a file to your device',
    view:     'Information only'
  };

  // ── PLAIN-LANGUAGE STATUS ─────────────────────────────────────────────────
  // The portal used at least four vocabularies for the same six states —
  // "pending", "unpublished", "queued", "awaiting_reconciliation". A volunteer
  // reading "awaiting_reconciliation" cannot tell whether they are the person
  // who has to do something. Every status shown to a person now resolves
  // through here: one word, and one sentence saying who is waiting on whom.
  var STATUS = {
    draft:     { label: 'Draft',     tone: 'grey',
                 means: 'Only you can see this. Nobody outside the club has it.' },
    saved:     { label: 'Saved',     tone: 'grey',
                 means: 'Your work is kept. It has not been sent to anyone yet.' },
    submitted: { label: 'Submitted', tone: 'amber',
                 means: 'Sent for checking. Somebody else has to approve it before it goes out.' },
    approved:  { label: 'Approved',  tone: 'green',
                 means: 'Checked and cleared. It will go out at the right moment.' },
    published: { label: 'Published', tone: 'green',
                 means: 'Live on the public website. Supporters can see it now.' },
    archived:  { label: 'Archived',  tone: 'grey',
                 means: 'Kept for the record. It is no longer shown to supporters.' }
  };
  var STATUS_ALIAS = {
    'pending': 'submitted', 'awaiting_reconciliation': 'submitted', 'in_review': 'submitted',
    'unpublished': 'draft', 'new': 'draft', 'in_progress': 'draft',
    'ready': 'approved', 'signed_off': 'approved', 'confirmed': 'approved',
    'live': 'published', 'public': 'published',
    'closed': 'archived', 'retired': 'archived', 'complete': 'approved'
  };
  function statusOf(raw) {
    var k = String(raw || '').toLowerCase().replace(/[\s-]+/g, '_');
    if (STATUS[k]) return STATUS[k];
    if (STATUS_ALIAS[k] && STATUS[STATUS_ALIAS[k]]) return STATUS[STATUS_ALIAS[k]];
    return null;
  }

  /**
   * May a signed-in person even SEE this tool?
   * Drawing only — the server re-checks every action regardless.
   */
  function canSee(tool, role, isChairman) {
    if (!tool) return false;
    // `chairman: true` means administrative-only. The System Maintainer is an
    // administrative role too — gating on the flag alone would hide the
    // developer tools from the person whose job they are.
    if (tool.chairman) return !!isChairman || roleHas(role, 'can_assign_admin_roles');
    if (tool.staffAccess) return !!isChairman || roleHas(role, 'can_view_staff');
    return true;
  }

  global.PortalTools = {
    AREAS: AREAS, TOOLS: TOOLS, PROFILES: PROFILES, ROLE_HOME: ROLE_HOME,
    EFFECT_LABEL: EFFECT_LABEL, STATUS: STATUS, STAFF_CAPS: STAFF_CAPS,
    roleHas: roleHas, canSee: canSee,
    byId: byId, byArea: byArea, areaByKey: areaByKey, areaOf: areaOf,
    homeFor: homeFor, quickFor: quickFor, guideFor: guideFor,
    profileFor: profileFor, profileKey: profileKey, statusOf: statusOf
  };
}(window));
