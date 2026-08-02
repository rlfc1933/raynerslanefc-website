// Load a browser file (a plain IIFE that attaches to window) inside node:test,
// so the SAME code the site ships is the code under test — not a copy of it
// that can drift away from the original without anything noticing.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

/**
 * @param {string} file  repo-relative, e.g. 'js/crest.js'
 * @param {object} [extra] extra globals the file expects (fetch, Image, …)
 * @returns {object} the window object it populated
 */
function loadBrowserScript(file, extra) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const win = Object.assign({
    // Enough DOM for a module that only builds strings. Anything a test
    // actually exercises gets a real stub rather than a silent no-op.
    document: {
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
      addEventListener() {},
    },
    fetch: () => Promise.reject(new Error('no network in tests')),
    Image: function () { this.src = ''; },
    setTimeout, clearTimeout, Promise, Date, Math, JSON, console,
  }, extra || {});
  win.window = win;
  vm.createContext(win);
  vm.runInContext(src, win, { filename: file });
  return win;
}

module.exports = { loadBrowserScript, ROOT };
