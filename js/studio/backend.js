/* ════════════════════════════════════════════════════════════════════════
   ASSET STUDIO — LIBRARY RULES (one copy, two homes)

   The rules for compositions, revisions, approvals, exports, publication
   records, sponsor-logo versions and uploaded assets. They run:
     • on the server, in netlify/functions/studio-assets.js, over Supabase;
     • in the browser, over localStorage, ONLY when the server library is not
       reachable — and the Studio then says plainly that work is saved on
       this device only.
   Same code both ways, so "device only" never means "different rules".

   THE PROMISES THIS FILE KEEPS
   • An approved revision is never overwritten. Saving changes to an
     approved graphic creates the next revision as a draft; the approved one
     stays approved and exportable until a new one is approved.
   • Two people saving the same graphic cannot silently lose each other's
     work: every save names the revision it was based on.
   • A final export is only recorded for the approved revision. A draft can
     be downloaded as a PROOF, which is recorded as a proof.
   • Exported is not published. Published needs the channel and the link.
   • A new sponsor logo is a new VERSION. Graphics made with the old one keep
     the old one unless someone deliberately updates them.
   ════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.StudioBackend = factory(root.StudioCore);
}(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';

  var CATEGORIES = ['identity', 'player', 'team', 'matchday', 'crest', 'sponsor', 'ground', 'heritage', 'template', 'publication'];
  var KINDS = ['png', 'jpeg', 'pdf', 'zip'];
  var UUIDISH = /^[0-9a-z-]{8,64}$/i;
  var MAX_DOC = 200000, MAX_LOGO = 1500000, MAX_PHOTO = 2600000, MAX_THUMB = 160000;

  function str(v, n) { return v == null ? null : (String(v).trim().slice(0, n || 300) || null); }
  function fail(error, extra) { return Object.assign({ ok: false, error: error }, extra || {}); }
  function now(o) { return new Date(o && o.now ? o.now() : Date.now()).toISOString(); }
  function dataUrlBytes(u) {
    var m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(u || ''));
    if (!m) return null;
    return { mime: m[1], bytes: Math.floor(m[2].length * 3 / 4) };
  }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  function create(db, opts) {
    opts = opts || {};
    var seed = opts.seed || { assets: [], sponsors: [], sponsorLogos: {} };

    function audit(actor, action, entity, id, before, after, note) {
      if (!db.audit) return Promise.resolve();
      return Promise.resolve(db.audit(actor, action, entity, id, before, after, note)).catch(function () {});
    }
    function one(table, where) { return db.select(table, where, { limit: 1 }).then(function (r) { return (r && r[0]) || null; }); }

    /** The library as the rules see it: repository seed + uploaded rows. */
    function library() {
      return Promise.all([
        db.select('studio_assets', {}, { order: 'created_at.desc', limit: 500 }),
        db.select('studio_sponsor_logos', {}, { order: 'version.asc', limit: 500 })
      ]).then(function (r) {
        var uploaded = (r[0] || []).filter(function (a) { return a.approval !== 'rejected'; }).map(function (a) {
          return Object.assign({}, a, { id: 'db:' + a.id, dbId: a.id });
        });
        return {
          assets: seed.assets.concat(uploaded),
          sponsors: seed.sponsors,
          logos: Core.mergeLogos(seed.sponsorLogos, r[1] || [])
        };
      });
    }

    var A = {};

    A.library = function () {
      return library().then(function (lib) { return { ok: true, library: lib }; });
    };

    A.list = function (b) {
      var where = b && b.archived ? {} : { state: { not: 'archived' } };
      return db.select('studio_compositions', where, { order: 'updated_at.desc', limit: 300 }).then(function (rows) {
        return { ok: true, compositions: rows || [] };
      });
    };

    A.get = function (b) {
      if (!b.id || !UUIDISH.test(b.id)) return Promise.resolve(fail('Which graphic?'));
      return one('studio_compositions', { id: b.id }).then(function (comp) {
        if (!comp) return fail('That graphic no longer exists.');
        return Promise.all([
          db.select('studio_revisions', { composition_id: comp.id }, { order: 'rev.asc', limit: 500 }),
          db.select('studio_exports', { composition_id: comp.id }, { order: 'exported_at.desc', limit: 200 }),
          db.select('studio_publications', { composition_id: comp.id }, { order: 'recorded_at.desc', limit: 100 })
        ]).then(function (r) { return { ok: true, composition: comp, revisions: r[0] || [], exports: r[1] || [], publications: r[2] || [] }; });
      });
    };

    A.save = function (b, actor) {
      var doc = b.doc;
      if (!doc || typeof doc !== 'object') return Promise.resolve(fail('Nothing to save.'));
      var t = Core.template(doc.template);
      if (!t) return Promise.resolve(fail('Unknown template.'));
      if (JSON.stringify(doc).length > MAX_DOC) return Promise.resolve(fail('This graphic is too large to save.'));
      var title = str(b.title, 120) || t.label;
      var meta = {
        fixture_id: str(doc.facts && doc.facts.fixture && doc.facts.fixture.id, 80),
        sponsor_key: str(doc.refs && doc.refs.sponsorKey, 80)
      };
      var at = now(opts);
      if (!b.id) {
        return db.insert('studio_compositions', Object.assign({ template: t.id, title: title, state: 'draft', head_rev: 1, approved_rev: null,
          created_by: actor, updated_by: actor, created_at: at, updated_at: at }, meta)).then(function (comp) {
          return db.insert('studio_revisions', { composition_id: comp.id, rev: 1, doc: doc, state: 'draft', created_by: actor, created_at: at }).then(function (rev) {
            return audit(actor, 'create', 'studio_composition', comp.id, null, { template: t.id, title: title }).then(function () {
              return { ok: true, composition: comp, revision: rev };
            });
          });
        });
      }
      return one('studio_compositions', { id: b.id }).then(function (comp) {
        if (!comp) return fail('That graphic no longer exists.');
        if (comp.template !== t.id) return fail('A graphic cannot change template. Duplicate it instead.');
        if (b.base_rev !== comp.head_rev) {
          return one('studio_revisions', { composition_id: comp.id, rev: comp.head_rev }).then(function (head) {
            // The same person pressing Save twice is not a conflict.
            if (head && same(head.doc, doc) && head.created_by === actor) return { ok: true, composition: comp, revision: head, repeated: true };
            return fail('A newer version (revision ' + comp.head_rev + ') was saved by ' + ((head && head.created_by) || 'someone else') +
              '. Your changes are kept on this device — reload to compare.', { conflict: true, head_rev: comp.head_rev });
          });
        }
        var outcome = Core.saveOutcome(comp);
        var rev = comp.head_rev + 1;
        return db.insert('studio_revisions', { composition_id: comp.id, rev: rev, doc: doc, state: 'draft', created_by: actor, created_at: at }).then(function (row) {
          var patch = Object.assign({ head_rev: rev, state: outcome.state, title: title, updated_by: actor, updated_at: at, archived_at: null }, meta);
          return db.update('studio_compositions', { id: comp.id }, patch).then(function (rows) {
            var after = (rows && rows[0]) || Object.assign({}, comp, patch);
            var note = comp.approved_rev ? 'Approved revision ' + comp.approved_rev + ' kept.' : null;
            return audit(actor, 'revise', 'studio_composition', comp.id, { head_rev: comp.head_rev, state: comp.state }, { head_rev: rev, state: outcome.state }, note).then(function () {
              return { ok: true, composition: after, revision: row, keptApproved: comp.approved_rev || null };
            });
          });
        });
      });
    };

    A.move = function (b, actor) {
      return one('studio_compositions', { id: b.id }).then(function (comp) {
        if (!comp) return fail('That graphic no longer exists.');
        var to = b.to;
        return one('studio_revisions', { composition_id: comp.id, rev: comp.head_rev }).then(function (head) {
          var checks = Promise.resolve([]);
          if (to === 'review' || to === 'approved') {
            checks = library().then(function (lib) {
              var issues = Core.factChecks(head.doc, lib, opts.now ? opts.now() : Date.now());
              var blocks = Core.blocking(issues);
              // The browser also checks the pixels (overflow, safe area). It can
              // only ADD blocking reasons here, never remove the server's.
              var n = +b.layout_blocking || 0;
              for (var i = 0; i < n; i++) blocks.push({ code: 'layout', message: 'Layout check' });
              return blocks;
            });
          }
          return checks.then(function (blocks) {
            var err = Core.guardMove(comp, to, { actor: actor, blocking: blocks, channel: str(b.channel, 60), url: str(b.url, 500), exportId: b.export_id });
            if (err) return fail(err, { blocking: blocks.filter(function (x) { return x.code !== 'layout'; }) });
            var at = now(opts);
            var patch = { state: to, updated_by: actor, updated_at: at };
            var work = Promise.resolve();
            if (to === 'approved') {
              patch.approved_rev = comp.head_rev;
              work = db.update('studio_revisions', { composition_id: comp.id, rev: comp.head_rev }, { state: 'approved', approved_by: actor, approved_at: at });
            }
            if (to === 'archived') patch.archived_at = at;
            if (to === 'published') {
              work = db.insert('studio_publications', { composition_id: comp.id, rev: comp.approved_rev, channel: str(b.channel, 60), url: str(b.url, 500),
                note: str(b.note, 300), recorded_by: actor, recorded_at: at });
            }
            return work.then(function () { return db.update('studio_compositions', { id: comp.id }, patch); }).then(function (rows) {
              return audit(actor, 'move', 'studio_composition', comp.id, { state: comp.state }, { state: to, rev: comp.head_rev }, str(b.note, 300)).then(function () {
                return { ok: true, composition: (rows && rows[0]) || Object.assign({}, comp, patch) };
              });
            });
          });
        });
      });
    };

    A.recordExport = function (b, actor) {
      var kind = b.kind, proof = !!b.proof;
      if (KINDS.indexOf(kind) === -1) return Promise.resolve(fail('Unknown file type.'));
      var fmt = Core.FORMATS[b.format];
      if (kind !== 'zip') {
        if (!fmt) return Promise.resolve(fail('Unknown format.'));
        if (+b.w !== fmt.w || +b.h !== fmt.h) return Promise.resolve(fail('The file is ' + b.w + '×' + b.h + '; ' + fmt.label + ' must be ' + fmt.w + '×' + fmt.h + '. Not recorded.'));
        if (kind === 'pdf' && !fmt.pdf) return Promise.resolve(fail(fmt.label + ' is not a PDF format.'));
      }
      if (!(+b.bytes > 0) || +b.bytes > 60e6) return Promise.resolve(fail('The file size is not plausible. Not recorded.'));
      if (!/^[a-z0-9][a-z0-9._-]{3,160}$/i.test(String(b.filename || ''))) return Promise.resolve(fail('Bad file name.'));
      if (b.thumb && (!/^data:image\/jpeg;base64,/.test(b.thumb) || b.thumb.length > MAX_THUMB)) return Promise.resolve(fail('Bad preview image.'));
      return one('studio_compositions', { id: b.id }).then(function (comp) {
        if (!comp) return fail('That graphic no longer exists.');
        var rev = +b.rev;
        if (!proof) {
          if (['approved', 'exported', 'published'].indexOf(comp.state) === -1 && !comp.approved_rev) return fail('Only an approved graphic exports as final. Download a proof instead.');
          if (rev !== comp.approved_rev) return fail('Revision ' + rev + ' is not the approved revision (' + comp.approved_rev + '). Final files come from the approved revision only.');
        }
        var at = now(opts);
        return db.insert('studio_exports', { composition_id: comp.id, rev: rev, format: kind === 'zip' ? (b.format || 'batch') : b.format, kind: kind,
          w: kind === 'zip' ? null : +b.w, h: kind === 'zip' ? null : +b.h, bytes: +b.bytes, sha256: str(b.sha256, 64), filename: b.filename,
          proof: proof, thumb: b.thumb || null, exported_by: actor, exported_at: at }).then(function (row) {
          var patch = { last_export_at: at, updated_at: at };
          if (!proof && comp.state === 'approved') patch.state = 'exported';
          return db.update('studio_compositions', { id: comp.id }, patch).then(function (rows) {
            return audit(actor, proof ? 'proof' : 'export', 'studio_composition', comp.id, null, { file: b.filename, rev: rev, bytes: +b.bytes }).then(function () {
              return { ok: true, export: row, composition: (rows && rows[0]) || Object.assign({}, comp, patch) };
            });
          });
        });
      });
    };

    A.uploadLogo = function (b, actor) {
      var key = str(b.sponsor_key, 80);
      if (!seed.sponsors.some(function (s) { return s.key === key; })) return Promise.resolve(fail('That sponsor is not on the sponsor list.'));
      var c = dataUrlBytes(b.colour);
      if (!c) return Promise.resolve(fail('Upload a PNG, JPEG or WebP logo.'));
      if (c.bytes > MAX_LOGO) return Promise.resolve(fail('That logo file is over 1.5 MB. Ask the sponsor for a web-sized PNG.'));
      if (b.white && !dataUrlBytes(b.white)) return Promise.resolve(fail('The white version must be a PNG, JPEG or WebP.'));
      if (b.ground !== 'light' && b.ground !== 'dark') return Promise.resolve(fail('Say whether this logo is designed for a light or a dark background.'));
      var w = +b.w, h = +b.h;
      if (!(w > 0 && h > 0)) return Promise.resolve(fail('Could not read the logo size.'));
      if (Math.max(w, h) < 300) return Promise.resolve(fail('That logo is only ' + w + '×' + h + ' pixels — too small to print. Ask the sponsor for a larger file.'));
      return db.select('studio_sponsor_logos', { sponsor_key: key }, { order: 'version.desc', limit: 1 }).then(function (rows) {
        var seedMax = (seed.sponsorLogos[key] || []).reduce(function (m, v) { return Math.max(m, v.version); }, 0);
        var version = Math.max(seedMax, rows && rows[0] ? rows[0].version : 0) + 1;
        return db.insert('studio_sponsor_logos', { sponsor_key: key, version: version, colour: b.colour, white: b.white || null, ground: b.ground, w: w, h: h, ar: +(w / h).toFixed(4),
          approval: 'needs_review', current: false, note: str(b.note, 300), created_by: actor, created_at: now(opts) }).then(function (row) {
          return audit(actor, 'upload', 'studio_sponsor_logo', key + '@' + version, null, { w: w, h: h }).then(function () { return { ok: true, logo: row }; });
        });
      });
    };

    A.approveLogo = function (b, actor) {
      var key = str(b.sponsor_key, 80), v = +b.version;
      return one('studio_sponsor_logos', { sponsor_key: key, version: v }).then(function (row) {
        if (!row) return fail('No such logo version.');
        if (row.approval === 'approved' && row.current) return { ok: true, logo: row };
        var at = now(opts);
        return db.update('studio_sponsor_logos', { sponsor_key: key, current: true }, { current: false, retired_at: at }).then(function () {
          return db.update('studio_sponsor_logos', { sponsor_key: key, version: v }, { approval: 'approved', current: true, approved_by: actor, approved_at: at, retired_at: null });
        }).then(function (rows) {
          return audit(actor, 'approve', 'studio_sponsor_logo', key + '@' + v, { approval: row.approval }, { approval: 'approved', current: true },
            'Existing graphics keep the logo version they were made with.').then(function () { return { ok: true, logo: rows && rows[0] }; });
        });
      });
    };

    A.registerAsset = function (b, actor) {
      var cat = b.category;
      if (CATEGORIES.indexOf(cat) === -1) return Promise.resolve(fail('Choose a category.'));
      var title = str(b.title, 120);
      if (!title) return Promise.resolve(fail('Give the asset a title.'));
      var rh = str(b.rights_holder, 160), lic = str(b.licence, 300);
      if (!rh || !lic) return Promise.resolve(fail('Record who owns this image and what permission the club has. Without that it cannot be used.'));
      var d = dataUrlBytes(b.src);
      if (!d) return Promise.resolve(fail('Upload a PNG, JPEG or WebP image.'));
      if (d.bytes > MAX_PHOTO) return Promise.resolve(fail('That file is over 2.5 MB. Export a 2400px JPEG and try again.'));
      var w = +b.w, h = +b.h;
      if (!(w > 0 && h > 0)) return Promise.resolve(fail('Could not read the image size.'));
      return db.insert('studio_assets', { title: title, category: cat, src: b.src, w: w, h: h, format: d.mime.split('/')[1], bytes: d.bytes, source: 'upload',
        rights_holder: rh, licence: lic, approval: 'needs_review', version: 1, related: b.related || {}, channel: str(b.channel, 60),
        expires_at: /^\d{4}-\d{2}-\d{2}$/.test(b.expires_at || '') ? b.expires_at : null, usage: str(b.usage, 300),
        created_by: actor, created_at: now(opts) }).then(function (row) {
        return audit(actor, 'upload', 'studio_asset', row.id, null, { title: title, category: cat, w: w, h: h }).then(function () { return { ok: true, asset: row }; });
      });
    };

    A.approveAsset = function (b, actor) {
      return one('studio_assets', { id: b.id }).then(function (row) {
        if (!row) return fail('No such asset.');
        var to = b.reject ? 'rejected' : 'approved';
        return db.update('studio_assets', { id: row.id }, { approval: to, approved_by: actor, approved_at: now(opts) }).then(function (rows) {
          return audit(actor, to, 'studio_asset', row.id, { approval: row.approval }, { approval: to }).then(function () { return { ok: true, asset: rows && rows[0] }; });
        });
      });
    };

    var READS = { library: 1, list: 1, get: 1 };
    function handle(action, body, actor) {
      if (!A[action]) return Promise.resolve(fail('Unknown action.'));
      if (!READS[action] && !(actor && String(actor).trim())) return Promise.resolve(fail('Say who you are first — every change is recorded with a name.'));
      return A[action](body || {}, actor && String(actor).trim().slice(0, 80));
    }
    return { handle: handle, library: library, actions: Object.keys(A) };
  }

  return { create: create, CATEGORIES: CATEGORIES };
}));
