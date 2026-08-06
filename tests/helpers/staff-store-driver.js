// An in-memory stand-in for the Supabase tables behind lib/staff-store.js.
//
// It exists so no test can reach the club's real committee records, and so the
// suite can assert behaviour that is otherwise only observable in production —
// that a replacement invitation revokes its predecessor, that a disabled
// account is refused before its password is read, that a hash is never handed
// back out.
//
// It implements only the PostgREST query shapes the store actually uses. That
// is deliberate: a fuller fake would let the store start relying on features
// the tests silently invent for it.
'use strict';

function makeDriver() {
  const tables = { la_staff_users: [], la_staff_invitations: [], la_staff_bootstrap: [{ id: true }] };

  /** `col=eq.value&col2=eq.value2` → a predicate. Ignores select/order/limit. */
  function parse(query) {
    const conds = [];
    String(query || '').split('&').forEach((part) => {
      const [k, v] = part.split('=');
      if (!k || !v) return;
      if (['select', 'order', 'limit', 'on_conflict'].indexOf(k) > -1) return;
      const [op, ...rest] = v.split('.');
      const val = decodeURIComponent(rest.join('.'));
      if (op === 'eq') conds.push((r) => String(r[k]) === val);
      else if (op === 'in') {
        const list = val.replace(/^\(|\)$/g, '').split(',').map(decodeURIComponent);
        conds.push((r) => list.indexOf(String(r[k])) > -1);
      }
    });
    return (r) => conds.every((c) => c(r));
  }

  return {
    _tables: tables,
    async sel(table, query) {
      const rows = tables[table].filter(parse(query));
      const m = /limit=(\d+)/.exec(query || '');
      return JSON.parse(JSON.stringify(m ? rows.slice(0, +m[1]) : rows));
    },
    async ins(table, row, onConflict) {
      if (onConflict) {
        const i = tables[table].findIndex((r) => r[onConflict] === row[onConflict]);
        if (i > -1) { Object.assign(tables[table][i], row); return [ { ...tables[table][i] } ]; }
      }
      const full = Object.assign({ created_at: new Date().toISOString() }, row);
      tables[table].push(full);
      return [ { ...full } ];
    },
    async upd(table, query, patch) {
      const hit = tables[table].filter(parse(query));
      hit.forEach((r) => Object.assign(r, patch));
      return JSON.parse(JSON.stringify(hit));
    },
    async del(table, query) {
      const keep = tables[table].filter((r) => !parse(query)(r));
      tables[table].length = 0;
      keep.forEach((r) => tables[table].push(r));
      return true;
    },
  };
}

module.exports = { makeDriver };
