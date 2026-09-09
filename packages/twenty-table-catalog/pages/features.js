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
    var stats = document.getElementById('statCards');
    if (stats) {
      stats.innerHTML =
        '<div class="ttc-stat"><div class="ttc-stat-value" style="color:var(--t-success)">' + c['2'] + '</div><div class="ttc-stat-label">مطبقة كاملة (' + pct + '%)</div></div>' +
        '<div class="ttc-stat"><div class="ttc-stat-value" style="color:var(--t-warning)">' + c['1'] + '</div><div class="ttc-stat-label">جزئية</div></div>' +
        '<div class="ttc-stat"><div class="ttc-stat-value" style="color:var(--t-text-tertiary)">' + c['0'] + '</div><div class="ttc-stat-label">مخطط لها</div></div>' +
        '<div class="ttc-stat"><div class="ttc-stat-value">14</div><div class="ttc-stat-label">مجموعة تصنيف</div></div>';
    }
    window.TTCCatalog('#app', {
      id: 'features-matrix',
      title: 'مصفوفة حالة الخصائص — 800 خاصية',
      description: 'فلتر بالحالة أو المجموعة، رتّب، ونسخ/تصدير',
      pageSize: 50
    });
  });
})();
