/*
 * twenty-table-catalog / pages/stress.js
 * صفحة اختبار الأداء — 100K صف
 * MIT License — see ../LICENSE
 */
(function () {
  'use strict';
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  ready(function () {
    var N = 100000;
    var t0 = performance.now();
    var cities = ['الرياض', 'جدة', 'الدمام', 'تبوك', 'أبها', 'حائل'];
    var statuses = ['نشط', 'جديد', 'موقوف', 'متأخر'];
    var rows = new Array(N);
    for (var i = 0; i < N; i++) {
      rows[i] = {
        name: 'عميل رقم ' + (i + 1),
        city: cities[i % cities.length],
        status: statuses[i % statuses.length],
        amount: Math.round(((i * 7919) % 977) * 13.37),
        score: (i * 37) % 101,
        date: '2026-' + String((i % 9) + 1).padStart(2, '0') + '-' + String((i % 28) + 1).padStart(2, '0')
      };
    }
    var genMs = Math.round(performance.now() - t0);

    var eng = window.TableEngine.create({
      id: 'stress',
      el: '#app',
      title: 'سجل العملاء — ' + N.toLocaleString('en') + ' صف',
      description: 'Virtual Scrolling · البحث والفلاتر على كامل البيانات · FPS لحظي',
      rowNumber: true,
      showSelection: true,
      pageSize: 50,
      mode: 'infinite',
      autoSave: false,
      persistData: false,
      virtual: true,
      footer: true,
      data: rows,
      columns: [
        { id: 'name', title: 'العميل', type: 'text', width: 200 },
        { id: 'city', title: 'المدينة', type: 'text', width: 140 },
        { id: 'status', title: 'الحالة', type: 'select', width: 120, options: statuses, colors: { 'نشط': '#36b37e', 'جديد': '#0057FF', 'موقوف': '#999999', 'متأخر': '#d45453' } },
        { id: 'amount', title: 'المبلغ', type: 'currency', width: 130, agg: 'sum', currency: 'ر.س', align: 'end' },
        { id: 'score', title: 'الدرجة', type: 'number', width: 100, agg: 'avg' },
        { id: 'date', title: 'التاريخ', type: 'date', width: 120 }
      ],
      conditional: [
        { col: 'score', type: 'colorScale', direction: 'red-green' }
      ]
    });
    eng.registerRenderer('status', function (v) { return window.TableEngine.badgeRenderer(v, null, eng.colById('status')); });
    window.TTC.registerEngine(eng);

    // first render metric
    eng.on('rendered', function (p) {
      var box = document.getElementById('perfStats');
      if (!box) return;
      box.innerHTML =
        '<div class="ttc-stat"><div class="ttc-stat-value">100,000</div><div class="ttc-stat-label">صف محمّل في الذاكرة</div></div>' +
        '<div class="ttc-stat"><div class="ttc-stat-value">' + genMs + ' ms</div><div class="ttc-stat-label">توليد البيانات</div></div>' +
        '<div class="ttc-stat"><div class="ttc-stat-value">' + p.ms + ' ms</div><div class="ttc-stat-label">آخر وقت عرض</div></div>' +
        '<div class="ttc-stat"><div class="ttc-stat-value">' + p.rows.toLocaleString('en') + '</div><div class="ttc-stat-label">صف في النافذة الافتراضية</div></div>';
    });
  });
})();
