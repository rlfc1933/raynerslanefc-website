// ADMIN_PIN-gated one-shot cleanup: removes the automated TEST rows (test
// players by throwaway email domain, and every staff login that isn't a real
// one) so the squad and the Management dropdown only show real people.
const L = require('./lib/lane');
const REAL_STAFF = ['pete.singh', 'gary.pitt'];

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  const b = L.parseBody(event);
  if (String(b.pin) !== String(process.env.ADMIN_PIN || '19332026')) return L.resp(401, { ok: false, error: 'Unauthorized' });

  const inlist = function (a) { return '(' + a.join(',') + ')'; };

  // Test staff = any app_user WITH a username that isn't a real staff login.
  const staff = await L.sel('la_app_users?select=id,username&username=not.is.null');
  const testStaffIds = staff.filter(function (s) { return REAL_STAFF.indexOf(s.username) < 0; }).map(function (s) { return s.id; });
  // Test players = throwaway email domains from the harness.
  const players = await L.sel('la_players?select=id,email');
  const testPlayerIds = players.filter(function (p) { return /@(example|x)\.com$/i.test(p.email || ''); }).map(function (p) { return p.id; });
  // Player-linked app_users for those test players.
  const linked = await L.sel('la_app_users?select=id,player_id&player_id=not.is.null');
  const testLinkedIds = linked.filter(function (a) { return testPlayerIds.indexOf(a.player_id) >= 0; }).map(function (a) { return a.id; });
  const userIds = Array.from(new Set(testStaffIds.concat(testLinkedIds)));

  let testEventIds = [];
  if (userIds.length) {
    const evs = await L.sel('la_events?select=id,created_by&created_by=in.' + inlist(userIds));
    testEventIds = evs.map(function (e) { return e.id; });
  }

  // Children first (no cascade on these FKs), then events (cascade avail/sel/checkin),
  // then the users, then the players (cascade their avail/sel/checkin/feedback).
  if (userIds.length) {
    await L.del('la_sessions', 'user_id=in.' + inlist(userIds));
    await L.del('la_audit_log', 'actor_id=in.' + inlist(userIds));
    await L.del('la_selections', 'selected_by=in.' + inlist(userIds));
  }
  if (testEventIds.length) await L.del('la_events', 'id=in.' + inlist(testEventIds));
  if (userIds.length) await L.del('la_app_users', 'id=in.' + inlist(userIds));
  if (testPlayerIds.length) await L.del('la_players', 'id=in.' + inlist(testPlayerIds));
  await L.del('la_venues', 'club_name=eq.Concurrency%20FC');

  return L.resp(200, { ok: true, removed: { staff: testStaffIds.length, players: testPlayerIds.length, events: testEventIds.length, linkedAccounts: testLinkedIds.length } });
};
