// In-memory stand-in for a Netlify Blobs store, with the conditional-write
// semantics the Studio relies on (onlyIfNew / onlyIfMatch → modified:false).
'use strict';
const crypto = require('crypto');

function makeStores() {
  const stores = {};
  return function (name) {
    if (!stores[name]) stores[name] = new Map();
    const m = stores[name];
    const etag = () => '"' + crypto.randomBytes(6).toString('hex') + '"';
    function write(key, value, opts) {
      const o = opts || {};
      const cur = m.get(key);
      if (o.onlyIfNew && cur) return { modified: false };
      if (o.onlyIfMatch && (!cur || cur.etag !== o.onlyIfMatch)) return { modified: false };
      const e = etag();
      m.set(key, { value, etag: e, metadata: o.metadata || {} });
      return { modified: true, etag: e };
    }
    function read(key, type) {
      const cur = m.get(key);
      if (!cur) return null;
      if (type === 'json') return JSON.parse(cur.value);
      if (type === 'arrayBuffer') return cur.value;
      return cur.value;
    }
    return {
      _map: m,
      async setJSON(key, v, opts) { return write(key, JSON.stringify(v), opts); },
      async set(key, v, opts) { return write(key, v, opts); },
      async get(key, opts) { return read(key, opts && opts.type); },
      async getWithMetadata(key, opts) {
        const cur = m.get(key);
        if (!cur) return null;
        return { data: read(key, opts && opts.type), etag: cur.etag, metadata: cur.metadata };
      },
      async list(opts) {
        const p = (opts && opts.prefix) || '';
        return { blobs: Array.from(m.keys()).filter((k) => k.startsWith(p)).sort().map((key) => ({ key, etag: m.get(key).etag })) };
      },
      async delete(key) { m.delete(key); },
    };
  };
}
module.exports = { makeStores };
