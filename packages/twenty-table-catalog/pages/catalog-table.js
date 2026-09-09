/*
 * twenty-table-catalog / pages/catalog-table.js
 * مكوّن مشترك: جدول فهرس الخصائص الـ800 — مستخدم في الصفحتين الرئيسية وصفحة الخصائص
 * MIT License — see ../LICENSE
 */
(function () {
  'use strict';

  var GROUPS = window.TTC_GROUPS;
  var ALL = [].concat(window.TTC_F1, window.TTC_F2, window.TTC_F3);
  var numToGroup = {};
  GROUPS.forEach(function (g) {
    for (var n = g.from; n <= g.to; n++) numToGroup[n] = g;
  });
  var groupColor = {};
  GROUPS.forEach(function (g) { groupColor[g.name] = g.color; });

  function hexA(hex, a) {
    var m = String(hex).replace('#', '');
    if (m.length === 3) m = m[0] + m[0] + m[1] + m[1] + m[2] + m[2];
    var r = parseInt(m.slice(0, 2), 16), g2 = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g2 + ',' + b + ',' + a + ')';
  }

  window.TTCCatalog = function (mountSel, opts) {
    opts = opts || {};
    var rows = ALL.map(function (f, i) {
      var g = numToGroup[f[0]];
      return {
        num: f[0],
        name: f[1],
        english: f[2],
        group: g.name,
        status: window.FEATURE_STATUS_LABELS[window.FEATURE_STATUS[i]]
      };
    });
    var eng = window.TableEngine.create({
      id: opts.id || 'catalog',
      el: mountSel,
      title: opts.title || 'فهرس الخصائص — 800 خاصية',
      description: opts.description || 'أقوى خصائص أنظمة الجداول (Excel / Google Sheets / Airtable / Notion / AG Grid) منظمة في 14 مجموعة',
      rowNumber: true,
      showSelection: true,
      pageSize: opts.pageSize || 50,
      autoSave: opts.autoSave !== false,
      persistData: false,
      footer: true,
      data: rows,
      columns: [
        { id: 'name', title: 'الخاصية', type: 'text', width: 300, natural: true, agg: 'count' },
        { id: 'english', title: 'English', type: 'text', width: 250 },
        { id: 'group', title: 'المجموعة', type: 'select', width: 190, editable: false, options: GROUPS.map(function (g) { return g.name; }) },
        { id: 'status', title: 'الحالة', type: 'select', width: 130, editable: false, options: ['مطبقة', 'جزئية', 'مخطط لها'], colors: { 'مطبقة': '#36b37e', 'جزئية': '#f79009', 'مخطط لها': '#999999' } }
      ],
      conditional: [
        { col: 'status', type: 'equals', value: 'مطبقة', bg: 'rgba(54,179,126,.08)' },
        { col: 'status', type: 'equals', value: 'جزئية', bg: 'rgba(247,144,9,.08)' }
      ]
    });
    eng.registerRenderer('status', function (v) {
      return window.TableEngine.badgeRenderer(v, null, eng.colById('status'));
    });
    eng.registerRenderer('group', function (v) {
      var c = groupColor[v] || '#888888';
      return '<span class="cf-badge" style="background:' + hexA(c, 0.14) + ';color:' + c + '"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + c + ';margin-inline-end:5px"></span>' + v + '</span>';
    });
    window.TTC.registerEngine(eng);
    return eng;
  };
})();
