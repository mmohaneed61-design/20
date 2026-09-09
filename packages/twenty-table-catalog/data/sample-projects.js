/*
 * twenty-table-catalog / data/sample-projects.js
 * بيانات تجريبية — مشاريع
 * MIT License — see ../LICENSE
 */
(function () {
  'use strict';
  var clients = ['وزارة التقنية', 'بنك المستقبل', 'شركة الاتصالات', 'مؤسسة المدن', 'جامعة الملك', 'مستشفى الشفاء', 'شركة الطاقة', 'مجموعة النقل'];
  var leads = ['أحمد العتيبي', 'سارة الحربي', 'خالد القحطاني', 'نورة الشمري', 'فهد المطيري', 'ريم الغامدي', 'محمد الزهراني', 'هند السبيعي'];
  var statuses = ['نشط', 'مكتمل', 'متأخر', 'موقوف', 'جديد'];
  var priorities = ['عالية', 'متوسطة', 'منخفضة'];
  var names = [
    'منصة التوظيف الذكية', 'نظام الفوترة الموحد', 'تطبيق العملاء الجوال', 'بوابة الخدمات الحكومية',
    'لوحة تحليلات المبيعات', 'نظام إدارة المستودعات', 'منصة التعلم الإلكتروني', 'نظام الحجوزات الموحد',
    'تطبيق الدفع اللحظي', 'نظام الصيانة التنبؤية', 'منصة العروض التفاعلية', 'نظام إدارة الأسطول',
    'تطبيق الصحة عن بعد', 'بوابة الموارد البشرية', 'نظام المخاطر الذكية', 'منصة الشراكات الرقمية',
    'نظام إدارة الأحداث', 'تطبيق الولاء والمكافآت', 'منصة الدعم الفني', 'نظام التقارير المالية'
  ];
  function rng(seed) { return function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }; }
  var r = rng(7);
  function pick(a) { return a[Math.floor(r() * a.length)]; }
  function int(a, b) { return a + Math.floor(r() * (b - a + 1)); }

  var rows = [];
  for (var i = 0; i < 20; i++) {
    var budget = int(20, 400) * 5000;
    var spent = Math.floor(budget * (0.2 + r() * 0.9));
    var st = pick(statuses);
    var start = new Date(2026, int(0, 6), int(1, 28));
    var end = new Date(start);
    end.setMonth(end.getMonth() + int(2, 8));
    var trend = [];
    for (var w = 0; w < 12; w++) trend.push(int(10, 100));
    rows.push({
      name: names[i],
      client: pick(clients),
      lead: pick(leads),
      status: st,
      priority: pick(priorities),
      budget: budget,
      spent: spent,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      progress: st === 'مكتمل' ? 100 : int(5, 95),
      trend: trend,
      formula: '=SUMIF(status:"نشط", budget:0)' // placeholder replaced below
    });
  }
  // cell formula demo on last column: percentage of budget spent (formula per row is static text; demo = formula in footer)
  window.SAMPLE_PROJECTS = rows.map(function (p) { delete p.formula; return p; });
})();
