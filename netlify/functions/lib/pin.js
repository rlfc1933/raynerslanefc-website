// The Staff HQ gate: ONE committee password, 1933.
//
// The club asked for it to be this simple. Previously the PIN lived only in
// the ADMIN_PIN env var and failed closed when it was missing, followed by a
// second per-person password screen — between them nobody could get in.
// Every function that writes anything still checks this on the server.
const COMMITTEE_PASSWORD = '1933';

module.exports = function adminOk(pin) {
  if (pin == null || pin === '') return false;
  return String(pin).trim() === COMMITTEE_PASSWORD;
};
module.exports.COMMITTEE_PASSWORD = COMMITTEE_PASSWORD;
