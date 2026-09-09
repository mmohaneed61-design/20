/*
 * twenty-table-catalog / engine/engine-ui.js
 * محرك الجدول المتقدم — الواجهة: شريط الأدوات، لوحة الفلاتر، القائمة السياقية،
 * الحوارات، شريط الحالة، القوائم المنسدلة
 * MIT License — see ../LICENSE
 */
(function () {
  'use strict';
  var esc = window.TableEngine._internals.esc;
  var debounce = window.TableEngine._internals.debounce;

  var FILTER_OPS = {
    text: [
      ['none', 'بدون فلتر'], ['contains', 'يحتوي'], ['notContains', 'لا يحتوي'],
      ['equals', 'يساوي'], ['notEquals', 'لا يساوي'], ['startsWith', 'يبدأ بـ'],
      ['endsWith', 'ينتهي بـ'], ['isEmpty', 'فارغ'], ['isNotEmpty', 'غير فارغ'],
      ['inList', 'في قائمة (فواصل)'], ['notInList', 'ليس في قائمة'], ['regex', 'تعبير عادي']
    ],
    number: [
      ['none', 'بدون فلتر'], ['equals', 'يساوي'], ['notEquals', 'لا يساوي'],
      ['gt', 'أكبر من'], ['lt', 'أقل من'], ['gte', 'أكبر من أو يساوي'],
      ['lte', 'أقل من أو يساوي'], ['between', 'بين قيمتين'], ['notBetween', 'ليس بين'],
      ['isEmpty', 'فارغ'], ['isNotEmpty', 'غير فارغ']
    ],
    date: [
      ['none', 'بدون فلتر'], ['today', 'اليوم'], ['yesterday', 'الأمس'],
      ['thisWeek', 'هذا الأسبوع'], ['lastWeek', 'الأسبوع الماضي'],
      ['thisMonth', 'هذا الشهر'], ['lastMonth', 'الشهر الماضي'],
      ['thisYear', 'هذه السنة'], ['lastYear', 'السنة الماضية'],
      ['last7', 'آخر 7 أيام'], ['last30', 'آخر 30 يوم'], ['last90', 'آخر 90 يوم'],
      ['before', 'قبل تاريخ'], ['after', 'بعد تاريخ'], ['isEmpty', 'فارغ']
    ]
  };
  function opsForType(t) {
    if (t === 'number' || t === 'currency' || t === 'money' || t === 'percent' || t === 'progress' || t === 'rating') return FILTER_OPS.number;
    if (t === 'date' || t === 'datetime' || t === 'time') return FILTER_OPS.date;
    return FILTER_OPS.text;
  }

  var UI = {
    _open: null,
    _fps: { frames: 0, last: 0, value: 0, raf: null },
    _dragCol: null,

    build: function (eng) {
      this._buildToolbar(eng);
      this._bindHeader(eng);
      this._bindRowDrag(eng);
      eng.on('rendered', function () { UI._statusBar(eng); });
      eng.on('selectionChanged', function () { UI._statusBar(eng); });
      eng.on('toast', function (p) { UI.toast(eng, p.message, p.type); });
      UI._statusBar(eng);
      var sb = eng._el('.tt-statusbar');
      if (sb) sb.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-pg]');
        if (!b || b.disabled) return;
        var v = b.dataset.pg;
        if (v === 'prev') eng.goToPage(Math.max(1, eng.page - 1));
        else if (v === 'next') eng.goToPage(Math.min(eng.pageCount(), eng.page + 1));
        else eng.goToPage(parseInt(v, 10));
      });
    },

    /* ================= toolbar ================= */
    _buildToolbar: function (eng) {
      var self = this;
      var tb = eng._el('.tt-toolbar');
      if (!tb) return;
      tb.innerHTML =
        '<div class="tt-globalsearch">' +
        '<span class="tt-gs-icon" aria-hidden="true">🔍</span>' +
        '<input type="search" placeholder="بحث فوري في كل الأعمدة…  ( / )" aria-label="بحث عام" />' +
        '<kbd class="tt-gs-kbd">/</kbd>' +
        '</div>' +
        '<div class="tt-tb-actions">' +
        '<button class="t-btn t-btn--icon" data-tb="undo" title="تراجع (Ctrl+Z)">↶</button>' +
        '<button class="t-btn t-btn--icon" data-tb="redo" title="إعادة (Ctrl+Y)">↷</button>' +
        '<span class="tt-tb-sep"></span>' +
        '<button class="t-btn" data-tb="views">👁 العروض ▾</button>' +
        '<button class="t-btn" data-tb="filter">🧭 فلترة <span class="tt-filter-badge" hidden>0</span> ▾</button>' +
        '<button class="t-btn" data-tb="sort">⇅ ترتيب </button>' +
        '<button class="t-btn" data-tb="group">🗂 تجميع ▾</button>' +
        '<button class="t-btn" data-tb="columns">📊 أعمدة ▾</button>' +
        '<span class="tt-tb-sep"></span>' +
        '<button class="t-btn" data-tb="row">+ صف</button>' +
        '<button class="t-btn" data-tb="import">⬆ استيراد ▾</button>' +
        '<button class="t-btn" data-tb="export">⬇ تصدير ▾</button>' +
        '<span class="tt-tb-sep"></span>' +
        '<button class="t-btn t-btn--icon" data-tb="density" title="الكثافة">Aa</button>' +
        '<button class="t-btn t-btn--icon" data-tb="theme" title="الثيم">🌙</button>' +
        '<button class="t-btn t-btn--icon" data-tb="dir" title="الاتجاه">RTL</button>' +
        '<button class="t-btn t-btn--icon" data-tb="perf" title="الأداء">📈</button>' +
        '<button class="t-btn t-btn--icon" data-tb="shortcuts" title="الاختصارات">؟</button>' +
        '<button class="t-btn t-btn--icon" data-tb="settings" title="الإعدادات">⚙</button>' +
        '</div>';

      var gs = tb.querySelector('.tt-globalsearch input');
      eng._inputGlobal = gs;
      gs.addEventListener('input', debounce(function (e) {
        eng.setGlobal(e.target.value);
        eng.announce('تم العثور على ' + eng.dataRowCount() + ' خاصية');
      }, 150));

      tb.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-tb]');
        if (!b) return;
        e.stopPropagation();
        var a = b.dataset.tb;
        var rect = b.getBoundingClientRect();
        switch (a) {
          case 'undo': eng.undo(); break;
          case 'redo': eng.redo(); break;
          case 'views': self._menu(eng, self._viewsMenu(eng), rect); break;
          case 'filter':
            var fm = self._menu(eng, self._filterMenu(eng), rect, true);
            self._filterMenuAction(eng, fm);
            break;
          case 'sort': self._menu(eng, self._sortMenu(eng), rect); break;
          case 'group': self._menu(eng, self._groupMenu(eng), rect); break;
          case 'columns': self._menu(eng, self._columnsMenu(eng), rect); break;
          case 'row':
            var vr = eng.visibleRows[eng.focus.ri];
            if (vr && vr.kind === 'data') eng.insertRow(vr.row._id, 'below');
            else eng.addRow(null);
            eng.toast('تمت إضافة صف', 'success');
            break;
          case 'import': self._menu(eng, self._importMenu(eng), rect); break;
          case 'export':
            var em = self._menu(eng, self._exportMenu(eng), rect, true);
            var seg = em.querySelector('.tt-exp-scope');
            if (seg) seg.addEventListener('click', function (e) {
              var b = e.target.closest('button[data-scope]');
              if (!b) return;
              seg.querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
              b.classList.add('active');
            });
            break;
          case 'density': {
            var next = { comfortable: 'normal', normal: 'compact', compact: 'comfortable' }[eng.density];
            eng.setDensity(next);
            eng.toast('الكثافة: ' + next, 'info');
            break;
          }
          case 'theme': {
            var t = eng.theme === 'dark' ? 'light' : 'dark';
            eng.setTheme(t);
            b.textContent = t === 'dark' ? '☀️' : '🌙';
            break;
          }
          case 'dir': {
            var d = eng.direction === 'rtl' ? 'ltr' : 'rtl';
            eng.setDirection(d);
            b.textContent = d.toUpperCase();
            break;
          }
          case 'perf': self._perfPanel(eng, rect); break;
          case 'shortcuts': self.shortcutsDialog(eng); break;
          case 'settings': self._settingsDialog(eng); break;
        }
      });
      // sync global search from outside
      eng._syncGlobalSearch = function (v) { gs.value = v || ''; };
    },

    _menu: function (eng, items, rect, isForm) {
      var self = this;
      this.closeOverlays(eng);
      var m = document.createElement('div');
      m.className = 't-menu';
      m.innerHTML = items.map(function (it) {
        if (it.sep) return '<div class="t-menu-sep"></div>';
        if (it.label) return '<div class="t-menu-label">' + esc(it.label) + '</div>';
        if (it.html) return it.html;
        return '<button class="t-menu-item" data-mi="' + it.id + '"' + (it.disabled ? ' disabled' : '') + '>' +
          (it.icon ? '<span class="t-menu-icon">' + it.icon + '</span>' : '') +
          '<span>' + esc(it.label2 || it.name || '') + '</span>' +
          (it.kbd ? '<span class="t-menu-kbd">' + esc(it.kbd) + '</span>' : '') +
          '</button>';
      }).join('');
      document.body.appendChild(m);
      // position
      var mw = m.offsetWidth, mh = m.offsetHeight;
      var top = rect.bottom + 4;
      var left = rect.right - mw;
      if (left < 8) left = 8;
      if (top + mh > window.innerHeight - 8) top = rect.top - mh - 4;
      m.style.top = top + 'px';
      m.style.left = left + 'px';
      m.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-mi]');
        if (!b || b.disabled) return;
        var item = items.find(function (i) { return i.id === b.dataset.mi; });
        if (item && item.action) item.action(eng, m);
        if (!isForm) self.closeOverlays(eng);
      });
      this._open = m;
      setTimeout(function () {
        document.addEventListener('mousedown', function onDoc(e) {
          if (!m.contains(e.target)) { self.closeOverlays(eng); document.removeEventListener('mousedown', onDoc); }
        });
      }, 0);
      return m;
    },
    closeOverlays: function (eng) {
      if (this._open) { this._open.remove(); this._open = null; }
      var modal = document.querySelector('.tt-modal-wrap');
      if (modal) modal.remove();
    },

    /* ---- views menu ---- */
    _viewsMenu: function (eng) {
      var self = this;
      var items = [
        { id: 'save1', icon: '💾', name: 'حفظ كعرض 1', action: function (e) { e.saveView('عرض 1'); } },
        { id: 'save2', icon: '💾', name: 'حفظ كعرض 2', action: function (e) { e.saveView('عرض 2'); } },
        { id: 'savec', icon: '💾', name: 'حفظ كعرض مخصص…', action: function (e) {
          var name = window.prompt('اسم العرض:');
          if (name) e.saveView(name);
        } },
        { sep: true }
      ];
      Object.keys(eng.views).forEach(function (n) {
        items.push({ id: 'v_' + n, icon: '👁', name: 'تطبيق: ' + n, action: function (e) { e.applyView(n); } });
        items.push({ id: 'vd_' + n, icon: '🗑', name: 'حذف: ' + n, action: function (e) { e.deleteView(n); } });
      });
      if (!Object.keys(eng.views).length) items.push({ id: 'none', icon: 'ℹ', name: 'لا توجد عروض محفوظة', disabled: true });
      items.push({ sep: true });
      items.push({ id: 'reset', icon: '♻', name: 'إعادة تعيين كل الإعدادات', action: function (e) { if (window.confirm('إعادة تعيين كل الإعدادات؟')) e.resetState(); } });
      return items;
    },

    /* ---- filter menu (form) ---- */
    _filterMenu: function (eng) {
      var self = this;
      var items = [];
      items.push({ html: '<div class="tt-fpanel">' +
        '<div class="tt-fpanel-head"><span>منطق الجمع بين الفلاتر:</span><div class="t-seg" id="tt-logic">' +
        '<button data-logic="AND"' + (eng.filterLogic === 'AND' ? ' class="active"' : '') + '>AND</button>' +
        '<button data-logic="OR"' + (eng.filterLogic === 'OR' ? ' class="active"' : '') + '>OR</button></div></div>' +
        eng.visibleCols.filter(function (c) { return c.id !== '__rownum' && c.id !== '__select'; }).map(function (c) {
          var f = eng.filters[c.id] || { op: 'none', values: [] };
          var ops = opsForType(c.type).map(function (o) {
            return '<option value="' + o[0] + '"' + (f.op === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
          }).join('');
          var v1 = f.values ? (f.values[0] !== undefined ? f.values[0] : '') : '';
          var v2 = f.values ? (f.values[1] !== undefined ? f.values[1] : '') : '';
          var needsVal = !['isEmpty', 'isNotEmpty', 'today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'thisYear', 'lastYear', 'last7', 'last30', 'last90', 'none'].indexOf(f.op) === -1;
          var needs2 = f.op === 'between' || f.op === 'notBetween';
          return '<div class="tt-frow" data-col="' + c.id + '">' +
            '<label>' + esc(c.title) + '</label>' +
            '<select class="tt-fop">' + ops + '</select>' +
            '<input class="tt-fv1" type="' + (c.type === 'date' ? 'date' : 'text') + '" value="' + esc(String(v1)) + '" placeholder="القيمة" ' + (needsVal ? '' : 'disabled') + ' />' +
            (needs2 ? '<input class="tt-fv2" type="' + (c.type === 'date' ? 'date' : 'text') + '" value="' + esc(String(v2)) + '" placeholder="و" />' : '') +
            '</div>';
        }).join('') +
        '<div class="tt-fpanel-foot">' +
        '<button class="t-btn" data-fact="save">💾 حفظ فلتر</button>' +
        '<select class="t-select" id="tt-preset-sel"><option value="">— فلتر محفوظ —</option>' + Object.keys(presetsOf(eng)).map(function (p) { return '<option>' + esc(p) + '</option>'; }).join('') + '</select>' +
        '<button class="t-btn" data-fact="load">تحميل</button>' +
        '<button class="t-btn" data-fact="delpreset">🗑</button>' +
        '<span class="tt-fsep"></span>' +
        '<button class="t-btn t-btn--primary" data-fact="apply">✓ تطبيق</button>' +
        '<button class="t-btn t-btn--danger" data-fact="clear">مسح الكل</button>' +
        '</div></div>' });
      return items;
    },
    _filterMenuAction: function (eng, menu) {
      var self = this;
      menu.querySelectorAll('.tt-frow').forEach(function (row) {
        var col = row.dataset.col;
        row.querySelector('.tt-fop').addEventListener('change', function (e) {
          var op = e.target.value;
          var needsVal = !['isEmpty', 'isNotEmpty', 'today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'thisYear', 'lastYear', 'last7', 'last30', 'last90', 'none'].indexOf(op) === -1;
          var needs2 = op === 'between' || op === 'notBetween';
          row.querySelector('.tt-fv1').disabled = !needsVal;
          var v2 = row.querySelector('.tt-fv2');
          if (needs2 && !v2) {
            v2 = document.createElement('input');
            v2.className = 'tt-fv2';
            row.appendChild(v2);
          }
          if (v2) v2.style.display = needs2 ? '' : 'none';
        });
      });
      var logic = menu.querySelector('#tt-logic');
      if (logic) logic.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-logic]');
        if (!b) return;
        eng.filterLogic = b.dataset.logic;
        logic.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
      });
      menu.querySelector('[data-fact="apply"]').addEventListener('click', function () {
        var changes = 0;
        menu.querySelectorAll('.tt-frow').forEach(function (row) {
          var col = row.dataset.col;
          var op = row.querySelector('.tt-fop').value;
          var v1 = row.querySelector('.tt-fv1').value;
          var v2el = row.querySelector('.tt-fv2');
          var v2 = v2el ? v2el.value : '';
          if (op === 'none') { if (eng.filters[col]) { delete eng.filters[col]; changes++; } }
          else {
            var cur = eng.filters[col];
            if (!cur || cur.op !== op || (cur.values[0] || '') !== v1 || (cur.values[1] || '') !== v2) {
              eng.filters[col] = { op: op, values: [v1, v2] };
              changes++;
            }
          }
        });
        eng.page = 1;
        eng.emit('filterChanged', {});
        eng.render(true);
        self.closeOverlays(eng);
        eng.toast(changes ? 'تم تطبيق ' + changes + ' فلتر' : 'لا تغييرات', 'success');
        eng.announce('تم تطبيق الفلاتر — ' + eng.dataRowCount() + ' نتيجة');
      });
      menu.querySelector('[data-fact="clear"]').addEventListener('click', function () {
        eng.clearFilters();
        eng._syncGlobalSearch('');
        self.closeOverlays(eng);
      });
      menu.querySelector('[data-fact="save"]').addEventListener('click', function () {
        var name = window.prompt('اسم الفلتر المحفوظ:');
        if (!name) return;
        var p = presetsOf(eng);
        p[name] = { filters: JSON.parse(JSON.stringify(eng.filters)), logic: eng.filterLogic, global: eng.global };
        try { localStorage.setItem(presetKey(eng), JSON.stringify(p)); } catch (e2) { }
        eng.toast('تم حفظ الفلتر «' + name + '»', 'success');
      });
      menu.querySelector('[data-fact="load"]').addEventListener('click', function () {
        var sel = menu.querySelector('#tt-preset-sel');
        var name = sel.value;
        if (!name) { eng.toast('اختر فلترًا محفوظًا', 'warning'); return; }
        var p = presetsOf(eng)[name];
        if (p) {
          eng.filters = p.filters || {};
          eng.filterLogic = p.logic || 'AND';
          eng.global = p.global || '';
          eng._syncGlobalSearch(eng.global);
          eng.render(true);
          self.closeOverlays(eng);
        }
      });
      menu.querySelector('[data-fact="delpreset"]').addEventListener('click', function () {
        var sel = menu.querySelector('#tt-preset-sel');
        var name = sel.value;
        if (!name) return;
        var p = presetsOf(eng);
        delete p[name];
        try { localStorage.setItem(presetKey(eng), JSON.stringify(p)); } catch (e2) { }
        sel.innerHTML = '<option value="">— فلتر محفوظ —</option>' + Object.keys(p).map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('');
        eng.toast('تم حذف الفلتر', 'success');
      });
    },

    /* ---- sort menu ---- */
    _sortMenu: function (eng) {
      var items = [];
      items.push({ label: 'انقر عنوان العمود للترتيب — Shift+نقر لمتعدد الأعمدة' });
      items.push({ sep: true });
      eng.visibleCols.forEach(function (c) {
        if (c.id === '__rownum' || c.id === '__select') return;
        var s = eng.sort.find(function (x) { return x.col === c.id; });
        items.push({
          id: 's_' + c.id,
          icon: s ? (s.dir === 1 ? '▲' : '▼') : '⇅',
          name: (s ? (s.dir === 1 ? 'تصاعدي' : 'تنازلي') + ' — ' : 'ترتيب — ') + c.title,
          action: function (e) {
            if (!s) e.setSort(c.id, 'asc');
            else if (s.dir === 1) e.setSort(c.id, 'desc');
            else e.setSort(c.id, null);
          }
        });
      });
      items.push({ sep: true });
      items.push({ id: 'sclear', icon: '✕', name: 'إزالة كل الترتيب', action: function (e) { e.clearSort(); } });
      return items;
    },

    /* ---- group menu ---- */
    _groupMenu: function (eng) {
      var items = [{ label: 'التجميع حسب' }];
      eng.visibleCols.forEach(function (c) {
        if (c.id === '__rownum' || c.id === '__select') return;
        items.push({
          id: 'g_' + c.id,
          icon: eng.groupBy.indexOf(c.id) !== -1 ? '✓' : '•',
          name: c.title,
          action: function (e) {
            var i = e.groupBy.indexOf(c.id);
            if (i !== -1) e.groupBy.splice(i, 1); else e.groupBy.push(c.id);
            e.setGroupBy(e.groupBy);
          }
        });
      });
      items.push({ sep: true });
      items.push({ id: 'gexp', icon: '⊞', name: 'توسيع الكل', action: function (e) { e.collapseAll(true); } });
      items.push({ id: 'gcoll', icon: '⊟', name: 'طي الكل', action: function (e) { e.collapseAll(false); } });
      items.push({ id: 'gclear', icon: '✕', name: 'إزالة التجميع', action: function (e) { e.setGroupBy([]); } });
      return items;
    },

    /* ---- columns menu ---- */
    _columnsMenu: function (eng) {
      var items = [{ label: 'إظهار / إخفاء الأعمدة' }];
      eng.columns.forEach(function (c) {
        items.push({
          id: 'c_' + c.id,
          icon: eng.hidden[c.id] ? '☐' : '☑',
          name: c.title,
          action: function (e) { e.toggleColumn(c.id); }
        });
      });
      items.push({ sep: true });
      items.push({ id: 'cafit', icon: '↔', name: 'ملاءمة كل الأعمدة', action: function (e) { e.autoFitAll(); } });
      items.push({ id: 'calpha', icon: 'أ', name: 'ترتيب الأعمدة أبجدياً', action: function (e) { e.sortColumnsAlpha(); } });
      items.push({ id: 'creset', icon: '♻', name: 'إعادة ترتيب افتراضي', action: function (e) { e.resetColumns(); } });
      items.push({ sep: true });
      items.push({ id: 'cadd', icon: '+', name: 'إضافة عمود جديد…', action: function (e, m) { UI._addColumnDialog(e); } });
      return items;
    },

    /* ---- import menu ---- */
    _importMenu: function (eng) {
      var items = [
        { id: 'ifile', icon: '📁', name: 'من ملف (CSV / JSON)', action: function (e) {
          var inp = document.createElement('input');
          inp.type = 'file';
          inp.accept = '.csv,.json,.tsv,.txt';
          inp.addEventListener('change', function () {
            if (inp.files && inp.files[0]) e.importFile(inp.files[0], function (data, info) {
              if (!data) { e.toast('فشل الاستيراد: ' + (info.errors[0] || ''), 'error'); return; }
              UI._importPreview(eng, data, info);
            });
          });
          inp.click();
        } },
        { id: 'ipaste', icon: '📋', name: 'لصق من الحافظة / نص', action: function (e) { UI.pasteDialog(e, function (t) { e.pasteClipboard(t); }); } },
        { id: 'iurl', icon: '🌐', name: 'من URL…', action: function (e) {
          var url = window.prompt('عنوان ملف CSV/JSON:');
          if (!url) return;
          fetch(url).then(function (r) { return r.text(); }).then(function (txt) {
            var isJson = /\.json$/i.test(url);
            var data = isJson ? JSON.parse(txt) : parseDelimitedPublic(txt);
            if (data) UI._importPreview(e, data, { source: url, errors: [] });
            else e.toast('تعذر تحليل الملف', 'error');
          }).catch(function (err) { e.toast('فشل التحميل: ' + err.message, 'error'); });
        } }
      ];
      return items;
    },
    _importPreview: function (eng, items, info) {
      var self = this;
      var sample = items.slice(0, 8);
      var keys = Object.keys(items[0] || {});
      var mapping = {};
        var html =
        '<div class="tt-imp-info">الملف: ' + esc(info.source || '') + ' — ' + items.length + ' صف</div>' +
        '<div class="tt-imp-map">' + keys.map(function (k) {
          var match = eng.columns.find(function (c) { return c.id === k || c.title === k; });
          var target = match ? match.id : '';
          mapping[k] = target;
          return '<div class="tt-map-row"><span class="tt-map-src">' + esc(k) + '</span><span>→</span>' +
            '<select data-mk="' + esc(k) + '"><option value="">— تجاهل —</option>' +
            eng.columns.map(function (c) { return '<option value="' + c.id + '"' + (c.id === target ? ' selected' : '') + '>' + esc(c.title) + '</option>'; }).join('') +
            '</select></div>';
        }).join('') + '</div>' +
        '<div class="tt-imp-preview"><table><thead><tr>' + keys.map(function (k) { return '<th>' + esc(k) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        sample.map(function (r) { return '<tr>' + keys.map(function (k) { return '<td>' + esc(r[k] === null || r[k] === undefined ? '' : String(r[k]).slice(0, 40)) + '</td>'; }).join('') + '</tr>'; }).join('') +
        '</tbody></table></div>' +
        '<div class="tt-imp-modes t-seg">' +
        '<button data-mode="append" class="active">إلحاق (append)</button>' +
        '<button data-mode="replace">استبدال (replace)</button>' +
        '<button data-mode="upsert">تحديث (upsert)</button></div>';
      UI.openModal(eng, 'معاينة الاستيراد', html,
        '<button class="t-btn" data-m="cancel">إلغاء</button><button class="t-btn t-btn--primary" data-m="ok">✓ استيراد</button>',
        function (m, close, m2) {
          m.querySelectorAll('[data-mode]').forEach(function (b) {
            b.addEventListener('click', function () {
              m.querySelectorAll('[data-mode]').forEach(function (x) { x.classList.remove('active'); });
              b.classList.add('active');
            });
          });
          m2.querySelector('[data-m="cancel"]').addEventListener('click', close);
          m2.querySelector('[data-m="ok"]').addEventListener('click', function () {
            var mp = {};
            m.querySelectorAll('select[data-mk]').forEach(function (s) { if (s.value) mp[s.dataset.mk] = s.value; });
            var mode = m.querySelector('[data-mode].active').dataset.mode;
            close();
            eng.importData(items, { mode: mode, mapping: mp });
          });
        });
    },

    /* ---- export menu ---- */
    _exportMenu: function (eng) {
      var formats = [
        ['csv', 'CSV (Excel)'], ['tsv', 'TSV'], ['json', 'JSON'], ['xml', 'XML'],
        ['html', 'HTML'], ['markdown', 'Markdown'], ['txt', 'نص عادي'], ['sql', 'SQL'],
        ['svg', 'SVG'], ['png', 'PNG (صورة)'], ['xls', 'Excel (.xls)'], ['doc', 'Word (.doc)'], ['pdf', 'PDF (طباعة)']
      ];
      var items = [
        { label: 'نطاق التصدير' },
        { html: '<div class="tt-exp-scope t-seg">' +
          '<button data-scope="filtered" class="active">المفلتر</button>' +
          '<button data-scope="all">الكل</button>' +
          '<button data-scope="selected">المحدد</button>' +
          '<button data-scope="page">الصفحة</button></div>' }
      ];
      items.push({ sep: true });
      formats.forEach(function (f) {
        items.push({
          id: 'ex_' + f[0],
          icon: '⬇',
          name: f[1],
          action: function (e) {
            var scope = 'filtered';
            var m = UI._open;
            if (m) { var a = m.querySelector('[data-scope].active'); if (a) scope = a.dataset.scope; }
            UI.closeOverlays(e);
            e.export(f[0], { scope: scope });
          }
        });
      });
      return items;
    },

    /* ================= header bindings ================= */
    _bindHeader: function (eng) {
      var self = this;
      var thead = eng._el('thead');
      if (!thead) return;
      thead.addEventListener('click', function (e) {
        var th = e.target.closest('th[data-col]');
        if (!th || e.target.closest('.th-resize')) return;
        var col = th.dataset.col;
        if (col === '__rownum' || col === '__select') return;
        var existing = eng.sort.find(function (s) { return s.col === col; });
        if (e.shiftKey) {
          if (!existing) eng.setSort(col, 'asc', true);
          else eng.setSort(col, existing.dir === 1 ? 'desc' : 'asc', true);
        } else if (!existing) {
          eng.setSort(col, 'asc');
        } else if (existing.dir === 1) {
          eng.setSort(col, 'desc');
        } else {
          eng.setSort(col, null);
        }
        eng.emit('columnHeaderClicked', { column: col });
      });
      thead.addEventListener('dblclick', function (e) {
        var th = e.target.closest('th[data-col]');
        if (!th) return;
        var col = th.dataset.col;
        if (col && col !== '__rownum' && col !== '__select') eng.autoFitColumn(col);
      });
      thead.addEventListener('contextmenu', function (e) {
        var th = e.target.closest('th[data-col]');
        if (!th) return;
        e.preventDefault();
        var col = th.dataset.col;
        if (col === '__rownum' || col === '__select') return;
        var rect = th.getBoundingClientRect();
        self._menu(eng, self._columnCtxMenu(eng, col), rect);
      });
      // resize
      thead.addEventListener('mousedown', function (e) {
        var h = e.target.closest('.th-resize');
        if (!h) return;
        e.preventDefault();
        var col = h.dataset.col;
        var startX = e.clientX;
        var th2 = h.closest('th');
        var startW = th2.offsetWidth;
        function onMove(ev) {
          var dl = ev.clientX - startX;
          var w = startW + (eng.direction === 'rtl' ? -dl : dl);
          eng.setColumnWidth(col, w);
        }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      // column drag reorder
      thead.addEventListener('dragstart', function (e) {
        var th = e.target.closest('th[data-col]');
        if (!th) return;
        if (th.dataset.col === '__rownum' || th.dataset.col === '__select') return;
        self._dragCol = th.dataset.col;
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', th.dataset.col); } catch (x) { }
      });
      thead.addEventListener('dragover', function (e) {
        if (!self._dragCol) return;
        e.preventDefault();
      });
      thead.addEventListener('drop', function (e) {
        if (!self._dragCol) return;
        e.preventDefault();
        var th = e.target.closest('th[data-col]');
        if (!th) return;
        var from = eng.columnOrder.indexOf(self._dragCol);
        var to = eng.columnOrder.indexOf(th.dataset.col);
        if (from !== -1 && to !== -1 && from !== to) {
          eng.columnOrder.splice(from, 1);
          eng.columnOrder.splice(to, 0, self._dragCol);
          eng.render(true);
          eng._save();
          eng.emit('columnMoved', { column: self._dragCol });
        }
        self._dragCol = null;
      });
    },
    _columnCtxMenu: function (eng, col) {
      var self = this;
      var c = eng.colById(col);
      var s = eng.sort.find(function (x) { return x.col === col; });
      return [
        { id: 'cs1', icon: '▲', name: 'ترتيب تصاعدي', kbd: 'Shift+Click', action: function (e) { e.setSort(col, 'asc'); } },
        { id: 'cs2', icon: '▼', name: 'ترتيب تنازلي', action: function (e) { e.setSort(col, 'desc'); } },
        { id: 'cs3', icon: '✕', name: 'إزالة ترتيب هذا العمود', disabled: !s, action: function (e) { e.setSort(col, null); } },
        { sep: true },
        { id: 'ca', icon: '↔', name: 'ملاءمة العرض تلقائياً (نقر مزدوج)', action: function (e) { e.autoFitColumn(col); } },
        { id: 'ch', icon: eng.hidden[col] ? '👁' : '🙈', name: eng.hidden[col] ? 'إظهار العمود' : 'إخفاء العمود', action: function (e) { e.toggleColumn(col); } },
        { id: 'cr', icon: '✏', name: 'إعادة تسمية…', action: function (e) {
          var t = window.prompt('اسم العمود:', c.title);
          if (t) e.renameColumn(col, t);
        } },
        { id: 'cd', icon: '', name: 'تكرار العمود', action: function (e) { e.duplicateColumn(col); } },
        { id: 'cg', icon: '🗂', name: eng.groupBy.indexOf(col) !== -1 ? 'إزالة التجميع بهذا العمود' : 'تجميع بهذا العمود', action: function (e) {
          var i = e.groupBy.indexOf(col);
          if (i !== -1) e.groupBy.splice(i, 1); else e.groupBy.push(col);
          e.setGroupBy(e.groupBy);
        } },
        { id: 'cw', icon: '📏', name: 'تغيير العرض…', action: function (e) {
          var w = window.prompt('عرض العمود بالبكسل:', e.widths[col] || c.width);
          if (w && !isNaN(parseInt(w, 10))) e.setColumnWidth(col, parseInt(w, 10));
        } },
        { sep: true },
        { id: 'cx', icon: '🗑', name: 'حذف العمود', action: function (e) {
          if (window.confirm('حذف عمود «' + c.title + '»؟')) e.deleteColumn(col);
        } }
      ];
    },

    /* ================= row drag & drop ================= */
    _bindRowDrag: function (eng) {
      var self = this;
      var tbody = eng._el('tbody');
      if (!tbody) return;
      tbody.addEventListener('dragstart', function (e) {
        var tr = e.target.closest('tr[data-rowid]');
        if (!tr) return;
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', tr.dataset.rowid); } catch (x) { }
        eng._dragRowId = tr.dataset.rowid;
        tr.classList.add('tr-dragging');
        eng.emit('rowDrag', { rowId: tr.dataset.rowid });
      });
      tbody.addEventListener('dragover', function (e) {
        if (!eng._dragRowId) return;
        var tr = e.target.closest('tr[data-rowid]');
        if (!tr) return;
        e.preventDefault();
        tr.classList.add('tr-drop-target');
      });
      tbody.addEventListener('dragleave', function (e) {
        var tr = e.target.closest('tr[data-rowid]');
        if (tr) tr.classList.remove('tr-drop-target');
      });
      tbody.addEventListener('drop', function (e) {
        if (!eng._dragRowId) return;
        e.preventDefault();
        var tr = e.target.closest('tr[data-rowid]');
        tbody.querySelectorAll('.tr-drop-target').forEach(function (x) { x.classList.remove('tr-drop-target'); });
        if (!tr || tr.dataset.rowid === eng._dragRowId) return;
        var from = eng.rows.findIndex(function (r) { return r._id === eng._dragRowId; });
        var to = eng.rows.findIndex(function (r) { return r._id === tr.dataset.rowid; });
        if (from === -1 || to === -1) return;
        eng.pushUndo({ type: 'rowMove', rowId: eng._dragRowId, from: from, to: to });
        var row = eng.rows.splice(from, 1)[0];
        eng.rows.splice(to, 0, row);
        eng._dragRowId = null;
        eng.render(true);
        eng.emit('rowDrop', { rowId: row._id, to: to });
      });
      tbody.addEventListener('dragend', function () {
        eng._dragRowId = null;
        tbody.querySelectorAll('.tr-dragging').forEach(function (x) { x.classList.remove('tr-dragging'); });
      });
      // make data rows draggable via rownum cell or whole row
      tbody.addEventListener('mousedown', function (e) {
        var tr = e.target.closest('tr[data-rowid]');
        if (tr) tr.setAttribute('draggable', 'true');
      });
    },

    /* ================= context menu (cell/row) ================= */
    _cellCtxMenu: function (eng, row, col) {
      var self = this;
      var c = col ? eng.colById(col) : null;
      var items = [];
      if (c && c.id !== '__rownum' && c.id !== '__select') {
        items.push({ id: 'ccopy', icon: '📋', name: 'نسخ', kbd: 'Ctrl+C', action: function (e) { e.copySelection('tsv'); } });
        items.push({ id: 'cpaste', icon: '📥', name: 'لصق هنا', kbd: 'Ctrl+V', action: function (e) { e.pasteClipboard(); } });
        items.push({ id: 'cclear', icon: '🧹', name: 'مسح الخلية', kbd: 'Del', action: function (e) { e.updateCell(row._id, c.id, null); } });
        items.push({ sep: true });
      }
      items.push({ id: 'ri', icon: '＋', name: 'إدراج صف فوق', action: function (e) { e.insertRow(row._id, 'above'); } });
      items.push({ id: 'rb', icon: '＋', name: 'إدراج صف تحت', action: function (e) { e.insertRow(row._id, 'below'); } });
      items.push({ id: 'rd', icon: '📑', name: 'تكرار الصف', action: function (e) { e.duplicateRow(row._id); } });
      items.push({ id: 'ru', icon: '↑', name: 'نقل لأعلى', action: function (e) { e.moveRow(row._id, 'up'); } });
      items.push({ id: 'rd2', icon: '↓', name: 'نقل لأسفل', action: function (e) { e.moveRow(row._id, 'down'); } });
      items.push({ sep: true });
      items.push({ id: 'pt', icon: '📌', name: row._pinned === 'top' ? 'إلغاء التثبيت (أعلى)' : 'تثبيت في الأعلى', action: function (e) { e.pinRow(row._id, row._pinned === 'top' ? null : 'top'); } });
      items.push({ id: 'pb', icon: '📍', name: row._pinned === 'bottom' ? 'إلغاء التثبيت (أسفل)' : 'تثبيت في الأسفل', action: function (e) { e.pinRow(row._id, row._pinned === 'bottom' ? null : 'bottom'); } });
      items.push({ id: 'pa', icon: row._archived ? '♻' : '🗄', name: row._archived ? 'استعادة الصف المحذوف' : 'أرشفة الصف', action: function (e) { e.archiveRow(row._id); } });
      items.push({ id: 'pl', icon: row._locked ? '🔓' : '🔒', name: row._locked ? 'فتح التحرير' : 'قفل الصف من التحرير', action: function (e) { e.toggleRowLocked(row._id); } });
      items.push({ id: 'pn', icon: '📝', name: 'تعليق / ملاحظة…', action: function (e) {
        var n = window.prompt('ملاحظة الصف:', row._note || '');
        if (n !== null) e.setRowNote(row._id, n);
      } });
      items.push({ id: 'pc', icon: '🎨', name: 'تلوين الصف…', action: function (e) {
        var colr = window.prompt('لون الصف (hex):', row._rowColor || '');
        if (colr !== null) e.setRowColor(row._id, colr || null);
      } });
      items.push({ sep: true });
      items.push({ id: 'pe', icon: '⤢', name: 'توسيع التفاصيل', action: function (e) { e.toggleExpand(row._id); } });
      items.push({ id: 'pg', icon: '🎯', name: 'الانتقال لهذا الصف (Ctrl+G)', action: function (e) {
        var i = e.rows.indexOf(row);
        e.navigateTo(i, 0);
      } });
      items.push({ sep: true });
      if (c && c.editable && c.id !== '__rownum') {
        items.push({ id: 'stb', icon: 'B', name: 'خط عريض', action: function (e) { var st = (row._styles || {})[c.id] || {}; e.setCellStyle(row._id, c.id, 'bold', !st.bold); } });
        items.push({ id: 'sti', icon: 'I', name: 'خط مائل', action: function (e) { var st = (row._styles || {})[c.id] || {}; e.setCellStyle(row._id, c.id, 'italic', !st.italic); } });
        items.push({ id: 'stu', icon: 'U', name: 'تسطير', action: function (e) { var st = (row._styles || {})[c.id] || {}; e.setCellStyle(row._id, c.id, 'underline', !st.underline); } });
        items.push({ id: 'stc', icon: '🖋', name: 'لون النص…', action: function (e) { var colr = window.prompt('لون النص (hex):'); if (colr) e.setCellStyle(row._id, c.id, 'color', colr); } });
        items.push({ id: 'stbg', icon: '🟨', name: 'لون الخلفية…', action: function (e) { var colr = window.prompt('لون الخلفية (hex):'); if (colr) e.setCellStyle(row._id, c.id, 'bg', colr); } });
      }
      items.push({ sep: true });
      items.push({ id: 'rdel', icon: '🗑', name: 'حذف الصف', kbd: 'Ctrl+Delete', action: function (e) { e.deleteRow(row._id); } });
      // plugins
      (eng.plugins.menuItems.cell || []).forEach(function (it, i) { items.push(Object.assign({ id: 'p' + i }, it)); });
      return items;
    },

    /* ================= dialogs ================= */
    openModal: function (eng, title, body, foot, onMount) {
      this.closeOverlays(eng);
      var wrap = document.createElement('div');
      wrap.className = 't-modal-backdrop tt-modal-wrap';
      wrap.innerHTML = '<div class="t-modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
        '<div class="t-modal-head"><h2>' + esc(title) + '</h2><button class="t-btn t-btn--icon t-btn--ghost" data-m="x" aria-label="إغلاق">✕</button></div>' +
        '<div class="t-modal-body">' + body + '</div>' +
        (foot ? '<div class="t-modal-foot">' + foot + '</div>' : '') +
        '</div>';
      document.body.appendChild(wrap);
      var close = function () { wrap.remove(); document.removeEventListener('keydown', onKey); };
      function onKey(e) { if (e.key === 'Escape') close(); }
      document.addEventListener('keydown', onKey);
      wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
      var x = wrap.querySelector('[data-m="x"]');
      if (x) x.addEventListener('click', close);
      if (onMount) onMount(wrap, close, wrap.querySelector('.t-modal'));
      return close;
    },

    gotoDialog: function (eng) {
      var self = this;
      this.openModal(eng, 'الانتقال لصف محدد',
        '<div class="t-field"><label>رقم الصف (1 - ' + eng.dataRowCount() + ')</label>' +
        '<input class="t-input" id="tt-goto" type="number" min="1" max="' + eng.dataRowCount() + '" value="1" /></div>',
        '<button class="t-btn" data-m="cancel">إلغاء</button><button class="t-btn t-btn--primary" data-m="ok">انتقال</button>',
        function (wrap, close, m) {
          var inp = m.querySelector('#tt-goto');
          inp.focus();
          inp.select();
          function go() {
            var n = parseInt(inp.value, 10) || 1;
            close();
            eng.navigateTo(n - 1, eng.focus.ci);
          }
          m.querySelector('[data-m="ok"]').addEventListener('click', go);
          m.querySelector('[data-m="cancel"]').addEventListener('click', close);
          inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
        });
    },

    shortcutsDialog: function (eng) {
      var rows = [
        ['أسهم / Tab / Shift+Tab', 'تنقل بين الخلايا'],
        ['Enter أو F2 أو نقر مزدوج', 'بدء التحرير'],
        ['Enter', 'حفظ وتنازل لأسفل'],
        ['Tab', 'حفظ والانتقال للتالي'],
        ['Escape', 'إلغاء التحرير / إغلاق القوائم'],
        ['Delete / Backspace', 'مسح الخلية'],
        ['Shift+أسهم', 'تحديد نطاق'],
        ['Ctrl+Click', 'تحديد متعدد'],
        ['Shift+Click', 'تحديد بالنطاق'],
        ['Ctrl+A', 'تحديد كل الصفوف'],
        ['Ctrl+C / X / V', 'نسخ / قص / لصق'],
        ['Ctrl+Z / Ctrl+Y', 'تراجع / إعادة'],
        ['Ctrl+D / Ctrl+R', 'ملء لأسفل / لليمين'],
        ['Ctrl+أسهم', 'القفز للحافة'],
        ['Ctrl+Home / Ctrl+End', 'البداية / النهاية المطلقة'],
        ['Home / End', 'أول/آخر عمود في الصف'],
        ['Page Up / Page Down', 'تمرير صفحة'],
        ['Space', 'تبديل Checkbox'],
        ['Alt+Enter', 'سطر جديد في الخلية'],
        ['Ctrl+Enter', 'حفظ وبقاء'],
        ['Ctrl+F أو /', 'البحث العام'],
        ['Ctrl+S', 'حفظ'],
        ['Ctrl+P', 'طباعة / PDF'],
        ['Ctrl+G', 'الانتقال لصف'],
        ['Ctrl+Insert', 'إدراج صف'],
        ['Ctrl+Delete', 'حذف الصف'],
        ['F5', 'تحديث'],
        ['؟', 'قائمة الاختصارات هذه']
      ];
      this.openModal(eng, 'اختصارات لوحة المفاتيح',
        '<table class="tt-shortcuts">' + rows.map(function (r) {
          return '<tr><th><kbd class="t-kbd">' + r[0] + '</kbd></th><td>' + r[1] + '</td></tr>';
        }).join('') + '</table>',
        '<button class="t-btn t-btn--primary" data-m="ok">حسنًا</button>',
        function (wrap, close, m) { m.querySelector('[data-m="ok"]').addEventListener('click', close); });
    },

    pasteDialog: function (eng, onText) {
      this.openModal(eng, 'لصق البيانات',
        '<div class="t-field"><label>ألصق النص هنا (من Excel أو CSV أو TSV)</label>' +
        '<textarea class="t-textarea" id="tt-paste-ta" rows="8" placeholder="اسم&#9;رقم&#10;أحمد&#9;123"></textarea></div>',
        '<button class="t-btn" data-m="cancel">إلغاء</button><button class="t-btn t-btn--primary" data-m="ok">لصق</button>',
        function (wrap, close, m) {
          m.querySelector('[data-m="ok"]').addEventListener('click', function () {
            var t = m.querySelector('#tt-paste-ta').value;
            close();
            onText(t);
          });
          m.querySelector('[data-m="cancel"]').addEventListener('click', close);
        });
    },

    _addColumnDialog: function (eng) {
      var self = this;
      this.openModal(eng, 'إضافة عمود جديد',
        '<div class="t-field"><label>اسم العمود</label><input class="t-input" id="tt-newcol-title" placeholder="مثال: الميزانية" /></div>' +
        '<div class="t-field" style="margin-top:10px"><label>النوع</label>' +
        '<select class="t-select" id="tt-newcol-type">' +
        ['text', 'longtext', 'number', 'currency', 'percent', 'date', 'time', 'datetime', 'select', 'multiselect', 'boolean', 'color', 'url', 'email', 'phone', 'progress', 'rating', 'file', 'sparkline'].map(function (t) {
          return '<option value="' + t + '">' + t + '</option>';
        }).join('') +
        '</select></div>' +
        '<div class="t-field" style="margin-top:10px"><label>قيم (للـ select — فواصل)</label><input class="t-input" id="tt-newcol-opts" placeholder="قيمة1, قيمة2, قيمة3" /></div>',
        '<button class="t-btn" data-m="cancel">إلغاء</button><button class="t-btn t-btn--primary" data-m="ok">إضافة</button>',
        function (wrap, close, m) {
          m.querySelector('[data-m="ok"]').addEventListener('click', function () {
            var title = m.querySelector('#tt-newcol-title').value.trim();
            if (!title) { eng.toast('أدخل اسم العمود', 'warning'); return; }
            var type = m.querySelector('#tt-newcol-type').value;
            var opts = m.querySelector('#tt-newcol-opts').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            close();
            eng.addNewColumn({ id: 'c_' + Date.now().toString(36), title: title, type: type, options: opts, width: 150 });
            eng.toast('تمت إضافة عمود «' + title + '»', 'success');
          });
          m.querySelector('[data-m="cancel"]').addEventListener('click', close);
        });
    },

    _settingsDialog: function (eng) {
      var self = this;
      this.openModal(eng, 'إعدادات الجدول',
        '<div class="tt-settings-grid">' +
        '<div class="t-field"><label>الكثافة</label><div class="t-seg" data-set="density">' +
        ['comfortable', 'normal', 'compact'].map(function (d) { return '<button data-v="' + d + '"' + (eng.density === d ? ' class="active"' : '') + '>' + ({ comfortable: 'مريح', normal: 'عادي', compact: 'مضغوط' }[d]) + '</button>'; }).join('') + '</div></div>' +
        '<div class="t-field"><label>صفوف / صفحة</label><select class="t-select" data-set="pageSize">' +
        [25, 50, 100, 200].map(function (n) { return '<option' + (eng.pageSize === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div>' +
        '<div class="t-field"><label>العرض</label><div class="t-seg" data-set="mode">' +
        [['pagination', 'ترقيم'], ['infinite', 'تمرير لا نهائي'], ['all', 'عرض الكل']].map(function (m) { return '<button data-v="' + m[0] + '"' + (eng.mode === m[0] ? ' class="active"' : '') + '>' + m[1] + '</button>'; }).join('') + '</div></div>' +
        '<div class="t-field"><label>البحث التقريبي (Fuzzy)</label><div class="t-seg" data-set="fuzzy">' +
        '<button data-v="1"' + (eng.fuzzy ? ' class="active"' : '') + '>مفعّل</button><button data-v="0"' + (!eng.fuzzy ? ' class="active"' : '') + '>معطّل</button></div></div>' +
        '<div class="t-field"><label>الحفظ التلقائي (Local Storage)</label><div class="t-seg" data-set="autosave">' +
        '<button data-v="1"' + (eng.autoSave ? ' class="active"' : '') + '>مفعّل</button><button data-v="0"' + (!eng.autoSave ? ' class="active"' : '') + '>معطّل</button></div></div>' +
        '<div class="t-field"><label>حفظ البيانات في التخزين المحلي</label><div class="t-seg" data-set="persistdata">' +
        '<button data-v="1"' + (eng.config.persistData ? ' class="active"' : '') + '>مفعّل</button><button data-v="0"' + (!eng.config.persistData ? ' class="active"' : '') + '>معطّل</button></div></div>' +
        '</div>' +
        '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="t-btn" data-setact="exportstate">⬇ تصدير حالة الجدول (JSON)</button>' +
        '<button class="t-btn" data-setact="importstate">⬆ استيراد حالة…</button>' +
        '<button class="t-btn t-btn--danger" data-setact="reset">♻ إعادة تعيين كل شيء</button>' +
        '</div>',
        '<button class="t-btn t-btn--primary" data-m="ok">إغلاق</button>',
        function (wrap, close, m) {
          m.querySelector('[data-set="density"]').addEventListener('click', function (e) {
            var b = e.target.closest('button'); if (!b) return;
            eng.setDensity(b.dataset.v);
            segActive(this, b);
          });
          m.querySelector('[data-set="pageSize"]').addEventListener('change', function (e) { eng.setPageSize(parseInt(e.target.value, 10)); });
          m.querySelector('[data-set="mode"]').addEventListener('click', function (e) {
            var b = e.target.closest('button'); if (!b) return;
            eng.setMode(b.dataset.v);
            segActive(this, b);
          });
          m.querySelector('[data-set="fuzzy"]').addEventListener('click', function (e) {
            var b = e.target.closest('button'); if (!b) return;
            eng.fuzzy = b.dataset.v === '1';
            segActive(this, b);
            eng.render(true);
          });
          m.querySelector('[data-set="autosave"]').addEventListener('click', function (e) {
            var b = e.target.closest('button'); if (!b) return;
            eng.autoSave = b.dataset.v === '1';
            if (eng.autoSave) eng._save();
            segActive(this, b);
          });
          m.querySelector('[data-set="persistdata"]').addEventListener('click', function (e) {
            var b = e.target.closest('button'); if (!b) return;
            eng.config.persistData = b.dataset.v === '1';
            if (eng.config.persistData) eng._save();
            segActive(this, b);
          });
          m.querySelector('[data-setact="exportstate"]').addEventListener('click', function () {
            window._ttDownloadBlob(new Blob([JSON.stringify(eng.exportState(), null, 2)], { type: 'application/json' }), 'twenty-table-state.json');
            eng.toast('تم تصدير حالة الجدول', 'success');
          });
          m.querySelector('[data-setact="importstate"]').addEventListener('click', function () {
            var inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = '.json';
            inp.addEventListener('change', function () {
              if (!inp.files || !inp.files[0]) return;
              var rd = new FileReader();
              rd.onload = function () {
                try { eng.importState(JSON.parse(String(rd.result))); eng.toast('تم استيراد الحالة', 'success'); }
                catch (e2) { eng.toast('ملف غير صالح', 'error'); }
              };
              rd.readAsText(inp.files[0]);
            });
            inp.click();
          });
          m.querySelector('[data-setact="reset"]').addEventListener('click', function () {
            if (window.confirm('إعادة تعيين كل الإعدادات والحالة؟')) { close(); eng.resetState(); }
          });
          m.querySelector('[data-m="ok"]').addEventListener('click', close);
        });
    },

    _perfPanel: function (eng, rect) {
      var self = this;
      if (this._fps.raf) { cancelAnimationFrame(this._fps.raf); this._fps.raf = null; }
      this._menu(eng, [{
        html: '<div class="tt-perf">' +
        '<div>FPS: <b id="tt-fps">—</b></div>' +
        '<div>وقت آخر عرض: <b id="tt-rms">' + (eng._lastRenderMs || 0) + '</b> ms</div>' +
        '<div>إجمالي الصفوف: <b>' + eng.rows.length.toLocaleString() + '</b></div>' +
        '<div>الصفوف المعروضة: <b>' + eng.visibleRows.length.toLocaleString() + '</b></div>' +
        '<div>الصفوف المفلترة: <b>' + eng.dataRowCount().toLocaleString() + '</b></div>' +
        '<div>الترقيم الافتراضي: <b>' + (eng._virtual ? 'نشط ✓' : 'معطّل') + '</b></div>' +
        '</div>'
      }], rect);
      this._fps.frames = 0;
      this._fps.last = performance.now();
      var tick = function () {
        self._fps.frames++;
        var now = performance.now();
        if (now - self._fps.last >= 1000) {
          self._fps.value = Math.round(self._fps.frames * 1000 / (now - self._fps.last));
          self._fps.frames = 0;
          self._fps.last = now;
          var el = document.getElementById('tt-fps');
          if (el) el.textContent = self._fps.value;
        }
        self._fps.raf = requestAnimationFrame(tick);
      };
      this._fps.raf = requestAnimationFrame(tick);
    },

    /* ================= status bar ================= */
    _statusBar: function (eng) {
      var sb = eng._el('.tt-statusbar');
      if (!sb) return;
      var total = eng.dataRowCount();
      var pages = eng.pageCount();
      var selCount = Object.keys(eng.selection).length;
      var active = eng.activeFilterCount();
      var html = '<span>صفوف: <b>' + total.toLocaleString() + '</b> من ' + eng.rows.length.toLocaleString() + '</span>';
      if (eng.mode === 'pagination') html += '<span>· صفحة <b>' + eng.page + '</b>/' + pages + '</span>';
      if (active) html += '<span class="tt-sb-filter">· 🧭 ' + active + ' فلتر نشط</span>';
      html += '<span class="tt-sb-pager"></span>';
      // selection summary
      if (selCount) {
        var sums = [];
        eng.visibleCols.forEach(function (c) {
          if (!['number', 'currency', 'money', 'percent', 'progress'].indexOf(c.type)) return;
          var nums = [];
          eng.rows.forEach(function (r) { if (eng.selection[r._id]) { var n = parseFloat(r[c.id]); if (!isNaN(n)) nums.push(n); } });
          if (nums.length) {
            var s = nums.reduce(function (a, b) { return a + b; }, 0);
            sums.push('<span class="tt-sb-sum">' + esc(c.title) + ': Σ ' + s.toLocaleString() + ' · μ ' + Math.round(s / nums.length * 100) / 100 + ' · n ' + nums.length + '</span>');
          }
        });
        html += '<span class="tt-sb-sel">المحدد: ' + selCount + (sums.length ? ' — ' + sums.join(' | ') : '') + '</span>';
      }
      // pagination buttons
      var pg = '';
      if (eng.mode === 'pagination' && pages > 1) {
        pg = '<button class="t-btn t-btn--sm" data-pg="prev"' + (eng.page === 1 ? ' disabled' : '') + '>‹</button>';
        var list = pageListPublic(eng.page, pages);
        list.forEach(function (n) {
          pg += n === '…' ? '<span>…</span>' : '<button class="t-btn t-btn--sm' + (n === eng.page ? ' t-btn--primary' : '') + '" data-pg="' + n + '">' + n + '</button>';
        });
        pg += '<button class="t-btn t-btn--sm" data-pg="next"' + (eng.page === pages ? ' disabled' : '') + '>›</button>';
      }
      html += pg;
      sb.innerHTML = html;
      var badge = eng._el('.tt-filter-badge');
      if (badge) { badge.textContent = active; badge.hidden = active === 0; }
    },

    /* ================= toast ================= */
    toast: function (eng, msg, type) {
      var box = document.querySelector('.t-toasts');
      if (!box) {
        box = document.createElement('div');
        box.className = 't-toasts';
        document.body.appendChild(box);
      }
      var t = document.createElement('div');
      t.className = 't-toast' + (type ? ' t-toast--' + type : '');
      t.innerHTML = '<span>' + esc(msg) + '</span><button class="t-toast-close" aria-label="إغلاق">✕</button>';
      box.appendChild(t);
      var rm = function () { t.remove(); };
      t.querySelector('.t-toast-close').addEventListener('click', rm);
      setTimeout(rm, 4200);
    }
  };

  function segActive(seg, btn) {
    seg.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b === btn); });
  }
  function presetsOf(eng) {
    try { return JSON.parse(localStorage.getItem(presetKey(eng)) || '{}'); } catch (e) { return {}; }
  }
  function presetKey(eng) { return eng.storageKey + '-presets'; }
  function pageListPublic(cur, total) {
    if (total <= 7) return Array.from({ length: total }, function (_, i) { return i + 1; });
    var set = [1, 2, total - 1, total, cur - 1, cur, cur + 1];
    var arr = set.filter(function (n) { return n >= 1 && n <= total; }).sort(function (a, b) { return a - b; });
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      if (i > 0 && arr[i] - arr[i - 1] > 1) out.push('…');
      out.push(arr[i]);
    }
    return out;
  }
  function parseDelimitedPublic(text) {
    var lines = text.replace(/\r/g, '').split('\n').filter(function (l) { return l.trim() !== ''; });
    if (lines.length < 2) return null;
    var sep = lines[0].split('\t').length > lines[0].split(',').length ? '\t' : ',';
    var head = lines[0].split(sep);
    return lines.slice(1).map(function (l) {
      var vals = l.split(sep);
      var o = {};
      head.forEach(function (h, i) { o[h.trim()] = (vals[i] || '').trim(); });
      return o;
    });
  }

  // wire extra bindings after engine-ui loads
  TableEngine.prototype._onContext = function (e) {
    var cell = this._cellFromEvent(e);
    if (!cell) return;
    var gtr = cell.tr && cell.tr.classList.contains('tr-group');
    if (gtr) {
      e.preventDefault();
      window.TableEngineUI._menu(this, [
        { id: 'gexp', icon: '⊞', name: 'توسيع المجموعة', action: function (en) { en.toggleGroup(gtr.dataset.path); } },
        { id: 'gcoll', icon: '⊟', name: 'طي المجموعة', action: function (en) { en.toggleGroup(gtr.dataset.path); } }
      ], gtr.getBoundingClientRect());
      return;
    }
    if (!cell.vr || cell.vr.kind !== 'data') return;
    e.preventDefault();
    var row = cell.vr.row;
    var col = cell.td && cell.td.dataset.col ? cell.td.dataset.col : null;
    var rect = (cell.td || cell.tr).getBoundingClientRect();
    this.focus.ri = cell.vi;
    this.selection = { [row._id]: true };
    this.render(false);
    window.TableEngineUI._menu(this, window.TableEngineUI._cellCtxMenu(this, row, col), rect);
    this.emit('contextMenuOpened', { rowId: row._id, column: col });
  };

  window.TableEngineUI = UI;
})();
