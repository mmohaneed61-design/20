/*
 * twenty-table-catalog / pages/features.js
 * صفحة مصفوفة الخصائص
 * MIT License — see ../LICENSE
 */
(function () {
  'use strict';
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  ready(function () {
    var c = window.FEATURE_STATUS_COUNTS;
    var pct = Math.round((c['2'] / 800) * 100);
    var eng = window.TTCCatalog('#app', {
      id: 'features-matrix',
      title: 'مصفوفة حالة الخصائص — 800 خاصية',
      description: 'فلتر بالحالة أو المجموعة، رتّب، ونسخ/تصدير',
      pageSize: 50
    });
    window.TTC.addSummary(eng, [
      { n: c['2'] + ' (' + pct + '%)', l: 'مطبقة', cls: 'ttc-chip--ok' },
      { n: c['1'], l: 'جزئية', cls: 'ttc-chip--warn' },
      { n: c['0'], l: 'مخطط لها', cls: 'ttc-chip--muted' },
      { n: 14, l: 'مجموعة', cls: '' }
    ]);
  });
})();
