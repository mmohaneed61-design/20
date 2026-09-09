/*
 * twenty-table-catalog / pages/people.js
 * صفحة جهات الاتصال
 * MIT License — see ../LICENSE
 */
(function () {
  'use strict';
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  ready(function () {
    var eng = window.TableEngine.create({
      id: 'people',
      el: '#app',
      title: 'جهات الاتصال',
      description: 'تحرير مباشر · تحقق · فلترة · تجميع · تذييل إحصائي · حفظ محلي',
      rowNumber: true,
      showSelection: true,
      pageSize: 25,
      autoSave: true,
      persistData: true,
      footer: true,
      data: window.SAMPLE_PEOPLE,
      columns: [
        { id: 'name', title: 'الاسم', type: 'text', width: 190, validators: ['required'] },
        { id: 'email', title: 'البريد الإلكتروني', type: 'email', width: 210, validators: ['email'] },
        { id: 'phone', title: 'الهاتف', type: 'phone', width: 150, validators: ['phone'] },
        { id: 'company', title: 'الشركة', type: 'text', width: 190 },
        { id: 'role', title: 'المنصب', type: 'text', width: 150 },
        { id: 'city', title: 'المدينة', type: 'text', width: 140 },
        { id: 'status', title: 'الحالة', type: 'select', width: 120, options: ['نشط', 'جديد', 'موقوف', 'متأخر'], colors: { 'نشط': '#36b37e', 'جديد': '#0057FF', 'موقوف': '#999999', 'متأخر': '#d45453' } },
        { id: 'priority', title: 'الأولوية', type: 'select', width: 120, options: ['عالية', 'متوسطة', 'منخفضة'], colors: { 'عالية': '#d45453', 'متوسطة': '#f79009', 'منخفضة': '#36b37e' } },
        { id: 'value', title: 'قيمة الصفقة', type: 'currency', width: 140, agg: 'sum', currency: 'ر.س', align: 'end' },
        { id: 'lastActivity', title: 'آخر نشاط', type: 'date', width: 130 },
        { id: 'createdAt', title: 'تاريخ الإنشاء', type: 'date', width: 140 },
        { id: 'progress', title: 'التقدم', type: 'progress', width: 150, agg: 'avg' },
        { id: 'rating', title: 'التقييم', type: 'rating', width: 130 },
        { id: 'tags', title: 'التصنيفات', type: 'multiselect', width: 170 }
      ],
      conditional: [
        { col: 'value', type: 'threshold', op: 'gt', value: 200000, bg: 'rgba(54,179,126,.10)', color: '#1e7a4f' },
        { col: 'value', type: 'threshold', op: 'lt', value: 5000, bg: 'rgba(212,84,83,.08)' },
        { col: 'progress', type: 'dataBar', color: 'var(--t-brand)' }
      ]
    });
    eng.registerRenderer('status', function (v) { return window.TableEngine.badgeRenderer(v, null, eng.colById('status')); });
    eng.registerRenderer('priority', function (v) { return window.TableEngine.badgeRenderer(v, null, eng.colById('priority')); });
    eng.registerRenderer('progress', function (v) { return window.TableEngine.progressRenderer(v, null, eng.colById('progress')); });
    eng.registerRenderer('rating', function (v) { return window.TableEngine.ratingRenderer(v); });
    window.TTC.registerEngine(eng);
  });
})();
