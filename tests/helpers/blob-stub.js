// An in-memory stand-in for @netlify/blobs.
//
// Every invitation test runs against this. Nothing reaches the club's real
// staff store, so no test can create, alter or disable a genuine account —
// which matters more here than anywhere else in the suite.
'use strict';
const stores = Object.create(null);
function reset() { Object.keys(stores).forEach((k) => delete stores[k]); }

function getStore(name) {
  stores[name] = stores[name] || Object.create(null);
  const s = stores[name];
  return {
    async get(key) { return s[key] === undefined ? null : JSON.parse(JSON.stringify(s[key])); },
    async setJSON(key, val) { s[key] = JSON.parse(JSON.stringify(val)); },
  };
}

module.exports = { getStore, reset, _stores: stores };
