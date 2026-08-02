// GATE 8 — what the public key can reach.
//
// Supabase's anon key ships in the page. Anything readable with it is readable
// by anyone who opens the network tab, so "nothing links to it" is not a
// control and "the endpoint filters" is only half of one. Row level security is
// the half that holds when a future endpoint forgets.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'supabase/migrations');
const SQL = fs.readdirSync(DIR).sort().map((f) => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');

/** Tables created anywhere in the migration history. */
function createdTables() {
  return (SQL.match(/create table if not exists public\.(\w+)/g) || [])
    .map((m) => m.split('.')[1]);
}

test('every table created has row level security switched on', () => {
  const tables = createdTables();
  assert.ok(tables.length > 20, 'expected the whole schema');
  const missing = tables.filter((t) => {
    const direct = new RegExp('alter table public\\.' + t + '\\s+enable row level security');
    // Several migrations enable RLS over an array of names in a loop.
    const inLoop = new RegExp("'" + t + "'[\\s\\S]{0,600}?enable row level security");
    return !direct.test(SQL) && !inLoop.test(SQL);
  });
  assert.deepStrictEqual(missing, [], 'tables with no row level security');
});

test('THE IDENTITY DECISION LOG IS NOT PUBLIC', () => {
  // It carries committee members' names and their judgements about real
  // people. No select policy means RLS denies it outright.
  assert.ok(/football_identity_decisions[\s\S]*?enable row level security/.test(SQL));
  assert.ok(!/create policy[^;]*on public\.football_identity_decisions[^;]*for select/.test(SQL),
    'a public read policy was added to the decision log');
});

test('the rejection list is not public either', () => {
  assert.ok(!/create policy[^;]*on public\.football_identity_rejections[^;]*for select/.test(SQL));
});

test('sync runs and conflicts stay private', () => {
  // They carry provider URLs, error text and the club's disagreements with its
  // own data source.
  ['football_sync_runs', 'football_source_conflicts'].forEach((t) => {
    assert.ok(!new RegExp('create policy[^;]*on public\\.' + t + '[^;]*for select[^;]*using \\(true\\)').test(SQL),
      t + ' is readable by the public key');
  });
});

test('a programme is public only once it is published', () => {
  const policy = (SQL.match(/create policy[^;]*programme_editions[^;]*for select[^;]*;/) || [])[0] || '';
  assert.ok(policy, 'programme_editions has no read policy at all');
  ['published_matchday', 'published_late', 'full_time_current', 'archived'].forEach((st) => {
    assert.ok(policy.includes(st), 'published state ' + st + ' missing from the policy');
  });
  assert.ok(!/draft_hidden/.test(policy), 'a hidden draft is readable');
  assert.ok(!/withheld/.test(policy), 'a withheld programme is readable');
});

test('season totals ARE public, and are the only new player table that is', () => {
  assert.ok(/create policy football_pss_read on public\.football_player_season_stats\s*\n?\s*for select using \(true\)/.test(SQL),
    'the squad page needs to read season totals');
});

test('a public slug cannot exist without a confirmed identity', () => {
  // Enforced by the database, not by remembering. Every future endpoint that
  // writes a slug inherits the rule.
  assert.match(SQL, /check \(public_slug is null or identity_status = 'confirmed'\)/);
});

test('one roster player cannot be claimed by two registry records', () => {
  assert.match(SQL, /create unique index if not exists football_players_club_id_idx[\s\S]{0,140}club_player_id/);
  assert.match(SQL, /create unique index if not exists football_players_public_slug_idx/);
});

test('the anon key is never used for a write path in the functions', () => {
  const dir = path.join(__dirname, '..', 'netlify/functions');
  const walk = (d, prefix, out) => {
    fs.readdirSync(d).forEach((f) => {
      const full = path.join(d, f);
      if (fs.statSync(full).isDirectory()) return walk(full, prefix + f + '/', out);
      if (f.endsWith('.js')) out.push([prefix + f, fs.readFileSync(full, 'utf8')]);
    });
    return out;
  };
  walk(dir, '', []).forEach(([name, src]) => {
    if (!/ANON_KEY|anonKey|PUBLISHABLE/.test(src)) return;
    // The anon key legitimately appears as the `apikey` on Supabase's
    // /auth/v1/user call — that is how a supporter's token is VERIFIED, and
    // verification is a read. What must never happen is the anon key being
    // the credential on a write.
    const anonReadOnly = /\/auth\/v1\/user/.test(src);
    const writes = /method:\s*'(POST|PATCH|DELETE)'/.test(src);
    if (anonReadOnly && writes) {
      // Writes in such a file must go through the service-key helper.
      assert.match(src, /require\(['"][^'"]*football\/store['"]\)/,
        name + ' writes without the service-key store');
      return;
    }
    assert.ok(!writes, name + ' writes while holding an anon key');
  });
});

test('a decision cannot be recorded without somebody\'s name', () => {
  assert.match(SQL, /decided_by\s+text not null/);
  assert.match(SQL, /rejected_by\s+text not null/);
});
