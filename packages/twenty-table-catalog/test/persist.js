/*
 * twenty-table-catalog / test/persist.js
 * اختبار الاستمرارية: تحرير → حفظ تلقائي → إعادة تحميل → استعادة البيانات
 * MIT License — see ../LICENSE
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeEl(tag) {
  const listeners = {};
  const el = {
    _tag: tag || 'div', _children: [], _qcache: {}, parentNode: null,
    className: '', dataset: {}, style: {}, value: '', checked: false, hidden: false,
    disabled: false, id: '', type: '', rows: 0, min: null, max: null, step: null, placeholder: '', title: '', dir: '',
    offsetWidth: 100, offsetHeight: 30, scrollTop: 0, clientHeight: 600, clientWidth: 800,
    classList: {
      add(c) { if (!el.classList.contains(c)) el.className += (el.className ? ' ' : '') + c; },
      remove(c) { el.className = el.className.split(/\s+/).filter(x => x && x !== c).join(' '); },
      contains(c) { return el.className.split(/\s+/).indexOf(c) !== -1; },
      toggle(c, f) { const has = el.classList.contains(c); const want = f === undefined ? !has : f; if (want) el.classList.add(c); else el.classList.remove(c); return want; }
    },
    set innerHTML(v) { el._html = v; },
    get innerHTML() { return el._html || ''; },
    setAttribute(k, v) { el[k] = v; },
    getAttribute(k) { return el[k] || null; },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener() { },
    dispatch(t, ev) { ev = Object.assign({ target: el, preventDefault() { }, stopPropagation() { } }, ev); (listeners[t] || []).slice().forEach(fn => fn(ev)); },
    focus() { g.document.activeElement = el; },
    blur() { if (g.document.activeElement === el) g.document.activeElement = null; },
    click() { }, select() { },
    appendChild(c) { el._children.push(c); c.parentNode = el; return c; },
    prepend(c) { el._children.unshift(c); c.parentNode = el; return c; },
    remove() { if (el.parentNode) el.parentNode._children = el.parentNode._children.filter(x => x !== el); el.parentNode = null; },
    removeChild(c) { el._children = el._children.filter(x => x !== c); },
    contains(n) { while (n) { if (n === el) return true; n = n.parentNode; } return false; },
    closest(sel) {
      const preds = String(sel).split(',').map(s => s.trim()).filter(Boolean);
      let n = el;
      while (n) {
        for (const p of preds) {
          if (p[0] === '[') { const m = /^\[(\w+)(?:=(["']?)([\s\S]*?)\2)\]$/.exec(p); if (m && n.dataset && String(n.dataset[m[1]] || '') === (m[3] !== undefined ? m[3] : '')) return n; continue; }
          if (p[0] === '.') { const cls = p.slice(1); if (n.className && n.className.split(/\s+/).indexOf(cls) !== -1) return n; continue; }
          if (n._tag === p) return n;
        }
        n = n.parentNode;
      }
      return null;
    },
    querySelector(sel) {
      if (!el._qcache[sel]) { let tag = 'div'; const mTag = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(sel); if (mTag) tag = mTag[0]; el._qcache[sel] = makeEl(tag); el._qcache[sel].parentNode = el; }
      return el._qcache[sel];
    },
    querySelectorAll(sel) { return [el.querySelector(sel)]; },
    getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; }
  };
  return el;
}

const g = {
  console,
  setTimeout: (fn) => 0,
  clearTimeout() { },
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame() { },
  matchMedia: () => ({ matches: false }),
  navigator: { clipboard: null },
  document: null,
  fetch: () => Promise.reject(new Error('no net')),
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL() { } },
  Blob: function (parts, opts) { this.type = opts && opts.type; this.text = Array.isArray(parts) ? parts.join('') : String(parts); },
  FileReader: function () { this.readAsText = () => { this.onload && this.onload(); }; },
  scrollTo() { }, prompt: () => 'test', confirm: () => true,
  addEventListener() { }, removeEventListener() { },
  _capturedBlob: null, _ttDownloadBlob: null
};
g.document = {
  title: '', documentElement: { dataset: {} }, readyState: 'complete', body: makeEl('body'),
  activeElement: null, createElement: (t) => makeEl(t), _els: {},
  querySelector(s) { if (!g.document._els[s]) g.document._els[s] = makeEl('div'); return g.document._els[s]; },
  querySelectorAll(s) { return [g.document.querySelector(s)]; },
  addEventListener() { }, removeEventListener() { }, execCommand: () => true,
  getElementById(id) { return g.document.querySelector('#' + id); }
};
g.window = g; g.self = g; g.top = g; g.globalThis = g;
g.localStorage = { _s: {}, getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };

vm.createContext(g);
const dir = __dirname;
['engine/engine-core.js', 'engine/engine-formula.js', 'engine/engine-io.js', 'engine/engine-edit.js', 'engine/engine-ui.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(dir, '..', f), 'utf8'), g, { filename: f }));

const eng = g.TableEngine.create({ id: 'iso', el: '#app', autoSave: true, persistData: true, data: [{ a: 1 }, { a: 2 }], columns: [{ id: 'a', title: 'A', type: 'number' }] });
console.log('colById type:', typeof eng.colById);
eng.updateCell(eng.rows[0]._id, 'a', 99);
const saved = g.localStorage.getItem('tt-iso');
console.log('saved a0:', JSON.parse(saved).data[0].a);
const eng2 = g.TableEngine.create({ id: 'iso', el: '#app', autoSave: true, persistData: true, data: [{ a: 1 }, { a: 2 }], columns: [{ id: 'a', title: 'A', type: 'number' }] });
console.log('restored a0:', eng2.rows[0].a);
console.log(eng2.rows[0].a === 99 ? 'ISOLATED PERSIST OK' : 'ISOLATED PERSIST FAILED');
process.exit(eng2.rows[0].a === 99 ? 0 : 1);
