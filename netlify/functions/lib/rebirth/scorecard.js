// ════════════════════════════════════════════════════════════════════════
//  EXECUTIVE SCORECARD + COMMAND-CENTRE PRIORITIES. Pure functions over
//  records the club already holds. Three rules hold everywhere:
//    · a researched prospect is never a sponsor;
//    · a pledge or an unpaid invoice is never cash;
//    · a page view is never attendance.
//  A metric with no data says "not recorded yet" and how to provide it.
// ════════════════════════════════════════════════════════════════════════
'use strict';

const CLOSED_OFFER = ['declined', 'withdrawn'];
const PANEL = { enquiry: 'commercial', opportunity: 'commercial', invoice: 'commercial', fulfilment: 'commercial', outreach: 'outreach',
  grant: 'funding', compliance: 'compliance', comms: 'commsdesk', task: 'clubtasks', analysis: 'coaching',
  volunteer_role: 'volunteers', volunteer_offer: 'volunteers', proposal: 'businessclub', research: 'future' };

function seasonStart(now = new Date()) { const y = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1; return `${y}-07-01`; }
const day = (iso) => String(iso || '').slice(0, 10);
const metric = (key, label, value, format, note, how) => ({ key, label, value: value == null ? null : value, format, note: note || null, empty: value == null, how: value == null ? (how || null) : null });

function scorecard(d, now = new Date()) {
  const items = d.items || [];
  const since = seasonStart(now);
  const won = items.filter((i) => i.kind === 'opportunity' && i.stage === 'won' && day(i.closed_at || i.updated_at) >= since);
  const cashWon = won.filter((i) => !i.in_kind);
  const invoices = items.filter((i) => i.kind === 'invoice');
  const payments = invoices.flatMap((i) => ((i.data || {}).payments || []).map((p) => Object.assign({ org_id: i.org_id }, p)));
  const seasonPayments = payments.filter((p) => day(p.at) >= since);
  const yearAgo = new Date(now.getTime() - 365 * 864e5).toISOString().slice(0, 10);
  const payingOrgs = new Set(payments.filter((p) => day(p.at) >= yearAgo && p.org_id).map((p) => p.org_id));
  const renewals = won.filter((i) => (i.data || {}).renewal_of);
  const owed = invoices.filter((i) => ['issued', 'part_paid', 'overdue'].includes(i.stage)).reduce((s, i) => s + (i.value_pence || 0) - (i.paid_pence || 0), 0);
  const grants = items.filter((i) => i.kind === 'grant' && ['eligible', 'preparing', 'awaiting_approval', 'submitted'].includes(i.stage));
  const fin = d.finance;
  const funding = [
    metric('contracted', 'Sponsorship contracted this season', cashWon.length ? cashWon.reduce((s, i) => s + (i.value_pence || 0), 0) : null, 'money',
      'Won deals with an agreed cash value.', 'Mark a deal Won with its agreed value.'),
    metric('collected', 'Cash collected this season', seasonPayments.length ? seasonPayments.reduce((s, p) => s + (p.pence || 0), 0) : null, 'money',
      'Payments recorded against invoices with bank evidence.', 'Record a payment on an issued invoice.'),
    metric('owed', 'Invoiced, not yet paid', owed || (invoices.length ? 0 : null), 'money', 'Owed to the club — not cash until it is paid.'),
    metric('in_kind', 'In-kind support (estimated value)', won.filter((i) => i.in_kind).length ? won.filter((i) => i.in_kind).reduce((s, i) => s + (i.estimate_pence || i.value_pence || 0), 0) : null, 'money', 'Estimated value of goods/services — never counted as money.'),
    metric('recurring', 'Recurring partner income', renewals.length ? renewals.reduce((s, i) => s + (i.in_kind ? 0 : i.value_pence || 0), 0) : null, 'money', 'Value of deals that are renewals of an earlier one.', 'Use Renew on a won deal when a sponsor comes back.'),
    metric('renewals', 'Sponsor renewals', renewals.length || null, 'count', null, 'Renewals appear when a renewed deal is won.'),
    metric('paying', 'Active paying sponsors', payingOrgs.size || null, 'count', 'Businesses with a payment recorded in the last 12 months.', 'Record payments against invoices.'),
    fin && fin.restricted ? Object.assign(metric('gap', 'Operating funding gap (monthly)', null, 'money'), { restricted: true, note: 'Confidential — visible to finance-authorised users only.' })
      : metric('gap', 'Operating funding gap (monthly)', fin && !fin.empty ? fin.sponsorshipNeededMonthlyPence : null, 'money',
        fin && !fin.empty ? (fin.includesEstimates ? 'Includes estimated lines.' : 'From actual cost and income lines.') : null, 'Enter cost and income lines in Club finances.'),
    metric('grants', 'Qualified funding opportunities', grants.length || null, 'count', 'Assessed eligible (with a written reason) or further along.', 'Assess opportunities in Grants & funding.'),
  ];

  const att = d.attendance || {};
  const prog = att.progress || {};
  const ci = att.checkins || { matches: [] };
  const last = ci.matches[0];
  const seasonCi = ci.matches.filter((m) => m.date >= since);
  const fans = [
    metric('avg_attendance', 'Verified average home attendance', prog.recentAverage, 'people',
      prog.verifiedMatches ? `Last ${Math.min(5, prog.verifiedMatches)} verified home matches. Next aspiration: ${prog.nextMilestone || '—'}.` : null,
      'Record and confirm the crowd after each home match (Attendance).'),
    metric('verified_matches', 'Home matches with a verified figure', prog.verifiedMatches || null, 'count', prog.baselineNote, 'Record attendance after each home match.'),
    metric('first_time', 'First-time Lane Card check-ins this season', seasonCi.length ? seasonCi.reduce((s, m) => s + m.firstTime, 0) : null, 'people', 'Card check-ins only — not the whole crowd.', 'Scan Lane Cards at the gate.'),
    metric('returning', 'Returning Lane Card check-ins this season', seasonCi.length ? seasonCi.reduce((s, m) => s + m.returning, 0) : null, 'people', last ? `Last home match: ${last.checkins} check-ins (${last.firstTime} first-time).` : null, 'Scan Lane Cards at the gate.'),
    metric('repeat_rate', 'Repeat visit rate (cardholders)', ci.repeatVisitRate, 'pct', 'Share of cardholders who checked in at 2+ home matches.'),
    metric('registrations', 'Valid supporter registrations', d.members && d.members.active != null ? d.members.active : null, 'count',
      d.members && d.members.last30 != null ? `${d.members.last30} joined in the last 30 days.` : null, 'Supporter membership data is not connected.'),
    metric('campaign_attendance', 'Attendance from campaigns', null, 'people', null, 'Not measurable yet — needs a campaign code at check-in.'),
  ];

  const opps = items.filter((i) => i.kind === 'opportunity');
  const offers = items.filter((i) => i.kind === 'volunteer_offer');
  const ninety = new Date(now.getTime() - 90 * 864e5).toISOString();
  const activeVol = new Set(offers.filter((o) => ['assigned', 'delivered', 'recognised'].includes(o.stage) && String(o.updated_at) >= ninety)
    .map((o) => String((o.data || {}).email || o.id).toLowerCase()));
  const hours = offers.filter((o) => ['delivered', 'recognised'].includes(o.stage)).reduce((s, o) => s + (Number((o.data || {}).hours) || 0), 0);
  const responses = new Set(items.filter((i) => (i.kind === 'enquiry') || (i.kind === 'outreach' && i.stage === 'replied')).map((i) => i.org_id || i.id));
  const meetings = opps.filter((o) => (o.data || {}).meeting_date).length;
  const community = items.filter((i) => i.kind === 'enquiry' && /community|school|charity/i.test(String((i.data || {}).category || ''))).length;
  const interest = [
    metric('responses', 'Genuine local business responses', responses.size || null, 'count', 'Website enquiries and replies to an approach.', 'Responses appear when a business enquires or replies.'),
    metric('meetings', 'Meetings / ground visits with prospective sponsors', meetings || null, 'count', null, 'Record a meeting date on the deal.'),
    metric('community', 'Community partner enquiries', community || null, 'count', null, 'Tag an enquiry as community to count it.'),
    metric('volunteers', 'Active volunteers (last 90 days)', activeVol.size || null, 'people', null, 'Assign volunteers to approved roles.'),
    metric('volunteer_hours', 'Volunteer hours recorded', hours || null, 'count', null, 'Record hours when help is delivered.'),
    metric('prospects', 'Businesses researched (not sponsors)', (d.orgs || []).filter((o) => o.relationship === 'prospect').length || null, 'count', 'Researched prospects — never counted as sponsors.'),
  ];
  return { funding, fans, interest, rules: ['Researched prospects are never reported as sponsors.', 'Pledges and unpaid invoices are never reported as cash.',
    'Website page views are never reported as attendance.', 'Estimated values are labelled and never presented as accounting records.'], since };
}

// ── Command-centre priorities: grouped and deduplicated ─────────────────
function priorities(d, now = new Date()) {
  const items = (d.items || []).filter((i) => !i.closed_at);
  const today = now.toISOString().slice(0, 10);
  const inDays = (n) => new Date(now.getTime() + n * 864e5).toISOString().slice(0, 10);
  const used = new Set();
  const row = (i, why, group) => ({ id: i.id, kind: i.kind, title: i.title, stage: i.stage, owner: i.owner || null, due: i.due_date || null, why, panel: PANEL[i.kind] || 'command', group });
  const take = (group, list, why) => list.filter((i) => !used.has(i.id)).map((i) => { used.add(i.id); return row(i, typeof why === 'function' ? why(i) : why, group); });
  const isMatchday = (i) => i.kind === 'task' && (((i.data || {}).area === 'Matchday') || /^fixture:/.test(i.source || ''));
  const over48 = (i) => (now.getTime() - Date.parse(i.created_at)) > 48 * 3600e3;

  // 1. What absolutely needs doing (wins any tie).
  const mustDo = []
    .concat(take('matchday', items.filter((i) => isMatchday(i) && i.due_date && i.due_date <= inDays(7)).sort(byDue), (i) => i.due_date < today ? 'Matchday task overdue' : 'Matchday task this week'))
    .concat(take('enquiries', items.filter((i) => i.kind === 'enquiry' && ['new', 'acknowledged'].includes(i.stage) && over48(i)), 'Enquiry unanswered for more than 48 hours'))
    .concat(take('deadlines', items.filter((i) => ['compliance', 'grant', 'task'].includes(i.kind) && !/^Renewal conversation/.test(i.title) && i.due_date && i.due_date <= inDays(14)).sort(byDue), (i) => i.due_date < today ? 'Overdue' : 'Due within 14 days'))
    .concat(take('approvals', items.filter((i) => (i.kind === 'outreach' && i.stage === 'draft') || (i.kind === 'comms' && i.stage === 'review')
      || (i.kind === 'invoice' && i.stage === 'draft' && i.value_pence > 0) || (i.kind === 'volunteer_offer' && i.stage === 'new')
      || (i.kind === 'volunteer_role' && i.stage === 'draft' && (i.data || {}).coordinator) || (i.kind === 'opportunity' && (i.data || {}).rebook_needed)),
    (i) => i.kind === 'opportunity' ? 'Booked fixture postponed or rearranged — re-book the sponsor' : i.kind === 'invoice' ? 'Invoice needs approval before it is issued'
      : i.kind === 'volunteer_offer' ? 'New volunteer offer — reply and approve' : i.kind === 'volunteer_role' ? 'Volunteer role ready for approval' : 'Needs approval by someone other than the writer'));
  for (const a of d.unverifiedAttendance || []) mustDo.push({ id: 'att:' + a.id, kind: 'attendance', title: `Confirm attendance — ${a.opponent || a.date} (${a.headcount})`, why: `Counted by ${a.recorded_by}; needs a second person to confirm`, due: a.date, panel: 'attendance', group: 'approvals' });
  for (const f of d.missingAttendance || []) mustDo.push({ id: 'att-missing:' + f.id, kind: 'attendance', title: `Record attendance — ${f.opponent || 'home match'}`, why: 'Home match played with no attendance figure', due: f.date, panel: 'attendance', group: 'deadlines' });

  // 2. Where money can come in.
  const money = []
    .concat(take('enquiries', items.filter((i) => i.kind === 'enquiry' && ['new', 'acknowledged', 'assigned'].includes(i.stage)), 'New sponsor enquiry'))
    .concat(take('proposals', items.filter((i) => (i.kind === 'opportunity' && ['proposal', 'negotiation'].includes(i.stage)) || (i.kind === 'proposal' && i.stage === 'review')),
      (i) => i.kind === 'proposal' ? 'Proposal awaiting the chairman’s decision' : (i.data || {}).package_approved_by ? 'Proposal with the business' : 'Proposal awaiting package approval'))
    .concat(take('invoices', items.filter((i) => i.kind === 'invoice' && ['issued', 'part_paid', 'overdue'].includes(i.stage)), (i) => `Unpaid: £${(((i.value_pence || 0) - (i.paid_pence || 0)) / 100).toFixed(2)}`))
    .concat(take('renewals', items.filter((i) => i.kind === 'task' && /^Renewal conversation/.test(i.title) && (!i.due_date || i.due_date <= inDays(30))), 'Renewal conversation due'))
    .concat(take('funding', items.filter((i) => i.kind === 'grant' && ['eligible', 'preparing', 'awaiting_approval'].includes(i.stage)), 'Eligible funding — assessed with a written reason'));

  const group = (list, order) => order.map((g) => ({ key: g, items: list.filter((x) => x.group === g) })).filter((g) => g.items.length);
  return {
    money: group(money, ['enquiries', 'proposals', 'invoices', 'renewals', 'funding']),
    supporters: {
      nextFixture: d.nextFixture || null, nextHomeFixture: d.nextHomeFixture || null,
      recentAttendance: (d.figures || []).slice(0, 3),
      laneCard: d.laneCard || null,
      promote: d.nextHomeFixture ? [`Promote ${d.nextHomeFixture.opponent || 'the next home match'} — invite a friend, share the fixture, programme and Lane Card sign-up.`] : [],
    },
    mustDo: group(mustDo, ['matchday', 'enquiries', 'deadlines', 'approvals']),
    counts: { money: money.length, mustDo: mustDo.length },
  };
}
function byDue(a, b) { return String(a.due_date || '9').localeCompare(String(b.due_date || '9')); }

module.exports = { scorecard, priorities, seasonStart, PANEL };
