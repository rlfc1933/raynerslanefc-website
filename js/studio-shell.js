/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — STUDIO FRONT DOOR

   Studio opened onto twenty-six buttons. For a volunteer who makes two posts a
   month that is not a menu, it is a test they might fail in public — and it
   was the single clearest example of the portal frightening the people it is
   meant to serve.

   It now asks one question: what are you making? Five answers, then the
   handful of templates that answer actually needs. Nothing is deleted; the
   same twenty-six templates are one tap further in, and "Show every template"
   restores the old wall for anyone who prefers it.

   THIS IS NAVIGATION ONLY. It calls psSetType(), which is the function the
   old buttons called. No template, renderer, permission or save path is
   touched. If this file failed to load, the original picker is still there.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /**
   * The five things the club actually makes.
   * Match content is grouped by WHEN, because that is how a matchday is lived
   * — before, during, after — not by which template a developer filed it under.
   */
  var CATS = [
    { key: 'match', label: 'From a match', hint: 'Matchday, team news, goals, full time',
      groups: [
        { label: 'Before the match', types: ['matchday', 'countdown', 'lineup', 'preseason', 'offstate'] },
        { label: 'During the match',  types: ['kickoff', 'goal', 'yellow', 'red', 'halftime'] },
        { label: 'After the match',   types: ['fulltime', 'motm'] }
      ] },
    { key: 'player', label: 'Player', hint: 'Signings, player of the month, birthdays',
      groups: [{ label: 'Players', types: ['signing', 'potm', 'birthday'] }] },
    { key: 'club', label: 'Club post', hint: 'Announcements, headlines, history',
      groups: [{ label: 'Club', types: ['announce', 'headline', 'history', 'quote'] }] },
    { key: 'sponsor', label: 'Sponsor', hint: 'Thank a sponsor, or sell a shirt',
      groups: [{ label: 'Sponsors', types: ['sponsorspot', 'psoffer', 'pscommunity', 'psannounce'] }] },
    { key: 'seasonal', label: 'Seasonal', hint: 'Season tickets and festive posts',
      groups: [{ label: 'Seasonal', types: ['seasonticket', 'festive'] }] }
  ];

  var S = { cat: null, all: false };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** The template's own label, from Studio's registry — never a second copy. */
  function labelFor(key) {
    try {
      var b = document.querySelector('#ps-types .ps-type[data-k="' + key + '"]');
      if (b) return b.textContent.trim();
    } catch (e) {}
    return key;
  }

  function render() {
    var host = document.getElementById('ps-shell');
    if (!host) return;

    if (S.all) {
      host.innerHTML = '<div class="pss"><button class="pss__back" onclick="StudioShell.home()">' +
        '&larr; Back to Make something</button></div>';
      showPicker(true);
      return;
    }

    if (!S.cat) {
      host.innerHTML =
        '<div class="pss">' +
          '<h3 class="pss__h">Make something</h3>' +
          '<div class="pss__cats">' + CATS.map(function (c) {
            return '<button class="pss__cat" onclick="StudioShell.pick(\'' + c.key + '\')">' +
              '<span class="pss__cl">' + esc(c.label) + '</span>' +
              '<span class="pss__ch">' + esc(c.hint) + '</span></button>';
          }).join('') + '</div>' +
          '<button class="pss__all" onclick="StudioShell.showAll()">Show every template</button>' +
        '</div>';
      showPicker(false);
      return;
    }

    var cat = CATS.filter(function (c) { return c.key === S.cat; })[0];
    host.innerHTML =
      '<div class="pss">' +
        '<button class="pss__back" onclick="StudioShell.home()">&larr; Make something</button>' +
        '<h3 class="pss__h">' + esc(cat.label) + '</h3>' +
        cat.groups.map(function (g) {
          var buttons = g.types.filter(exists).map(function (t) {
            return '<button class="pss__t" data-t="' + esc(t) + '" onclick="StudioShell.choose(\'' + esc(t) + '\')">' +
              esc(labelFor(t)) + '</button>';
          }).join('');
          if (!buttons) return '';
          return '<div class="pss__grp"><span class="pss__gl">' + esc(g.label) + '</span>' +
            '<div class="pss__ts">' + buttons + '</div></div>';
        }).join('') +
      '</div>';
    showPicker(false);
  }

  /** Only offer a template Studio actually has. */
  function exists(key) {
    try { return !!document.querySelector('#ps-types .ps-type[data-k="' + key + '"]'); }
    catch (e) { return false; }
  }

  /** The original 26-button wall: hidden, never removed. */
  function showPicker(on) {
    var el = document.getElementById('ps-types');
    if (el) el.style.display = on ? '' : 'none';
    var hint = document.getElementById('ps-hint');
    if (hint) hint.style.display = on ? '' : 'none';
  }

  function pick(k)   { S.cat = k; S.all = false; render(); }
  function home()    { S.cat = null; S.all = false; render(); }
  function showAll() { S.all = true; render(); }

  /** Choosing a template is exactly what the old buttons did. */
  function choose(t) {
    try { if (typeof global.psSetType === 'function') global.psSetType(t); } catch (e) {}
    try {
      var stage = document.querySelector('.ps-stage');
      if (stage && stage.scrollIntoView) stage.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (e) {}
    mark(t);
  }

  function mark(t) {
    try {
      document.querySelectorAll('.pss__t').forEach(function (b) {
        b.classList.toggle('on', b.getAttribute('data-t') === t);
      });
    } catch (e) {}
  }

  function init() { S.cat = null; S.all = false; render(); }

  global.StudioShell = {
    init: init, render: render, pick: pick, home: home, showAll: showAll,
    choose: choose, CATS: CATS, _state: S
  };
}(typeof window !== 'undefined' ? window : globalThis));
