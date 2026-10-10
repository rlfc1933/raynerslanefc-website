// Asset Studio — the database adapter js/studio/backend.js runs on, server side.
// PostgREST over fetch with the service-role key. Nothing here decides a rule;
// it only reads and writes rows.
'use strict';

function adapter(opts) {
  const URL = opts.url, KEY = opts.key;
  const q = encodeURIComponent;

  function filter(where) {
    const out = [];
    for (const k of Object.keys(where || {})) {
      const v = where[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if ('not' in v) out.push(k + '=neq.' + q(v.not));
        else if ('in' in v) out.push(k + '=in.(' + v.in.map(q).join(',') + ')');
        else if ('is' in v) out.push(k + '=is.' + (v.is === null ? 'null' : q(v.is)));
      } else if (v === null) out.push(k + '=is.null');
      else out.push(k + '=eq.' + q(v));
    }
    return out;
  }

  async function call(method, path, body, prefer) {
    const r = await fetch(URL + '/rest/v1/' + path, {
      method,
      signal: AbortSignal.timeout(9000),
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: prefer || 'return=representation' },
      body: body == null ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
    if (!r.ok) {
      const err = new Error((json && (json.message || json.hint)) || ('supabase ' + r.status));
      err.status = r.status; err.code = json && json.code;
      if (err.code === '42P01' || /relation .* does not exist/i.test(err.message)) err.notSetUp = true;
      if (err.code === '23505') err.duplicate = true;
      throw err;
    }
    return json;
  }

  return {
    select(table, where, o) {
      const parts = filter(where).concat(['select=*']);
      if (o && o.order) parts.push('order=' + o.order);
      if (o && o.limit) parts.push('limit=' + o.limit);
      return call('GET', table + '?' + parts.join('&'));
    },
    async insert(table, row) {
      const r = await call('POST', table, row);
      return Array.isArray(r) ? r[0] : r;
    },
    update(table, where, patch) {
      return call('PATCH', table + '?' + filter(where).join('&'), patch);
    },
    async audit(actor, action, entity, id, before, after, note) {
      try {
        await call('POST', 'hq_audit', { actor, action, entity, entity_id: id == null ? null : String(id), before: before || null, after: after || null, note: note || null }, 'return=minimal');
      } catch (e) { console.error('[studio-assets] audit failed', e.message); }
    },
  };
}

module.exports = { adapter };
