// The Football Web Pages layer — the ONLY place in the codebase that knows what
// the provider's markup looks like.
//
// Everything else consumes the normalised shapes returned here. When the
// provider changes its HTML, or the club moves to another supplier, this
// directory is rewritten and nothing else is touched.
//
// The match parser and HTTP client are the ones already proven in production
// through a real fixture (Rayners Lane 3-3 Wallingford & Crowmarsh, 1 Aug
// 2026). They are re-exported here rather than rewritten: an architecture is
// not worth a working Saturday. Later gates migrate callers to this surface
// once shadow comparison proves parity.
'use strict';

const match = require('../fwp-adapter');    // proven in production — do not fork
const client = require('../fwp-client');    // proven in production — do not fork
const normalise = require('./normalise');
const table = require('./parse-table');
const fixtures = require('./parse-fixtures');

module.exports = {
  PROVIDER: 'fwp',

  // transport
  isEnabled: client.isEnabled,
  request: client.request,
  fetchMatch: client.fetchMatch,
  fetchFixtureList: client.fetchFixtureList,
  embedUrl: client.embedUrl,
  matchPath: client.matchPath,

  // parsing
  parseMatch: match.parseMatch,
  validateMatch: match.validateMatch,
  ourView: match.ourView,
  eventKey: match.eventKey,
  parseFixtureList: fixtures.parseFixtureList,
  validateFixtureList: fixtures.validateFixtureList,
  parseLeagueTable: table.parseLeagueTable,
  validateLeagueTable: table.validateTable,

  // identity
  clubKey: normalise.clubKey,
  playerKey: normalise.playerKey,
  sameClub: normalise.sameClub,
  slug: normalise.slug,
};
