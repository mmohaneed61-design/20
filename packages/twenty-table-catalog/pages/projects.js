/*
 * twenty-table-catalog / pages/projects.js
 * صفحة المشاريع — مع صيغ حية وتجميع
 * MIT License — see ../LICENSE
 */
(function () {
  'use strict';
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  ready(function () {
    // عمود صيغة حي: الاستهلاك % = ROUND(المصروفات / الميزانية * 100, 0)
    // الحروف: A name, B client, C lead, D status, E priority, F budget, G spent, H start, I end, J progress, K trend, L consumption
    var rows = window.SAMPLE_PROJECTS.map(function (p, i) {
      p.consumption = '=ROUND(G' + (i + 1) + '/F' + (i + 1) + '*100,0)';
      return p;
    });
    var eng = window.TableEngine.create({
      id: 'projects',
      el: '#app',
      title: 'المشاريع',
      description: 'صيغ حية · تجميع حسب الحالة · Sparklines · تذييل إجمالي',
      rowNumber: true,
      showSelection: true,
      pageSize: 25,
      autoSave: true,
      persistData: false,
      footer: true,
      groupBy: ['status'],
      data: rows,
      columns: [
        { id: 'name', title: 'المشروع', type: 'text', width: 220 },
        { id: 'client', title: 'العميل', type: 'text', width: 170 },
        { id: 'lead', title: 'مسؤول المشروع', type: 'text', width: 160 },
        { id: 'status', title: 'الحالة', type: 'select', width: 120, options: ['نشط', 'مكتمل', 'متأخر', 'موقوف', 'جديد'], colors: { 'نشط': '#0057FF', 'مكتمل': '#36b37e', 'متأخر': '#d45453', 'موقوف': '#999999', 'جديد': '#f79009' } },
        { id: 'priority', title: 'الأولوية', type: 'select', width: 120, options: ['عالية', 'متوسطة', 'منخفضة'], colors: { 'عالية': '#d45453', 'متوسطة': '#f79009', 'منخفضة': '#36b37e' } },
        { id: 'budget', title: 'الميزانية', type: 'currency', width: 140, agg: 'sum', currency: 'ر.س', align: 'end' },
        { id: 'spent', title: 'المصروفات', type: 'currency', width: 140, agg: 'sum', currency: 'ر.س', align: 'end' },
        { id: 'start', title: 'البداية', type: 'date', width: 120 },
        { id: 'end', title: 'النهاية', type: 'date', width: 120 },
        { id: 'progress', title: 'التقدم', type: 'progress', width: 150, agg: 'avg' },
        { id: 'trend', title: 'النشاط (12 أسبوع)', type: 'sparkline', width: 130, editable: false },
        { id: 'consumption', title: 'الاستهلاك % (صيغة)', type: 'percent', width: 150, editable: false, decimals: 0 }
      ],
      conditional: [
        { col: 'consumption', type: 'threshold', op: 'gt', value: 90, bg: 'rgba(212,84,83,.12)', color: '#d45453' },
        { col: 'consumption', type: 'threshold', op: 'lt', value: 40, bg: 'rgba(54,179,126,.10)', color: '#1e7a4f' },
        { col: 'progress', type: 'dataBar', color: 'var(--t-brand)' }
      ]
    });
    eng.registerRenderer('status', function (v) { return window.TableEngine.badgeRenderer(v, null, eng.colById('status')); });
    eng.registerRenderer('priority', function (v) { return window.TableEngine.badgeRenderer(v, null, eng.colById('priority')); });
    eng.registerRenderer('progress', function (v) { return window.TableEngine.progressRenderer(v, null, eng.colById('progress')); });
    eng.registerRenderer('sparkline', function (v, row, c) { return window.TableEngine.sparklineRenderer(v, row, c); });
    window.TTC.registerEngine(eng);
  });
})();
