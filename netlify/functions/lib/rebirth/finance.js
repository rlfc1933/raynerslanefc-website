// ════════════════════════════════════════════════════════════════════════
//  OPERATING-COST MODEL — confidential, built only from lines that an
//  authorised person has entered. Pure functions. Never fabricates a figure:
//  no lines → an empty model that says so.
//
//  Cash, pledged and in-kind are kept apart and never added together. An
//  in-kind estimate is not money; a pledge is not cash. Club-level lines
//  only — the model has no place for any individual's own contributions.
// ════════════════════════════════════════════════════════════════════════
'use strict';

const KINDS = ['income', 'cost', 'cash_balance', 'liability'];
const CATEGORIES = {
  income: ['gate', 'sponsorship', 'matchday_sales', 'merchandise', 'grants', 'fundraising', 'other_income'],
  cost: ['pitch_and_venue', 'officials_and_match', 'league_and_fa_fees', 'kit_and_equipment', 'travel', 'insurance', 'player_costs', 'other_cost'],
  cash_balance: ['bank'],
  liability: ['supplier', 'league_or_fa', 'other_liability'],
};
const FREQUENCIES = ['monthly', 'per_home_match', 'annual', 'one_off'];
const BASES = ['actual', 'budget', 'estimate'];
const RECEIPTS = ['cash', 'pledged', 'in_kind'];

function validateLine(b) {
  if (!KINDS.includes(b.kind)) return 'Choose income, cost, cash balance or liability.';
  if (!CATEGORIES[b.kind].includes(b.category)) return 'Choose a category from the list.';
  if (!String(b.label || '').trim()) return 'Describe the line (e.g. "Pitch hire").';
  if (!(Number.isInteger(b.amount_pence) && b.amount_pence >= 0)) return 'Enter an amount in pounds.';
  if (['income', 'cost'].includes(b.kind) && !FREQUENCIES.includes(b.frequency)) return 'How often: monthly, per home match, annual or one-off.';
  if (!BASES.includes(b.basis)) return 'Is this an actual figure, a budget or an estimate?';
  if (b.kind === 'income' && !RECEIPTS.includes(b.receipt)) return 'Is this income cash received, pledged, or in-kind?';
  if ((b.kind === 'cash_balance' || b.basis === 'actual') && !String(b.evidence || '').trim()) return 'Say where the figure comes from (bank statement date, invoice, receipt).';
  if (b.as_of && !/^\d{4}-\d{2}-\d{2}$/.test(b.as_of)) return 'Date must be a date.';
  return null;
}

function perMonth(line, homePerMonth) {
  switch (line.frequency) {
    case 'monthly': return line.amount_pence;
    case 'per_home_match': return Math.round(line.amount_pence * homePerMonth);
    case 'annual': return Math.round(line.amount_pence / 12);
    default: return 0;
  }
}

/**
 * @param lines   active finance lines
 * @param opts    { homeMatchesPerMonth, sponsorshipCollected12mPence, today:'YYYY-MM-DD' }
 */
function model(lines = [], opts = {}) {
  const live = lines.filter((l) => !l.archived_at);
  const hpm = Number(opts.homeMatchesPerMonth) > 0 ? Number(opts.homeMatchesPerMonth) : 2;
  if (!live.length) {
    return { empty: true, homeMatchesPerMonth: hpm, sponsorshipCollected12mPence: opts.sponsorshipCollected12mPence || 0,
      note: 'No figures entered yet. Add the club’s actual costs and income lines to see the monthly position.' };
  }
  const sum = (arr) => arr.reduce((s, l) => s + perMonth(l, hpm), 0);
  const costs = live.filter((l) => l.kind === 'cost');
  const income = live.filter((l) => l.kind === 'income');
  const cashIn = income.filter((l) => l.receipt === 'cash');
  const m = {
    empty: false, homeMatchesPerMonth: hpm,
    monthlyCostPence: sum(costs),
    fixedCostPence: sum(costs.filter((l) => l.fixed)),
    variableCostPence: sum(costs.filter((l) => !l.fixed)),
    monthlyCashIncomePence: sum(cashIn),
    repeatableCashIncomePence: sum(cashIn.filter((l) => l.repeatable)),
    pledgedMonthlyPence: sum(income.filter((l) => l.receipt === 'pledged')),     // NOT cash
    inKindMonthlyPence: sum(income.filter((l) => l.receipt === 'in_kind')),      // NOT money
    byCategory: {},
  };
  for (const l of costs.concat(income)) {
    const k = l.kind + ':' + l.category;
    m.byCategory[k] = (m.byCategory[k] || 0) + perMonth(l, hpm);
  }
  m.monthlySurplusPence = m.monthlyCashIncomePence - m.monthlyCostPence;            // negative = shortfall
  m.position = m.monthlySurplusPence >= 0 ? 'surplus' : 'shortfall';
  m.sponsorshipNeededMonthlyPence = Math.max(0, -m.monthlySurplusPence);
  m.sponsorshipNeededAnnualPence = m.sponsorshipNeededMonthlyPence * 12;
  // If every pledge is honoured — shown separately, never folded into the position.
  m.surplusIfPledgesPaidPence = m.monthlySurplusPence + m.pledgedMonthlyPence;
  m.repeatableSharePct = m.monthlyCashIncomePence ? Math.round((m.repeatableCashIncomePence / m.monthlyCashIncomePence) * 100) : null;
  const balances = live.filter((l) => l.kind === 'cash_balance').sort((a, b) => String(b.as_of || '').localeCompare(String(a.as_of || '')));
  m.cashAvailablePence = balances.length ? balances[0].amount_pence : null;
  m.cashAvailableAsOf = balances.length ? balances[0].as_of || null : null;
  m.liabilitiesPence = live.filter((l) => l.kind === 'liability').reduce((s, l) => s + l.amount_pence, 0);
  // Next 90 days: three months of run-rate plus one-off lines dated inside the window.
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const end = new Date(Date.parse(today + 'T12:00:00Z') + 90 * 864e5).toISOString().slice(0, 10);
  const oneOff = (k) => live.filter((l) => l.kind === k && l.frequency === 'one_off' && l.as_of && l.as_of >= today && l.as_of <= end && (k !== 'income' || l.receipt === 'cash'))
    .reduce((s, l) => s + l.amount_pence, 0);
  m.next90 = { from: today, to: end, cashInPence: m.monthlyCashIncomePence * 3 + oneOff('income'), costPence: m.monthlyCostPence * 3 + oneOff('cost') };
  m.next90.netPence = m.next90.cashInPence - m.next90.costPence;
  m.sponsorshipCollected12mPence = opts.sponsorshipCollected12mPence || 0;
  m.includesEstimates = live.some((l) => l.basis === 'estimate');
  m.basisCounts = BASES.reduce((o, b) => { o[b] = live.filter((l) => l.basis === b).length; return o; }, {});
  m.note = m.includesEstimates ? 'Includes lines marked as estimates — they are not accounting records.' : 'Built from the lines entered below.';
  return m;
}

module.exports = { KINDS, CATEGORIES, FREQUENCIES, BASES, RECEIPTS, validateLine, perMonth, model };
