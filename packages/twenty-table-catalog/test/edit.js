/*
 * twenty-table-catalog / test/edit.js
 * اختبار تدفق التحرير التفاعلي كما يفعله المستخدم:
 * نقر، نقر مزدوج، محرر، Enter/Tab/Esc/blur، تحقق، قوائم منسدلة
 * MIT License — see ../LICENSE
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------- DOM stub richer than smoke (tree + closest + contains) ---------- */
function makeEl(tag) {
  const listeners = {};
  const el = {
    _tag: tag || 'div',
    _children: [],
    _qcache: {},
    parentNode: null,
    className: '',
    dataset: {},
    style: {},
    value: '',
    checked: false,
    hidden: false,
    disabled: false,
    id: '',
    type: '',
    rows: 0,
    min: null,
    max: null,
    step: null,
    placeholder: '',
    title: '',
    dir: '',
    offsetWidth: 100,
    offsetHeight: 30,
    scrollTop: 0,
    clientHeight: 600,
    clientWidth: 800,
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
    dispatch(t, ev) {
      ev = Object.assign({ target: ev && ev.target || el, preventDefault() { }, stopPropagation() { } }, ev);
      (listeners[t] || []).slice().forEach(fn => fn(ev));
    },
    focus() { if (el._focusable !== false) g.document.activeElement = el; },
    blur() { if (g.document.activeElement === el) g.document.activeElement = null; },
    click() { el.dispatch('click', {}); },
    select() { },
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
          if (p[0] === '[') {
            const m = /^\[(\w+)(?:=(["']?)([\s\S]*?)\2)\]$/.exec(p);
            if (m && n.dataset && String(n.dataset[m[1]] || '') === (m[3] !== undefined ? m[3] : '')) return n;
            continue;
          }
          if (p[0] === '.') {
            const cls = p.slice(1);
            if (el === n && n.className.split(/\s+/).indexOf(cls) !== -1) return n;
            if (n.className && n.className.split(/\s+/).indexOf(cls) !== -1) return n;
            continue;
          }
          if (n._tag === p) return n;
        }
        n = n.parentNode;
      }
      return null;
    },
    querySelector(sel) {
      if (!el._qcache[sel]) {
        let tag = 'div';
        const mTag = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(sel);
        if (mTag) tag = mTag[0];
        el._qcache[sel] = makeEl(tag);
        el._qcache[sel].parentNode = el;
      }
      return el._qcache[sel];
    },
    querySelectorAll(sel) { return [el.querySelector(sel)]; },
    getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; }
  };
  return el;
}

const pendingTimers = [];
const g = {
  console,
  setTimeout: (fn, ms) => { const id = ++g._tid; pendingTimers.push({ id, fn, ms }); return id; },
  clearTimeout() { },
  _tid: 0,
  performance: { now: () => Date.now() },
  requestAnimationFrame: (fn) => 0,
  cancelAnimationFrame() { },
  matchMedia: () => ({ matches: false }),
  navigator: { clipboard: null },
  document: null,
  fetch: () => Promise.reject(new Error('no net')),
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL() { } },
  Blob: function (parts, opts) { this.type = opts && opts.type; this.text = Array.isArray(parts) ? parts.join('') : String(parts); },
  FileReader: function () { this.readAsText = () => { this.onload && this.onload(); }; },
  scrollTo() { },
  prompt: () => 'test',
  confirm: () => true,
  addEventListener() { },
  removeEventListener() { },
  _capturedBlob: null,
  _ttDownloadBlob: null,
  _toasts: []
};
g.document = {
  title: '',
  documentElement: { dataset: {} },
  readyState: 'complete',
  body: makeEl('body'),
  activeElement: null,
  createElement: (t) => makeEl(t),
  _els: {},
  querySelector(s) { if (!g.document._els[s]) { g.document._els[s] = makeEl('div'); g.document._els[s]._sel = s; } return g.document._els[s]; },
  querySelectorAll(s) { return [g.document.querySelector(s)]; },
  addEventListener() { },
  removeEventListener() { },
  execCommand: () => true,
  getElementById(id) { return g.document.querySelector('#' + id); }
};
g.window = g; g.self = g; g.top = g; g.globalThis = g;
g.localStorage = { _s: {}, getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };

vm.createContext(g);
['engine/engine-core.js', 'engine/engine-formula.js', 'engine/engine-io.js', 'engine/engine-edit.js', 'engine/engine-ui.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), g, { filename: f }));

let fails = 0;
const assert = (c, m) => { if (!c) { console.error('  ASSERT FAIL:', m); fails++; } else console.log('  ok -', m); };

/* capture toasts emitted by the engine */
g._toastEvents = [];

function makeEngine(extra) {
  const data = [
    { name: 'أحمد', email: 'a@x.com', city: 'الرياض', status: 'نشط', num: 100 },
    { name: 'سارة', email: 's@x.com', city: 'جدة', status: 'موقوف', num: 50 },
    { name: 'خالد', email: 'k@x.com', city: 'الرياض', status: 'نشط', num: 300 }
  ];
  return g.TableEngine.create(Object.assign({
    id: 'edit-test',
    el: '#app',
    rowNumber: true,
    showSelection: true,
    pageSize: 10,
    autoSave: false,
    persistData: false,
    footer: false,
    data,
    columns: [
      { id: 'name', title: 'الاسم', type: 'text', width: 150 },
      { id: 'email', title: 'البريد', type: 'email', width: 180, validators: ['email'] },
      { id: 'city', title: 'المدينة', type: 'text', width: 120 },
      { id: 'status', title: 'الحالة', type: 'select', width: 120, options: ['نشط', 'موقوف', 'جديد'] },
      { id: 'num', title: 'القيمة', type: 'number', width: 120 }
    ]
  }, extra || {}));
}

/* wire the fake tr/td that the engine's querySelector cache will return */
function wireCell(eng, rowIndex, colId) {
  const root = eng._elRoot;
  const tbody = root.querySelector('tbody');
  const row = eng.rows[rowIndex];
  const tr = tbody.querySelector('tr[data-rowid="' + row._id + '"]');
  tr._tag = 'tr';
  tr.className = 'tr';
  tr.dataset.rowid = row._id;
  tr.dataset.vi = String(rowIndex);
  const ci = eng.visibleCols.findIndex(c => c.id === colId);
  const td = tr.querySelector('td[data-col="' + colId + '"]');
  td._tag = 'td';
  td.dataset.col = colId;
  td.dataset.i = String(ci);
  return { root, tbody, tr, td, row, ci };
}
function lastChild(el) { return el._children[el._children.length - 1]; }
function fire(el, type, ev) { el.dispatch(type, ev); }
function pump() { const t = pendingTimers.splice(0); t.forEach(x => x.fn()); }

/* ================= TESTS ================= */
console.log('== edit flow ==');
{
  const eng = makeEngine();
  eng.on('toast', p => g._toastEvents.push(p.message + (p.type ? ':' + p.type : '')));

  // --- 1. single click focuses & selects ---
  const c1 = wireCell(eng, 0, 'name');
  fire(c1.root.querySelector('.tt-scroller'), 'click', { target: c1.td });
  assert(eng.focus.ri === 0, 'click sets focus row 0');
  assert(eng.selection[c1.row._id] === true, 'click selects the row');
  assert(g.document.activeElement === c1.root.querySelector('.tt-scroller'), 'click focuses the scroller');

  // --- 2. dblclick opens editor ---
  fire(c1.root.querySelector('.tt-scroller'), 'dblclick', { target: c1.td });
  assert(eng.editing && eng.editing.colId === 'name', 'dblclick opens editor on name');
  const inp = lastChild(c1.td);
  assert(inp && inp.className === 'tt-editor', 'editor input rendered in td');
  assert(inp.value === 'أحمد', 'editor pre-filled with current value');

  // --- 3. Enter commits + moves down + reopens ---
  inp.value = 'أحمد الجديد';
  fire(inp, 'keydown', { key: 'Enter' });
  assert(eng.rows[0].name === 'أحمد الجديد', 'Enter commits the new value');
  assert(eng.editing && eng.editing.rowId === eng.rows[1]._id, 'Enter moves focus to next row and reopens editor');

  // --- 4. Escape cancels ---
  const c1b = wireCell(eng, 1, 'name');
  const inp2 = lastChild(c1b.td);
  assert(inp2 && inp2.value === 'سارة', 'second row editor pre-filled');
  inp2.value = 'لا شيء';
  fire(inp2, 'keydown', { key: 'Escape' });
  assert(eng.editing === null, 'Escape closes editor');
  assert(eng.rows[1].name === 'سارة', 'Escape does not change value');

  // --- 5. Tab commits and moves to next column ---
  fire(c1b.root.querySelector('.tt-scroller'), 'dblclick', { target: c1b.td });
  const inp3 = lastChild(c1b.td);
  inp3.value = 'سارة م';
  fire(inp3, 'keydown', { key: 'Tab' });
  assert(eng.rows[1].name === 'سارة م', 'Tab commits value');
  assert(eng.editing && eng.editing.colId === 'email', 'Tab moves to next column (LTR order)');

  // --- 6. blur commits ---
  fire(c1.root.querySelector('.tt-scroller'), 'dblclick', { target: c1.td });
  const inp4 = lastChild(c1.td);
  inp4.value = 'عبر البلاك';
  fire(inp4, 'blur', {});
  pump();
  assert(eng.rows[0].name === 'عبر البلاك', 'blur (focus loss) commits value');
  assert(eng.editing === null, 'blur clears editing state');

  // --- 7. keyboard: click + Enter opens editor ---
  const c2 = wireCell(eng, 2, 'city');
  fire(c2.root.querySelector('.tt-scroller'), 'click', { target: c2.td });
  fire(c2.root.querySelector('.tt-scroller'), 'keydown', { key: 'Enter' });
  assert(eng.editing && eng.editing.colId === 'city', 'single click + Enter opens editor');
  const inp5 = lastChild(c2.td);
  inp5.value = 'مكة';
  fire(inp5, 'keydown', { key: 'Enter' });
  assert(eng.rows[2].city === 'مكة', 'keyboard-edited value committed');

  // --- 8. F2 opens editor ---
  const c2c = wireCell(eng, 2, 'city');
  fire(lastChild(c2c.td), 'keydown', { key: 'Escape' }); // close the editor reopened by test 7
  assert(eng.editing === null, 'editor closed before F2 test');
  fire(c2.root.querySelector('.tt-scroller'), 'click', { target: c2.td });
  fire(c2.root.querySelector('.tt-scroller'), 'keydown', { key: 'F2' });
  assert(eng.editing && eng.editing.colId === 'city', 'F2 opens editor');
  fire(lastChild(c2.td), 'keydown', { key: 'Escape' });

  // --- 9. number parsing ---
  const c3 = wireCell(eng, 0, 'num');
  fire(c3.root.querySelector('.tt-scroller'), 'dblclick', { target: c3.td });
  const inp6 = lastChild(c3.td);
  assert(inp6.type === 'number', 'number column gets number input');
  inp6.value = '250';
  fire(inp6, 'keydown', { key: 'Enter' });
  assert(eng.rows[0].num === 250 && typeof eng.rows[0].num === 'number', 'number editor parses to number');

  // --- 10. select editor ---
  const c4 = wireCell(eng, 0, 'status');
  fire(c4.root.querySelector('.tt-scroller'), 'dblclick', { target: c4.td });
  const sel = lastChild(c4.td);
  assert(sel && sel.className === 'tt-editor' && sel._tag === 'select', 'select column renders a <select>');
  assert(sel.innerHTML.indexOf('نشط') !== -1, 'select lists options');
  sel.value = 'جديد';
  fire(sel, 'keydown', { key: 'Enter' });
  assert(eng.rows[0].status === 'جديد', 'select commit works');

  // --- 11. validation blocks bad email ---
  const before = eng.rows[1].email;
  const c5 = wireCell(eng, 1, 'email');
  fire(c5.root.querySelector('.tt-scroller'), 'dblclick', { target: c5.td });
  const inp7 = lastChild(c5.td);
  assert(inp7.type === 'email', 'email column gets email input');
  inp7.value = 'ليس بريداً';
  fire(inp7, 'keydown', { key: 'Enter' });
  assert(eng.rows[1].email === before, 'invalid email rejected');
  assert(g._toastEvents.some(t => t.indexOf('بريد') !== -1), 'validation error toast shown');

  // --- 12. undo/redo around edits ---
  const c6 = wireCell(eng, 2, 'name');
  fire(c6.root.querySelector('.tt-scroller'), 'dblclick', { target: c6.td });
  const inp8 = lastChild(c6.td);
  inp8.value = 'خالد الثاني';
  fire(inp8, 'keydown', { key: 'Escape' }); // ensure closed
  const c7 = wireCell(eng, 2, 'name');
  fire(c7.root.querySelector('.tt-scroller'), 'dblclick', { target: c7.td });
  const inp9 = lastChild(c7.td);
  inp9.value = 'خالد الثاني';
  fire(inp9, 'keydown', { key: 'Enter' });
  assert(eng.rows[2].name === 'خالد الثاني', 'value set for undo test');
  eng.undo();
  assert(eng.rows[2].name === 'خالد', 'undo reverts the interactive edit');
  eng.redo();
  assert(eng.rows[2].name === 'خالد الثاني', 'redo re-applies the interactive edit');

  // --- 13. Delete key clears focused cell ---
  const c8 = wireCell(eng, 0, 'city');
  fire(c8.root.querySelector('.tt-scroller'), 'click', { target: c8.td });
  fire(c8.root.querySelector('.tt-scroller'), 'keydown', { key: 'Delete' });
  assert(eng.rows[0].city === null, 'Delete clears focused cell');

  // --- 14. read-only column refuses edit (dblclick path) ---
  const eng2 = g.TableEngine.create({
    id: 'ro', el: '#app2', pageSize: 10, autoSave: false, persistData: false, footer: false,
    data: [{ x: 1, y: 2 }],
    columns: [{ id: 'x', title: 'X', type: 'number' }, { id: 'y', title: 'Y', type: 'number', editable: false }]
  });
  eng2.on('toast', p => g._toastEvents.push(p.message + (p.type ? ':' + p.type : '')));
  const c9 = wireCell(eng2, 0, 'y');
  const sc2 = eng2._elRoot.querySelector('.tt-scroller');
  fire(sc2, 'dblclick', { target: c9.td });
  assert(eng2.editing === null, 'read-only column does not open editor');
  assert(g._toastEvents.some(t => t.indexOf('قراءة فقط') !== -1), 'read-only toast shown');
}

console.log(fails ? 'EDIT TESTS FAILED (' + fails + ')' : 'ALL EDIT TESTS PASSED');
process.exit(fails ? 1 : 0);
