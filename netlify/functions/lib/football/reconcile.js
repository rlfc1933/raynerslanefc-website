// Reconciling the provider's season against the club's own fixture list.
//
// This is the part that can do real damage quietly. Attaching a provider match
// to the wrong internal fixture puts another club's score on our website, or
// files our result against somebody else's game — and it looks fine until
// somebody notices weeks later.
//
// So the rule is: an EXTERNAL ID is an identity, everything else is a guess.
// A guess may reach 'strong' and be used; it may reach 'needs_review' and wait
// for a human; it is never silently promoted.
//
// Pure functions only — no network, no database. Everything here is decided
// from two lists, which is what makes it testable against the real season.
'use strict';

const N = require('../fwp/normalise');

const CLUB = 'Rayners Lane';

/** The provider id embedded in our own fixture ids: 'fwp-578225' → '578225'. */
function internalExternalId(fixture) {
  const m = String((fixture && fixture.id) || '').match(/^fwp-(\d+)$/);
  return m ? m[1] : null;
}

/** Same calendar day? Compared as plain ISO dates, never as parsed instants. */
function sameDate(a, b) {
  return !!a && !!b && String(a).slice(0, 10) === String(b).slice(0, 10);
}

/**
 * Decide which internal fixture a provider fixture belongs to.
 *
 * Confidence:
 *   exact_id     — our id already carries the provider's id. Certain.
 *   strong       — same date AND same opponent AND same venue designation.
 *                  Enough to use; three independent facts agreeing.
 *   needs_review — a partial agreement. NEVER used automatically.
 *   rejected     — contradicts on something that matters.
 */
function matchToInternal(provider, internalList) {
  const byExact = internalList.filter((f) => internalExternalId(f) === provider.externalFixtureId);
  if (byExact.length === 1) {
    return { internal: byExact[0], confidence: 'exact_id', reasons: ['provider id matches our fixture id'] };
  }
  if (byExact.length > 1) {
    return { internal: null, confidence: 'rejected', reasons: ['more than one internal fixture claims provider id ' + provider.externalFixtureId] };
  }

  const candidates = internalList.filter((f) => sameDate(f.date, provider.date));
  const sameOpp = candidates.filter((f) => N.sameClub(f.opponent, provider.opponent));

  if (sameOpp.length === 1) {
    const f = sameOpp[0];
    const venueAgrees = (f.isHome !== false) === provider.isHome;
    if (!venueAgrees) {
      // Date and opponent agree but one says home and the other away. That is a
      // genuine contradiction, not a near miss — refuse it.
      return {
        internal: f, confidence: 'rejected',
        reasons: ['home/away disagree: ours says ' + (f.isHome !== false ? 'home' : 'away') +
                  ', provider says ' + (provider.isHome ? 'home' : 'away')],
      };
    }
    return { internal: f, confidence: 'strong', reasons: ['same date, opponent and venue'] };
  }
  if (sameOpp.length > 1) {
    return { internal: null, confidence: 'needs_review', reasons: ['two internal fixtures share that date and opponent'] };
  }
  if (candidates.length) {
    return {
      internal: null, confidence: 'needs_review',
      reasons: ['a fixture exists on ' + provider.date + ' but against ' +
                candidates.map((c) => c.opponent).join('/') + ', not ' + provider.opponent],
    };
  }
  return { internal: null, confidence: 'needs_review', reasons: ['no internal fixture on ' + provider.date] };
}

/**
 * Compare a matched pair and report every meaningful disagreement.
 * Reporting is the point — nothing here decides to overwrite anything.
 */
function diffFixture(internal, provider) {
  const out = [];
  if (!internal) return out;

  if (!sameDate(internal.date, provider.date)) {
    out.push({ field: 'date', internal: internal.date, provider: provider.date, severity: 'critical' });
  }
  // The provider stops reporting a kick-off once the match is played, so a null
  // is silence rather than disagreement.
  if (provider.kickoff && internal.kickoff && provider.kickoff !== internal.kickoff) {
    out.push({ field: 'kickoff', internal: internal.kickoff, provider: provider.kickoff, severity: 'critical' });
  }
  if ((internal.isHome !== false) !== provider.isHome) {
    out.push({ field: 'isHome', internal: String(internal.isHome !== false), provider: String(provider.isHome), severity: 'critical' });
  }
  if (internal.opponent && !N.sameClub(internal.opponent, provider.opponent)) {
    out.push({ field: 'opponent', internal: internal.opponent, provider: provider.opponent, severity: 'critical' });
  }
  if (internal.competition && provider.competition &&
      N.slug(internal.competition) !== N.slug(provider.competition)) {
    // Competition names are abbreviated differently on each side
    // ("Combined Counties Prem N" vs "Combined Counties Premier Division
    // North"), so this is informational rather than a contradiction.
    out.push({ field: 'competition', internal: internal.competition, provider: provider.competition, severity: 'info' });
  }
  if (provider.played) {
    const us = provider.isHome ? provider.homeScore : provider.awayScore;
    const them = provider.isHome ? provider.awayScore : provider.homeScore;
    if (internal.us != null && internal.us !== us) {
      out.push({ field: 'us', internal: String(internal.us), provider: String(us), severity: 'critical' });
    }
    if (internal.them != null && internal.them !== them) {
      out.push({ field: 'them', internal: String(internal.them), provider: String(them), severity: 'critical' });
    }
  }
  return out;
}

/**
 * A full shadow reconciliation of the season.
 * Reports; changes nothing.
 */
function reconcileSeason(providerFixtures, internalFixtures) {
  const matched = [];
  const unmatchedProvider = [];
  const conflicts = [];
  const claimed = new Set();

  for (const p of providerFixtures) {
    const r = matchToInternal(p, internalFixtures);
    if (r.internal && (r.confidence === 'exact_id' || r.confidence === 'strong')) {
      if (claimed.has(r.internal.id)) {
        unmatchedProvider.push({ provider: p, confidence: 'rejected', reasons: ['internal fixture already claimed'] });
        continue;
      }
      claimed.add(r.internal.id);
      const diffs = diffFixture(r.internal, p);
      matched.push({ provider: p, internal: r.internal, confidence: r.confidence, diffs });
      diffs.forEach((d) => conflicts.push(Object.assign({ fixtureId: r.internal.id }, d)));
    } else {
      unmatchedProvider.push({ provider: p, confidence: r.confidence, reasons: r.reasons });
    }
  }

  const unmatchedInternal = internalFixtures.filter((f) => !claimed.has(f.id));
  return {
    matched, unmatchedProvider, unmatchedInternal, conflicts,
    summary: {
      provider: providerFixtures.length,
      internal: internalFixtures.length,
      matched: matched.length,
      exactId: matched.filter((m) => m.confidence === 'exact_id').length,
      strong: matched.filter((m) => m.confidence === 'strong').length,
      unmatchedProvider: unmatchedProvider.length,
      unmatchedInternal: unmatchedInternal.length,
      criticalConflicts: conflicts.filter((c) => c.severity === 'critical').length,
    },
  };
}

/** Only Rayners Lane home fixtures get a programme, unless staff say otherwise. */
function programmeEligible(provider) {
  return !!provider.isHome && !/friendly/i.test(provider.competition || '');
}

module.exports = {
  CLUB, internalExternalId, sameDate,
  matchToInternal, diffFixture, reconcileSeason, programmeEligible,
};
