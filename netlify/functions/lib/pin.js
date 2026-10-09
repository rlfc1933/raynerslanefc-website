// The Staff HQ gate: ONE committee password, 1933.
//
// The club asked for it to be this simple. Previously the PIN lived only in
// the ADMIN_PIN env var and failed closed when it was missing, followed by a
// second per-person password screen — between them nobody could get in.
// Every function that writes anything still checks this on the server.
const COMMITTEE_PASSWORD = '1933';

module.exports = function adminOk(pin) {
  if (pin == null || pin === '') return false;
  const p = String(pin).trim();
  if (p === COMMITTEE_PASSWORD) return true;
  // Server-to-server: scheduled functions (fwp-sync, football-registry-sync)
  // call save-data with process.env.ADMIN_PIN. That value never reaches a
  // browser, so honouring it keeps the automated fixture/result write-back
  // working without the committee needing to know it exists.
  const internal = process.env.ADMIN_PIN;
  return !!(internal && internal.length >= 4 && p === String(internal));
};
module.exports.COMMITTEE_PASSWORD = COMMITTEE_PASSWORD;
