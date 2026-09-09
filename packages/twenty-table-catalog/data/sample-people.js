/*
 * twenty-table-catalog / data/sample-people.js
 * بيانات تجريبية — جهات اتصال (CRM)
 * MIT License — see ../LICENSE
 */
(function () {
  'use strict';
  var first = ['أحمد', 'سارة', 'خالد', 'نورة', 'فهد', 'ريم', 'محمد', 'لطيفة', 'عبدالله', 'هند', 'سلطان', 'دانة', 'يوسف', 'جواهر', 'ناصر', 'لمى', 'عمر', 'شهد', 'بدر', 'غلا', 'تركي', 'أروى', 'ماجد', 'دلال', 'سعود', 'مشاعل', 'طلال', 'أفنان', 'راكان', 'وعد', 'زياد', 'رغد', 'حسن', 'تالا', 'مازن', 'لينا', 'فيصل', 'نوف', 'إبراهيم', 'سارة', 'عادل', 'رنا', 'وليد', 'حصة', 'أنس', 'مريم', 'سليم', 'فوزية'];
  var last = ['العتيبي', 'الشمري', 'القحطاني', 'الحربي', 'الغامدي', 'المطيري', 'الزهراني', 'السبيعي', 'الدوسري', 'العنزي'];
  var companies = ['شركة النخبة التقنية', 'مجموعة الرؤية', 'دار الابتكار', 'شركة المسار الرقمي', 'مؤسسة الأفق', 'شركة التقاعد الذكي', 'مجموعة المنارة', 'شركة حلول الغد', 'دار المشاريع', 'شركة التميز'];
  var cities = ['الرياض', 'جدة', 'الدمام', 'تبوك', 'أبها', 'المدينة المنورة', 'حائل', 'جازان'];
  var statuses = ['نشط', 'جديد', 'موقوف', 'متأخر'];
  var priorities = ['عالية', 'متوسطة', 'منخفضة'];
  var roles = ['مدير تنفيذي', 'مدير مبيعات', 'مدير تسويق', 'مدير مشروع', 'مدير مالي', 'مدير تقنية', 'مدير عمليات', 'مدير عملاء'];
  var tagsPool = ['VIP', 'عميل حالي', 'فرصة', 'متابعة', 'عقد جديد', 'تجديد', 'استشارة'];

  function rng(seed) {
    return function () {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }
  var r = rng(42);
  function pick(arr) { return arr[Math.floor(r() * arr.length)]; }
  function int(a, b) { return a + Math.floor(r() * (b - a + 1)); }

  var rows = [];
  for (var i = 0; i < 48; i++) {
    var f = first[i % first.length];
    var l = last[int(0, last.length - 1)];
    var st = pick(statuses);
    var d = new Date(2026, int(0, 8), int(1, 28));
    var d2 = new Date(2026, int(0, 8), int(1, 28));
    rows.push({
      name: f + ' ' + l,
      email: 'user' + (i + 1) + '@example.sa',
      phone: '+966 5' + int(0, 9) + ' ' + int(100, 999) + ' ' + int(1000, 9999),
      company: pick(companies),
      role: pick(roles),
      city: pick(cities),
      status: st,
      priority: pick(priorities),
      value: int(5, 950) * 500,
      lastActivity: d.toISOString().slice(0, 10),
      createdAt: d2.toISOString().slice(0, 10),
      progress: st === 'مكتمل' ? 100 : int(0, 100),
      rating: int(1, 5),
      notes: r() > 0.75 ? 'تواصل هاتفي محدد' : '',
      tags: [pick(tagsPool)] + (r() > 0.5 ? [pick(tagsPool)] : []).filter(function (v, ix, a) { return a.indexOf(v) === ix; })
    });
  }
  window.SAMPLE_PEOPLE = rows;
})();
