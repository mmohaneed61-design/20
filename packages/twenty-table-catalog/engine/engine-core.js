/*
 * twenty-table-catalog / engine/engine-core.js
 * محرك الجدول المتقدم — النواة: الحالة، الأحداث، البيانات، الفلترة، الترتيب،
 * التجميع، الترقيم، العرض الافتراضي (Virtual Scrolling)، إدارة الأعمدة
 * MIT License — see ../LICENSE
 */
(function () {
  'use strict';

  /* ================= utilities ================= */
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var uid = function () { return 'r' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var deepClone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var debounce = function (fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; };
  var throttleRAF = function (fn) { var q = false; return function () { if (q) return; q = true; requestAnimationFrame(function () { q = false; fn(); }); }; };
  var nowISO = function () { return new Date().toISOString(); };

  var Emitter = function () {
    this._ev = {};
  };
  Emitter.prototype.on = function (name, fn) {
    (this._ev[name] = this._ev[name] || []).push(fn);
    return this;
  };
  Emitter.prototype.off = function (name, fn) {
    var l = this._ev[name];
    if (l) this._ev[name] = fn ? l.filter(function (f) { return f !== fn; }) : [];
    return this;
  };
  Emitter.prototype.emit = function (name, payload) {
    (this._ev[name] || []).slice().forEach(function (fn) { fn(payload || {}); });
  };

  var COLS_META = ['_id', '_archived', '_pinned', '_locked', '_note', '_createdAt', '_createdBy', '_modifiedAt', '_modifiedBy', '_rowColor', '_styles', '_values'];

  /* ================= filter operators ================= */
  var dateBounds = {
    today: function () { var d = new Date(); d.setHours(0, 0, 0, 0); return [d, endOfDay(d)]; },
    yesterday: function () { var a = new Date(); a.setDate(a.getDate() - 1); a.setHours(0, 0, 0, 0); var b = new Date(a); b.setDate(b.getDate() + 1); return [a, b]; },
    thisWeek: function () { var d = new Date(); var day = (d.getDay() + 6) % 7; var a = new Date(d); a.setDate(d.getDate() - day); a.setHours(0, 0, 0, 0); var b = new Date(a); b.setDate(a.getDate() + 7); return [a, b]; },
    lastWeek: function () { var r = dateBounds.thisWeek(); var a = new Date(r[0]); a.setDate(a.getDate() - 7); var b = new Date(r[0]); return [a, b]; },
    thisMonth: function () { var d = new Date(); var a = new Date(d.getFullYear(), d.getMonth(), 1); var b = new Date(d.getFullYear(), d.getMonth() + 1, 1); return [a, b]; },
    lastMonth: function () { var d = new Date(); var b = new Date(d.getFullYear(), d.getMonth(), 1); var a = new Date(d.getFullYear(), d.getMonth() - 1, 1); return [a, b]; },
    thisYear: function () { var d = new Date(); return [new Date(d.getFullYear(), 0, 1), new Date(d.getFullYear() + 1, 0, 1)]; },
    lastYear: function () { var d = new Date(); return [new Date(d.getFullYear() - 1, 0, 1), new Date(d.getFullYear(), 0, 1)]; },
    last7: function () { var b = new Date(); var a = new Date(b); a.setDate(a.getDate() - 7); return [a, b]; },
    last30: function () { var b = new Date(); var a = new Date(b); a.setDate(a.getDate() - 30); return [a, b]; },
    last90: function () { var b = new Date(); var a = new Date(b); a.setDate(a.getDate() - 90); return [a, b]; }
  };
  function endOfDay(d) { var x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

  function compareValues(a, b, col) {
    if (a === b) return 0;
    if (a === null || a === undefined || a === '') return -1;
    if (b === null || b === undefined || b === '') return 1;
    if (col && col.type === 'date' || col && col.type === 'datetime' || col && col.type === 'time') return String(a) < String(b) ? -1 : 1;
    var na = typeof a === 'number' ? a : parseFloat(a);
    var nb = typeof b === 'number' ? b : parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a) < String(b) ? -1 : 1;
  }

  function naturalCompare(a, b) {
    a = String(a == null ? '' : a); b = String(b == null ? '' : b);
    var re = /(\d+)(.*)/g; var m1, m2; var parts1 = a.match(re) || []; var parts2 = b.match(re) || [];
    if (a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }) !== 0) return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    return a.localeCompare(b);
  }

  function fuzzyMatch(text, q) {
    text = String(text).toLowerCase(); q = String(q).toLowerCase();
    if (text.indexOf(q) !== -1) return true;
    var ti = 0;
    for (var i = 0; i < q.length; i++) {
      ti = text.indexOf(q[i], ti);
      if (ti === -1) return false;
      ti++;
    }
    return true;
  }

  function testOperator(value, op, vals, col) {
    var v = value;
    var s = v === null || v === undefined ? '' : String(v);
    var l = s.toLowerCase();
    var v1 = vals[0], v2 = vals[1];
    switch (op) {
      case 'contains': return l.indexOf(String(v1).toLowerCase()) !== -1;
      case 'notContains': return l.indexOf(String(v1).toLowerCase()) === -1;
      case 'equals': return v === v1 || s === String(v1);
      case 'notEquals': return !(v === v1 || s === String(v1));
      case 'startsWith': return l.indexOf(String(v1).toLowerCase()) === 0;
      case 'endsWith': return l.lastIndexOf(String(v1).toLowerCase()) === s.length - String(v1).length;
      case 'isEmpty': return s === '' || v === null || v === undefined;
      case 'isNotEmpty': return s !== '' && v !== null && v !== undefined;
      case 'gt': return compareValues(v, v1, col) > 0;
      case 'lt': return compareValues(v, v1, col) < 0;
      case 'gte': return compareValues(v, v1, col) >= 0;
      case 'lte': return compareValues(v, v1, col) <= 0;
      case 'between': return compareValues(v, v1, col) >= 0 && compareValues(v, v2, col) <= 0;
      case 'notBetween': return !(compareValues(v, v1, col) >= 0 && compareValues(v, v2, col) <= 0);
      case 'inList': return String(v1).split(',').map(function (x) { return x.trim().toLowerCase(); }).indexOf(l) !== -1;
      case 'notInList': return String(v1).split(',').map(function (x) { return x.trim().toLowerCase(); }).indexOf(l) === -1;
      case 'regex':
        try { return new RegExp(String(v1), 'i').test(s); } catch (e) { return false; }
      case 'before': return compareValues(v, v1, col) < 0;
      case 'after': return compareValues(v, v1, col) > 0;
      case 'today': case 'yesterday': case 'thisWeek': case 'lastWeek':
      case 'thisMonth': case 'lastMonth': case 'thisYear': case 'lastYear':
      case 'last7': case 'last30': case 'last90':
        if (!v) return false;
        var d = v instanceof Date ? v : new Date(v);
        if (isNaN(d.getTime())) return false;
        var b = dateBounds[op]();
        return d >= b[0] && d < b[1];
      default: return true;
    }
  }

  /* ================= TableEngine ================= */
  function TableEngine(config) {
    var self = this;
    Emitter.call(this);
    this.config = config;
    this.id = config.id || 'tt';
    this.columns = (config.columns || []).map(function (c) {
      return Object.assign({
        id: c.id || c.title, title: c.title || c.id, type: c.type || 'text',
        width: c.width || 160, minWidth: c.minWidth || 70, maxWidth: c.maxWidth || 600,
        visible: c.visible !== false, editable: c.editable !== false, locked: false,
        align: c.align || 'start', agg: c.agg || null, format: c.format || null,
        validators: c.validators || [], options: c.options || [], colors: c.colors || null,
        placeholder: c.placeholder || '', default: c.default === undefined ? null : c.default,
        tooltip: c.tooltip || ''
      }, c);
    });
    this.columnOrder = this.columns.map(function (c) { return c.id; });
    this.hidden = {};
    this.widths = {};
    this.sort = [];
    this.filters = {};
    this.filterLogic = config.filterLogic || 'AND';
    this.global = '';
    this.fuzzy = !!config.fuzzy;
    this.groupBy = config.groupBy || [];
    this.collapsed = {};
    this.page = 1;
    this.pageSize = config.pageSize || 50;
    this.mode = config.mode || 'pagination';
    this.density = config.density || 'normal';
    this.theme = config.theme || 'light';
    this.direction = config.direction || 'rtl';
    this.virtual = config.virtual !== false;
    this.autoSave = config.autoSave !== false;
    this.storageKey = (config.storagePrefix || 'tt') + '-' + this.id;
    this.selection = {};
    this._selectionIds = [];
    this.focus = { ri: 0, ci: 0 };
    this.editing = null;
    this.expanded = {};
    this.rows = [];
    this.visibleRows = [];   // [{kind:'data',row,idx} | {kind:'group',node,level}]
    this.visibleDataRows = []; // row objects only
    this.visibleCols = [];
    this.groupTree = null;
    this._formulaCache = {};
    this._undo = [];
    this._redo = [];
    this._loading = !!config.loading;
    this._error = null;
    this._renderScheduled = false;
    this.user = config.user || 'أنت';
    this.views = {}; // saved views
    this.plugins = { editors: {}, renderers: {}, formats: {}, functions: {}, menuItems: {} };
    this._destroyed = false;

    this._normalizeData(config.data || []);
    this._bind();
    if (config.groupBy && config.groupBy.length) this.setGroupBy(config.groupBy);
    this._restore();
    this.render(true);
  }
  TableEngine.prototype = Object.create(Emitter.prototype);
  TableEngine.prototype.constructor = TableEngine;

  /* ---------- columns ---------- */
  TableEngine.prototype.colById = function (id) {
    for (var i = 0; i < this.columns.length; i++) if (this.columns[i].id === id) return this.columns[i];
    return null;
  };
  TableEngine.prototype.visibleColumns = function () {
    var self = this, out = [];
    this.columnOrder.forEach(function (id) {
      var c = self.colById(id);
      if (c && !self.hidden[id]) out.push(c);
    });
    if (this.config.rowNumber) out.unshift({ id: '__rownum', title: '#', type: 'rownum', width: 56, fixed: true });
    if (this.config.showSelection) out.unshift({ id: '__select', title: '', type: 'select', width: 44, fixed: true });
    return out;
  };
  TableEngine.prototype.colLetter = function (colId) {
    var ids = this.columnOrder.filter(function (id) { return !this.hidden[id]; }, this);
    var i = ids.indexOf(colId);
    var s = '';
    i++;
    while (i > 0) { s = String.fromCharCode(64 + ((i - 1) % 26)) + s; i = Math.floor((i - 1) / 26); }
    return s;
  };

  TableEngine.prototype.setColumnWidth = function (id, w) {
    var c = this.colById(id); if (!c) return;
    w = clamp(w, c.minWidth, c.maxWidth);
    this.widths[id] = w;
    this.renderHeader();
    this._save();
    this.emit('columnResized', { column: id, width: w });
  };
  TableEngine.prototype.autoFitColumn = function (id) {
    var c = this.colById(id); if (!c) return;
    var max = String(c.title).length * 8 + 24;
    this.rows.forEach(function (r) {
      var v = String(self0(r, id) == null ? '' : self0(r, id));
      if (v.length * 7.5 + 24 > max) max = v.length * 7.5 + 24;
    });
    this.widths[id] = clamp(max, c.minWidth, c.maxWidth);
    this.renderHeader(); this._save();
  };
  function self0(r, id) { var v = r[id]; return (v === undefined && r._values) ? r._values[id] : v; }
  TableEngine.prototype.autoFitAll = function () {
    this.columnOrder.forEach(this.autoFitColumn.bind(this));
  };
  TableEngine.prototype.moveColumn = function (id, dir) {
    var i = this.columnOrder.indexOf(id);
    var j = i + (dir === 'left' ? 1 : -1); // RTL: left = +1 visually
    if (i < 0 || j < 0 || j >= this.columnOrder.length) return;
    var t = this.columnOrder[i]; this.columnOrder[i] = this.columnOrder[j]; this.columnOrder[j] = t;
    this.render(true);
    this._save();
    this.emit('columnMoved', { column: id, direction: dir });
  };
  TableEngine.prototype.toggleColumn = function (id) {
    this.hidden[id] = !this.hidden[id];
    this.render(true);
    this._save();
    this.emit('columnVisibilityChanged', { column: id, visible: !this.hidden[id] });
  };
  TableEngine.prototype.showAllColumns = function () {
    this.hidden = {};
    this.render(true); this._save();
  };
  TableEngine.prototype.renameColumn = function (id, title) {
    var c = this.colById(id); if (!c) return;
    c.title = title;
    this.renderHeader(); this._save();
    this.emit('columnRenamed', { column: id, title: title });
  };
  TableEngine.prototype.addNewColumn = function (col) {
    if (!col.id) col.id = 'col_' + Date.now().toString(36);
    if (!col.title) col.title = col.id;
    col.type = col.type || 'text';
    col.width = col.width || 150;
    this.columns.push(col);
    this.columnOrder.push(col.id);
    this.rows.forEach(function (r) { if (r[col.id] === undefined) r[col.id] = null; });
    this.render(true); this._save();
    this.emit('columnAdded', { column: col.id });
  };
  TableEngine.prototype.duplicateColumn = function (id) {
    var c = this.colById(id); if (!c) return;
    var nc = deepClone(c);
    nc.id = id + '_copy';
    nc.title = c.title + ' (نسخة)';
    this.addNewColumn(nc);
    this.rows.forEach(function (r) { r[nc.id] = r[id]; });
    this.render(true); this._save();
  };
  TableEngine.prototype.deleteColumn = function (id) {
    var i = this.columns.findIndex(function (c) { return c.id === id; });
    if (i === -1) return;
    this.columns.splice(i, 1);
    var o = this.columnOrder.indexOf(id);
    if (o !== -1) this.columnOrder.splice(o, 1);
    delete this.hidden[id]; delete this.widths[id];
    this.render(true); this._save();
    this.emit('columnDeleted', { column: id });
  };
  TableEngine.prototype.sortColumnsAlpha = function () {
    var self = this;
    this.columnOrder.sort(function (a, b) {
      return self.colById(a).title.localeCompare(self.colById(b).title, 'ar');
    });
    this.render(true); this._save();
    this.toast('تم ترتيب الأعمدة أبجدياً', 'success');
  };
  TableEngine.prototype.resetColumns = function () {
    this.columnOrder = this.columns.map(function (c) { return c.id; });
    this.hidden = {};
    this.widths = {};
    this.render(true); this._save();
    this.toast('تمت إعادة تعيين الأعمدة', 'success');
  };

  /* ---------- data ---------- */
  TableEngine.prototype._normalizeData = function (data) {
    var self = this;
    this.rows = data.map(function (r) {
      if (typeof r !== 'object' || r === null) return r;
      var row = {};
      Object.keys(r).forEach(function (k) { if (k.indexOf('_') !== 0) row[k] = r[k]; });
      if (!row._id) row._id = uid();
      if (!row._createdAt) row._createdAt = nowISO();
      row._createdBy = row._createdBy || self.user;
      row._modifiedAt = row._modifiedAt || row._createdAt;
      row._modifiedBy = row._modifiedBy || self.user;
      row._archived = !!row._archived;
      row._pinned = row._pinned || null;
      row._locked = !!row._locked;
      row._note = row._note || '';
      row._rowColor = row._rowColor || null;
      row._styles = row._styles || {};
      return row;
    });
  };
  TableEngine.prototype.getData = function (opts) {
    opts = opts || {};
    var rows = opts.selectedOnly ? this.rows.filter(this._isSel, this) : this.rows;
    if (opts.filteredOnly !== false && !opts.selectedOnly) rows = this._filterAndSort(true);
    if (opts.excludeMeta !== false) return rows.map(function (r) {
      var o = {};
      Object.keys(r).forEach(function (k) { if (k.indexOf('_') !== 0) o[k] = r[k]; });
      o.id = r._id;
      return o;
    });
    return deepClone(rows);
  };
  TableEngine.prototype.setData = function (data) {
    this.pushUndo({ type: 'bulk', before: deepClone(this._plain()) });
    this._normalizeData(data || []);
    this.render(true);
    this._save();
    this.emit('dataLoaded', { count: this.rows.length });
  };
  TableEngine.prototype._plain = function () {
    return this.rows.map(function (r) {
      var o = { _id: r._id };
      Object.keys(r).forEach(function (k) { if (k.indexOf('_') !== 0) o[k] = r[k]; });
      o._archived = r._archived; o._pinned = r._pinned; o._note = r._note || '';
      return o;
    });
  };
  TableEngine.prototype._isSel = function (r) { return !!this.selection[r._id]; };

  TableEngine.prototype.addRow = function (values, pos) {
    var self = this;
    var row = {};
    this.columns.forEach(function (c) { row[c.id] = (values && values[c.id] !== undefined) ? values[c.id] : (c.default !== null ? c.default : null); });
    row._id = uid();
    row._createdAt = nowISO(); row._createdBy = this.user;
    row._modifiedAt = row._createdAt; row._modifiedBy = this.user;
    if (pos === 'top') this.rows.unshift(row);
    else if (typeof pos === 'number') this.rows.splice(pos, 0, row);
    else this.rows.push(row);
    this.pushUndo({ type: 'rowAdd', rowId: row._id, index: this.rows.indexOf(row), row: deepClone(row) });
    this.emit('beforeInsert', { row: row });
    this._afterMutate('rowInserted', { rowId: row._id });
    return row;
  };
  TableEngine.prototype.deleteRow = function (rowId, force) {
    var i = -1;
    this.rows.forEach(function (r, idx) { if (r._id === rowId) i = idx; });
    if (i === -1) return;
    if (!force && !this.rows[i]._archived && !window.confirm('هل تريد حذف هذا الصف؟')) return;
    var row = this.rows[i];
    this.pushUndo({ type: 'rowDelete', row: deepClone(row), index: i });
    this.emit('beforeDelete', { row: row });
    this.rows.splice(i, 1);
    delete this.selection[rowId];
    this._afterMutate('rowDeleted', { rowId: rowId });
  };
  TableEngine.prototype.duplicateRow = function (rowId) {
    var i = -1;
    this.rows.forEach(function (r, idx) { if (r._id === rowId) i = idx; });
    if (i === -1) return;
    var src = this.rows[i];
    var copy = deepClone(src);
    copy._id = uid();
    copy._createdAt = nowISO(); copy._modifiedAt = copy._createdAt;
    this.rows.splice(i + 1, 0, copy);
    this.pushUndo({ type: 'rowAdd', rowId: copy._id, index: i + 1 });
    this._afterMutate('rowDuplicated', { rowId: copy._id });
  };
  TableEngine.prototype.insertRow = function (posRowId, where) {
    var i = -1;
    this.rows.forEach(function (r, idx) { if (r._id === posRowId) i = idx; });
    if (i === -1) i = 0;
    var row = this.addRow(null, where === 'above' ? i : i + 1);
    this.focusRowId = row._id;
    return row;
  };
  TableEngine.prototype.moveRow = function (rowId, dir) {
    var i = -1, j;
    this.rows.forEach(function (r, idx) { if (r._id === rowId) i = idx; });
    if (i === -1) return;
    j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= this.rows.length) return;
    var t = this.rows[i]; this.rows[i] = this.rows[j]; this.rows[j] = t;
    this.pushUndo({ type: 'rowMove', rowId: rowId, from: i, to: j });
    this._afterMutate('rowMoved', { rowId: rowId, direction: dir });
  };
  TableEngine.prototype.pinRow = function (rowId, pos) {
    var r = this._row(rowId); if (!r) return;
    r._pinned = pos;
    this._afterMutate('rowPinned', { rowId: rowId, position: pos });
  };
  TableEngine.prototype.archiveRow = function (rowId) {
    var r = this._row(rowId); if (!r) return;
    r._archived = !r._archived;
    this._afterMutate(r._archived ? 'rowArchived' : 'rowRestored', { rowId: rowId });
  };
  TableEngine.prototype.setRowNote = function (rowId, note) {
    var r = this._row(rowId); if (!r) return;
    r._note = note;
    this._afterMutate('rowNoteChanged', { rowId: rowId, note: note });
  };
  TableEngine.prototype.toggleRowLocked = function (rowId) {
    var r = this._row(rowId); if (!r) return;
    r._locked = !r._locked;
    this._afterMutate('rowLockedChanged', { rowId: rowId, locked: r._locked });
  };
  TableEngine.prototype.setRowColor = function (rowId, color) {
    var r = this._row(rowId); if (!r) return;
    r._rowColor = color || null;
    this._afterMutate('rowColorChanged', { rowId: rowId, color: color });
  };
  TableEngine.prototype._row = function (id) {
    for (var i = 0; i < this.rows.length; i++) if (this.rows[i]._id === id) return this.rows[i];
    return null;
  };

  /* ---------- undo / redo ---------- */
  TableEngine.prototype.pushUndo = function (op) {
    this._undo.push(op);
    if (this._undo.length > 100) this._undo.shift();
    this._redo = [];
    this.emit('undoStateChanged', { canUndo: true, canRedo: false });
  };
  TableEngine.prototype.undo = function () {
    var op = this._undo.pop();
    if (!op) return;
    this._applyInverse(op);
    this._redo.push(op);
    this.emit('undo', { op: op.type });
    this._afterMutate('undoPerformed', {});
  };
  TableEngine.prototype.redo = function () {
    var op = this._redo.pop();
    if (!op) return;
    this._applyForward(op);
    this._undo.push(op);
    this.emit('redo', { op: op.type });
    this._afterMutate('redoPerformed', {});
  };
  TableEngine.prototype._applyInverse = function (op) {
    switch (op.type) {
      case 'cellEdit':
        var r = this._row(op.rowId);
        if (r) { r[op.colId] = op.before; if (r._styles) { delete r._styles[op.colId]; } }
        break;
      case 'rowAdd':
        var i2 = this.rows.findIndex(function (r2) { return r2._id === op.rowId; });
        if (i2 !== -1) this.rows.splice(i2, 1);
        break;
      case 'rowDelete':
        this.rows.splice(clamp(op.index, 0, this.rows.length), 0, op.row);
        break;
      case 'rowMove':
        this._swapRows(op.from, op.to);
        break;
      case 'bulk':
        this._normalizeData(op.before);
        break;
      case 'rowOp':
        var r3 = this._row(op.rowId);
        if (r3) r3[op.field] = op.before;
        break;
    }
  };
  TableEngine.prototype._applyForward = function (op) {
    switch (op.type) {
      case 'cellEdit':
        var r = this._row(op.rowId);
        if (r) { r[op.colId] = op.after; }
        break;
      case 'rowAdd':
        if (op.row) this.rows.splice(clamp(op.index, 0, this.rows.length), 0, op.row);
        break;
      case 'rowDelete':
        var i = this.rows.findIndex(function (r2) { return r2._id === op.row._id; });
        if (i !== -1) this.rows.splice(i, 1);
        break;
      case 'rowMove':
        this._swapRows(op.to, op.from);
        break;
      case 'bulk':
        // no-op forward (state already there)
        break;
    }
  };
  TableEngine.prototype._swapRows = function (a, b) {
    if (a < 0 || b < 0 || a >= this.rows.length || b >= this.rows.length) return;
    var t = this.rows[a]; this.rows[a] = this.rows[b]; this.rows[b] = t;
  };

  /* ---------- cell updates ---------- */
  TableEngine.prototype.updateCell = function (rowId, colId, value, opts) {
    opts = opts || {};
    var self = this;
    var r = this._row(rowId);
    if (!r) return { ok: false, error: 'row not found' };
    var c = this.colById(colId);
    if (!c) return { ok: false, error: 'column not found' };
    if (r._locked || c.locked || (opts.noValidate && false)) {
      return { ok: false, error: 'row locked' };
    }
    if (!opts.skipValidation) {
      var err = this.validate(c, value);
      if (err) {
        this.emit('validationError', { rowId: rowId, column: colId, error: err });
        return { ok: false, error: err };
      }
    }
    var before = r[colId];
    if (before === value) return { ok: true, changed: false };
    this.pushUndo({ type: 'cellEdit', rowId: rowId, colId: colId, before: before, after: value });
    r[colId] = value;
    r._modifiedAt = nowISO();
    r._modifiedBy = this.user;
    this.emit('validationSuccess', { rowId: rowId, column: colId });
    this.emit('valueChanged', { rowId: rowId, column: colId, before: before, after: value });
    this._recalc();
    this._afterMutate('cellEdited', { rowId: rowId, column: colId, value: value });
    return { ok: true, changed: true };
  };
  TableEngine.prototype.validate = function (c, value) {
    var v = value === null || value === undefined ? '' : value;
    var s = String(v);
    if (c.required !== false && c.id !== '__rownum' && c.id !== '__select' && value === null && s === '' && c.type !== 'boolean') {
      // required only when explicitly marked
      if (c.validators.indexOf('required') !== -1) return 'حقل مطلوب';
    }
    for (var i = 0; i < c.validators.length; i++) {
      var val = c.validators[i];
      if (typeof val === 'string') {
        switch (val) {
          case 'required': if (s === '') return 'حقل مطلوب'; break;
          case 'minLength2': break;
          case 'email': if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'بريد إلكتروني غير صالح'; break;
          case 'url': if (s && !/^https?:\/\/.+/i.test(s) && s.indexOf('.') === -1) return 'رابط غير صالح'; break;
          case 'phone': if (s && !/^[+\d\s\-()]{6,20}$/.test(s)) return 'رقم هاتف غير صالح'; break;
          case 'unique':
            if (s) {
              var dup = this.rows.some(function (r) { return r._id !== null && String(r[c.id]) === s; });
              if (dup) return 'القيمة موجودة مسبقاً';
            }
            break;
        }
      } else if (typeof val === 'object') {
        if (val.min !== undefined && (typeof v === 'number' || !isNaN(parseFloat(v))) && parseFloat(v) < val.min) return 'القيمة أقل من الحد الأدنى (' + val.min + ')';
        if (val.max !== undefined && (typeof v === 'number' || !isNaN(parseFloat(v))) && parseFloat(v) > val.max) return 'القيمة أكبر من الحد الأقصى (' + val.max + ')';
        if (val.minLength && s.length > 0 && s.length < val.minLength) return 'الأقل ' + val.minLength + ' أحرف';
        if (val.maxLength && s.length > val.maxLength) return 'الأقصى ' + val.maxLength + ' أحرف';
        if (val.pattern) {
          try { if (s && !new RegExp(val.pattern).test(s)) return val.message || 'نمط غير صالح'; } catch (e) { }
        }
        if (val.custom && typeof val.custom === 'function') {
          var e = val.custom(v, this.rows);
          if (e) return e;
        }
      }
    }
    return null;
  };
  TableEngine.prototype.setCellStyle = function (rowId, colId, styleKey, value) {
    var r = this._row(rowId); if (!r) return;
    r._styles = r._styles || {};
    r._styles[colId] = r._styles[colId] || {};
    r._styles[colId][styleKey] = value;
    this._afterMutate('cellStyleChanged', { rowId: rowId, column: colId, style: styleKey, value: value });
  };

  /* ---------- filters ---------- */
  TableEngine.prototype.setFilter = function (colId, filter) {
    if (!filter || (filter.op === 'none')) delete this.filters[colId];
    else this.filters[colId] = filter;
    this.page = 1;
    this.emit('filterChanged', { column: colId, filter: filter });
    this._afterMutate('filterApplied', { column: colId });
  };
  TableEngine.prototype.clearFilters = function (colId) {
    if (colId) delete this.filters[colId];
    else this.filters = {};
    this.global = '';
    this.page = 1;
    this.emit('filterChanged', { column: colId || null });
    this._afterMutate('filtersCleared', {});
  };
  TableEngine.prototype.setGlobal = function (q) {
    this.global = q || '';
    this.page = 1;
    this._afterMutate('globalSearchChanged', { query: this.global });
  };
  TableEngine.prototype.activeFilterCount = function () {
    return Object.keys(this.filters).length + (this.global ? 1 : 0);
  };

  TableEngine.prototype._passFilters = function (row) {
    var self = this;
    var q = this.global.trim().toLowerCase();
    if (q) {
      var found = false;
      this.columns.forEach(function (c) {
        if (found) return;
        var v = row[c.id];
        var s = v === null || v === undefined ? '' : String(v);
        if (s.toLowerCase().indexOf(q) !== -1 || (self.fuzzy && fuzzyMatch(s, q))) found = true;
      });
      if (!found) return false;
    }
    var keys = Object.keys(this.filters);
    if (!keys.length) return true;
    var results = keys.map(function (k) {
      var f = self.filters[k];
      var c = self.colById(k);
      return testOperator(row[k], f.op, f.values || [], c);
    });
    return this.filterLogic === 'OR' ? results.some(Boolean) : results.every(Boolean);
  };

  /* ---------- sorting ---------- */
  TableEngine.prototype.setSort = function (colId, dir, additive) {
    var self = this;
    if (dir === null) {
      this.sort = this.sort.filter(function (s) { return s.col !== colId; });
    } else {
      var i = this.sort.findIndex(function (s) { return s.col === colId; });
      var entry = { col: colId, dir: dir === 'desc' ? -1 : 1 };
      if (i !== -1) {
        if (additive) { this.sort[i].dir *= -1; }
        else { this.sort = [entry]; }
      } else {
        if (additive) this.sort.push(entry);
        else this.sort = [entry];
      }
    }
    this.emit('sortChanged', { sort: deepClone(this.sort) });
    this._afterMutate('sortApplied', { sort: deepClone(this.sort) });
  };
  TableEngine.prototype.clearSort = function () {
    this.sort = [];
    this.emit('sortChanged', { sort: [] });
    this._afterMutate('sortCleared', {});
  };
  TableEngine.prototype._sortRows = function (rows) {
    var self = this;
    if (!this.sort.length) return rows;
    var statusOrder = { 'نشط': 1, 'مكتمل': 2, 'متأخر': 3, 'جديد': 4, 'موقوف': 5, 'active': 1, 'done': 2, 'late': 3, 'new': 4, 'on-hold': 5 };
    rows.sort(function (a, b) {
      for (var i = 0; i < self.sort.length; i++) {
        var s = self.sort[i];
        var c = self.colById(s.col);
        var av = a[s.col], bv = b[s.col];
        var an = (av === null || av === undefined || av === ''), bn = (bv === null || bv === undefined || bv === '');
        if (an && bn) continue;
        if (an) return 1; // nulls last (default)
        if (bn) return -1;
        var r = 0;
        if (c) {
          var t = c.type;
          if (t === 'number' || t === 'currency' || t === 'percent' || t === 'progress' || t === 'rating') {
            r = (parseFloat(av) || 0) - (parseFloat(bv) || 0);
          } else if (t === 'date' || t === 'datetime' || t === 'time') {
            r = String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0;
          } else if (c.natural) {
            r = naturalCompare(av, bv);
          } else if (statusOrder[av] || statusOrder[bv]) {
            r = (statusOrder[av] || 99) - (statusOrder[bv] || 99);
          } else {
            r = String(av).localeCompare(String(bv), 'ar', { numeric: true, sensitivity: 'base' });
          }
        } else {
          r = String(av).localeCompare(String(bv), 'ar');
        }
        if (r !== 0) return r * s.dir;
      }
      return 0;
    });
    return rows;
  };

  /* ---------- pipeline ---------- */
  TableEngine.prototype._filterAndSort = function (all) {
    var rows = this.rows.filter(this._passFilters, this);
    // pinned rows first (fast path when nothing is pinned — matters at 100k+)
    var hasPin = false;
    for (var i = 0; i < rows.length; i++) { if (rows[i]._pinned) { hasPin = true; break; } }
    if (!hasPin) {
      this._sortRows(rows);
      return rows;
    }
    var pinned = rows.filter(function (r) { return r._pinned === 'top'; });
    var normal = rows.filter(function (r) { return !r._pinned; });
    var bottom = rows.filter(function (r) { return r._pinned === 'bottom'; });
    rows = this._sortRows(pinned).concat(this._sortRows(normal), this._sortRows(bottom));
    return all ? rows : rows;
  };
  TableEngine.prototype._buildGroupTree = function (rows) {
    if (!this.groupBy.length) return null;
    var root = { children: {}, total: rows.length, level: 0 };
    rows.forEach(function (r) {
      var node = root;
      for (var i = 0; i < self_groupCols.length; i++) {
        var colId = self_groupCols[i];
        var v = r[colId];
        var key = v === null || v === undefined ? '(فارغ)' : String(v);
        if (self_dateGroup[colId]) {
          var d = v ? new Date(v) : null;
          if (d && !isNaN(d.getTime())) key = self_dateGroup[colId] === 'month' ? d.toLocaleDateString('ar', { month: 'long', year: 'numeric' }) : d.toLocaleDateString('ar', { year: 'numeric' });
        }
        if (self_alphaGroup[colId]) key = String(key).charAt(0).toUpperCase() || '؟';
        if (!node.children[key]) node.children[key] = { key: key, col: colId, level: i + 1, count: 0, children: {}, rows: [] };
        node = node.children[key];
        node.count++;
        node.rows.push(r);
      }
    });
    return root;
  };
  var self_groupCols = [];
  var self_dateGroup = {};
  var self_alphaGroup = {};
  TableEngine.prototype._flattenGroups = function (root) {
    var out = [];
    var self = this;
    (function walk(node, path) {
      var keys = Object.keys(node.children).sort(function (a, b) {
        return a.localeCompare(b, 'ar', { numeric: true });
      });
      keys.forEach(function (k) {
        var g = node.children[k];
        var collapsed = self.collapsed[k + '@' + g.level] || (path && self.collapsed[path]);
        out.push({ kind: 'group', node: g, collapsed: !!collapsed, path: path ? path + '>' + k : k });
        if (!collapsed) {
          if (g.children && Object.keys(g.children).length) walk(g, path ? path + '>' + k : k);
          else g.rows.forEach(function (r) { out.push({ kind: 'data', row: r }); });
        }
      });
    })(root, '');
    return out;
  };
  TableEngine.prototype.toggleGroup = function (path) {
    this.collapsed[path] = !this.collapsed[path];
    this._afterMutate('groupToggled', { path: path, collapsed: this.collapsed[path] });
    this.emit('groupingChanged', {});
  };
  TableEngine.prototype.collapseAll = function (open) {
    var self = this;
    this._walkGroupKeys(function (k, lvl) { self.collapsed[k + '@' + lvl] = !open; });
    this._afterMutate('groups' + (open ? 'Expanded' : 'Collapsed'), {});
  };
  TableEngine.prototype._walkGroupKeys = function (fn) {
    if (!this.groupTree) return;
    (function walk(node, prefix) {
      Object.keys(node.children).forEach(function (k) {
        var g = node.children[k];
        fn(prefix ? prefix + '>' + k : k, g.level);
        walk(g, prefix ? prefix + '>' + k : k);
      });
    })(this.groupTree, '');
  };
  TableEngine.prototype.setGroupBy = function (colIds) {
    this.groupBy = colIds || [];
    this.collapsed = {};
    self_groupCols = this.groupBy;
    self_dateGroup = {};
    self_alphaGroup = {};
    this.groupBy.forEach(function (id) {
      var c = this.colById(id);
      if (c && c.type === 'date') self_dateGroup[id] = c.dateGroup || 'month';
      if (c && c.alphaGroup) self_alphaGroup[id] = true;
    }, this);
    this._afterMutate('groupingChanged', { groupBy: this.groupBy });
    this.emit('groupingChanged', { groupBy: this.groupBy });
  };

  /* ---------- view rows ---------- */
  TableEngine.prototype._computeVisible = function () {
    var rows = this._filterAndSort(true);
    this._dataTotal = rows.length;
    // pagination slices data rows (not while grouped — the group tree shows in full)
    if (this.mode === 'pagination' && !this.groupBy.length) {
      var pages = Math.max(1, Math.ceil(rows.length / this.pageSize));
      if (this.page > pages) this.page = pages;
      var start = (this.page - 1) * this.pageSize;
      rows = rows.slice(start, start + this.pageSize);
    }
    this.visibleDataRows = rows;
    if (this.groupBy.length) {
      this.groupTree = this._buildGroupTree(rows);
      this.visibleRows = this._flattenGroups(this.groupTree);
    } else {
      this.groupTree = null;
      this.visibleRows = rows.map(function (r) { return { kind: 'data', row: r }; });
    }
  };
  TableEngine.prototype.dataRowCount = function () { return this._dataTotal || 0; };

  /* ---------- rendering ---------- */
  TableEngine.prototype.render = function (full) {
    var self = this;
    if (this._destroyed) return;
    if (!this._renderScheduled || full) {
      this._renderScheduled = false;
      var t0 = performance.now();
      this.visibleCols = this.visibleColumns();
      this._computeVisible();
      if (this._loading) this.renderSkeleton();
      else if (this._error) this.renderError();
      else if (!this.visibleRows.length) this.renderEmpty();
      else this.renderBody(full);
      this.renderHeader();
      this.renderFooter();
      this._lastRenderMs = Math.round((performance.now() - t0) * 100) / 100;
      this.emit('rendered', { ms: this._lastRenderMs, rows: this.visibleRows.length });
      if (this.autoSave) this._save();
    } else {
      this._renderScheduled = true;
      requestAnimationFrame(function () { self.render(false); });
    }
  };
  TableEngine.prototype.rowHeight = function () {
    return this.density === 'comfortable' ? 40 : this.density === 'compact' ? 28 : 32;
  };
  TableEngine.prototype.renderHeader = function () {
    var h = this._el('thead');
    if (!h) return;
    var self = this;
    var html = '<tr>';
    this.visibleCols.forEach(function (c, i) {
      var w = self.widths[c.id] || c.width;
      if (c.id === '__select') {
        var vrData = self.visibleRows.filter(function (v) { return v.kind === 'data'; });
        var allSel = vrData.length > 0 && vrData.every(function (v) { return self._isSel(v.row); });
        html += '<th data-col="__select" style="width:' + w + 'px;min-width:' + c.minWidth + 'px;max-width:' + c.maxWidth + 'px" class="th' + (c.fixed ? ' th-fixed' : '') + '"><input type="checkbox" data-sel-all' + (allSel ? ' checked' : '') + ' aria-label="تحديد الكل" /></th>';
        return;
      }
      var sortEntry = self.sort.find(function (s) { return s.col === c.id; });
      var ariaSort = sortEntry ? (sortEntry.dir === 1 ? 'ascending' : 'descending') : 'none';
      var arrow = sortEntry ? (sortEntry.dir === 1 ? '▲' : '▼') : '';
      var prio = sortEntry ? self.sort.indexOf(sortEntry) + 1 : '';
      var filterActive = self.filters[c.id] ? ' filter-active' : '';
      html += '<th data-col="' + c.id + '" data-i="' + i + '" style="width:' + w + 'px;min-width:' + c.minWidth + 'px;max-width:' + c.maxWidth + 'px" aria-sort="' + ariaSort + '" class="th' + filterActive + (c.fixed ? ' th-fixed' : '') + '" draggable="' + (c.fixed ? 'false' : 'true') + '">' +
        '<span class="th-inner">' + esc(c.title) +
        (sortEntry ? '<span class="th-prio">' + prio + '</span>' : '') +
        '<span class="th-arrow">' + arrow + '</span>' +
        (self.filters[c.id] ? '<span class="th-filter-dot"></span>' : '') +
        '</span>' +
        '<span class="th-resize" data-col="' + c.id + '"></span></th>';
    });
    html += '</tr>';
    // filter row
    html += '<tr class="th-filterrow">' + this.visibleCols.map(function (c) {
      return '<td data-col="' + c.id + '" style="width:' + (self.widths[c.id] || c.width) + 'px"></td>';
    }).join('') + '</tr>';
    h.innerHTML = html;
  };
  TableEngine.prototype._cellHTML = function (row, c, i) {
    var self = this;
    var v = row[c.id];
    var styles = row._styles && row._styles[c.id];
    var css = '';
    if (styles) {
      if (styles.align) css += 'text-align:' + styles.align + ';';
      if (styles.color) css += 'color:' + styles.color + ';';
      if (styles.bg) css += 'background:' + styles.bg + ';';
      if (styles.bold) css += 'font-weight:700;';
      if (styles.italic) css += 'font-style:italic;';
      if (styles.underline) css += 'text-decoration:underline;';
      if (styles.strike) css += 'text-decoration:line-through;';
      if (styles.font) css += 'font-family:' + styles.font + ';';
      if (styles.size) css += 'font-size:' + styles.size + 'px;';
    }
    if (!css && c.align) css += 'text-align:' + c.align + ';';
    if (c.wrap === false) css += 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

    var content = '';
    var q = this.global.trim();
    var customRenderer = this.plugins.renderers[c.id] || (this.plugins.renderers[c.type] && this.plugins.renderers[c.type]);
    if (customRenderer) {
      content = customRenderer(v, row, c) || content;
    }
    if (!content) {
      if (typeof v === 'string' && v.indexOf('=') === 0) {
        content = esc(this.evaluateFormula(v, row._id));
      } else {
        var fv = this.formatValue(c, v);
        content = esc(fv);
      }
    }
    // highlight
    if (q && content) {
      var safe = content.replace(/<mark>/g, '').replace(/<\/mark>/g, '');
      var qe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      content = safe.replace(new RegExp('(' + qe + ')', 'gi'), '<mark>$1</mark>');
    }
    // conditional formatting + cell widgets
    var cf = this._conditionalStyle(row, c, v);
    if (cf && cf.bg) css += 'background:' + cf.bg + ';';
    if (cf && cf.color) css += 'color:' + cf.color + ';font-weight:600;';
    if (cf && cf.prefix) content = cf.prefix + content;

    var note = row._note ? '<span class="cell-note" data-tt="ملاحظة: ' + esc(row._note) + '">📝</span>' : '';
    var lock = row._locked || c.locked ? ' cell-locked' : '';
    return '<td data-col="' + c.id + '" data-i="' + i + '" style="' + css + '" class="cell' + lock + '">' +
      '<div class="cell-inner">' + content + note + '</div></td>';
  };
  TableEngine.prototype._rowHTML = function (vr, vi) {
    var self = this;
    var c0 = this.visibleCols[0];
    if (vr.kind === 'group') {
      var g = vr.node;
      var aggHtml = this.groupAggs(g.rows);
      return '<tr class="tr-group" data-path="' + esc(vr.path) + '" style="height:' + this.rowHeight() + 'px" aria-expanded="' + !vr.collapsed + '">' +
        '<td colspan="' + this.visibleCols.length + '" class="td-group" data-level="' + g.level + '">' +
        '<span class="g-caret">' + (vr.collapsed ? '▶' : '▼') + '</span>' +
        '<span class="g-key">' + esc(g.key) + '</span>' +
        '<span class="g-count">' + g.count + ' صف</span>' +
        '<span class="g-aggs">' + aggHtml + '</span></td></tr>';
    }
    var row = vr.row;
    var isSel = !!this.selection[row._id];
    var focusRow = this.focus.ri === vi;
    var isExp = !!this.expanded[row._id];
    var cells = this.visibleCols.map(function (c, i) {
      if (c.id === '__rownum') return '<td class="cell cell-rownum">' + (self._rownum(row) || '') + '</td>';
      if (c.id === '__select') return '<td class="cell cell-sel"><input type="checkbox" data-sel="' + row._id + '" ' + (isSel ? 'checked' : '') + ' aria-label="تحديد الصف" /></td>';
      return self._cellHTML(row, c, i);
    }).join('');
    var rc = row._rowColor ? 'background:' + hexA(row._rowColor, 0.12) + ';' : '';
    var html = '<tr data-rowid="' + row._id + '" data-vi="' + vi + '" class="tr' + (isSel ? ' tr-selected' : '') + (focusRow ? ' tr-focused' : '') + (row._archived ? ' tr-archived' : '') + (isExp ? ' tr-expanded' : '') + '" style="height:' + this.rowHeight() + 'px;' + rc + '" aria-selected="' + isSel + '">' + cells + '</tr>';
    if (isExp) {
      html += '<tr class="tr-detail"><td colspan="' + this.visibleCols.length + '"><div class="detail-box">' +
        '<table class="detail-table">' + this.visibleCols.map(function (c) {
          if (c.id === '__rownum' || c.id === '__select') return '';
          var v = row[c.id];
          return '<tr><th>' + esc(c.title) + '</th><td dir="auto">' + esc(v === null || v === undefined ? '—' : String(v)) + '</td></tr>';
        }).join('') + '</table></div></td></tr>';
    }
    return html;
  };
  TableEngine.prototype._rownum = function (row) {
    var i = this.rows.indexOf(row);
    return i === -1 ? '' : i + 1;
  };
  function hexA(hex, a) {
    if (!hex) return '';
    var m = String(hex).replace('#', '');
    if (m.length === 3) m = m[0] + m[0] + m[1] + m[1] + m[2] + m[2];
    var r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  TableEngine.prototype.renderBody = function (full) {
    var self = this;
    var tbody = this._el('tbody');
    if (!tbody) return;
    var vr = this.visibleRows;
    var rh = this.rowHeight();
    var useVirtual = this.virtual && vr.length > 200 && !Object.keys(this.expanded).length && this.mode !== 'all';
    if (!useVirtual) {
      tbody.innerHTML = vr.map(function (v, i) { return self._rowHTML(v, i); }).join('');
      this._virtual = false;
      tbody.parentNode.style.height = '';
      return;
    }
    this._virtual = true;
    var scroller = tbody.parentNode;
    var totalH = vr.length * rh;
    var scrollTop = scroller.scrollTop || 0;
    var viewH = scroller.clientHeight || 600;
    var start = Math.max(0, Math.floor(scrollTop / rh) - 5);
    var count = Math.ceil(viewH / rh) + 10;
    var end = Math.min(vr.length, start + count);
    var topPad = start * rh;
    var botPad = (vr.length - end) * rh;
    var html = '';
    if (topPad > 0) html += '<tr class="tr-pad" style="height:' + topPad + 'px"><td colspan="' + this.visibleCols.length + '" class="td-pad"></td></tr>';
    for (var i = start; i < end; i++) html += this._rowHTML(vr[i], i);
    if (botPad > 0) html += '<tr class="tr-pad" style="height:' + botPad + 'px"><td colspan="' + this.visibleCols.length + '" class="td-pad"></td></tr>';
    tbody.innerHTML = html;
  };
  TableEngine.prototype.renderSkeleton = function () {
    var tbody = this._el('tbody');
    if (!tbody) return;
    var html = '';
    for (var i = 0; i < 8; i++) {
      html += '<tr class="tr-skel"><td>' + this.visibleCols.map(function () {
        return '<div class="skel-bar" style="width:' + (40 + Math.floor(Math.random() * 50)) + '%"></div>';
      }).join('') + '</td></tr>';
    }
    tbody.innerHTML = html;
  };
  TableEngine.prototype.renderEmpty = function () {
    var tbody = this._el('tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr class="tr-empty"><td colspan="' + Math.max(1, this.visibleCols.length) + '"><div class="empty-box"><div class="empty-icon">🔎</div><div class="empty-title">لا توجد نتائج</div><div class="empty-sub">جرّب تغيير البحث أو الفلاتر</div><button class="t-btn" data-action="clear-all">مسح كل الفلاتر</button></div></td></tr>';
  };
  TableEngine.prototype.renderError = function () {
    var tbody = this._el('tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr class="tr-empty"><td colspan="' + Math.max(1, this.visibleCols.length) + '"><div class="empty-box"><div class="empty-icon">⚠️</div><div class="empty-title">خطأ في التحميل</div><div class="empty-sub">' + esc(this._error) + '</div><button class="t-btn" data-action="retry">إعادة المحاولة</button></div></td></tr>';
  };
  TableEngine.prototype.groupAggs = function (rows) {
    var self = this;
    var out = [];
    this.visibleCols.forEach(function (c) {
      if (!c.agg || !['number', 'currency', 'percent', 'progress'].indexOf(c.type) && c.agg === 'auto') return;
      var agg = c.agg;
      if (!agg) return;
      var nums = rows.map(function (r) { return parseFloat(r[c.id]); }).filter(function (n) { return !isNaN(n); });
      if (!nums.length) return;
      var val = null;
      if (agg === 'sum') val = nums.reduce(function (a, b) { return a + b; }, 0);
      else if (agg === 'avg') val = nums.reduce(function (a, b) { return a + b; }, 0) / nums.length;
      else if (agg === 'min') val = Math.min.apply(null, nums);
      else if (agg === 'max') val = Math.max.apply(null, nums);
      else if (agg === 'count') val = rows.length;
      else return;
      out.push('<span class="g-agg"><i>' + esc(c.title) + ': ' + esc(self.formatValue(c, Math.round(val * 100) / 100)) + '</i></span>');
    });
    return out.join('');
  };
  TableEngine.prototype.renderFooter = function () {
    var tfoot = this._el('tfoot');
    if (!tfoot) return;
    if (!this.config.footer) { tfoot.innerHTML = ''; return; }
    var self = this;
    var rows = this.visibleDataRows || [];
    var html = '<tr class="tr-footer"><th>الإجمالي (' + rows.length + ')</th>';
    this.visibleCols.forEach(function (c) {
      if (c.id === '__rownum' || c.id === '__select') { html += '<th></th>'; return; }
      var agg = c.agg;
      var val = '';
      if (agg) {
        var nums = rows.map(function (r) { return parseFloat(r[c.id]); }).filter(function (n) { return !isNaN(n); });
        if (nums.length) {
          if (agg === 'sum') val = self.formatValue(c, nums.reduce(function (a, b) { return a + b; }, 0));
          else if (agg === 'avg') val = self.formatValue(c, nums.reduce(function (a, b) { return a + b; }, 0) / nums.length);
          else if (agg === 'min') val = self.formatValue(c, Math.min.apply(null, nums));
          else if (agg === 'max') val = self.formatValue(c, Math.max.apply(null, nums));
          else if (agg === 'count') val = String(nums.length);
          else if (agg === 'countDistinct') val = String(new Set(nums).size);
          else if (agg === 'median') { nums.sort(function (a, b) { return a - b; }); var m = nums.length >> 1; val = self.formatValue(c, nums.length % 2 ? nums[m] : (nums[m - 1] + nums[m]) / 2); }
          else if (agg === 'stddev') { var mu = nums.reduce(function (a, b) { return a + b; }, 0) / nums.length; val = self.formatValue(c, Math.sqrt(nums.reduce(function (a, b) { return a + (b - mu) * (b - mu); }, 0) / nums.length)); }
          else if (agg === 'variance') { var mu2 = nums.reduce(function (a, b) { return a + b; }, 0) / nums.length; val = self.formatValue(c, nums.reduce(function (a, b) { return a + (b - mu2) * (b - mu2); }, 0) / nums.length); }
          else if (agg === 'range') val = self.formatValue(c, Math.max.apply(null, nums) - Math.min.apply(null, nums));
          else if (agg === 'mode') { var freq = {}; nums.forEach(function (n) { freq[n] = (freq[n] || 0) + 1; }); var best = null, bc = 0; Object.keys(freq).forEach(function (k) { if (freq[k] > bc) { bc = freq[k]; best = +k; } }); val = self.formatValue(c, best); }
        }
      }
      html += '<th class="tf-val">' + esc(val || '') + '</th>';
    });
    html += '</tr>';
    tfoot.innerHTML = html;
  };

  /* ---------- formatting ---------- */
  TableEngine.prototype.formatValue = function (c, v) {
    if (v === null || v === undefined || v === '') return '';
    if (c && this.plugins.formats[c.id]) return this.plugins.formats[c.id](v, c);
    var fmt = (c && c.format) || (c && c.type);
    if (fmt === 'number' || fmt === 'currency' || fmt === 'percent' || fmt === 'money') {
      var n = parseFloat(v);
      if (isNaN(n)) return String(v);
      var dec = (c && c.decimals !== undefined) ? c.decimals : (fmt === 'percent' ? 1 : 0);
      var s = n.toLocaleString('en', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      if (fmt === 'percent') s += '%';
      if (fmt === 'currency' || fmt === 'money') {
        var sym = (c && c.currency) || 'ر.س';
        s = sym + ' ' + s;
      }
      return s;
    }
    if (fmt === 'date') {
      var d = new Date(v);
      if (isNaN(d.getTime())) return String(v);
      return d.toLocaleDateString('ar', { year: 'numeric', month: '2-digit', day: '2-digit' });
    }
    if (fmt === 'time') {
      var d2 = new Date(v);
      if (isNaN(d2.getTime())) return String(v);
      return d2.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
    }
    if (fmt === 'datetime') {
      var d3 = new Date(v);
      if (isNaN(d3.getTime())) return String(v);
      return d3.toLocaleDateString('ar', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' + d3.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
    }
    if (fmt === 'boolean') return v ? '✓' : '—';
    return String(v);
  };

  /* ---------- state persistence ---------- */
  TableEngine.prototype._save = function () {
    if (!this.autoSave) return;
    try {
      var st = {
        columnOrder: this.columnOrder, hidden: this.hidden, widths: this.widths,
        sort: this.sort, filters: this.filters, filterLogic: this.filterLogic,
        groupBy: this.groupBy, pageSize: this.pageSize, page: this.page,
        density: this.density, theme: this.theme, direction: this.direction,
        views: this.views, data: this.config.persistData ? this._plain() : undefined
      };
      localStorage.setItem(this.storageKey, JSON.stringify(st));
    } catch (e) { /* quota */ }
  };
  TableEngine.prototype._restore = function () {
    var self = this;
    try {
      var raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      var st = JSON.parse(raw);
      if (st.columnOrder) {
        var valid = st.columnOrder.filter(function (id) { return !!self0col(self, id); });
        this.columnOrder = valid.concat(this.columns.map(function (c) { return c.id; }).filter(function (id) { return st.columnOrder.indexOf(id) === -1; }));
      }
      this.hidden = st.hidden || {};
      this.widths = st.widths || {};
      this.sort = st.sort || [];
      this.filters = st.filters || {};
      this.filterLogic = st.filterLogic || 'AND';
      this.pageSize = st.pageSize || this.pageSize;
      this.density = st.density || this.density;
      if (st.views) this.views = st.views;
      if (st.data) this._normalizeData(st.data);
      if (st.groupBy) this.setGroupBy(st.groupBy);
      this.page = st.page || 1;
    } catch (e) { console.error('RESTORE ERR', e && e.message); }
  };
  function self0col(self, id) { return !!self.colById(id); }
  TableEngine.prototype.resetState = function () {
    localStorage.removeItem(this.storageKey);
    this.sort = []; this.filters = {}; this.global = ''; this.hidden = {};
    this.columnOrder = this.columns.map(function (c) { return c.id; });
    this.groupBy = []; this.collapsed = {}; this.page = 1;
    this.render(true);
    this.toast('تمت إعادة تعيين كل الإعدادات', 'success');
  };
  TableEngine.prototype.saveView = function (name) {
    this.views[name] = {
      sort: deepClone(this.sort), filters: deepClone(this.filters), groupBy: this.groupBy.slice(),
      hidden: Object.assign({}, this.hidden), pageSize: this.pageSize, density: this.density, page: this.page
    };
    this._save();
    this.renderViewsMenu();
    this.toast('تم حفظ العرض «' + name + '»', 'success');
  };
  TableEngine.prototype.applyView = function (name) {
    var v = this.views[name];
    if (!v) return;
    this.sort = v.sort || []; this.filters = v.filters || {}; this.hidden = v.hidden || {};
    this.pageSize = v.pageSize || this.pageSize; this.density = v.density || this.density;
    this.setGroupBy(v.groupBy || []);
    this.page = v.page || 1;
    this.render(true);
    this.toast('تم تطبيق العرض «' + name + '»', 'success');
  };
  TableEngine.prototype.deleteView = function (name) {
    delete this.views[name];
    this._save();
    this.renderViewsMenu();
  };
  TableEngine.prototype.exportState = function () {
    return {
      columnOrder: this.columnOrder, hidden: this.hidden, widths: this.widths,
      sort: this.sort, filters: this.filters, groupBy: this.groupBy,
      pageSize: this.pageSize, density: this.density
    };
  };
  TableEngine.prototype.importState = function (st) {
    if (!st) return;
    if (st.columnOrder) this.columnOrder = st.columnOrder;
    if (st.hidden) this.hidden = st.hidden;
    if (st.widths) this.widths = st.widths;
    if (st.sort) this.sort = st.sort;
    if (st.filters) this.filters = st.filters;
    if (st.groupBy) this.setGroupBy(st.groupBy);
    this.render(true);
  };

  /* ---------- misc api ---------- */
  TableEngine.prototype.navigateTo = function (ri, ci) {
    this.focus.ri = clamp(ri || 0, 0, Math.max(0, this.visibleRows.length - 1));
    this.focus.ci = clamp(ci || 0, 0, Math.max(0, this.visibleCols.length - 1));
    this._ensureFocusVisible();
    this.render(false);
    this.emit('navigateTo', { row: this.focus.ri, col: this.focus.ci });
  };
  TableEngine.prototype._ensureFocusVisible = function () {
    var scroller = this._el('.tt-scroller');
    if (!scroller) return;
    var rh = this.rowHeight();
    var top = this.focus.ri * rh;
    if (top < scroller.scrollTop) scroller.scrollTop = top - rh * 2;
    else if (top + rh * 2 > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = top + rh * 2 - scroller.clientHeight;
  };
  TableEngine.prototype.setSelection = function (rowIds) {
    this.selection = {};
    (rowIds || []).forEach(function (id) { this.selection[id] = true; }, this);
    this.render(false);
    this.emit('selectionChanged', { count: this._selectionIds = Object.keys(this.selection) });
  };
  TableEngine.prototype.refresh = function () {
    this.emit('refresh', {});
    this.render(true);
    this.toast('تم التحديث', 'success');
  };
  TableEngine.prototype.destroy = function () {
    this._destroyed = true;
    var el = this._elRoot;
    if (el && el.parentNode) el.parentNode.removeChild(el);
    this.emit('destroyed', {});
  };
  TableEngine.prototype.setLoading = function (b) {
    this._loading = b;
    this.render(true);
  };
  TableEngine.prototype.setError = function (msg) {
    this._error = msg || null;
    this._loading = false;
    this.render(true);
    if (msg) this.emit('dataLoadError', { message: msg });
  };
  TableEngine.prototype.setDensity = function (d) {
    this.density = d;
    this.render(true);
    this._save();
    this.emit('densityChanged', { density: d });
  };
  TableEngine.prototype.setTheme = function (t) {
    this.theme = t;
    var root = this._elRoot;
    if (root) root.dataset.theme = t;
    this.render(false);
    this._save();
    this.emit('themeChanged', { theme: t });
  };
  TableEngine.prototype.setDirection = function (dir) {
    this.direction = dir;
    var root = this._elRoot;
    if (root) root.dir = dir;
    this.render(true);
    this._save();
    this.emit('directionChanged', { direction: dir });
  };
  TableEngine.prototype.setPageSize = function (n) {
    this.pageSize = n;
    this.page = 1;
    this.render(true);
    this._save();
    this.emit('pageSizeChanged', { pageSize: n });
  };
  TableEngine.prototype.setMode = function (m) {
    this.mode = m;
    this.page = 1;
    this.render(true);
  };
  TableEngine.prototype.pageCount = function () {
    return Math.max(1, Math.ceil((this._dataTotal || 0) / this.pageSize));
  };
  TableEngine.prototype.goToPage = function (p) {
    this.page = clamp(p, 1, this.pageCount());
    this.render(true);
    this.emit('pageChanged', { page: this.page });
  };

  TableEngine.prototype.toast = function (msg, type) {
    if (this.config.toast) this.config.toast(msg, type);
    else this.emit('toast', { message: msg, type: type || 'info' });
  };
  TableEngine.prototype.announce = function (msg) {
    var live = this._elRoot && this._elRoot.querySelector('[aria-live]');
    if (live) live.textContent = msg;
  };
  TableEngine.prototype._afterMutate = function (event, payload) {
    this._recalc();
    this.render(true);
    if (event) this.emit(event, payload);
  };
  TableEngine.prototype._recalc = function () {
    this._formulaCache = {};
  };

  /* ---------- plugins ---------- */
  TableEngine.prototype.registerEditor = function (type, fn) { this.plugins.editors[type] = fn; };
  TableEngine.prototype.registerRenderer = function (key, fn) { this.plugins.renderers[key] = fn; };
  TableEngine.prototype.registerFormat = function (key, fn) { this.plugins.formats[key] = fn; };
  TableEngine.prototype.registerFunction = function (name, fn) { this.plugins.functions[name] = fn; };
  TableEngine.prototype.registerMenuItem = function (ctx, item) {
    this.plugins.menuItems[ctx] = this.plugins.menuItems[ctx] || [];
    this.plugins.menuItems[ctx].push(item);
  };

  /* ---------- DOM binding (delegated) ---------- */
  TableEngine.prototype._el = function (sel) {
    return this._elRoot ? this._elRoot.querySelector(sel) : null;
  };
  TableEngine.prototype._bind = function () {
    var self = this;
    var mount = typeof this.config.el === 'string' ? document.querySelector(this.config.el) : this.config.el;
    var root = document.createElement('div');
    root.className = 'tt';
    root.dataset.theme = this.theme;
    root.dir = this.direction;
    root.setAttribute('role', 'grid');
    root.setAttribute('aria-rowcount', String(this.rows.length));
    root.setAttribute('aria-colcount', String(this.visibleColumns().length));
    if (this.config.title) root.setAttribute('aria-label', this.config.title);
    if (this.config.description) root.setAttribute('aria-describedby', this.config.description);
    mount.appendChild(root);
    this._elRoot = root;
    root.innerHTML =
      '<div class="tt-titlebar">' +
      (this.config.title ? '<h2 class="tt-title">' + esc(this.config.title) + '</h2>' : '') +
      (this.config.description ? '<p class="tt-desc">' + esc(this.config.description) + '</p>' : '') +
      '<div class="tt-live" role="status" aria-live="polite"></div>' +
      '</div>' +
      '<div class="tt-toolbar" data-region="toolbar"></div>' +
      '<div class="tt-scroller" tabindex="0">' +
      '<table class="tt-table"><thead></thead><tbody></tbody><tfoot></tfoot></table>' +
      '</div>' +
      '<div class="tt-statusbar" data-region="statusbar"></div>';
    if (this.config.title) root.setAttribute('role', 'region');

    var scroller = root.querySelector('.tt-scroller');
    scroller.addEventListener('scroll', throttleRAF(function () {
      self.emit('scroll', { scrollTop: scroller.scrollTop });
      if (self._virtual) {
        var tbody = root.querySelector('tbody');
        if (tbody) self.renderBody(true);
      }
      if (self.mode === 'infinite' && scroller.scrollTop + scroller.clientHeight > scroller.scrollHeight - 200) {
        // infinite: append more
        if (self._pageEnd < self._dataTotal) {
          self._pageEnd = Math.min(self._dataTotal, self._pageEnd + self.pageSize);
          self.render(true);
          self.emit('infiniteLoadMore', { loaded: self._pageEnd });
        }
      }
    }));
    scroller.addEventListener('click', function (e) { self._onClick(e); });
    scroller.addEventListener('dblclick', function (e) { self._onDblClick(e); });
    scroller.addEventListener('contextmenu', function (e) { self._onContext(e); });
    scroller.addEventListener('keydown', function (e) { self._onKey(e); });
    scroller.addEventListener('mousedown', function (e) { self._onMouseDown(e); });
    scroller.addEventListener('change', function (e) { self._onChange(e); });
    scroller.addEventListener('input', function (e) { self._onInput(e); });
    document.addEventListener('mousedown', function (e) { self._onDocMouseDown(e); });
    window.addEventListener('beforeprint', function () { self._printBackup = self.mode; self.setMode('all'); });
    window.addEventListener('afterprint', function () { self.setMode(self._printBackup || 'pagination'); });
  };
  TableEngine.prototype._cellFromEvent = function (e) {
    var td = e.target.closest('td,th');
    if (!td || !this._elRoot.contains(td)) return null;
    var tr = td.closest('tr');
    if (!tr) return null;
    var col = td.dataset.col;
    var ci = parseInt(td.dataset.i || '0', 10);
    var vi = tr.dataset.vi !== undefined ? parseInt(tr.dataset.vi, 10) : -1;
    return { td: td, tr: tr, col: col, ci: ci, vi: vi, vr: vi >= 0 ? this.visibleRows[vi] : null, row: tr.dataset.rowid ? this._row(tr.dataset.rowid) : null };
  };

  /* ---------- events from UI (implemented in engine-ui.js) ---------- */
  TableEngine.prototype._onClick = function (e) { };
  TableEngine.prototype._onDblClick = function (e) { };
  TableEngine.prototype._onContext = function (e) { };
  TableEngine.prototype._onKey = function (e) { };
  TableEngine.prototype._onMouseDown = function (e) { };
  TableEngine.prototype._onChange = function (e) { };
  TableEngine.prototype._onInput = function (e) { };
  TableEngine.prototype._onDocMouseDown = function (e) { };

  /* ---------- factory ---------- */
  TableEngine.version = '1.0.0';
  TableEngine._internals = { esc: esc, uid: uid, clamp: clamp, deepClone: deepClone, testOperator: testOperator, dateBounds: dateBounds, fuzzyMatch: fuzzyMatch, naturalCompare: naturalCompare, debounce: debounce };
  TableEngine.create = function (config) {
    var eng = new TableEngine(config);
    if (window.TableEngineUI) window.TableEngineUI.build(eng);
    return eng;
  };
  window.TableEngine = TableEngine;
})();
