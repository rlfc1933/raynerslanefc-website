// Server-side handle on the SHARED Match Day Operations core.
//
// There is deliberately no second copy of these rules. js/matchday-core.js is
// the single owner of season derivation, competition mapping, ticket
// categories, the status vocabulary and every calculation; the browser loads it
// with a <script> tag and the functions require it through here. The bundler
// inlines it at deploy time.
//
// If these ever diverge, the server and the volunteer's phone would disagree
// about how much money the club took. They must not diverge.
module.exports = require('../../../js/matchday-core.js');
