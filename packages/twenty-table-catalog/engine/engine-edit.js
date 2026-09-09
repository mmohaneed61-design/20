/*
 * twenty-table-catalog / engine/engine-edit.js
 * محرك الجدول المتقدم — التحرير: التنقل بلوحة المفاتيح، المحررات، التحقق،
 * النسخ واللصق، الملء التلقائي، التحديد بالنطاق
 * MIT License — see ../LICENSE
 */
(function () {
  'use strict';
  var T = window.TableEngine._internals;
  var esc = T.esc;

  /* ---------- focus helpers ---------- */
  TableEngine.prototype._focusDataIndex = function () {
    // map focus.ri (position in visibleRows) — keep it as-is; nav skips group rows
    return this.focus.ri;
  };
  TableEngine.prototype._isDataVisible = function (vi) {
    var vr = this.visibleRows[vi];
    return vr && vr.kind === 'data';
  };
  TableEngine.prototype._moveFocus = function (dr, dc) {
    var vr = this.visibleRows;
    if (!vr.length) return;
    var maxR = vr.length - 1;
    var maxC = this.visibleCols.length - 1;
    var r = this.focus.ri, c = this.focus.ci;
    if (dr) {
      do { r = clamp2(r + dr, 0, maxR); } while (!this._isDataVisible(r) && vr.length > 1);
    }
    if (dc) c = clamp2(c + dc, 0, maxC);
    this.focus.ri = r;
    this.focus.ci = c;
    this._ensureFocusVisible();
    this.render(false);
  };
  function clamp2(v, a, b) { return Math.max(a, Math.min(b, v)); }
  TableEngine.prototype._focusRow = function (rowId) {
    for (var i = 0; i < this.visibleRows.length; i++) {
      if (this.visibleRows[i].kind === 'data' && this.visibleRows[i].row._id === rowId) {
        this.focus.ri = i;
        return;
      }
    }
  };

  /* ---------- click ---------- */
  TableEngine.prototype._onClick = function (e) {
    var self = this;
    var act = e.target.closest('[data-action]');
    if (act) {
      var a = act.dataset.action;
      if (a === 'clear-all') { this.clearFilters(); if (this._inputGlobal) this._inputGlobal.value = ''; this.global = ''; this.render(true); this.toast('تم مسح كل الفلاتر', 'success'); }
      if (a === 'retry') { this.setError(null); this.setLoading(false); this.toast('تمت إعادة المحاولة', 'success'); }
      return;
    }
    if (e.target.closest('.tt-toolbar') || e.target.closest('.tt-titlebar')) return;
    this._commitEditingIfAny(e);
    var cell = this._cellFromEvent(e);
    if (!cell || !cell.td) return;
    // checkbox selection
    var sel = e.target.closest('input[data-sel]');
    if (sel) {
      var id = sel.dataset.sel;
      if (sel.checked) this.selection[id] = true;
      else delete this.selection[id];
      this.emit('rowSelected', { rowId: id, selected: sel.checked });
      this.render(false);
      e.stopPropagation();
      return;
    }
    // group header → toggle
    var gtr = cell.tr && cell.tr.classList.contains('tr-group');
    if (gtr) {
      this.toggleGroup(gtr.dataset.path);
      return;
    }
    if (!cell.vr || cell.vr.kind !== 'data') return;
    var rowId = cell.vr.row._id;
    // range selection with shift
    if (e.shiftKey && this._anchorRowId) {
      var a = this._anchorRowId;
      var ai = -1, bi = -1;
      this.visibleRows.forEach(function (v, i) {
        if (v.kind === 'data' && v.row._id === a) ai = i;
        if (v.kind === 'data' && v.row._id === rowId) bi = i;
      });
      if (ai !== -1 && bi !== -1) {
        var lo = Math.min(ai, bi), hi = Math.max(ai, bi);
        var ids = [];
        for (var i = lo; i <= hi; i++) if (this.visibleRows[i].kind === 'data') ids.push(this.visibleRows[i].row._id);
        if (!e.ctrlKey && !e.metaKey) this.selection = {};
        ids.forEach(function (id) { self.selection[id] = true; });
        this.emit('selectionChanged', { count: Object.keys(this.selection).length, range: true });
        this.render(false);
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      if (this.selection[rowId]) { delete this.selection[rowId]; this.emit('rowDeselected', { rowId: rowId }); }
      else { this.selection[rowId] = true; this.emit('rowSelected', { rowId: rowId }); }
    } else {
      this.selection = {};
      this.selection[rowId] = true;
      this.emit('rowSelected', { rowId: rowId });
    }
    this._anchorRowId = rowId;
    this.focus.ri = cell.vi;
    if (cell.ci !== undefined && !isNaN(cell.ci)) this.focus.ci = cell.ci;
    this.emit('cellClicked', { rowId: rowId, column: cell.col });
    this.render(false);
    var sc = this._el('.tt-scroller');
    if (sc && document.activeElement !== sc && !sc.contains(document.activeElement)) {
      try { sc.focus({ preventScroll: true }); } catch (e2) { sc.focus(); }
    }
  };

  /* commit an open editor when the user clicks away (before processing the click) */
  TableEngine.prototype._commitEditingIfAny = function (e) {
    if (!this.editing) return;
    if (e && e.target && e.target.closest && e.target.closest('.cell-editing')) return;
    var ed = this.editing;
    var inp = ed.input;
    var raw = inp ? (inp.type === 'checkbox' ? inp.checked : inp.value) : undefined;
    if (raw === undefined || raw === null) { this.cancelEdit(true); return; }
    this.finishEdit(ed.rowId, ed.colId, raw, true);
  };

  TableEngine.prototype._onDblClick = function (e) {
    var cell = this._cellFromEvent(e);
    if (!cell || !cell.vr || cell.vr.kind !== 'data') return;
    this.focus.ri = cell.vi;
    this.focus.ci = cell.ci || 0;
    var c = this.visibleCols[this.focus.ci];
    if (c && (c.id === '__rownum' || c.id === '__select')) return;
    this.startEdit();
  };

  /* ---------- expand row (double click on rownum or expander) ---------- */
  TableEngine.prototype.toggleExpand = function (rowId) {
    if (this.expanded[rowId]) delete this.expanded[rowId];
    else this.expanded[rowId] = true;
    this.render(true);
    this.emit('rowExpanded', { rowId: rowId, expanded: !!this.expanded[rowId] });
  };

  /* ---------- editors ---------- */
  TableEngine.prototype.startEdit = function (rowId, colId) {
    var self = this;
    if (this.editing) this.cancelEdit(true);
    var vr = this.visibleRows[this.focus.ri];
    if (!vr || vr.kind !== 'data') return;
    var row = rowId ? this._row(rowId) : vr.row;
    var c = colId ? this.colById(colId) : this.visibleCols[this.focus.ci];
    if (!row || !c) return;
    if (row._locked || c.locked) { this.toast('الصف أو العمود مقفل من التحرير', 'warning'); return; }
    if (!c.editable) { this.toast('هذا العمود للقراءة فقط', 'warning'); return; }
    var vi = -1;
    this.visibleRows.forEach(function (v, i) { if (v.kind === 'data' && v.row._id === row._id) vi = i; });
    if (vi === -1) return;
    this.editing = { rowId: row._id, colId: c.id, vi: vi, ci: this.visibleCols.indexOf(c) };
    this.emit('editStarted', { rowId: row._id, column: c.id });
    this._renderEditor(row, c);
  };
  TableEngine.prototype._renderEditor = function (row, c) {
    var self = this;
    var tbody = this._el('tbody');
    if (!tbody) return;
    var tr = tbody.querySelector('tr[data-rowid="' + row._id + '"]');
    if (!tr) { this.render(false); tr = tbody.querySelector('tr[data-rowid="' + row._id + '"]'); }
    if (!tr) return;
    var td = tr.querySelector('td[data-col="' + c.id + '"]');
    if (!td) return;
    td.classList.add('cell-editing');
    var v = row[c.id];
    var custom = this.plugins.editors[c.id] || this.plugins.editors[c.type];
    if (custom) {
      td.innerHTML = custom(v, row, c);
      var el = td.querySelector('input,select,textarea');
      if (el) { el.focus(); el.select && el.select(); }
      if (this.editing) this.editing.input = el || null;
      return;
    }
    var input = document.createElement('input');
    var opts = c.options || [];
    switch (c.type) {
      case 'longtext':
        input = document.createElement('textarea');
        input.className = 'tt-editor tt-textarea';
        input.rows = 3;
        input.value = v || '';
        var counter = document.createElement('span');
        counter.className = 'tt-counter';
        counter.textContent = (v || '').length;
        input.addEventListener('input', function () { counter.textContent = input.value.length; });
        td.innerHTML = '';
        td.appendChild(input);
        td.appendChild(counter);
        break;
      case 'number':
      case 'currency':
      case 'money':
      case 'percent':
      case 'progress':
      case 'rating':
        input.type = 'number';
        input.className = 'tt-editor';
        input.value = v === null || v === undefined ? '' : v;
        if (c.type === 'progress') { input.min = 0; input.max = 100; input.step = 1; }
        if (c.type === 'rating') { input.min = 0; input.max = 5; input.step = 1; }
        if (c.type === 'currency' || c.type === 'money') { input.step = '0.01'; }
        break;
      case 'date':
        input.type = 'date';
        input.className = 'tt-editor';
        input.value = v || '';
        break;
      case 'time':
        input.type = 'time';
        input.className = 'tt-editor';
        input.value = v || '';
        break;
      case 'datetime':
        input.type = 'datetime-local';
        input.className = 'tt-editor';
        input.value = v ? String(v).slice(0, 16) : '';
        break;
      case 'color':
        input.type = 'color';
        input.className = 'tt-editor tt-editor-color';
        input.value = typeof v === 'string' && v ? v : '#888888';
        break;
      case 'boolean':
        input.type = 'checkbox';
        input.className = 'tt-editor';
        input.checked = !!v;
        break;
      case 'select':
        input = document.createElement('select');
        input.className = 'tt-editor';
        input.innerHTML = '<option value=""></option>' + opts.map(function (o) {
          var val = typeof o === 'object' ? o.value : o;
          var lab = typeof o === 'object' ? o.label : o;
          return '<option value="' + esc(val) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(lab) + '</option>';
        }).join('');
        break;
      case 'multiselect':
        input.type = 'text';
        input.className = 'tt-editor';
        input.value = Array.isArray(v) ? v.join(', ') : (v || '');
        input.placeholder = 'قيم مفصولة بفواصل (tags)';
        break;
      case 'url':
        input.type = 'url';
        input.className = 'tt-editor';
        input.value = v || '';
        input.placeholder = 'https://';
        break;
      case 'email':
        input.type = 'email';
        input.className = 'tt-editor';
        input.value = v || '';
        break;
      case 'phone':
        input.type = 'tel';
        input.className = 'tt-editor';
        input.value = v || '';
        input.dir = 'ltr';
        break;
      case 'file':
        input.type = 'file';
        input.className = 'tt-editor';
        break;
      default:
        input.type = c.autoComplete === 'off' ? 'text' : 'text';
        input.className = 'tt-editor';
        input.value = v === null || v === undefined ? '' : String(v);
        input.placeholder = c.placeholder || '';
        if (opts.length) {
          var dl = document.createElement('datalist');
          dl.id = 'dl_' + c.id + '_' + Date.now();
          dl.innerHTML = opts.map(function (o) {
            var val = typeof o === 'object' ? o.value : o;
            var lab = typeof o === 'object' ? o.label : o;
            return '<option value="' + esc(val) + '">' + esc(lab) + '</option>';
          }).join('');
          td.appendChild(dl);
          input.setAttribute('list', dl.id);
        }
    }
    td.innerHTML = '';
    td.appendChild(input);
    if (this.editing) this.editing.input = input;
    input.focus();
    if (input.select) {
      if (c.type === 'select') input.focus();
      else setTimeout(function () { input.select(); }, 0);
    }
    if (c.type === 'file') {
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        if (!f) return;
        if (f.type.indexOf('image/') === 0 && f.size < 400000) {
          var rd = new FileReader();
          rd.onload = function () { self.finishEdit(row._id, c.id, { _file: f.name, _fileData: rd.result }, true); };
          rd.readAsDataURL(f);
        } else {
          self.finishEdit(row._id, c.id, f.name, true);
        }
      });
      return;
    }
    if (c.type === 'boolean') {
      input.addEventListener('change', function () { self.finishEdit(row._id, c.id, input.checked, true); });
      return;
    }
    var saved = false;
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter' && c.type !== 'longtext') { e.preventDefault(); self.finishEdit(row._id, c.id, input.value, true, 'down'); }
      else if (e.key === 'Enter' && e.altKey && c.type === 'longtext') { e.preventDefault(); var pos = input.selectionStart; input.value = input.value.slice(0, pos) + '\n' + input.value.slice(pos); }
      else if (e.key === 'Tab') { e.preventDefault(); self.finishEdit(row._id, c.id, input.value, true, e.shiftKey ? 'left' : 'right'); }
      else if (e.key === 'Escape') { e.preventDefault(); self.cancelEdit(); }
      else if (e.key === 'Enter' && c.type === 'longtext' && e.ctrlKey) { e.preventDefault(); self.finishEdit(row._id, c.id, input.value, true); }
    });
    input.addEventListener('blur', function () {
      if (!saved) setTimeout(function () { if (self.editing && self.editing.rowId === row._id) self.finishEdit(row._id, c.id, input.value, true); }, 100);
    });
  };
  TableEngine.prototype.finishEdit = function (rowId, colId, rawValue, commit, move) {
    var c = this.colById(colId);
    if (!c || !this.editing) { this.render(false); return; }
    var row = this._row(rowId);
    var value = parseValue(c, rawValue);
    this.editing = null;
    if (commit && row) {
      var res = this.updateCell(rowId, colId, value);
      if (!res.ok) {
        this.toast('⚠ ' + res.error, 'error');
        this.emit('validationError', { rowId: rowId, column: colId, error: res.error });
      } else if (res.changed) {
        // keep focus
        this._focusRow(rowId);
      }
    }
    this.render(false);
    this.emit('editEnded', { rowId: rowId, column: colId, committed: commit, value: value });
    if (move) {
      if (move === 'down') this._moveFocus(1, 0);
      // Tab/Shift+Tab always move in reading (DOM) order, which is visually
      // right in LTR and left in RTL — same index delta in both directions
      if (move === 'right') this._moveFocus(0, 1);
      if (move === 'left') this._moveFocus(0, -1);
      // reopen edit in new cell
      var c2 = this.visibleCols[this.focus.ci];
      var vr2 = this.visibleRows[this.focus.ri];
      if (c2 && vr2 && vr2.kind === 'data' && c2.editable && c2.id !== '__rownum' && c2.id !== '__select') this.startEdit();
    }
  };
  TableEngine.prototype.cancelEdit = function (silent) {
    if (!this.editing) return;
    var e = this.editing;
    this.editing = null;
    if (!silent) this.render(false);
    this.emit('editEnded', { rowId: e.rowId, column: e.colId, committed: false });
  };
  function parseValue(c, v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'object' && v._file) return v;
    if (typeof v === 'boolean') return v;
    var s = String(v).trim();
    if (s === '') return null;
    switch (c.type) {
      case 'number': case 'currency': case 'money': case 'percent': case 'progress': case 'rating':
        var n = parseFloat(s);
        return isNaN(n) ? null : n;
      case 'multiselect':
        return s.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      case 'boolean': return v === true || s === 'true' || s === '1';
      default: return s;
    }
  }

  /* ---------- keyboard ---------- */
  TableEngine.prototype._onKey = function (e) {
    var self = this;
    var k = e.key;
    var ctrl = e.ctrlKey || e.metaKey;
    var scroller = this._el('.tt-scroller');

    if (this.editing) return; // editor handles its own keys

    // global shortcuts (work even when focus not in table)
    if (k === '/' && !ctrl) { e.preventDefault(); this._focusGlobalSearch(); return; }
    if (ctrl && (k === 'f' || k === 'F')) { e.preventDefault(); this._focusGlobalSearch(); return; }
    if (ctrl && (k === 's' || k === 'S')) { e.preventDefault(); this._saveNow(); return; }
    if (ctrl && (k === 'p' || k === 'P')) { e.preventDefault(); window.print(); this.emit('print', {}); return; }
    if (ctrl && (k === 'g' || k === 'G')) { e.preventDefault(); if (window.TableEngineUI) window.TableEngineUI.gotoDialog(this); return; }
    if (k === '?' || (k === '/' && e.shiftKey)) { e.preventDefault(); if (window.TableEngineUI) window.TableEngineUI.shortcutsDialog(this); return; }
    if (k === 'F5') { e.preventDefault(); this.refresh(); return; }

    var ae = document.activeElement;
    if (ae !== scroller && ae !== document.body && ae !== document.documentElement && !this._elRoot.contains(ae)) return;

    // selection
    if (ctrl && (k === 'a' || k === 'A')) {
      e.preventDefault();
      this.visibleRows.forEach(function (v) { if (v.kind === 'data') self.selection[v.row._id] = true; });
      this.emit('selectionChanged', { count: Object.keys(this.selection).length, all: true });
      this.render(false);
      return;
    }
    if (ctrl && (k === 'c' || k === 'C')) { e.preventDefault(); this.copySelection('tsv'); return; }
    if (ctrl && (k === 'x' || k === 'X')) { e.preventDefault(); this.copySelection('tsv', true); return; }
    if (ctrl && (k === 'v' || k === 'V')) { e.preventDefault(); this.pasteClipboard(); return; }
    if (ctrl && (k === 'z' || k === 'Z') && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
    if ((ctrl && (k === 'y' || k === 'Y')) || (ctrl && e.shiftKey && (k === 'z' || k === 'Z'))) { e.preventDefault(); this.redo(); return; }
    if (ctrl && (k === 'd' || k === 'D')) { e.preventDefault(); this.fill('down'); return; }
    if (ctrl && (k === 'r' || k === 'R')) { e.preventDefault(); this.fill('right'); return; }
    if (ctrl && k === 'Insert') { e.preventDefault(); this._insertRowAtFocus('above'); return; }
    if (ctrl && k === 'Delete') { e.preventDefault(); this._deleteRowAtFocus(); return; }

    switch (k) {
      case 'ArrowDown':
        e.preventDefault();
        if (ctrl) this._jumpToEdge('row', 1);
        else this._moveFocus(1, 0);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (ctrl) this._jumpToEdge('row', -1);
        else this._moveFocus(-1, 0);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (ctrl) this._jumpToEdge('col', this.direction === 'rtl' ? -1 : 1);
        else if (e.shiftKey) { this._moveFocus(0, this.direction === 'rtl' ? -1 : 1); this._rangeExtend(); }
        else this._moveFocus(0, this.direction === 'rtl' ? -1 : 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (ctrl) this._jumpToEdge('col', this.direction === 'rtl' ? 1 : -1);
        else if (e.shiftKey) { this._moveFocus(0, this.direction === 'rtl' ? 1 : -1); this._rangeExtend(); }
        else this._moveFocus(0, this.direction === 'rtl' ? 1 : -1);
        break;
      case 'Home': e.preventDefault(); this.focus.ci = 0; this.render(false); break;
      case 'End': e.preventDefault(); this.focus.ci = this.visibleCols.length - 1; this.render(false); break;
      case 'PageDown': e.preventDefault(); scroller && (scroller.scrollTop += scroller.clientHeight - 40); break;
      case 'PageUp': e.preventDefault(); scroller && (scroller.scrollTop -= scroller.clientHeight - 40); break;
      case 'Enter':
        e.preventDefault();
        this.startEdit();
        break;
      case 'F2':
        e.preventDefault();
        this.startEdit();
        break;
      case 'Escape':
        e.preventDefault();
        if (window.TableEngineUI) window.TableEngineUI.closeOverlays(this);
        if (this._inputGlobal && document.activeElement === this._inputGlobal) { this._inputGlobal.value = ''; this.setGlobal(''); }
        this.selection = {};
        this.render(false);
        break;
      case ' ':
        var cc = this.visibleCols[this.focus.ci];
        if (cc && cc.type === 'boolean') {
          e.preventDefault();
          var vr = this.visibleRows[this.focus.ri];
          if (vr && vr.kind === 'data') this.updateCell(vr.row._id, cc.id, !vr.row[cc.id]);
        }
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        this._clearCellAtFocus();
        break;
    }
    // Ctrl+Home / Ctrl+End
    if (ctrl && k === 'Home') { e.preventDefault(); this.focus.ri = 0; this.focus.ci = 0; this._ensureFocusVisible(); this.render(false); }
    if (ctrl && k === 'End') { e.preventDefault(); this.focus.ri = this.visibleRows.length - 1; this.focus.ci = this.visibleCols.length - 1; this._ensureFocusVisible(); this.render(false); }
  };
  TableEngine.prototype._jumpToEdge = function (axis, dir) {
    if (axis === 'row') this.focus.ri = dir < 0 ? 0 : this.visibleRows.length - 1;
    else this.focus.ci = dir < 0 ? 0 : this.visibleCols.length - 1;
    this._ensureFocusVisible();
    this.render(false);
  };
  TableEngine.prototype._rangeExtend = function () {
    var vr = this.visibleRows[this.focus.ri];
    if (vr && vr.kind === 'data') {
      if (this._anchorRowId === undefined) this._anchorRowId = vr.row._id;
      var a = this._anchorRowId;
      var ai = -1, bi = -1;
      this.visibleRows.forEach(function (v, i) {
        if (v.kind === 'data' && v.row._id === a) ai = i;
        if (v.kind === 'data' && v.row._id === vr.row._id) bi = i;
      });
      if (ai !== -1 && bi !== -1) {
        var lo = Math.min(ai, bi), hi = Math.max(ai, bi);
        this.selection = {};
        for (var i = lo; i <= hi; i++) if (this.visibleRows[i].kind === 'data') this.selection[this.visibleRows[i].row._id] = true;
        this.emit('selectionChanged', { count: hi - lo + 1, range: true });
        this.render(false);
      }
    }
  };
  TableEngine.prototype._clearCellAtFocus = function () {
    var vr = this.visibleRows[this.focus.ri];
    if (!vr || vr.kind !== 'data') return;
    var c = this.visibleCols[this.focus.ci];
    if (!c || c.id === '__rownum' || c.id === '__select' || !c.editable) return;
    this.updateCell(vr.row._id, c.id, null);
    this.toast('تم مسح الخلية', 'info');
  };
  TableEngine.prototype._insertRowAtFocus = function (where) {
    var vr = this.visibleRows[this.focus.ri];
    var base = vr && vr.kind === 'data' ? vr.row : null;
    var idx = base ? this.rows.indexOf(base) : 0;
    var row = this.addRow(null, where === 'above' ? idx : idx + 1);
    this._focusRow(row._id);
    this.render(true);
  };
  TableEngine.prototype._deleteRowAtFocus = function () {
    var vr = this.visibleRows[this.focus.ri];
    if (!vr || vr.kind !== 'data') return;
    this.deleteRow(vr.row._id);
  };
  TableEngine.prototype._focusGlobalSearch = function () {
    var inp = document.querySelector('.tt-globalsearch input') || (window.TableEngineUI && window.TableEngineUI._globalSearchInput());
    if (inp) { inp.focus(); inp.select(); }
  };
  TableEngine.prototype._saveNow = function () {
    this._save();
    this.toast('تم الحفظ', 'success');
    this.emit('afterSave', {});
  };

  /* ---------- fill down / right ---------- */
  TableEngine.prototype.fill = function (dir) {
    var vr = this.visibleRows[this.focus.ri];
    if (!vr || vr.kind !== 'data') return;
    var c = this.visibleCols[this.focus.ci];
    if (!c || c.id === '__rownum' || c.id === '__select' || !c.editable) return;
    var src = vr.row[c.id];
    if (src === null || src === undefined || src === '') { this.toast('الخلية المصدر فارغة', 'warning'); return; }
    var count = 0;
    if (dir === 'down') {
      for (var r = this.focus.ri + 1; r < this.visibleRows.length && count < 200; r++) {
        var v2 = this.visibleRows[r];
        if (v2 && v2.kind === 'data' && (v2.row[c.id] === null || v2.row[c.id] === undefined || v2.row[c.id] === '')) {
          this.updateCell(v2.row._id, c.id, src, { skipValidation: true });
          count++;
        }
      }
    } else {
      for (var ci = this.focus.ci + 1; ci < this.visibleCols.length; ci++) {
        var c2 = this.visibleCols[ci];
        if (c2.id === '__rownum' || c2.id === '__select' || !c2.editable) continue;
        if (vr.row[c2.id] === null || vr.row[c2.id] === undefined || vr.row[c2.id] === '') {
          this.updateCell(vr.row._id, c2.id, src, { skipValidation: true });
          count++;
        }
      }
    }
    this.toast('تم ملء ' + count + ' خلية ' + (dir === 'down' ? 'للأسفل' : 'لليمين'), 'success');
    this.emit('fillApplied', { direction: dir, count: count });
  };

  /* ---------- clipboard ---------- */
  TableEngine.prototype._selectionRows = function () {
    var ids = Object.keys(this.selection);
    if (ids.length) {
      return this.rows.filter(function (r) { return self2_sel(ids, r); });
    }
    var vr = this.visibleRows[this.focus.ri];
    return vr && vr.kind === 'data' ? [vr.row] : [];
  };
  function self2_sel(ids, r) { return ids.indexOf(r._id) !== -1; }
  TableEngine.prototype._serialize = function (format) {
    var self = this;
    var rows = this._selectionRows();
    var cols = this.visibleCols.filter(function (c) { return c.id !== '__select'; });
    var flat = rows.map(function (r) {
      return cols.map(function (c) {
        if (c.id === '__rownum') return String(self.rows.indexOf(r) + 1);
        var v = r[c.id];
        return v === null || v === undefined ? '' : (Array.isArray(v) ? v.join(', ') : String(v));
      });
    });
    var head = cols.map(function (c) { return c.title; });
    if (format === 'csv' || format === 'tsv') {
      var sep = format === 'csv' ? ',' : '\t';
      var q = function (s) { s = String(s == null ? '' : s); return s.indexOf(sep) !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1 ? '"' + s.replace(/"/g, '""') + '"' : s; };
      return [head.map(q).join(sep)].concat(flat.map(function (r) { return r.map(q).join(sep); })).join('\n');
    }
    if (format === 'json') {
      return JSON.stringify(rows.map(function (r) {
        var o = {};
        cols.forEach(function (c) { if (c.id !== '__rownum') o[c.title] = r[c.id]; });
        return o;
      }, this), null, 2);
    }
    if (format === 'html') {
      return '<table><thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        flat.map(function (r) { return '<tr>' + r.map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    }
    if (format === 'markdown') {
      return '| ' + head.join(' | ') + ' |\n|' + head.map(function () { return '---|'; }).join('') + '\n' +
        flat.map(function (r) { return '| ' + r.map(function (v) { return String(v).replace(/\|/g, '\\|'); }).join(' | ') + ' |'; }).join('\n');
    }
    return '';
  };
  TableEngine.prototype.copySelection = function (format, cut) {
    var text = this._serialize(format || 'tsv');
    var self = this;
    writeClipboard(text).then(function () {
      self.toast('تم نسخ ' + (self._selectionRows().length) + ' صف (' + (format || 'TSV').toUpperCase() + ')', 'success');
      self.emit('copied', { format: format || 'tsv' });
      if (cut) {
        var ids = Object.keys(self.selection);
        ids.forEach(function (id) { self.deleteRow(id, true); });
      }
    }).catch(function () {
      self.toast('تعذر النسخ للحافظة — استخدم Ctrl+C في المتصفح', 'warning');
    });
  };
  TableEngine.prototype.pasteClipboard = function (text) {
    var self = this;
    var doPaste = function (t) {
      var parsed = parseClipboard(t);
      if (!parsed.length) { self.toast('لا يوجد نص صالح للصق', 'warning'); return; }
      var start = self.focus.ri;
      var vr = self.visibleRows[start];
      var baseRow = vr && vr.kind === 'data' ? self.rows.indexOf(vr.row) : self.rows.length - 1;
      var cols = self.visibleCols.filter(function (c) { return c.id !== '__select' && c.id !== '__rownum'; });
      parsed.forEach(function (vals, i) {
        var row = baseRow + i < self.rows.length ? self.rows[baseRow + i] : self.addRow(null, self.rows.length);
        if (baseRow + i < self.rows.length) { /* update */ } else { /* new row appended */ }
        cols.forEach(function (c, ci) {
          var v = vals[ci];
          if (v === undefined || v === '') return;
          var parsed2 = parseValue(c, v);
          self.updateCell(row._id, c.id, parsed2, { skipValidation: true });
        });
      });
      self.toast('تم لصق ' + parsed.length + ' صف', 'success');
      self.emit('pasted', { rows: parsed.length });
    };
    if (text !== undefined) { doPaste(text); return; }
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(doPaste).catch(function () {
        if (window.TableEngineUI) window.TableEngineUI.pasteDialog(self, doPaste);
      });
    } else if (window.TableEngineUI) {
      window.TableEngineUI.pasteDialog(self, doPaste);
    }
  };
  function parseClipboard(t) {
    t = (t || '').replace(/\n$/, '');
    var lines = t.split('\n');
    if (!lines.length) return [];
    var sep = lines[0].indexOf('\t') !== -1 ? '\t' : ',';
    if (sep === ',' && lines[0].split(',').length < 2 && t.indexOf('\t') === -1) {
      // single column
      return lines.map(function (l) { return [l]; });
    }
    return lines.map(function (l) {
      return l.split(sep).map(function (s) { return s.replace(/^"|"$/g, '').replace(/""/g, '"'); });
    });
  }
  function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (res, rej) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy') ? res() : rej(new Error('copy failed')); } catch (e) { rej(e); }
      ta.remove();
    });
  }
  window._ttWriteClipboard = writeClipboard;
})();
