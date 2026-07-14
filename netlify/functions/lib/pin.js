// The admin PIN gate.
//
// The PIN lives ONLY in the ADMIN_PIN env var. There is deliberately NO
// fallback here, and adding one back would undo the whole point:
//
// This used to read `process.env.ADMIN_PIN || '<the real PIN>'` in 17
// functions, and admin.html shipped `const PIN = '<the real PIN>'` to every
// visitor. So the
// "secret" was printed in the public page source of the site it protected,
// and in a public repo's history. Anyone who viewed source could write to
// data/*.json or call la-seed-staff and make themselves chairman.
//
// It also broke deploys: Netlify's secrets scanning (once ADMIN_PIN was
// marked "contains secret values") correctly refused to publish a build that
// contained the secret in plaintext, and every deploy failed until the
// hardcoded copies came out.
//
// Fails CLOSED. No ADMIN_PIN set means nobody gets in — which is the safe
// direction. Falling back to a published default is how this went wrong the
// first time.
module.exports = function adminOk(pin) {
  const expected = process.env.ADMIN_PIN;
  if (!expected) return false;             // not configured -> deny, never default
  if (pin == null || pin === '') return false;
  return String(pin) === String(expected);
};
