/* ────────────────────────────────────────────────────────────────────────────
   SponsorRail — the ONE canonical sponsor-placement component.
   Used by the Studio (admin.html, html2canvas), the public share cards
   (js/share-news.js, native canvas) and the QC contact sheet. Same input →
   same deterministic output everywhere.

   Design rules baked in (professional-club standard):
   • Football is the hero — the rail is a reserved bottom commercial zone only.
   • CONTEXT-driven partners (home / away / neutral), fixed order, no venue logic.
   • Cap-height sizing on TRIMMED visible artwork; equal gutters; equal optical
     height (≤10% optical correction per asset); aspect ratio never altered.
   • No labels on public exports.
   • Single row; falls back to a controlled 2-row grid only if a single row can't
     hold the logos at a readable size.
   • Real collision detection: layout().ok === false + .problems[] when anything
     overlaps, breaches the safe margin, or drops below minimum readable size.
     Callers MUST block export when ok === false.
   ──────────────────────────────────────────────────────────────────────────── */
(function (g) {
  var GUT = 0.82;          // gutter between logos = cap-height * GUT
  var PAD = 0.06;          // side safe margin = canvas width * PAD

  function railLayout(opts) {
    var W = opts.W, H = opts.H, M = opts.manifest, format = opts.format, context = opts.context;
    var pct = (M.railPct && M.railPct[format]) || 0.14;
    var railH = Math.round(H * pct), railTop = H - railH;
    var pad = Math.round(W * (opts.pad || PAD));
    var span = W - 2 * pad;
    var ids = (M.contexts[context] || []).slice();
    var items = ids.map(function (id) { var s = M.sponsors[id]; return { id: id, s: s, opt: s.optical || 1, ar: s.ar }; });
    var n = items.length;
    var minH = Math.max(20, Math.round(H * 0.018));   // minimum readable logo height
    var out = { railH: railH, railTop: railTop, pad: pad, format: format, context: context, cells: [], rows: 0, cap: 0, ok: true, problems: [] };
    if (!n) return out;

    function rowW(cap, arr) { var t = 0; arr.forEach(function (it) { t += cap * it.opt * it.ar; }); return t + (arr.length - 1) * (cap * GUT); }
    function placeRow(arr, cap, cy) {
      var gut = cap * GUT, groupW = 0;
      arr.forEach(function (it) { groupW += cap * it.opt * it.ar; }); groupW += (arr.length - 1) * gut;
      var startX = Math.round((W - groupW) / 2); if (startX < pad) startX = pad;
      var cur = startX, res = [];
      arr.forEach(function (it) { var h = cap * it.opt, w = h * it.ar; res.push({ id: it.id, s: it.s, x: Math.round(cur), y: Math.round(cy - h / 2), w: Math.round(w), h: Math.round(h), cy: Math.round(cy) }); cur += w + gut; });
      return res;
    }

    var capCeil = railH * 0.40, capFloor = Math.max(minH, railH * 0.22), cap = capCeil, cells, rows;
    while (cap > capFloor && rowW(cap, items) > span) cap -= 0.5;
    if (rowW(cap, items) <= span + 0.5) {
      rows = 1; cells = placeRow(items, cap, railTop + railH / 2);
    } else {                                            // controlled 2-row grid
      var half = Math.ceil(n / 2), a = items.slice(0, half), b = items.slice(half);
      cap = railH * 0.28;
      while (cap > minH && (rowW(cap, a) > span || rowW(cap, b) > span)) cap -= 0.5;
      cells = placeRow(a, cap, railTop + railH * 0.32).concat(placeRow(b, cap, railTop + railH * 0.70));
      rows = 2;
    }
    out.cells = cells; out.rows = rows; out.cap = Math.round(cap);

    // ── collision / bounds / min-size gate ──
    cells.forEach(function (c) {
      if (c.h < minH - 0.5) out.problems.push(c.id + ': below min readable height (' + c.h + '<' + minH + ')');
      if (c.x < pad - 1) out.problems.push(c.id + ': breaches left safe margin');
      if (c.x + c.w > W - pad + 1) out.problems.push(c.id + ': breaches right safe margin');
      if (c.y < railTop - 1) out.problems.push(c.id + ': above the rail zone');
    });
    for (var i = 0; i < cells.length; i++) for (var j = i + 1; j < cells.length; j++) {
      if (cells[i].cy === cells[j].cy && cells[i].x < cells[j].x + cells[j].w && cells[j].x < cells[i].x + cells[i].w)
        out.problems.push(cells[i].id + '/' + cells[j].id + ': overlap');
    }
    out.ok = out.problems.length === 0;
    return out;
  }

  // background hint: 'dark' card → white logo; 'light' card → colour logo
  function railAsset(cell, bg) { return bg === 'light' ? cell.s.colour : cell.s.white; }

  g.SponsorRail = { layout: railLayout, asset: railAsset };
})(typeof window !== 'undefined' ? window : this);
